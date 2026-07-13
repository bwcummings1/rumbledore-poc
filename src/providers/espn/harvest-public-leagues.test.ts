import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  corpusContentHash,
  createRequestGovernor,
  ESPN_CORPUS_VIEWS,
  type EspnCorpusEntry,
  HARVESTER_VERSION,
  harvestPublicLeagues,
  parseHarvesterArgs,
  RequestBudgetExceededError,
  runHarvesterCli,
  sanitizeEspnPayload,
} from "../../../scripts/harvest-public-leagues";

const fixtureSalt = "fixture-corpus-salt-v1";
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "rumbledore-espn-corpus-"));
  temporaryDirectories.push(directory);
  return directory;
}

function fakeClock() {
  let milliseconds = 0;
  const sleeps: number[] = [];
  return {
    now: () => milliseconds,
    sleep: async (delay: number) => {
      sleeps.push(delay);
      milliseconds += delay;
    },
    sleeps,
  };
}

function seededHex(seed: number, length: number): string {
  let state = seed >>> 0;
  let output = "";
  while (output.length < length) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    output += state.toString(16).padStart(8, "0");
  }
  return output.slice(0, length);
}

function generatedGuid(seed: number): string {
  const hex = seededHex(seed, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readCorpusEntry(path: string): EspnCorpusEntry {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as EspnCorpusEntry;
  } catch (cause) {
    throw new Error(`Could not parse generated corpus entry ${path}`, {
      cause,
    });
  }
}

function listJsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listJsonFiles(path);
    return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
  });
}

describe("public ESPN corpus harvester", () => {
  it("keeps the committed corpus free of embedded identifiers and the known source league name", () => {
    const corpusDirectory = join(
      process.cwd(),
      "test",
      "fixtures",
      "espn-corpus",
    );
    const forbiddenPatterns = [
      {
        label: "embedded GUID",
        pattern: /\{?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\}?/gi,
      },
      {
        label: "embedded email",
        pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
      },
      {
        label: "known source league name",
        pattern: /NHS\s+Alumni\s+Annual/gi,
      },
    ];
    const leaks = listJsonFiles(corpusDirectory).flatMap((path) => {
      const contents = readFileSync(path, "utf8");
      return forbiddenPatterns.flatMap(({ label, pattern }) => {
        pattern.lastIndex = 0;
        return pattern.test(contents) ? [`${label}: ${path}`] : [];
      });
    });

    expect(leaks).toEqual([]);
  });

  it("refuses before parsing or fetching unless the ToS acknowledgment is present", async () => {
    const errors: string[] = [];
    let fetchCalls = 0;

    const exitCode = await runHarvesterCli([], {
      error: (message) => errors.push(message),
      fetch: async () => {
        fetchCalls += 1;
        return new Response("{}");
      },
      log: () => undefined,
    });

    expect(exitCode).toBe(2);
    expect(fetchCalls).toBe(0);
    expect(errors.join("\n")).toContain("REFUSING TO RUN");
    expect(errors.join("\n")).toContain("No network request was made");
  });

  it("also refuses direct library calls without an explicit ToS acknowledgment", async () => {
    let fetchCalls = 0;

    await expect(
      harvestPublicLeagues(
        {
          acknowledgedTos: false as true,
          leagueId: "12345",
          seasons: [2024],
          outputDirectory: createTemporaryDirectory(),
          requestBudget: ESPN_CORPUS_VIEWS.length,
          requestsPerSecond: 2,
          jitterMs: 0,
        },
        {
          fetch: async () => {
            fetchCalls += 1;
            return new Response("{}");
          },
        },
      ),
    ).rejects.toThrow("requires acknowledgedTos: true before any request");
    expect(fetchCalls).toBe(0);
  });

  it("enforces rate spacing with jitter and a runtime hard budget on a fake clock", async () => {
    const clock = fakeClock();
    const governor = createRequestGovernor({
      requestBudget: 3,
      requestsPerSecond: 2,
      jitterMs: 100,
      now: clock.now,
      random: () => 0.5,
      sleep: clock.sleep,
    });

    await governor.beforeRequest();
    await governor.beforeRequest();
    await governor.beforeRequest();

    expect(clock.sleeps).toEqual([550, 550]);
    expect(governor.requestsUsed()).toBe(3);
    await expect(governor.beforeRequest()).rejects.toEqual(
      new RequestBudgetExceededError(3),
    );
    expect(governor.requestsUsed()).toBe(3);
  });

  it("rejects a harvest whose exact view plan exceeds the budget before fetching", async () => {
    let fetchCalls = 0;

    await expect(
      harvestPublicLeagues(
        {
          acknowledgedTos: true,
          leagueId: "12345",
          seasons: [2024],
          salt: fixtureSalt,
          outputDirectory: createTemporaryDirectory(),
          requestBudget: ESPN_CORPUS_VIEWS.length - 1,
          requestsPerSecond: 2,
          jitterMs: 0,
        },
        {
          fetch: async () => {
            fetchCalls += 1;
            return new Response("{}");
          },
        },
      ),
    ).rejects.toEqual(
      new RequestBudgetExceededError(ESPN_CORPUS_VIEWS.length - 1),
    );
    expect(fetchCalls).toBe(0);
  });

  it("fetches exactly the importer views without cookies and writes verifiable provenance", async () => {
    const outputDirectory = createTemporaryDirectory();
    const clock = fakeClock();
    const calls: Array<{ init?: RequestInit; url: string }> = [];
    const memberGuid = "{01234567-89ab-cdef-0123-456789abcdef}";
    const displayName = "Private Fixture Manager";
    const payload = [
      {
        id: 12345,
        members: [
          {
            id: memberGuid,
            displayName,
            firstName: "Private",
            lastName: "Manager",
            email: "private.manager@example.test",
            profileImageUrl: "https://images.example.test/private.png",
          },
        ],
        seasonId: 2024,
        teams: [{ id: 1, owners: [memberGuid] }],
      },
    ];

    const result = await harvestPublicLeagues(
      {
        acknowledgedTos: true,
        leagueId: "12345",
        seasons: [2024],
        salt: fixtureSalt,
        outputDirectory,
        requestBudget: ESPN_CORPUS_VIEWS.length,
        requestsPerSecond: 2,
        jitterMs: 0,
      },
      {
        fetch: async (input, init) => {
          calls.push({ init, url: input.toString() });
          return new Response(JSON.stringify(payload), {
            headers: { "content-type": "application/json" },
          });
        },
        now: clock.now,
        random: () => 0,
        sleep: clock.sleep,
      },
    );

    expect(result.entriesWritten).toBe(ESPN_CORPUS_VIEWS.length);
    expect(result.requestsUsed).toBe(ESPN_CORPUS_VIEWS.length);
    expect(calls).toHaveLength(ESPN_CORPUS_VIEWS.length);
    expect(
      calls.map(({ url }) => new URL(url).searchParams.get("view")),
    ).toEqual(ESPN_CORPUS_VIEWS);
    for (const { init, url } of calls) {
      const parsedUrl = new URL(url);
      expect(parsedUrl.origin).toBe("https://lm-api-reads.fantasy.espn.com");
      expect(parsedUrl.pathname).toBe("/apis/v3/games/ffl/leagueHistory/12345");
      expect(parsedUrl.searchParams.get("seasonId")).toBe("2024");
      expect(parsedUrl.searchParams.getAll("view")).toHaveLength(1);
      const headers = new Headers(init?.headers);
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("cookie")).toBe(false);
    }

    for (const view of ESPN_CORPUS_VIEWS) {
      const path = join(
        outputDirectory,
        result.leagueIdHash,
        "2024",
        `${view}.json`,
      );
      const entry = readCorpusEntry(path);
      expect(entry.provenance).toEqual({
        leagueIdHash: result.leagueIdHash,
        season: 2024,
        view,
        fetchedAt: expect.any(String),
        contentHash: corpusContentHash(entry.payload),
        harvesterVersion: HARVESTER_VERSION,
      });
      const serialized = JSON.stringify(entry.payload);
      expect(serialized).not.toContain("12345");
      expect(serialized).not.toContain(memberGuid);
      expect(serialized).not.toContain(displayName);
      expect(serialized).not.toContain("private.manager@example.test");
      expect(serialized).not.toContain(
        "https://images.example.test/private.png",
      );
    }
  });

  it("uses a fresh random salt for each invocation unless one is supplied", async () => {
    const generatedSalts = [
      "fresh-invocation-salt-0001",
      "fresh-invocation-salt-0002",
    ];
    let saltIndex = 0;
    const harvest = () =>
      harvestPublicLeagues(
        {
          acknowledgedTos: true,
          leagueId: "12345",
          seasons: [2024],
          outputDirectory: createTemporaryDirectory(),
          requestBudget: ESPN_CORPUS_VIEWS.length,
          requestsPerSecond: 2,
          jitterMs: 0,
        },
        {
          createSalt: () => {
            const salt = generatedSalts[saltIndex];
            saltIndex += 1;
            if (!salt) throw new Error("test salt sequence exhausted");
            return salt;
          },
          fetch: async () => new Response("[]"),
          now: () => 0,
          random: () => 0,
          sleep: async () => undefined,
          writeEntry: () => undefined,
        },
      );

    const first = await harvest();
    const second = await harvest();

    expect(first.leagueIdHash).not.toBe(second.leagueIdHash);
    expect(saltIndex).toBe(2);
  });

  it("property-tests deterministic removal of GUIDs, names, emails, and avatars", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const guid = generatedGuid(seed);
      const displayName = `Private Manager ${seed} Ω-${seededHex(seed, 12)}`;
      const firstName = `Given-${seededHex(seed + 1, 10)}`;
      const lastName = `Family-${seededHex(seed + 2, 10)}`;
      const email = `private.${seed}.${seededHex(seed, 6)}@example.test`;
      const avatar = `https://images.example.test/${seededHex(seed, 20)}.png`;
      const noIdDisplayName = `No Id Manager ${seed}-${seededHex(seed, 8)}`;
      const leagueName = `Private League ${seed}-${seededHex(seed + 3, 10)}`;
      const teamName = `Private Team ${seed}-${seededHex(seed + 4, 10)}`;
      const teamLocation = `Private Location ${seed}`;
      const teamNickname = `Private Nickname ${seed}`;
      const teamAbbrev = `P${seed}`;
      const input = {
        id: 12345,
        members: [
          {
            id: `{${guid}}`,
            displayName,
            firstName,
            lastName,
            emailAddress: email,
            avatarUrl: avatar,
          },
          {
            displayName: noIdDisplayName,
            firstName: `NoIdGiven-${seed}`,
            lastName: `NoIdFamily-${seed}`,
          },
        ],
        note: `contact ${email}`,
        players: [
          {
            firstName: "Real",
            fullName: "Real Football Player",
            id: seed,
            lastName: "Player",
          },
        ],
        settings: { name: leagueName },
        teams: [
          {
            abbrev: teamAbbrev,
            id: seed,
            location: teamLocation,
            name: teamName,
            nickname: teamNickname,
            owners: [guid.toUpperCase()],
          },
        ],
      };

      const first = sanitizeEspnPayload(input, {
        leagueId: "12345",
        salt: fixtureSalt,
      });
      const repeated = sanitizeEspnPayload(structuredClone(input), {
        leagueId: "12345",
        salt: fixtureSalt,
      });
      const withDifferentSalt = sanitizeEspnPayload(input, {
        leagueId: "12345",
        salt: "different-fixture-salt-v2",
      });
      const serialized = JSON.stringify(first);
      const sanitizedObject = first as {
        members: Array<{ id: string }>;
        settings: { name: string };
        teams: Array<{
          abbrev: string;
          location: string;
          name: string;
          nickname: string;
          owners: string[];
        }>;
      };

      expect(first).toEqual(repeated);
      expect(first).not.toEqual(withDifferentSalt);
      expect(serialized.toLowerCase()).not.toContain(guid.toLowerCase());
      expect(serialized).not.toContain(displayName);
      expect(serialized).not.toContain(firstName);
      expect(serialized).not.toContain(lastName);
      expect(serialized).not.toContain(email);
      expect(serialized).not.toContain(avatar);
      expect(serialized).not.toContain(noIdDisplayName);
      expect(serialized).not.toContain(leagueName);
      expect(serialized).not.toContain(teamName);
      expect(serialized).not.toContain(teamLocation);
      expect(serialized).not.toContain(teamNickname);
      expect(serialized).not.toContain(`"${teamAbbrev}"`);
      expect(serialized).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      expect(serialized).toContain("Real Football Player");
      expect(sanitizedObject.settings.name).toMatch(
        /^Corpus League [a-f0-9]{8}$/,
      );
      expect(sanitizedObject.teams[0]).toMatchObject({
        abbrev: expect.stringMatching(/^T\d{3}$/),
        location: "Corpus",
        name: expect.stringMatching(/^Corpus Team \d{3}$/),
        nickname: expect.stringMatching(/^Team \d{3}$/),
      });
      expect(sanitizedObject.members[0]?.id).toBe(
        sanitizedObject.teams[0]?.owners[0],
      );
    }
  });

  it("parses bounded CLI settings and normalizes seasons", () => {
    const options = parseHarvesterArgs([
      "--i-reviewed-tos",
      "--league-id",
      "12345",
      "--seasons",
      "2025,2024,2025",
      "--salt",
      fixtureSalt,
      "--request-budget",
      "24",
      "--rps",
      "2",
      "--jitter-ms",
      "0",
    ]);

    expect(options.seasons).toEqual([2024, 2025]);
    expect(options.acknowledgedTos).toBe(true);
    expect(options.salt).toBe(fixtureSalt);
    expect(options.requestBudget).toBe(24);
    expect(options.requestsPerSecond).toBe(2);
    expect(options.jitterMs).toBe(0);
  });

  it("leaves salt generation to the harvest invocation when --salt is omitted", () => {
    const options = parseHarvesterArgs([
      "--i-reviewed-tos",
      "--league-id",
      "12345",
      "--seasons",
      "2024",
    ]);

    expect(options.acknowledgedTos).toBe(true);
    expect(options.salt).toBeUndefined();
  });
});
