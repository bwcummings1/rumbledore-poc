export const OG_IMAGE_SIZE = {
  height: 630,
  width: 1200,
} as const;

export type OgCardKind =
  | "arena"
  | "central_article"
  | "invite"
  | "league_article"
  | "league_home"
  | "neutral"
  | "section";

export type OgCardStatus = "published" | "retracted" | "superseded";

export interface OgCardData {
  byline: string;
  headline: string;
  kind: OgCardKind;
  leagueName: string;
  section: string;
  status: OgCardStatus;
  summary: string;
}

const TEXT_LIMITS = {
  byline: 84,
  headline: 112,
  leagueName: 84,
  section: 42,
  summary: 134,
} as const;

const BRAND_MARK = "RUMBLEDORE";

const KIND_LABELS = {
  arena: "Arena desk",
  central_article: "Central news",
  invite: "League invite",
  league_article: "The Press",
  league_home: "League home",
  neutral: "Status notice",
  section: "Edition",
} as const satisfies Record<OgCardKind, string>;

export function ogCardFromSearchParams(params: URLSearchParams): OgCardData {
  const kind = parseKind(params.get("kind"));
  const status = parseStatus(params.get("status"));
  if (status !== "published" || kind === "neutral") {
    return {
      byline: "Editorial desk",
      headline: "No longer available",
      kind: "neutral",
      leagueName: "",
      section: "Editorial lifecycle",
      status: status === "published" ? "retracted" : status,
      summary: "This story was retracted or superseded.",
    };
  }

  const headline = cleanCardText(params.get("title"), TEXT_LIMITS.headline);
  return {
    byline:
      cleanCardText(params.get("byline"), TEXT_LIMITS.byline) ||
      defaultByline(kind),
    headline: headline || defaultHeadline(kind),
    kind,
    leagueName: cleanCardText(params.get("league"), TEXT_LIMITS.leagueName),
    section:
      cleanCardText(params.get("section"), TEXT_LIMITS.section) ||
      KIND_LABELS[kind],
    status: "published",
    summary:
      kind === "central_article"
        ? cleanCardText(params.get("summary"), TEXT_LIMITS.summary)
        : "",
  };
}

export function ogCardSnapshot(data: OgCardData) {
  return {
    brandMark: BRAND_MARK,
    byline: data.byline,
    bylineContext: KIND_LABELS[data.kind],
    headline: data.headline,
    kind: data.kind,
    leagueName: data.leagueName,
    section: data.section,
    status: data.status,
    summary: data.summary,
    sectionChip: data.section,
  };
}

export function renderOgCard(data: OgCardData) {
  const isNeutral = data.status !== "published";
  const accent = isNeutral ? "#82B2D0" : accentForKind(data.kind);
  const secondaryAccent = isNeutral ? "#6E7290" : "#E2B266";

  return (
    <div
      style={{
        alignItems: "stretch",
        background:
          "radial-gradient(900px 520px at 82% -12%, rgba(111,114,201,.22), transparent 62%), radial-gradient(760px 480px at 7% 108%, rgba(185,138,56,.13), transparent 58%), linear-gradient(180deg,#0E1019,#08090F 68%)",
        color: "#E7E9F3",
        display: "flex",
        fontFamily: "Arial",
        height: "100%",
        justifyContent: "center",
        padding: 54,
        width: "100%",
      }}
    >
      <div
        style={{
          border: "1px solid rgba(170,176,210,.24)",
          borderRadius: 28,
          boxShadow: "0 26px 68px rgba(0,0,0,.38)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          overflow: "hidden",
          padding: 46,
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(158deg,rgba(27,29,41,.88),rgba(13,15,23,.94))",
            display: "flex",
            inset: 0,
            position: "absolute",
          }}
        />
        <div
          style={{
            background:
              "repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 4px)",
            display: "flex",
            inset: 0,
            opacity: 0.5,
            position: "absolute",
          }}
        />

        <div
          style={{
            alignItems: "center",
            display: "flex",
            position: "relative",
          }}
        >
          <div
            style={{
              color: accent,
              display: "flex",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 7,
              textTransform: "uppercase",
            }}
          >
            {BRAND_MARK}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 22,
            position: "relative",
          }}
        >
          {data.leagueName ? (
            <div
              style={{
                color: "#AEB2C8",
                display: "flex",
                fontSize: 28,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              {data.leagueName}
            </div>
          ) : null}
          <div
            style={{
              color: "#E7E9F3",
              display: "flex",
              fontSize: 70,
              fontWeight: 800,
              letterSpacing: 0,
              lineHeight: 1.02,
              maxWidth: 900,
            }}
          >
            {data.headline}
          </div>
          {data.summary ? (
            <div
              style={{
                color: "#AEB2C8",
                display: "flex",
                fontSize: 30,
                lineHeight: 1.25,
                maxWidth: 850,
              }}
            >
              {data.summary}
            </div>
          ) : null}
        </div>

        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: 18,
            }}
          >
            <div
              style={{
                alignItems: "center",
                background: `linear-gradient(135deg, ${accent}, ${secondaryAccent}, #5FC9C0)`,
                borderRadius: 999,
                boxShadow: `0 0 34px ${accent}`,
                display: "flex",
                height: 58,
                justifyContent: "center",
                width: 58,
              }}
            >
              <span
                style={{
                  background:
                    "radial-gradient(circle at 42% 38%,#1B1D2B,#08090F 72%)",
                  borderRadius: 999,
                  display: "flex",
                  height: 32,
                  width: 32,
                }}
              />
            </div>
            <div
              style={{
                color: "#E7E9F3",
                display: "flex",
                flexDirection: "column",
                fontSize: 28,
                gap: 4,
              }}
            >
              <span>{data.byline}</span>
              <span
                style={{
                  color: "#6E7290",
                  fontSize: 20,
                  letterSpacing: 4,
                  textTransform: "uppercase",
                }}
              >
                {KIND_LABELS[data.kind]}
              </span>
            </div>
          </div>
          <div
            style={{
              background: "rgba(20,22,34,.62)",
              border: "1px solid rgba(170,176,210,.30)",
              borderRadius: 999,
              color: accent,
              display: "flex",
              fontSize: 22,
              letterSpacing: 4,
              padding: "13px 18px",
              textTransform: "uppercase",
            }}
          >
            {data.section}
          </div>
        </div>
      </div>
    </div>
  );
}

function parseKind(value: string | null): OgCardKind {
  switch (value) {
    case "arena":
    case "central_article":
    case "invite":
    case "league_article":
    case "league_home":
    case "neutral":
    case "section":
      return value;
    default:
      return "section";
  }
}

function parseStatus(value: string | null): OgCardStatus {
  switch (value) {
    case "retracted":
    case "superseded":
      return value;
    default:
      return "published";
  }
}

function cleanCardText(
  value: string | null | undefined,
  limit: number,
): string {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function defaultByline(kind: OgCardKind): string {
  switch (kind) {
    case "central_article":
      return "Central fantasy desk";
    case "league_article":
      return "The Rumbledore cast";
    case "invite":
      return "League office";
    case "arena":
      return "Arena desk";
    case "league_home":
      return "League home";
    case "neutral":
    case "section":
      return "Editorial desk";
  }
}

function defaultHeadline(kind: OgCardKind): string {
  switch (kind) {
    case "arena":
      return "Arena";
    case "central_article":
      return "Rumbledore News";
    case "invite":
      return "Claim your team";
    case "league_article":
      return "The Press";
    case "league_home":
      return "League home";
    case "neutral":
      return "No longer available";
    case "section":
      return "Latest dispatch";
  }
}

function accentForKind(kind: OgCardKind): string {
  switch (kind) {
    case "arena":
      return "#E2B266";
    case "central_article":
      return "#82B2D0";
    case "invite":
      return "#6FC79A";
    case "league_article":
    case "league_home":
      return "#A7A9EC";
    case "neutral":
      return "#82B2D0";
    case "section":
      return "#A7A9EC";
  }
}
