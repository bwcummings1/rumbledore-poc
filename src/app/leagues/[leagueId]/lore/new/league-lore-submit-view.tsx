"use client";

import { ArrowLeft, CheckCircle2, FilePlus2, Landmark } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { onboardingPanelError, postJson } from "@/app/onboarding/client-http";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
      readonly resultStatus: LoreClaimSubmitResponse["status"];
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

function resultTitle(state: Extract<SubmitState, { status: "success" }>) {
  switch (state.resultStatus) {
    case "canonized":
      return "On the record";
    case "rejected":
      return "Refuted by the record";
    case "vote":
      return "Posted for league vote";
  }
}

function resultTone(state: SubmitState) {
  if (state.status === "error") {
    return "danger" as const;
  }
  if (state.status !== "success") {
    return "info" as const;
  }
  switch (state.resultStatus) {
    case "canonized":
      return "ok" as const;
    case "rejected":
      return "danger" as const;
    case "vote":
      return "info" as const;
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
        resultStatus: result.status,
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
        <div className="panel grid gap-3 p-4">
          <div className="flex items-center gap-2 text-primary">
            <Landmark className="size-5" aria-hidden="true" />
            <p className="eyebrow text-primary">Submit claim</p>
          </div>
          <div className="max-w-2xl">
            <h1 className="heading-auspex text-xl leading-tight">
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
        <section className="panel grid gap-4 p-4">
          <div>
            <h2 className="font-display text-base font-medium text-foreground">
              Claim
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Write it like the league would say it.
            </p>
          </div>
          <Field controlId="title" label="Title">
            {({ controlProps }) => (
              <Input
                {...controlProps}
                maxLength={160}
                onChange={(event) => setTitle(event.currentTarget.value)}
                placeholder="The 2019 trade was the worst move in league history"
                required
                value={title}
              />
            )}
          </Field>
          <Field controlId="body" label="Statement">
            {({ controlProps }) => (
              <Textarea
                {...controlProps}
                className="min-h-36"
                maxLength={4000}
                onChange={(event) => setBody(event.currentTarget.value)}
                placeholder="Make the case for the record."
                required
                showCount={true}
                value={body}
              />
            )}
          </Field>
        </section>

        <section className="panel grid gap-4 p-4">
          <div>
            <h2 className="font-display text-base font-medium text-foreground">
              Subjects
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional canonical tags keep lore attached to durable league
              history.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field controlId="subject-person" label="Person">
              {({ controlProps }) => (
                <Select
                  {...controlProps}
                  onValueChange={setSubjectPersonId}
                  options={[
                    { label: "No person tag", value: "" },
                    ...data.submitOptions.people.map((person) => ({
                      label: person.name,
                      value: person.id,
                    })),
                  ]}
                  value={subjectPersonId}
                />
              )}
            </Field>
            <Field controlId="subject-record" label="Record">
              {({ controlProps }) => (
                <Select
                  {...controlProps}
                  onValueChange={setSubjectRecordType}
                  options={[
                    { label: "No record tag", value: "" },
                    ...data.submitOptions.recordTypes.map((record) => ({
                      label: record.label,
                      value: record.recordType,
                    })),
                  ]}
                  value={subjectRecordType}
                />
              )}
            </Field>
            <Field controlId="subject-season" label="Season">
              {({ controlProps }) => (
                <Select
                  {...controlProps}
                  onValueChange={(nextValue) => {
                    setSubjectSeason(nextValue);
                    setSubjectWeek("");
                  }}
                  options={[
                    { label: "No season tag", value: "" },
                    ...data.submitOptions.seasons.map((season) => ({
                      label: String(season.season),
                      value: optionValue(season.season),
                    })),
                  ]}
                  value={subjectSeason}
                />
              )}
            </Field>
            <Field controlId="subject-week" label="Week">
              {({ controlProps }) => (
                <Select
                  {...controlProps}
                  disabled={subjectWeekOptions.length === 0}
                  onValueChange={setSubjectWeek}
                  options={[
                    { label: "No week tag", value: "" },
                    ...subjectWeekOptions.map((week) => ({
                      label: `Week ${week}`,
                      value: optionValue(week),
                    })),
                  ]}
                  value={subjectWeek}
                />
              )}
            </Field>
          </div>
        </section>

        <section className="panel grid gap-4 p-4">
          <Checkbox
            checked={includeAssertion}
            description="Leave this off for a pure opinion claim."
            label="Assert a structured fact"
            onCheckedChange={setIncludeAssertion}
          />

          {includeAssertion ? (
            <div className="grid gap-4 border-border border-t pt-4">
              <div className="cell p-3 text-sm text-muted-foreground">
                Checked against the record before the league has to vote. If the
                imported data cannot verify it, the claim falls back to league
                decision.
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field controlId="assertion-source" label="Fact source">
                  <Segmented
                    aria-label="Fact source"
                    onValueChange={(nextValue) =>
                      setAssertionSource(nextValue as LoreAssertionSource)
                    }
                    options={LORE_ASSERTION_SOURCES.map((source) => ({
                      label: sourceLabel(source),
                      value: source,
                    }))}
                    value={assertionSource}
                  />
                </Field>

                {assertionSource !== "all_time_record" ? (
                  <Field controlId="assertion-person" label="Person">
                    {({ controlProps }) => (
                      <Select
                        {...controlProps}
                        onValueChange={setAssertionPersonId}
                        options={[
                          { label: "Pick person", value: "" },
                          ...data.submitOptions.people.map((person) => ({
                            label: person.name,
                            value: person.id,
                          })),
                        ]}
                        value={assertionPersonId}
                      />
                    )}
                  </Field>
                ) : (
                  <Field controlId="record-type" label="Record type">
                    {({ controlProps }) => (
                      <Select
                        {...controlProps}
                        onValueChange={setRecordType}
                        options={[
                          { label: "Pick record", value: "" },
                          ...data.submitOptions.recordTypes.map((record) => ({
                            label: record.label,
                            value: record.recordType,
                          })),
                        ]}
                        value={recordType}
                      />
                    )}
                  </Field>
                )}

                {assertionSource !== "all_time_record" ? (
                  <Field controlId="assertion-season" label="Season">
                    {({ controlProps }) => (
                      <Select
                        {...controlProps}
                        onValueChange={(nextValue) => {
                          setAssertionSeason(nextValue);
                          setAssertionWeek("");
                        }}
                        options={[
                          { label: "Pick season", value: "" },
                          ...data.submitOptions.seasons.map((season) => ({
                            label: String(season.season),
                            value: optionValue(season.season),
                          })),
                        ]}
                        value={assertionSeason}
                      />
                    )}
                  </Field>
                ) : (
                  <Field controlId="record-holder" label="Holder">
                    {({ controlProps }) => (
                      <Select
                        {...controlProps}
                        onValueChange={setRecordHolderPersonId}
                        options={[
                          { label: "Any holder", value: "" },
                          ...data.submitOptions.people.map((person) => ({
                            label: person.name,
                            value: person.id,
                          })),
                        ]}
                        value={recordHolderPersonId}
                      />
                    )}
                  </Field>
                )}

                {assertionSource === "weekly_statistics" ? (
                  <Field controlId="assertion-week" label="Week">
                    {({ controlProps }) => (
                      <Select
                        {...controlProps}
                        disabled={assertionWeekOptions.length === 0}
                        onValueChange={setAssertionWeek}
                        options={[
                          { label: "Pick week", value: "" },
                          ...assertionWeekOptions.map((week) => ({
                            label: `Week ${week}`,
                            value: optionValue(week),
                          })),
                        ]}
                        value={assertionWeek}
                      />
                    )}
                  </Field>
                ) : null}

                {assertionSource === "season_statistics" ? (
                  <Field controlId="season-metric" label="Metric">
                    {({ controlProps }) => (
                      <Select
                        {...controlProps}
                        onValueChange={(nextValue) =>
                          setSeasonMetric(
                            nextValue as (typeof SEASON_LORE_METRICS)[number],
                          )
                        }
                        options={SEASON_LORE_METRICS.map((metric) => ({
                          label: loreMetricLabel(metric),
                          value: metric,
                        }))}
                        value={seasonMetric}
                      />
                    )}
                  </Field>
                ) : null}

                {assertionSource === "weekly_statistics" ? (
                  <Field controlId="weekly-metric" label="Metric">
                    {({ controlProps }) => (
                      <Select
                        {...controlProps}
                        onValueChange={(nextValue) =>
                          setWeeklyMetric(
                            nextValue as (typeof WEEKLY_LORE_METRICS)[number],
                          )
                        }
                        options={WEEKLY_LORE_METRICS.map((metric) => ({
                          label: loreMetricLabel(metric),
                          value: metric,
                        }))}
                        value={weeklyMetric}
                      />
                    )}
                  </Field>
                ) : null}

                {assertionSource === "all_time_record" ? (
                  <>
                    <Field controlId="record-season" label="Season">
                      {({ controlProps }) => (
                        <Input
                          {...controlProps}
                          inputMode="numeric"
                          onChange={(event) =>
                            setRecordSeason(event.currentTarget.value)
                          }
                          placeholder="Optional"
                          tone="numeric"
                          value={recordSeason}
                        />
                      )}
                    </Field>
                    <Field controlId="record-week" label="Week">
                      {({ controlProps }) => (
                        <Input
                          {...controlProps}
                          inputMode="numeric"
                          onChange={(event) =>
                            setRecordWeek(event.currentTarget.value)
                          }
                          placeholder="Optional"
                          tone="numeric"
                          value={recordWeek}
                        />
                      )}
                    </Field>
                  </>
                ) : null}
              </div>

              {assertionSource === "season_statistics" &&
              BOOLEAN_SEASON_METRICS.has(seasonMetric) ? (
                <Field controlId="asserted-boolean" label="Asserted value">
                  <RadioGroup
                    onValueChange={setAssertedBoolean}
                    options={[
                      { label: "True", value: "true" },
                      { label: "False", value: "false" },
                    ]}
                    value={assertedBoolean}
                  />
                </Field>
              ) : (
                <Field controlId="asserted-value" label="Asserted value">
                  {({ controlProps }) => (
                    <Input
                      {...controlProps}
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
                      tone={
                        assertionSource === "season_statistics" &&
                        seasonMetric === "final_placement"
                          ? "default"
                          : "numeric"
                      }
                      value={assertedValue}
                    />
                  )}
                </Field>
              )}
            </div>
          ) : (
            <div className="cell p-3 text-sm text-muted-foreground">
              Opinion mode: the league will decide this claim by quorum vote.
            </div>
          )}
        </section>

        {submitState.message ? (
          <Alert
            actions={
              submitState.status === "success" ? (
                <Link
                  href={`/leagues/${encodeURIComponent(data.league.id)}/lore/${encodeURIComponent(submitState.claimId)}`}
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  Open claim
                </Link>
              ) : null
            }
            icon={
              submitState.status === "success" ? (
                <CheckCircle2 className="size-5" />
              ) : undefined
            }
            role={submitState.status === "error" ? "alert" : "status"}
            title={
              submitState.status === "success"
                ? resultTitle(submitState)
                : "Claim could not be posted"
            }
            tone={resultTone(submitState)}
          >
            <p>{submitState.message}</p>
          </Alert>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Link
            href={loreHref}
            className={cn(buttonVariants({ variant: "ghost" }))}
          >
            Cancel
          </Link>
          <Button
            disabled={submitDisabled}
            loading={submitState.status === "submitting"}
            loadingLabel="Submitting claim"
            type="submit"
          >
            <FilePlus2 data-icon="inline-start" />
            {submitState.status === "submitting" ? "Submitting" : "Submit"}
          </Button>
        </div>
      </form>
    </main>
  );
}
