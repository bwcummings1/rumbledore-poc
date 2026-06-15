"use client";

import { ArrowLeft, CheckCircle2, FilePlus2, Landmark } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { onboardingPanelError, postJson } from "@/app/onboarding/client-http";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SeasonLoreMetric, WeeklyLoreMetric } from "@/lore";
import {
  LORE_ASSERTION_SOURCES,
  type LoreAssertionSource,
  type LoreClaimSubmitResponse,
  type LoreSectionData,
  loreMetricLabel,
  SEASON_LORE_METRICS,
  WEEKLY_LORE_METRICS,
} from "@/lore/member-ui";

type SubmitState =
  | { readonly message: string | null; readonly status: "idle" }
  | { readonly message: string | null; readonly status: "submitting" }
  | {
      readonly claimId: string;
      readonly message: string;
      readonly status: "success";
    }
  | { readonly message: string; readonly status: "error" };

type LoreClaimPayload = {
  readonly assertions?: readonly Record<string, unknown>[];
  readonly body: string;
  readonly subjects: readonly Record<string, unknown>[];
  readonly title: string;
};

const BOOLEAN_SEASON_METRICS = new Set(["made_playoffs", "made_championship"]);

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function parseFiniteNumber(value: string): number | null {
  const normalized = value.trim().replaceAll(",", "");
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string): number | null {
  const parsed = parseFiniteNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function sourceLabel(source: LoreAssertionSource): string {
  switch (source) {
    case "weekly_statistics":
      return "Weekly stat";
    case "season_statistics":
      return "Season stat";
    case "all_time_record":
      return "All-time record";
  }
}

function resultMessage(result: LoreClaimSubmitResponse): string {
  switch (result.status) {
    case "canonized":
      return "On the record. The data auto-confirmed this claim as canon.";
    case "rejected": {
      const actual = result.verificationResult?.actualValue;
      return actual
        ? `Refuted. The recorded value is ${actual}.`
        : "Refuted. The imported record contradicted this claim.";
    }
    case "vote":
      switch (result.verification) {
        case "unverifiable":
          return `Posted. The fact could not be checked, so the league is voting until ${formatDateTime(result.voteClosesAt)}.`;
        case "n_a":
          return `Posted. The league is voting until ${formatDateTime(result.voteClosesAt)}.`;
      }
  }
}

function optionValue(value: number | string): string {
  return String(value);
}

export function LeagueLoreSubmitView({ data }: { data: LoreSectionData }) {
  const loreHref = `/leagues/${encodeURIComponent(data.league.id)}/lore`;
  const firstPersonId = data.submitOptions.people[0]?.id ?? "";
  const firstSeason = data.submitOptions.seasons[0]?.season;
  const firstRecordType = data.submitOptions.recordTypes[0]?.recordType ?? "";

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subjectPersonId, setSubjectPersonId] = useState("");
  const [subjectSeason, setSubjectSeason] = useState("");
  const [subjectWeek, setSubjectWeek] = useState("");
  const [subjectRecordType, setSubjectRecordType] = useState("");
  const [includeAssertion, setIncludeAssertion] = useState(false);
  const [assertionSource, setAssertionSource] =
    useState<LoreAssertionSource>("weekly_statistics");
  const [assertionPersonId, setAssertionPersonId] = useState(firstPersonId);
  const [assertionSeason, setAssertionSeason] = useState(
    firstSeason ? String(firstSeason) : "",
  );
  const [assertionWeek, setAssertionWeek] = useState("");
  const [weeklyMetric, setWeeklyMetric] = useState<WeeklyLoreMetric>(
    WEEKLY_LORE_METRICS[0],
  );
  const [seasonMetric, setSeasonMetric] = useState<SeasonLoreMetric>(
    SEASON_LORE_METRICS[0],
  );
  const [recordType, setRecordType] = useState(firstRecordType);
  const [recordHolderPersonId, setRecordHolderPersonId] = useState("");
  const [recordSeason, setRecordSeason] = useState("");
  const [recordWeek, setRecordWeek] = useState("");
  const [assertedValue, setAssertedValue] = useState("");
  const [assertedBoolean, setAssertedBoolean] = useState("true");
  const [submitState, setSubmitState] = useState<SubmitState>({
    message: null,
    status: "idle",
  });

  const selectedAssertionSeason = parseInteger(assertionSeason);
  const assertionWeekOptions = useMemo(() => {
    if (selectedAssertionSeason === null) {
      return [];
    }
    return (
      data.submitOptions.seasons.find(
        (season) => season.season === selectedAssertionSeason,
      )?.weeks ?? []
    );
  }, [data.submitOptions.seasons, selectedAssertionSeason]);

  const subjectWeekOptions = useMemo(() => {
    const season = parseInteger(subjectSeason);
    if (season === null) {
      return [];
    }
    return (
      data.submitOptions.seasons.find((option) => option.season === season)
        ?.weeks ?? []
    );
  }, [data.submitOptions.seasons, subjectSeason]);

  const submitDisabled =
    submitState.status === "submitting" ||
    title.trim().length === 0 ||
    body.trim().length === 0;

  function buildPayload(): LoreClaimPayload | string {
    const payload: LoreClaimPayload = {
      body: body.trim(),
      subjects: buildSubjects(),
      title: title.trim(),
    };

    if (!includeAssertion) {
      return payload;
    }

    const assertion = buildAssertion();
    if (typeof assertion === "string") {
      return assertion;
    }

    return {
      ...payload,
      assertions: [assertion],
    };
  }

  function buildSubjects(): readonly Record<string, unknown>[] {
    const subjects: Record<string, unknown>[] = [];
    if (subjectPersonId) {
      subjects.push({ personId: subjectPersonId, subjectType: "person" });
    }
    const season = parseInteger(subjectSeason);
    const week = parseInteger(subjectWeek);
    if (season !== null && week !== null) {
      subjects.push({ season, subjectType: "week", week });
    } else if (season !== null) {
      subjects.push({ season, subjectType: "season" });
    }
    if (subjectRecordType) {
      subjects.push({
        recordType: subjectRecordType,
        subjectType: "record",
      });
    }
    return subjects;
  }

  function buildAssertion(): Record<string, unknown> | string {
    switch (assertionSource) {
      case "weekly_statistics": {
        const season = parseInteger(assertionSeason);
        const scoringPeriod = parseInteger(assertionWeek);
        const value = parseFiniteNumber(assertedValue);
        if (!assertionPersonId || season === null || scoringPeriod === null) {
          return "Pick a person, season, and week for the weekly fact.";
        }
        if (value === null) {
          return "Enter the weekly stat value as a number.";
        }
        return {
          assertedValue: value,
          metric: weeklyMetric,
          personId: assertionPersonId,
          scoringPeriod,
          season,
          source: assertionSource,
        };
      }
      case "season_statistics": {
        const season = parseInteger(assertionSeason);
        const value = BOOLEAN_SEASON_METRICS.has(seasonMetric)
          ? assertedBoolean === "true"
          : seasonMetric === "final_placement"
            ? assertedValue.trim()
            : parseFiniteNumber(assertedValue);
        if (!assertionPersonId || season === null) {
          return "Pick a person and season for the season fact.";
        }
        if (value === null || value === "") {
          return "Enter the season stat value.";
        }
        return {
          assertedValue: value,
          metric: seasonMetric,
          personId: assertionPersonId,
          season,
          source: assertionSource,
        };
      }
      case "all_time_record": {
        const value = parseFiniteNumber(assertedValue) ?? assertedValue.trim();
        const season = parseInteger(recordSeason);
        const scoringPeriod = parseInteger(recordWeek);
        if (!recordType) {
          return "Pick an all-time record type.";
        }
        if (value === "") {
          return "Enter the all-time record value.";
        }
        return {
          assertedValue: value,
          ...(recordHolderPersonId
            ? { holderPersonId: recordHolderPersonId }
            : {}),
          recordType,
          ...(scoringPeriod !== null ? { scoringPeriod } : {}),
          ...(season !== null ? { season } : {}),
          source: assertionSource,
        };
      }
    }
  }

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitDisabled) {
      return;
    }

    const payload = buildPayload();
    if (typeof payload === "string") {
      setSubmitState({ message: payload, status: "error" });
      return;
    }

    setSubmitState({ message: null, status: "submitting" });
    try {
      const result = await postJson<LoreClaimSubmitResponse>(
        `/api/leagues/${data.league.id}/lore/claims`,
        payload,
      );
      setSubmitState({
        claimId: result.claimId,
        message: resultMessage(result),
        status: "success",
      });
    } catch (error) {
      setSubmitState({
        message: onboardingPanelError(error).message,
        status: "error",
      });
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-4">
        <Link
          href={loreHref}
          className={cn(
            buttonVariants({ className: "w-fit", variant: "ghost" }),
          )}
        >
          <ArrowLeft data-icon="inline-start" />
          Lore
        </Link>
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Landmark className="size-5" aria-hidden="true" />
            <p className="text-sm font-medium">Submit claim</p>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Add to {data.league.name} lore
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Opinion claims go to the league. Structured facts are checked
              against imported records first.
            </p>
          </div>
        </div>
      </header>

      <form className="grid gap-4" onSubmit={submitClaim}>
        <section className="grid gap-4 rounded-card border border-border bg-card p-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Claim</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Write it like the league would say it.
            </p>
          </div>
          <label className="grid gap-2 text-sm font-medium" htmlFor="title">
            Title
            <input
              className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-base outline-none transition-colors focus:border-primary"
              id="title"
              maxLength={160}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder="The 2019 trade was the worst move in league history"
              required
              value={title}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="body">
            Statement
            <textarea
              className="min-h-36 rounded-control border border-border bg-background px-3 py-2 text-base outline-none transition-colors focus:border-primary"
              id="body"
              maxLength={4000}
              onChange={(event) => setBody(event.currentTarget.value)}
              placeholder="Make the case for the record."
              required
              value={body}
            />
          </label>
        </section>

        <section className="grid gap-4 rounded-card border border-border bg-card p-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Subjects</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional tags keep lore attached to durable league history.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="subject-person"
            >
              Person
              <select
                className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                id="subject-person"
                onChange={(event) =>
                  setSubjectPersonId(event.currentTarget.value)
                }
                value={subjectPersonId}
              >
                <option value="">No person tag</option>
                {data.submitOptions.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="subject-record"
            >
              Record
              <select
                className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm capitalize outline-none focus:border-primary"
                id="subject-record"
                onChange={(event) =>
                  setSubjectRecordType(event.currentTarget.value)
                }
                value={subjectRecordType}
              >
                <option value="">No record tag</option>
                {data.submitOptions.recordTypes.map((record) => (
                  <option key={record.recordType} value={record.recordType}>
                    {record.label}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="subject-season"
            >
              Season
              <select
                className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                id="subject-season"
                onChange={(event) => {
                  setSubjectSeason(event.currentTarget.value);
                  setSubjectWeek("");
                }}
                value={subjectSeason}
              >
                <option value="">No season tag</option>
                {data.submitOptions.seasons.map((season) => (
                  <option
                    key={season.season}
                    value={optionValue(season.season)}
                  >
                    {season.season}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="subject-week"
            >
              Week
              <select
                className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={subjectWeekOptions.length === 0}
                id="subject-week"
                onChange={(event) => setSubjectWeek(event.currentTarget.value)}
                value={subjectWeek}
              >
                <option value="">No week tag</option>
                {subjectWeekOptions.map((week) => (
                  <option key={week} value={optionValue(week)}>
                    Week {week}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="grid gap-4 rounded-card border border-border bg-card p-4">
          <label className="flex items-start gap-3 text-sm font-medium">
            <input
              checked={includeAssertion}
              className="mt-1 size-4 accent-primary"
              onChange={(event) =>
                setIncludeAssertion(event.currentTarget.checked)
              }
              type="checkbox"
            />
            <span>
              <span className="block">Assert a structured fact</span>
              <span className="mt-1 block text-sm font-normal text-muted-foreground">
                Leave this off for a pure opinion claim.
              </span>
            </span>
          </label>

          {includeAssertion ? (
            <div className="grid gap-4 border-border border-t pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className="grid gap-2 text-sm font-medium"
                  htmlFor="assertion-source"
                >
                  Fact source
                  <select
                    className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    id="assertion-source"
                    onChange={(event) =>
                      setAssertionSource(
                        event.currentTarget.value as LoreAssertionSource,
                      )
                    }
                    value={assertionSource}
                  >
                    {LORE_ASSERTION_SOURCES.map((source) => (
                      <option key={source} value={source}>
                        {sourceLabel(source)}
                      </option>
                    ))}
                  </select>
                </label>

                {assertionSource !== "all_time_record" ? (
                  <label
                    className="grid gap-2 text-sm font-medium"
                    htmlFor="assertion-person"
                  >
                    Person
                    <select
                      className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      id="assertion-person"
                      onChange={(event) =>
                        setAssertionPersonId(event.currentTarget.value)
                      }
                      value={assertionPersonId}
                    >
                      <option value="">Pick person</option>
                      {data.submitOptions.people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label
                    className="grid gap-2 text-sm font-medium"
                    htmlFor="record-type"
                  >
                    Record type
                    <select
                      className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm capitalize outline-none focus:border-primary"
                      id="record-type"
                      onChange={(event) =>
                        setRecordType(event.currentTarget.value)
                      }
                      value={recordType}
                    >
                      <option value="">Pick record</option>
                      {data.submitOptions.recordTypes.map((record) => (
                        <option
                          key={record.recordType}
                          value={record.recordType}
                        >
                          {record.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {assertionSource !== "all_time_record" ? (
                  <label
                    className="grid gap-2 text-sm font-medium"
                    htmlFor="assertion-season"
                  >
                    Season
                    <select
                      className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      id="assertion-season"
                      onChange={(event) => {
                        setAssertionSeason(event.currentTarget.value);
                        setAssertionWeek("");
                      }}
                      value={assertionSeason}
                    >
                      <option value="">Pick season</option>
                      {data.submitOptions.seasons.map((season) => (
                        <option
                          key={season.season}
                          value={optionValue(season.season)}
                        >
                          {season.season}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label
                    className="grid gap-2 text-sm font-medium"
                    htmlFor="record-holder"
                  >
                    Holder
                    <select
                      className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      id="record-holder"
                      onChange={(event) =>
                        setRecordHolderPersonId(event.currentTarget.value)
                      }
                      value={recordHolderPersonId}
                    >
                      <option value="">Any holder</option>
                      {data.submitOptions.people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {assertionSource === "weekly_statistics" ? (
                  <label
                    className="grid gap-2 text-sm font-medium"
                    htmlFor="assertion-week"
                  >
                    Week
                    <select
                      className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      disabled={assertionWeekOptions.length === 0}
                      id="assertion-week"
                      onChange={(event) =>
                        setAssertionWeek(event.currentTarget.value)
                      }
                      value={assertionWeek}
                    >
                      <option value="">Pick week</option>
                      {assertionWeekOptions.map((week) => (
                        <option key={week} value={optionValue(week)}>
                          Week {week}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {assertionSource === "season_statistics" ? (
                  <label
                    className="grid gap-2 text-sm font-medium"
                    htmlFor="season-metric"
                  >
                    Metric
                    <select
                      className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      id="season-metric"
                      onChange={(event) =>
                        setSeasonMetric(
                          event.currentTarget
                            .value as (typeof SEASON_LORE_METRICS)[number],
                        )
                      }
                      value={seasonMetric}
                    >
                      {SEASON_LORE_METRICS.map((metric) => (
                        <option key={metric} value={metric}>
                          {loreMetricLabel(metric)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {assertionSource === "weekly_statistics" ? (
                  <label
                    className="grid gap-2 text-sm font-medium"
                    htmlFor="weekly-metric"
                  >
                    Metric
                    <select
                      className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      id="weekly-metric"
                      onChange={(event) =>
                        setWeeklyMetric(
                          event.currentTarget
                            .value as (typeof WEEKLY_LORE_METRICS)[number],
                        )
                      }
                      value={weeklyMetric}
                    >
                      {WEEKLY_LORE_METRICS.map((metric) => (
                        <option key={metric} value={metric}>
                          {loreMetricLabel(metric)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {assertionSource === "all_time_record" ? (
                  <>
                    <label
                      className="grid gap-2 text-sm font-medium"
                      htmlFor="record-season"
                    >
                      Season
                      <input
                        className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                        id="record-season"
                        inputMode="numeric"
                        onChange={(event) =>
                          setRecordSeason(event.currentTarget.value)
                        }
                        placeholder="Optional"
                        value={recordSeason}
                      />
                    </label>
                    <label
                      className="grid gap-2 text-sm font-medium"
                      htmlFor="record-week"
                    >
                      Week
                      <input
                        className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                        id="record-week"
                        inputMode="numeric"
                        onChange={(event) =>
                          setRecordWeek(event.currentTarget.value)
                        }
                        placeholder="Optional"
                        value={recordWeek}
                      />
                    </label>
                  </>
                ) : null}
              </div>

              {assertionSource === "season_statistics" &&
              BOOLEAN_SEASON_METRICS.has(seasonMetric) ? (
                <label
                  className="grid gap-2 text-sm font-medium"
                  htmlFor="asserted-boolean"
                >
                  Asserted value
                  <select
                    className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    id="asserted-boolean"
                    onChange={(event) =>
                      setAssertedBoolean(event.currentTarget.value)
                    }
                    value={assertedBoolean}
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </label>
              ) : (
                <label
                  className="grid gap-2 text-sm font-medium"
                  htmlFor="asserted-value"
                >
                  Asserted value
                  <input
                    className="min-h-11 rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    id="asserted-value"
                    inputMode={
                      assertionSource === "season_statistics" &&
                      seasonMetric === "final_placement"
                        ? "text"
                        : "decimal"
                    }
                    onChange={(event) =>
                      setAssertedValue(event.currentTarget.value)
                    }
                    placeholder="200.4"
                    value={assertedValue}
                  />
                </label>
              )}
            </div>
          ) : null}
        </section>

        {submitState.message ? (
          <output
            className={cn(
              "rounded-card border px-3 py-2 text-sm",
              submitState.status === "success"
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {submitState.status === "success" ? (
              <CheckCircle2
                className="mr-2 inline size-4 align-[-0.125em]"
                aria-hidden="true"
              />
            ) : null}
            {submitState.message}
          </output>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Link
            href={loreHref}
            className={cn(buttonVariants({ variant: "ghost" }))}
          >
            Cancel
          </Link>
          <button
            className={cn(buttonVariants())}
            disabled={submitDisabled}
            type="submit"
          >
            <FilePlus2 data-icon="inline-start" />
            {submitState.status === "submitting" ? "Submitting" : "Submit"}
          </button>
        </div>
      </form>
    </main>
  );
}
