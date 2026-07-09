// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "./client";
import { withLeagueContext } from "./rls";
import {
  type AiPersonaCard,
  type AiPersonaToneHistory,
  aiPersonaCards,
  aiPersonaToneHistory,
  bankrollLedger,
  bankrollWeeks,
  type ContentItem,
  type ContentReaction,
  contentItems,
  contentReactions,
  type DataIntegrityCheck,
  dataIntegrityChecks,
  type EditorialAction,
  type EmailDigestDeliveryRecord,
  editorialActions,
  emailDigestDeliveryRecords,
  type FantasyPlayerWeekStatBreakdown,
  type FantasyTeam,
  fantasyPlayerWeekStatBreakdowns,
  fantasyTeams,
  type Instigation,
  instigations,
  type LeagueWebhook,
  type LoreClaim,
  type LoreEvent,
  type LoreSubject,
  type LoreVerification,
  type LoreVote,
  leagueDataEdits,
  leagueGroupingSeasons,
  leagueSeasonGroupings,
  leagues,
  leagueWebhooks,
  loreClaims,
  loreEvents,
  loreSubjects,
  loreVerifications,
  loreVotes,
  type Member,
  members,
  type Poll,
  type PollVote,
  type PushNotificationPreference,
  polls,
  pollVotes,
  pushNotificationPreferences,
  type User,
  users,
  type WebhookDeliveryRecord,
  webhookDeliveryRecords,
} from "./schema";
import { migrateSerialized } from "./test-support";

type LeagueDataEdit = typeof leagueDataEdits.$inferSelect;
type LeagueSeasonGrouping = typeof leagueSeasonGroupings.$inferSelect;
type LeagueGroupingSeason = typeof leagueGroupingSeasons.$inferSelect;

/**
 * THE league-isolation canary (spec 02 §7): two leagues, one RLS-bound role,
 * proof that a league-scoped query under `withLeagueContext` can neither read
 * nor write the other league's rows. If this suite fails, the isolation model
 * is broken — fix that before anything else.
 *
 * The compose user is a superuser (bypasses RLS even with FORCE), so the
 * admin connection only migrates, provisions a dedicated NOSUPERUSER
 * NOBYPASSRLS login role, and seeds fixtures; every assertion about policy
 * behavior runs on a second pool connected as that role.
 */

const CANARY_ROLE = "rumbledore_rls_canary";
// Dev-stack-only credential for the throwaway test role; never used outside
// the local compose Postgres.
const CANARY_PASSWORD = "rls-canary"; // ubs:ignore — local test-role password, not a real secret

const marker = `rlscanary-${randomUUID()}`;

let admin: DbHandle;
let canary: DbHandle;
let leagueA: string;
let leagueB: string;
let teamA: FantasyTeam;
let teamB: FantasyTeam;
let statBreakdownA: FantasyPlayerWeekStatBreakdown;
let statBreakdownB: FantasyPlayerWeekStatBreakdown;
let contentA: ContentItem;
let contentB: ContentItem;
let centralContent: ContentItem;
let contentReactionA: ContentReaction;
let contentReactionB: ContentReaction;
let leagueWebhookA: LeagueWebhook;
let leagueWebhookB: LeagueWebhook;
let webhookDeliveryA: WebhookDeliveryRecord;
let webhookDeliveryB: WebhookDeliveryRecord;
let emailDigestDeliveryA: EmailDigestDeliveryRecord;
let emailDigestDeliveryB: EmailDigestDeliveryRecord;
let editorialActionA: EditorialAction;
let editorialActionB: EditorialAction;
let personaCardA: AiPersonaCard;
let personaCardB: AiPersonaCard;
let toneHistoryA: AiPersonaToneHistory;
let toneHistoryB: AiPersonaToneHistory;
let userA: User;
let userB: User;
let bankrollWeekA: { id: string; leagueId: string };
let bankrollWeekB: { id: string; leagueId: string };
let bankrollLedgerA: { id: string; leagueId: string };
let bankrollLedgerB: { id: string; leagueId: string };
let integrityCheckA: DataIntegrityCheck;
let integrityCheckB: DataIntegrityCheck;
let leagueDataEditA: LeagueDataEdit;
let leagueDataEditB: LeagueDataEdit;
let leagueSeasonGroupingA: LeagueSeasonGrouping;
let leagueSeasonGroupingB: LeagueSeasonGrouping;
let leagueGroupingSeasonA: LeagueGroupingSeason;
let leagueGroupingSeasonB: LeagueGroupingSeason;
let memberA: Member;
let memberB: Member;
let instigationA: Instigation;
let instigationB: Instigation;
let pollA: Poll;
let pollB: Poll;
let pollVoteA: PollVote;
let pollVoteB: PollVote;
let loreClaimA: LoreClaim;
let loreClaimB: LoreClaim;
let loreEventA: LoreEvent;
let loreEventB: LoreEvent;
let loreSubjectA: LoreSubject;
let loreSubjectB: LoreSubject;
let loreVerificationA: LoreVerification;
let loreVerificationB: LoreVerification;
let loreVoteA: LoreVote;
let loreVoteB: LoreVote;
let pushPreferenceA: PushNotificationPreference;
let pushPreferenceB: PushNotificationPreference;

/** Drizzle wraps pg errors; the SQLSTATE lives on `cause.code`. */
async function sqlstateOf(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? String(cause ?? error);
  }
  throw new Error("expected the query to be rejected, but it succeeded");
}

beforeAll(async () => {
  const adminUrl = parseEnv(process.env).databaseUrl;
  admin = createDb(adminUrl);
  try {
    await admin.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable — start the local stack with `pnpm db:up` before running tests.",
      { cause },
    );
  }
  await migrateSerialized(admin);

  // Provision the RLS-bound role idempotently. ALTER (re)asserts the flags
  // and password even when the role survived a previous run.
  await admin.pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${CANARY_ROLE}') THEN
        CREATE ROLE ${CANARY_ROLE};
      END IF;
    END $$;
  `);
  await admin.pool.query(
    `ALTER ROLE ${CANARY_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${CANARY_PASSWORD}'`,
  );
  await admin.pool.query(`GRANT USAGE ON SCHEMA public TO ${CANARY_ROLE}`);
  await admin.pool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON leagues, fantasy_teams, fantasy_members, fantasy_matchups, fantasy_roster_entries, fantasy_player_week_stat_breakdowns, fantasy_transactions, provider_final_standings, league_season_settings, historical_import_checkpoints, data_coverage, data_integrity_check, data_correction_audit_log, league_data_edits, league_season_groupings, league_grouping_seasons, league_curation_season_states, person, team_season, identity_mapping, identity_audit_log, weekly_statistics, season_statistics, head_to_head_record, championship_record, all_time_record, content_item, content_reactions, editorial_actions, league_feed_reference, ai_persona_card, ai_persona_tone_history, ai_generation_run, ai_memory, instigations, polls, poll_votes, lore_claims, lore_subjects, lore_verifications, lore_votes, lore_events, push_subscription, push_notification_preferences, league_webhooks, webhook_delivery_records, email_digest_delivery_records, bankroll_weeks, bankroll_ledger, bet_slips, bet_legs, bet_settlements, league_invites, league_member_identity_claims TO ${CANARY_ROLE}`,
  );

  // Seed two leagues with one fantasy team each — as admin, outside any
  // league context (the superuser bypasses RLS; that's exactly why it can't be
  // the role under test).
  [userA, userB] = await admin.db
    .insert(users)
    .values([
      {
        displayName: "Canary User A",
        email: `${marker}-a@example.test`,
      },
      {
        displayName: "Canary User B",
        email: `${marker}-b@example.test`,
      },
    ])
    .returning();

  const [la, lb] = await admin.db
    .insert(leagues)
    .values([
      { provider: "espn", providerLeagueId: `${marker}-a`, name: "League A" },
      { provider: "espn", providerLeagueId: `${marker}-b`, name: "League B" },
    ])
    .returning();
  leagueA = la.id;
  leagueB = lb.id;

  [memberA, memberB] = await admin.db
    .insert(members)
    .values([
      {
        organizationId: leagueA,
        role: "member",
        userId: userA.id,
      },
      {
        organizationId: leagueB,
        role: "member",
        userId: userB.id,
      },
    ])
    .returning();

  [teamA, teamB] = await admin.db
    .insert(fantasyTeams)
    .values([
      {
        leagueId: leagueA,
        provider: "espn",
        providerTeamId: `${marker}-team-a`,
        leagueProviderId: `${marker}-a`,
        season: 2026,
        name: "Team A",
        abbrev: "A",
        contentHash: `${marker}-team-a-hash`,
      },
      {
        leagueId: leagueB,
        provider: "espn",
        providerTeamId: `${marker}-team-b`,
        leagueProviderId: `${marker}-b`,
        season: 2026,
        name: "Team B",
        abbrev: "B",
        contentHash: `${marker}-team-b-hash`,
      },
    ])
    .returning();

  [statBreakdownA, statBreakdownB] = await admin.db
    .insert(fantasyPlayerWeekStatBreakdowns)
    .values([
      {
        contentHash: `${marker}-stat-breakdown-a-hash`,
        fantasyPoints: 4,
        leagueId: leagueA,
        leagueProviderId: `${marker}-a`,
        provider: "espn",
        providerPlayerId: `${marker}-player-a`,
        providerStatId: 4,
        providerTeamId: teamA.providerTeamId,
        scoringPeriod: 1,
        season: 2026,
        statCategory: "passing",
        statKey: "passingTouchdowns",
        statSource: "actual",
        statValue: 1,
      },
      {
        contentHash: `${marker}-stat-breakdown-b-hash`,
        fantasyPoints: 6,
        leagueId: leagueB,
        leagueProviderId: `${marker}-b`,
        provider: "espn",
        providerPlayerId: `${marker}-player-b`,
        providerStatId: 25,
        providerTeamId: teamB.providerTeamId,
        scoringPeriod: 1,
        season: 2026,
        statCategory: "rushing",
        statKey: "rushingTouchdowns",
        statSource: "actual",
        statValue: 1,
      },
    ])
    .returning();

  [contentA, contentB, centralContent] = await admin.db
    .insert(contentItems)
    .values([
      {
        authorPersona: "commissioner",
        body: "League A content",
        contentHash: `${marker}-content-a-hash`,
        dedupKey: `${marker}-content-a`,
        kind: "blog",
        leagueId: leagueA,
        summary: "League A summary",
        title: "League A blog",
      },
      {
        authorPersona: "commissioner",
        body: "League B content",
        contentHash: `${marker}-content-b-hash`,
        dedupKey: `${marker}-content-b`,
        kind: "blog",
        leagueId: leagueB,
        summary: "League B summary",
        title: "League B blog",
      },
      {
        body: "Central content",
        contentHash: `${marker}-central-hash`,
        dedupKey: `${marker}-central`,
        kind: "news",
        leagueId: null,
        summary: "Central summary",
        title: "Central news",
      },
    ])
    .returning();

  [leagueWebhookA, leagueWebhookB] = await admin.db
    .insert(leagueWebhooks)
    .values([
      {
        createdByUserId: userA.id,
        encryptedUrl: `${marker}-encrypted-webhook-a`,
        leagueId: leagueA,
        name: "Canary webhook A",
        targetKind: "generic",
        updatedByUserId: userA.id,
        urlHash: `${marker}-webhook-hash-a`,
        urlLabel: "chat.example.test / encrypted endpoint",
      },
      {
        createdByUserId: userB.id,
        encryptedUrl: `${marker}-encrypted-webhook-b`,
        leagueId: leagueB,
        name: "Canary webhook B",
        targetKind: "generic",
        updatedByUserId: userB.id,
        urlHash: `${marker}-webhook-hash-b`,
        urlLabel: "chat.example.test / encrypted endpoint",
      },
    ])
    .returning();

  [webhookDeliveryA, webhookDeliveryB] = await admin.db
    .insert(webhookDeliveryRecords)
    .values([
      {
        contentItemId: contentA.id,
        deliveredAt: new Date("2026-06-12T00:00:00.000Z"),
        deliveryStatus: "delivered",
        eventKey: `content:${contentA.id}`,
        eventType: "content.published",
        leagueId: leagueA,
        payload: { marker, side: "a" },
        targetKind: "generic",
        webhookId: leagueWebhookA.id,
      },
      {
        contentItemId: contentB.id,
        deliveredAt: new Date("2026-06-12T00:00:00.000Z"),
        deliveryStatus: "delivered",
        eventKey: `content:${contentB.id}`,
        eventType: "content.published",
        leagueId: leagueB,
        payload: { marker, side: "b" },
        targetKind: "generic",
        webhookId: leagueWebhookB.id,
      },
    ])
    .returning();

  [emailDigestDeliveryA, emailDigestDeliveryB] = await admin.db
    .insert(emailDigestDeliveryRecords)
    .values([
      {
        contentItemIds: [contentA.id],
        deliveredAt: new Date("2026-06-13T00:00:00.000Z"),
        deliveryStatus: "delivered",
        digestKey: `${marker}:weekly:a`,
        leagueId: leagueA,
        payload: { marker, side: "a" },
        recipientEmailHash: `${marker}-digest-email-hash-a`,
        recipientUserId: userA.id,
        windowEndAt: new Date("2026-06-13T00:00:00.000Z"),
        windowStartAt: new Date("2026-06-06T00:00:00.000Z"),
      },
      {
        contentItemIds: [contentB.id],
        deliveredAt: new Date("2026-06-13T00:00:00.000Z"),
        deliveryStatus: "delivered",
        digestKey: `${marker}:weekly:b`,
        leagueId: leagueB,
        payload: { marker, side: "b" },
        recipientEmailHash: `${marker}-digest-email-hash-b`,
        recipientUserId: userB.id,
        windowEndAt: new Date("2026-06-13T00:00:00.000Z"),
        windowStartAt: new Date("2026-06-06T00:00:00.000Z"),
      },
    ])
    .returning();

  [contentReactionA, contentReactionB] = await admin.db
    .insert(contentReactions)
    .values([
      {
        contentItemId: contentA.id,
        emoji: "fire",
        leagueId: leagueA,
        memberId: memberA.id,
      },
      {
        contentItemId: contentB.id,
        emoji: "skull",
        leagueId: leagueB,
        memberId: memberB.id,
      },
    ])
    .returning();

  [personaCardA, personaCardB] = await admin.db
    .insert(aiPersonaCards)
    .values([
      {
        beat: "Canary commissioner beat A",
        leagueId: leagueA,
        name: "Commissioner A",
        persona: "commissioner",
        pointOfView: "Canary league A point of view.",
        promptTemplate: "Canary prompt A",
        purpose: "Canary persona A",
        tone: "Canary tone A",
        toneProfile: {
          beats: ["canary beat A"],
          diction: ["canary"],
          dosAndDonts: ["Do keep league A isolated."],
          guardrails: {
            loreCanonContract: ["A canon only"],
            noLeakage: ["A no leakage"],
            noRealMoney: ["A no money"],
            untrustedNews: ["A news"],
          },
          pointOfView: "Canary league A point of view.",
          styleDirectives: ["A style"],
        },
      },
      {
        beat: "Canary commissioner beat B",
        leagueId: leagueB,
        name: "Commissioner B",
        persona: "commissioner",
        pointOfView: "Canary league B point of view.",
        promptTemplate: "Canary prompt B",
        purpose: "Canary persona B",
        tone: "Canary tone B",
        toneProfile: {
          beats: ["canary beat B"],
          diction: ["canary"],
          dosAndDonts: ["Do keep league B isolated."],
          guardrails: {
            loreCanonContract: ["B canon only"],
            noLeakage: ["B no leakage"],
            noRealMoney: ["B no money"],
            untrustedNews: ["B news"],
          },
          pointOfView: "Canary league B point of view.",
          styleDirectives: ["B style"],
        },
      },
    ])
    .returning();

  [toneHistoryA, toneHistoryB] = await admin.db
    .insert(aiPersonaToneHistory)
    .values([
      {
        leagueId: leagueA,
        persona: "commissioner",
        personaCardId: personaCardA.id,
        source: "seed",
        toneProfile: personaCardA.toneProfile,
        toneUpdatedBy: "canary",
        toneVersion: 1,
      },
      {
        leagueId: leagueB,
        persona: "commissioner",
        personaCardId: personaCardB.id,
        source: "seed",
        toneProfile: personaCardB.toneProfile,
        toneUpdatedBy: "canary",
        toneVersion: 1,
      },
    ])
    .returning();

  [editorialActionA, editorialActionB] = await admin.db
    .insert(editorialActions)
    .values([
      {
        action: "retract",
        actorUserId: userA.id,
        beforeContentItemId: contentA.id,
        leagueId: leagueA,
        reason: "canary retract",
        targetContentItemId: contentA.id,
      },
      {
        action: "retract",
        actorUserId: userB.id,
        beforeContentItemId: contentB.id,
        leagueId: leagueB,
        reason: "canary retract",
        targetContentItemId: contentB.id,
      },
    ])
    .returning();

  [bankrollWeekA, bankrollWeekB] = await admin.db
    .insert(bankrollWeeks)
    .values([
      {
        floorCents: 1_000_000,
        leagueId: leagueA,
        openingBalanceCents: 1_000_000,
        userId: userA.id,
        weekEnd: new Date("2026-09-08T00:00:00.000Z"),
        weekStart: new Date("2026-09-01T00:00:00.000Z"),
      },
      {
        floorCents: 1_000_000,
        leagueId: leagueB,
        openingBalanceCents: 1_000_000,
        userId: userB.id,
        weekEnd: new Date("2026-09-08T00:00:00.000Z"),
        weekStart: new Date("2026-09-01T00:00:00.000Z"),
      },
    ])
    .returning({
      id: bankrollWeeks.id,
      leagueId: bankrollWeeks.leagueId,
    });

  [bankrollLedgerA, bankrollLedgerB] = await admin.db
    .insert(bankrollLedger)
    .values([
      {
        amountCents: 1_000_000,
        bankrollWeekId: bankrollWeekA.id,
        entryType: "week_open",
        leagueId: leagueA,
        runningBalanceCents: 1_000_000,
        seq: 1,
        userId: userA.id,
      },
      {
        amountCents: 1_000_000,
        bankrollWeekId: bankrollWeekB.id,
        entryType: "week_open",
        leagueId: leagueB,
        runningBalanceCents: 1_000_000,
        seq: 1,
        userId: userB.id,
      },
    ])
    .returning({
      id: bankrollLedger.id,
      leagueId: bankrollLedger.leagueId,
    });

  [integrityCheckA, integrityCheckB] = await admin.db
    .insert(dataIntegrityChecks)
    .values([
      {
        checkKey: "identity_sanity",
        detail: { marker, side: "a" },
        leagueId: leagueA,
        season: 2026,
        status: "pass",
      },
      {
        checkKey: "identity_sanity",
        detail: { marker, side: "b" },
        leagueId: leagueB,
        season: 2026,
        status: "fail",
      },
    ])
    .returning();

  [leagueSeasonGroupingA, leagueSeasonGroupingB] = await admin.db
    .insert(leagueSeasonGroupings)
    .values([
      {
        confirmedByUserId: userA.id,
        config: { member_count_hint: 10 },
        derivedFrom: { marker, side: "a" },
        kind: "era",
        leagueId: leagueA,
        name: "Canary Era A",
        ordinal: 1,
        status: "confirmed",
      },
      {
        confirmedByUserId: userB.id,
        config: { member_count_hint: 12 },
        derivedFrom: { marker, side: "b" },
        kind: "era",
        leagueId: leagueB,
        name: "Canary Era B",
        ordinal: 1,
        status: "confirmed",
      },
    ])
    .returning();

  [leagueGroupingSeasonA, leagueGroupingSeasonB] = await admin.db
    .insert(leagueGroupingSeasons)
    .values([
      {
        groupingId: leagueSeasonGroupingA.id,
        leagueId: leagueA,
        season: 2026,
      },
      {
        groupingId: leagueSeasonGroupingB.id,
        leagueId: leagueB,
        season: 2026,
      },
    ])
    .returning();

  [leagueDataEditA, leagueDataEditB] = await admin.db
    .insert(leagueDataEdits)
    .values([
      {
        actorUserId: userA.id,
        afterValue: { name: "Canary Era A" },
        beforeValue: { name: "Proposed Era A" },
        editClass: "substantive",
        field: "grouping_confirmation",
        leagueId: leagueA,
        reason: "canary",
        targetId: leagueSeasonGroupingA.id,
        targetKind: "grouping",
      },
      {
        actorUserId: userB.id,
        afterValue: { name: "Canary Era B" },
        beforeValue: { name: "Proposed Era B" },
        editClass: "substantive",
        field: "grouping_confirmation",
        leagueId: leagueB,
        reason: "canary",
        targetId: leagueSeasonGroupingB.id,
        targetKind: "grouping",
      },
    ])
    .returning();

  [instigationA, instigationB] = await admin.db
    .insert(instigations)
    .values([
      {
        dedupKey: `${marker}-instigation-a`,
        groundingRefs: [{ id: teamA.id, type: "team" }],
        kind: "settle_it_poll",
        leagueId: leagueA,
        options: ["Team A", "Nobody"],
        persona: "trash_talker",
        promptText: "Settle it: Team A owns the plot?",
        status: "polling",
      },
      {
        dedupKey: `${marker}-instigation-b`,
        groundingRefs: [{ id: teamB.id, type: "team" }],
        kind: "settle_it_poll",
        leagueId: leagueB,
        options: ["Team B", "Nobody"],
        persona: "trash_talker",
        promptText: "Settle it: Team B owns the plot?",
        status: "polling",
      },
    ])
    .returning();

  [pollA, pollB] = await admin.db
    .insert(polls)
    .values([
      {
        closesAt: new Date("2026-06-21T00:00:00.000Z"),
        instigationId: instigationA.id,
        leagueId: leagueA,
        options: ["Team A", "Nobody"],
        question: "Settle it: Team A owns the plot?",
      },
      {
        closesAt: new Date("2026-06-21T00:00:00.000Z"),
        instigationId: instigationB.id,
        leagueId: leagueB,
        options: ["Team B", "Nobody"],
        question: "Settle it: Team B owns the plot?",
      },
    ])
    .returning();

  [pollVoteA, pollVoteB] = await admin.db
    .insert(pollVotes)
    .values([
      {
        leagueId: leagueA,
        memberId: memberA.id,
        optionIdx: 0,
        pollId: pollA.id,
      },
      {
        leagueId: leagueB,
        memberId: memberB.id,
        optionIdx: 0,
        pollId: pollB.id,
      },
    ])
    .returning();

  [loreClaimA, loreClaimB] = await admin.db
    .insert(loreClaims)
    .values([
      {
        authorPersona: "trash_talker",
        body: "The league voted Team A owns the plot.",
        evidenceRefs: [{ id: pollA.id, type: "poll" }],
        kind: "opinion",
        leagueId: leagueA,
        origin: "ai",
        ratifiedAt: new Date("2026-06-14T00:00:00.000Z"),
        ratifiedBy: "vote",
        sourceInstigationId: instigationA.id,
        sourcePollId: pollA.id,
        statement: "The league voted Team A owns the plot.",
        status: "canon",
        title: "Team A plot vote",
      },
      {
        authorPersona: "trash_talker",
        body: "The league voted Team B owns the plot.",
        evidenceRefs: [{ id: pollB.id, type: "poll" }],
        kind: "opinion",
        leagueId: leagueB,
        origin: "ai",
        ratifiedAt: new Date("2026-06-14T00:00:00.000Z"),
        ratifiedBy: "vote",
        sourceInstigationId: instigationB.id,
        sourcePollId: pollB.id,
        statement: "The league voted Team B owns the plot.",
        status: "canon",
        title: "Team B plot vote",
      },
    ])
    .returning();

  [loreSubjectA, loreSubjectB] = await admin.db
    .insert(loreSubjects)
    .values([
      {
        claimId: loreClaimA.id,
        leagueId: leagueA,
        season: 2026,
        subjectType: "season",
      },
      {
        claimId: loreClaimB.id,
        leagueId: leagueB,
        season: 2026,
        subjectType: "season",
      },
    ])
    .returning();

  [loreVerificationA, loreVerificationB] = await admin.db
    .insert(loreVerifications)
    .values([
      {
        assertedValue: "Team A owns the plot",
        claimId: loreClaimA.id,
        leagueId: leagueA,
        result: "uncheckable",
      },
      {
        assertedValue: "Team B owns the plot",
        claimId: loreClaimB.id,
        leagueId: leagueB,
        result: "uncheckable",
      },
    ])
    .returning();

  [loreVoteA, loreVoteB] = await admin.db
    .insert(loreVotes)
    .values([
      {
        choice: "affirm",
        claimId: loreClaimA.id,
        leagueId: leagueA,
        voterMemberId: memberA.id,
      },
      {
        choice: "affirm",
        claimId: loreClaimB.id,
        leagueId: leagueB,
        voterMemberId: memberB.id,
      },
    ])
    .returning();

  [loreEventA, loreEventB] = await admin.db
    .insert(loreEvents)
    .values([
      {
        afterState: { marker, status: "canon" },
        claimId: loreClaimA.id,
        kind: "ratified",
        leagueId: leagueA,
        reason: "canary",
      },
      {
        afterState: { marker, status: "canon" },
        claimId: loreClaimB.id,
        kind: "ratified",
        leagueId: leagueB,
        reason: "canary",
      },
    ])
    .returning();

  [pushPreferenceA, pushPreferenceB] = await admin.db
    .insert(pushNotificationPreferences)
    .values([
      {
        channel: "none",
        enabled: false,
        eventFamily: "arena",
        leagueId: leagueA,
        type: "arena.rival.passed",
        userId: userA.id,
      },
      {
        channel: "none",
        enabled: false,
        eventFamily: "arena",
        leagueId: leagueB,
        type: "arena.rival.passed",
        userId: userB.id,
      },
    ])
    .returning();

  const canaryUrl = new URL(adminUrl);
  canaryUrl.username = CANARY_ROLE;
  canaryUrl.password = CANARY_PASSWORD;
  canary = createDb(canaryUrl.toString());
});

afterAll(async () => {
  // Leagues cascade to fantasy domain rows. The role stays — it is
  // provisioned idempotently and another run may be mid-flight.
  if (admin) {
    await admin.db
      .delete(contentItems)
      .where(sql`${contentItems.dedupKey} like ${`${marker}-%`}`);
    await admin.db
      .delete(leagues)
      .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
    await admin.db
      .delete(users)
      .where(sql`${users.email} like ${`${marker}-%`}`);
  }
  await canary?.pool.end();
  await admin?.pool.end();
});

describe("canary preconditions", () => {
  it("connects as a role that RLS actually binds (no superuser, no BYPASSRLS)", async () => {
    const { rows } = await canary.pool.query(
      "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });
});

describe("two-league isolation under withLeagueContext", () => {
  it("sees no fantasy team rows at all outside a league context", async () => {
    const rows = await canary.db
      .select()
      .from(fantasyTeams)
      .where(inArray(fantasyTeams.id, [teamA.id, teamB.id]));
    expect(rows).toHaveLength(0);
  });

  it("sees no player stat breakdown rows at all outside a league context", async () => {
    const rows = await canary.db
      .select()
      .from(fantasyPlayerWeekStatBreakdowns)
      .where(
        inArray(fantasyPlayerWeekStatBreakdowns.id, [
          statBreakdownA.id,
          statBreakdownB.id,
        ]),
      );
    expect(rows).toHaveLength(0);
  });

  it("outside a league context sees central content but no league blog rows", async () => {
    const rows = await canary.db
      .select({
        id: contentItems.id,
        leagueId: contentItems.leagueId,
      })
      .from(contentItems)
      .where(
        inArray(contentItems.id, [contentA.id, contentB.id, centralContent.id]),
      );
    expect(rows).toEqual([{ id: centralContent.id, leagueId: null }]);
  });

  it("sees no editorial action rows outside a league context", async () => {
    const rows = await canary.db
      .select()
      .from(editorialActions)
      .where(
        inArray(editorialActions.id, [
          editorialActionA.id,
          editorialActionB.id,
        ]),
      );

    expect(rows).toHaveLength(0);
  });

  it("sees no content reaction rows outside a league context", async () => {
    const rows = await canary.db
      .select()
      .from(contentReactions)
      .where(
        inArray(contentReactions.id, [
          contentReactionA.id,
          contentReactionB.id,
        ]),
      );

    expect(rows).toHaveLength(0);
  });

  it("sees no persona tone history rows outside a league context", async () => {
    const rows = await canary.db
      .select()
      .from(aiPersonaToneHistory)
      .where(
        inArray(aiPersonaToneHistory.id, [toneHistoryA.id, toneHistoryB.id]),
      );

    expect(rows).toHaveLength(0);
  });

  it("sees no bankroll rows at all outside a league context", async () => {
    const weeks = await canary.db
      .select()
      .from(bankrollWeeks)
      .where(inArray(bankrollWeeks.id, [bankrollWeekA.id, bankrollWeekB.id]));
    const ledger = await canary.db
      .select()
      .from(bankrollLedger)
      .where(
        inArray(bankrollLedger.id, [bankrollLedgerA.id, bankrollLedgerB.id]),
      );

    expect(weeks).toHaveLength(0);
    expect(ledger).toHaveLength(0);
  });

  it("sees no data integrity rows at all outside a league context", async () => {
    const rows = await canary.db
      .select()
      .from(dataIntegrityChecks)
      .where(
        inArray(dataIntegrityChecks.id, [
          integrityCheckA.id,
          integrityCheckB.id,
        ]),
      );
    expect(rows).toHaveLength(0);
  });

  it("sees no curation rows at all outside a league context", async () => {
    const edits = await canary.db
      .select()
      .from(leagueDataEdits)
      .where(
        inArray(leagueDataEdits.id, [leagueDataEditA.id, leagueDataEditB.id]),
      );
    const groupings = await canary.db
      .select()
      .from(leagueSeasonGroupings)
      .where(
        inArray(leagueSeasonGroupings.id, [
          leagueSeasonGroupingA.id,
          leagueSeasonGroupingB.id,
        ]),
      );
    const groupingSeasons = await canary.db
      .select()
      .from(leagueGroupingSeasons)
      .where(
        inArray(leagueGroupingSeasons.id, [
          leagueGroupingSeasonA.id,
          leagueGroupingSeasonB.id,
        ]),
      );

    expect(edits).toHaveLength(0);
    expect(groupings).toHaveLength(0);
    expect(groupingSeasons).toHaveLength(0);
  });

  it("sees no instigator or lore rows at all outside a league context", async () => {
    const instigationRows = await canary.db
      .select()
      .from(instigations)
      .where(inArray(instigations.id, [instigationA.id, instigationB.id]));
    const pollRows = await canary.db
      .select()
      .from(polls)
      .where(inArray(polls.id, [pollA.id, pollB.id]));
    const voteRows = await canary.db
      .select()
      .from(pollVotes)
      .where(inArray(pollVotes.id, [pollVoteA.id, pollVoteB.id]));
    const claimRows = await canary.db
      .select()
      .from(loreClaims)
      .where(inArray(loreClaims.id, [loreClaimA.id, loreClaimB.id]));
    const eventRows = await canary.db
      .select()
      .from(loreEvents)
      .where(inArray(loreEvents.id, [loreEventA.id, loreEventB.id]));

    expect(instigationRows).toHaveLength(0);
    expect(pollRows).toHaveLength(0);
    expect(voteRows).toHaveLength(0);
    expect(claimRows).toHaveLength(0);
    expect(eventRows).toHaveLength(0);
  });

  it("sees no push preference rows at all outside a league context", async () => {
    const rows = await canary.db
      .select()
      .from(pushNotificationPreferences)
      .where(
        inArray(pushNotificationPreferences.id, [
          pushPreferenceA.id,
          pushPreferenceB.id,
        ]),
      );
    expect(rows).toHaveLength(0);
  });

  it("sees no webhook rows at all outside a league context", async () => {
    const webhooks = await canary.db
      .select()
      .from(leagueWebhooks)
      .where(
        inArray(leagueWebhooks.id, [leagueWebhookA.id, leagueWebhookB.id]),
      );
    const deliveries = await canary.db
      .select()
      .from(webhookDeliveryRecords)
      .where(
        inArray(webhookDeliveryRecords.id, [
          webhookDeliveryA.id,
          webhookDeliveryB.id,
        ]),
      );

    expect(webhooks).toHaveLength(0);
    expect(deliveries).toHaveLength(0);
  });

  it("scoped to league A, sees A's fantasy team and nothing of league B", async () => {
    const { mine, theirs } = await withLeagueContext(
      canary.db,
      leagueA,
      async (tx) => ({
        mine: await tx
          .select()
          .from(fantasyTeams)
          .where(eq(fantasyTeams.leagueId, leagueA)),
        theirs: await tx
          .select()
          .from(fantasyTeams)
          .where(eq(fantasyTeams.id, teamB.id)),
      }),
    );
    expect(mine.map((m) => m.id)).toContain(teamA.id);
    expect(theirs).toHaveLength(0);
  });

  it("scoped to league A, an unfiltered scan still yields only league A rows", async () => {
    const all = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(fantasyTeams),
    );
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, unfiltered player stat breakdown scans yield only league A rows", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(fantasyPlayerWeekStatBreakdowns),
    );

    expect(rows.map((row) => row.id)).toContain(statBreakdownA.id);
    expect(rows.map((row) => row.id)).not.toContain(statBreakdownB.id);
    expect(rows.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, unfiltered bankroll scans still yield only league A rows", async () => {
    const { ledger, weeks } = await withLeagueContext(
      canary.db,
      leagueA,
      async (tx) => ({
        ledger: await tx.select().from(bankrollLedger),
        weeks: await tx.select().from(bankrollWeeks),
      }),
    );

    expect(weeks.map((row) => row.id)).toContain(bankrollWeekA.id);
    expect(weeks.map((row) => row.id)).not.toContain(bankrollWeekB.id);
    expect(weeks.every((row) => row.leagueId === leagueA)).toBe(true);
    expect(ledger.map((row) => row.id)).toContain(bankrollLedgerA.id);
    expect(ledger.map((row) => row.id)).not.toContain(bankrollLedgerB.id);
    expect(ledger.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, unfiltered data integrity scans still yield only league A rows", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(dataIntegrityChecks),
    );

    expect(rows.map((row) => row.id)).toContain(integrityCheckA.id);
    expect(rows.map((row) => row.id)).not.toContain(integrityCheckB.id);
    expect(rows.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, unfiltered editorial action scans yield only league A rows", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(editorialActions),
    );

    expect(rows.map((row) => row.id)).toContain(editorialActionA.id);
    expect(rows.map((row) => row.id)).not.toContain(editorialActionB.id);
    expect(rows.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, unfiltered content reaction scans yield only league A rows", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(contentReactions),
    );

    expect(rows.map((row) => row.id)).toContain(contentReactionA.id);
    expect(rows.map((row) => row.id)).not.toContain(contentReactionB.id);
    expect(rows.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, unfiltered persona tone history scans yield only league A rows", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(aiPersonaToneHistory),
    );

    expect(rows.map((row) => row.id)).toContain(toneHistoryA.id);
    expect(rows.map((row) => row.id)).not.toContain(toneHistoryB.id);
    expect(rows.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, unfiltered curation scans still yield only league A rows", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, async (tx) => ({
      edits: await tx.select().from(leagueDataEdits),
      groupingSeasons: await tx.select().from(leagueGroupingSeasons),
      groupings: await tx.select().from(leagueSeasonGroupings),
    }));

    expect(rows.edits.map((row) => row.id)).toContain(leagueDataEditA.id);
    expect(rows.edits.map((row) => row.id)).not.toContain(leagueDataEditB.id);
    expect(rows.edits.every((row) => row.leagueId === leagueA)).toBe(true);
    expect(rows.groupings.map((row) => row.id)).toContain(
      leagueSeasonGroupingA.id,
    );
    expect(rows.groupings.map((row) => row.id)).not.toContain(
      leagueSeasonGroupingB.id,
    );
    expect(rows.groupings.every((row) => row.leagueId === leagueA)).toBe(true);
    expect(rows.groupingSeasons.map((row) => row.id)).toContain(
      leagueGroupingSeasonA.id,
    );
    expect(rows.groupingSeasons.map((row) => row.id)).not.toContain(
      leagueGroupingSeasonB.id,
    );
    expect(rows.groupingSeasons.every((row) => row.leagueId === leagueA)).toBe(
      true,
    );
  });

  it("scoped to league A, unfiltered instigator and lore scans yield only league A rows", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, async (tx) => ({
      claims: await tx.select().from(loreClaims),
      events: await tx.select().from(loreEvents),
      instigations: await tx.select().from(instigations),
      loreVotes: await tx.select().from(loreVotes),
      polls: await tx.select().from(polls),
      subjects: await tx.select().from(loreSubjects),
      verifications: await tx.select().from(loreVerifications),
      votes: await tx.select().from(pollVotes),
    }));

    expect(rows.instigations.map((row) => row.id)).toContain(instigationA.id);
    expect(rows.instigations.map((row) => row.id)).not.toContain(
      instigationB.id,
    );
    expect(rows.instigations.every((row) => row.leagueId === leagueA)).toBe(
      true,
    );
    expect(rows.polls.map((row) => row.id)).toContain(pollA.id);
    expect(rows.polls.map((row) => row.id)).not.toContain(pollB.id);
    expect(rows.polls.every((row) => row.leagueId === leagueA)).toBe(true);
    expect(rows.votes.map((row) => row.id)).toContain(pollVoteA.id);
    expect(rows.votes.map((row) => row.id)).not.toContain(pollVoteB.id);
    expect(rows.votes.every((row) => row.leagueId === leagueA)).toBe(true);
    expect(rows.claims.map((row) => row.id)).toContain(loreClaimA.id);
    expect(rows.claims.map((row) => row.id)).not.toContain(loreClaimB.id);
    expect(rows.claims.every((row) => row.leagueId === leagueA)).toBe(true);
    expect(rows.subjects.map((row) => row.id)).toContain(loreSubjectA.id);
    expect(rows.subjects.map((row) => row.id)).not.toContain(loreSubjectB.id);
    expect(rows.subjects.every((row) => row.leagueId === leagueA)).toBe(true);
    expect(rows.verifications.map((row) => row.id)).toContain(
      loreVerificationA.id,
    );
    expect(rows.verifications.map((row) => row.id)).not.toContain(
      loreVerificationB.id,
    );
    expect(rows.verifications.every((row) => row.leagueId === leagueA)).toBe(
      true,
    );
    expect(rows.loreVotes.map((row) => row.id)).toContain(loreVoteA.id);
    expect(rows.loreVotes.map((row) => row.id)).not.toContain(loreVoteB.id);
    expect(rows.loreVotes.every((row) => row.leagueId === leagueA)).toBe(true);
    expect(rows.events.map((row) => row.id)).toContain(loreEventA.id);
    expect(rows.events.map((row) => row.id)).not.toContain(loreEventB.id);
    expect(rows.events.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, unfiltered push preference scans yield only league A rows", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(pushNotificationPreferences),
    );

    expect(rows.map((row) => row.id)).toContain(pushPreferenceA.id);
    expect(rows.map((row) => row.id)).not.toContain(pushPreferenceB.id);
    expect(rows.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, unfiltered webhook scans yield only league A rows", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, async (tx) => ({
      deliveries: await tx.select().from(webhookDeliveryRecords),
      webhooks: await tx.select().from(leagueWebhooks),
    }));

    expect(rows.webhooks.map((row) => row.id)).toContain(leagueWebhookA.id);
    expect(rows.webhooks.map((row) => row.id)).not.toContain(leagueWebhookB.id);
    expect(rows.webhooks.every((row) => row.leagueId === leagueA)).toBe(true);
    expect(rows.deliveries.map((row) => row.id)).toContain(webhookDeliveryA.id);
    expect(rows.deliveries.map((row) => row.id)).not.toContain(
      webhookDeliveryB.id,
    );
    expect(rows.deliveries.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, unfiltered digest delivery scans yield only league A rows", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(emailDigestDeliveryRecords),
    );

    expect(rows.map((row) => row.id)).toContain(emailDigestDeliveryA.id);
    expect(rows.map((row) => row.id)).not.toContain(emailDigestDeliveryB.id);
    expect(rows.every((row) => row.leagueId === leagueA)).toBe(true);
  });

  it("scoped to league A, content scans include central rows and league A only", async () => {
    const rows = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx
        .select({
          id: contentItems.id,
          leagueId: contentItems.leagueId,
        })
        .from(contentItems)
        .where(
          inArray(contentItems.id, [
            contentA.id,
            contentB.id,
            centralContent.id,
          ]),
        ),
    );
    expect(rows).toContainEqual({ id: contentA.id, leagueId: leagueA });
    expect(rows).toContainEqual({ id: centralContent.id, leagueId: null });
    expect(rows.map((row) => row.id)).not.toContain(contentB.id);
  });

  it("rejects writing a league B row from league A context (WITH CHECK)", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(fantasyTeams).values({
            leagueId: leagueB,
            provider: "espn",
            providerTeamId: `${marker}-bad-team`,
            leagueProviderId: `${marker}-b`,
            season: 2026,
            name: "Bad Team",
            contentHash: `${marker}-bad-team-hash`,
          }),
        ),
      ),
    ).toBe("42501"); // insufficient_privilege: new row violates row-level security policy
  });

  it("rejects writing a league B player stat breakdown from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(fantasyPlayerWeekStatBreakdowns).values({
            contentHash: `${marker}-bad-stat-breakdown-hash`,
            fantasyPoints: 4,
            leagueId: leagueB,
            leagueProviderId: `${marker}-b`,
            provider: "espn",
            providerPlayerId: `${marker}-bad-player`,
            providerStatId: 4,
            providerTeamId: teamB.providerTeamId,
            scoringPeriod: 1,
            season: 2026,
            statCategory: "passing",
            statKey: "passingTouchdowns",
            statSource: "actual",
            statValue: 1,
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing a league B bankroll week from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(bankrollWeeks).values({
            floorCents: 1_000_000,
            leagueId: leagueB,
            openingBalanceCents: 1_000_000,
            userId: userB.id,
            weekEnd: new Date("2026-09-15T00:00:00.000Z"),
            weekStart: new Date("2026-09-08T00:00:00.000Z"),
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing a league B data integrity row from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(dataIntegrityChecks).values({
            checkKey: "schedule_coverage",
            detail: { marker, bad: true },
            leagueId: leagueB,
            season: 2026,
            status: "fail",
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing a league B editorial action from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(editorialActions).values({
            action: "retract",
            actorUserId: userA.id,
            beforeContentItemId: contentB.id,
            leagueId: leagueB,
            reason: "bad cross-league retract",
            targetContentItemId: contentB.id,
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing a league B content reaction from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(contentReactions).values({
            contentItemId: contentB.id,
            emoji: "laugh",
            leagueId: leagueB,
            memberId: memberB.id,
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing league B persona tone history from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(aiPersonaToneHistory).values({
            leagueId: leagueB,
            persona: "commissioner",
            personaCardId: personaCardB.id,
            source: "edit",
            toneProfile: toneHistoryB.toneProfile,
            toneVersion: 2,
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing league B curation rows from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(leagueSeasonGroupings).values({
            derivedFrom: { marker, bad: true },
            kind: "era",
            leagueId: leagueB,
            name: "Bad Cross-League Era",
            ordinal: 9,
            status: "confirmed",
          }),
        ),
      ),
    ).toBe("42501");

    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(leagueGroupingSeasons).values({
            groupingId: leagueSeasonGroupingB.id,
            leagueId: leagueB,
            season: 2027,
          }),
        ),
      ),
    ).toBe("42501");

    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(leagueDataEdits).values({
            afterValue: "bad",
            beforeValue: null,
            editClass: "substantive",
            field: "grouping_confirmation",
            leagueId: leagueB,
            targetId: leagueSeasonGroupingB.id,
            targetKind: "grouping",
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing a league B instigation from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(instigations).values({
            dedupKey: `${marker}-bad-instigation`,
            groundingRefs: [{ id: teamB.id, type: "team" }],
            kind: "settle_it_poll",
            leagueId: leagueB,
            options: ["Team B", "Nobody"],
            persona: "trash_talker",
            promptText: "Bad cross-league instigation",
            status: "polling",
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing league B lore rows from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(loreSubjects).values({
            claimId: loreClaimB.id,
            leagueId: leagueB,
            season: 2026,
            subjectType: "season",
          }),
        ),
      ),
    ).toBe("42501");

    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(loreVerifications).values({
            assertedValue: "cross-league",
            claimId: loreClaimB.id,
            leagueId: leagueB,
            result: "uncheckable",
          }),
        ),
      ),
    ).toBe("42501");

    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(loreVotes).values({
            choice: "affirm",
            claimId: loreClaimB.id,
            leagueId: leagueB,
            voterMemberId: memberB.id,
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing a league B push preference from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(pushNotificationPreferences).values({
            channel: "none",
            enabled: false,
            eventFamily: "lore",
            leagueId: leagueB,
            type: "league.lore.vote.opened",
            userId: userB.id,
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing league B webhook rows from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(leagueWebhooks).values({
            encryptedUrl: `${marker}-bad-encrypted-webhook`,
            leagueId: leagueB,
            name: "Bad cross-league webhook",
            targetKind: "generic",
            urlHash: `${marker}-bad-webhook-hash`,
            urlLabel: "chat.example.test / encrypted endpoint",
          }),
        ),
      ),
    ).toBe("42501");

    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(webhookDeliveryRecords).values({
            contentItemId: contentB.id,
            deliveredAt: new Date("2026-06-12T00:00:00.000Z"),
            deliveryStatus: "delivered",
            eventKey: `content:${contentB.id}:bad`,
            eventType: "content.published",
            leagueId: leagueB,
            payload: { marker, bad: true },
            targetKind: "generic",
            webhookId: leagueWebhookB.id,
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("rejects writing a league B digest delivery from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(emailDigestDeliveryRecords).values({
            contentItemIds: [contentB.id],
            deliveredAt: new Date("2026-06-13T00:00:00.000Z"),
            deliveryStatus: "delivered",
            digestKey: `${marker}:weekly:bad`,
            leagueId: leagueB,
            payload: { marker, bad: true },
            recipientEmailHash: `${marker}-bad-digest-email-hash`,
            recipientUserId: userB.id,
            windowEndAt: new Date("2026-06-13T00:00:00.000Z"),
            windowStartAt: new Date("2026-06-06T00:00:00.000Z"),
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("enforces one claim vote per member", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(loreVotes).values({
            choice: "reject",
            claimId: loreClaimA.id,
            leagueId: leagueA,
            voterMemberId: memberA.id,
          }),
        ),
      ),
    ).toBe("23505");
  });

  it("rejects writing league B blog content from league A context", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx.insert(contentItems).values({
            authorPersona: "commissioner",
            body: "Bad content",
            contentHash: `${marker}-bad-content-hash`,
            dedupKey: `${marker}-bad-content`,
            kind: "blog",
            leagueId: leagueB,
            summary: "Bad summary",
            title: "Bad blog",
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("cannot update league B's rows from league A context", async () => {
    const updated = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx
        .update(fantasyTeams)
        .set({ name: "Should Not Change" })
        .where(eq(fantasyTeams.id, teamB.id))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const [intact] = await admin.db
      .select()
      .from(fantasyTeams)
      .where(eq(fantasyTeams.id, teamB.id));
    expect(intact.name).toBe("Team B");
  });

  it("cannot delete league B's rows from league A context", async () => {
    const deleted = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.delete(fantasyTeams).where(eq(fantasyTeams.id, teamB.id)).returning(),
    );
    expect(deleted).toHaveLength(0);

    const survivors = await admin.db
      .select()
      .from(fantasyTeams)
      .where(eq(fantasyTeams.id, teamB.id));
    expect(survivors).toHaveLength(1);
  });

  it("rejects direct lore event mutation while allowing append-only reads", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx
            .update(loreEvents)
            .set({ reason: "mutated" })
            .where(eq(loreEvents.id, loreEventA.id)),
        ),
      ),
    ).toBe("55000");
  });

  it("rejects direct editorial action mutation while allowing append-only reads", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx
            .update(editorialActions)
            .set({ reason: "mutated" })
            .where(eq(editorialActions.id, editorialActionA.id)),
        ),
      ),
    ).toBe("55000");
  });

  it("rejects direct persona tone history mutation while allowing append-only reads", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx
            .update(aiPersonaToneHistory)
            .set({ reason: "mutated" })
            .where(eq(aiPersonaToneHistory.id, toneHistoryA.id)),
        ),
      ),
    ).toBe("55000");
  });

  it("rejects direct webhook delivery mutation while allowing append-only reads", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx
            .update(webhookDeliveryRecords)
            .set({ errorMessage: "mutated" })
            .where(eq(webhookDeliveryRecords.id, webhookDeliveryA.id)),
        ),
      ),
    ).toBe("55000");
  });

  it("rejects direct digest delivery mutation while allowing append-only reads", async () => {
    expect(
      await sqlstateOf(
        withLeagueContext(canary.db, leagueA, (tx) =>
          tx
            .update(emailDigestDeliveryRecords)
            .set({ errorMessage: "mutated" })
            .where(eq(emailDigestDeliveryRecords.id, emailDigestDeliveryA.id)),
        ),
      ),
    ).toBe("55000");
  });

  it("allows normal reads and writes within the scoped league (positive control)", async () => {
    const inserted = await withLeagueContext(canary.db, leagueA, async (tx) => {
      const [row] = await tx
        .insert(fantasyTeams)
        .values({
          leagueId: leagueA,
          provider: "espn",
          providerTeamId: `${marker}-team-c`,
          leagueProviderId: `${marker}-a`,
          season: 2026,
          name: "Team C",
          abbrev: "C",
          contentHash: `${marker}-team-c-hash`,
        })
        .returning();
      return row;
    });
    expect(inserted.leagueId).toBe(leagueA);

    const seen = await withLeagueContext(canary.db, leagueA, (tx) =>
      tx.select().from(fantasyTeams).where(eq(fantasyTeams.id, inserted.id)),
    );
    expect(seen).toHaveLength(1);
  });

  it("keeps league B's own view intact when scoped to league B", async () => {
    const rows = await withLeagueContext(canary.db, leagueB, (tx) =>
      tx.select().from(fantasyTeams),
    );
    expect(rows.map((m) => m.id)).toContain(teamB.id);
    expect(rows.every((row) => row.leagueId === leagueB)).toBe(true);
  });
});
