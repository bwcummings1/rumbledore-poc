# Spec 46 — Distribution & Arrival (the content must reach the league)

> Outcomes spec. Content nobody sees isn't spectacle: the league already lives in a group chat (iMessage/
> GroupMe/Discord/WhatsApp), and this spec makes Rumbledore content **arrive** there — share cards, teaser
> links, webhooks, digest — plus the two arrival moments that define the product: the **cold-start launch
> edition** and the invite unfurl. Read `docs/NORTH-STAR.md` first; `DESIGN.md` is a gate. Builds on
> `specs/45` (lifecycle — share/teaser must respect `retracted`), `specs/05` (feeds), `specs/20`
> (notifications), `specs/04` (onboarding/invites), `specs/17` (entitlements). All external delivery
> (webhooks, email) follows the house mock discipline — `{mock:true}|{mock:false,…}` unions, $0 until keys/
> URLs exist.

## Why this spec exists (the soul)
The North Star's spectacle is **participatory** — it needs an audience arriving weekly, and the audience's
front page is their group chat, not our app. Today a pasted article link unfurls as a bare URL (zero
`generateMetadata` in the repo), a logged-out tap hits a login wall, iOS push only works after A2HS (most
members will never install), and a freshly connected league with 16 years of history sees an **empty** front
page. Every one of these is a first-impression moment; this spec makes each one land.

## Outcomes
1. **Every shareable URL unfurls beautifully** — typographic OG cards (headline, persona byline, league name,
   AUSPEX style). No player photos/logos — licensing-clean by construction.
2. **A shared league link shows a logged-out visitor a teaser**, not a wall: headline + lede + "claim your team
   to read the rest" — the viral loop's landing step.
3. **League content can post itself into the group chat** — per-league outbound webhook (Discord native;
   generic JSON for GroupMe/Slack), commissioner-configured, headline + link + share-card.
4. **A weekly digest email** exists for the members push can't reach (provider behind a mock boundary).
5. **A newly connected league gets a launch edition within minutes** — "this thing already knows your league."
6. **The notification stack is honest about iOS** — digest/webhook-first for casual members; push is the
   enhancement, not the baseline.

---

## A. Social preview metadata + share cards
- **NEW:** `generateMetadata` on every shareable route (central articles/sections, league press/posts,
  invite links, league home, arena) with title/description/OG/Twitter tags.
- **NEW:** dynamic OG image endpoint(s) via `next/og` `ImageResponse`: **typographic** AUSPEX cards (masthead
  style, headline, persona-tinted byline orb, league name, section chip). Deterministic per content (cacheable
  by content hash). Zero external assets — fonts embedded, no photos/logos.
- **Privacy posture:** the OG card for league-scoped content is **teaser-safe by design** — headline + byline +
  league name only (sharing a link into a chat is the member's deliberate act; the card must not leak body
  content). Central content cards may carry the summary. Retracted/superseded content unfurls to a neutral
  "no longer available" card (`specs/45 §B` events keep this current).

## B. Share links + logged-out teaser
- **NEW:** a share affordance on articles (copy-link + native share sheet) — the URL is the canonical article
  URL; no separate token infrastructure. Share actions respect entitlements and lifecycle state.
- **NEW:** logged-out arrival on a league article renders a **teaser view**: headline, byline, first paragraph,
  designed AUSPEX frame, then the join CTA — wired into the existing invite/claim flow (`specs/04`). The teaser
  read path goes through `withLeagueContext()` with an explicit, deliberately-scoped public-teaser query —
  documented as intentionally open the way deliberately-open tables already are, with tests asserting exactly
  what it exposes (headline/lede/byline; never body, never member data).
- Logged-out arrival on **central** content renders it fully (it's already league-agnostic) inside the
  logged-out frame with the join CTA.

## C. Group-chat webhooks (outbound)
- **NEW:** per-league `league_webhooks` (league-scoped RLS; commissioner-managed): target kind
  (`discord | generic`), URL (encrypted at rest like provider creds), event selection (new published content by
  section; optionally lore canonizations, record-broken). Delivery = headline + share URL (+ OG card unfurls do
  the visual work). Outbound goes through a `WebhookDeliverer` boundary: `{mock:true}` logs/records, real mode
  POSTs with retry/backoff + failure visibility in the `specs/45 §F` queue pattern. Deliveries respect
  lifecycle (never deliver retracted; deliver corrections per `specs/45 §E`).
- Rate/abuse posture: deliveries are cadence-driven (bounded by content caps); manual "send this post now" is
  commissioner-gated and idempotent per (webhook, content).

## D. Weekly digest email
- **NEW:** an `EmailSender` boundary (`{mock:true}` records to DB/log; provider choice deferred to the owner —
  Resend/Postmark/SES all fit behind it). A weekly Inngest digest job per league composes the week's published
  content (respecting lifecycle + entitlements) into a simple AUSPEX-flavored HTML digest; per-member opt-in/out
  rides the existing notification-preferences plane (`specs/20`). No real sends until a key + domain exist
  (owner set-aside).

## E. Cold-start launch edition
- **NEW:** a `league.connected` cadence trigger fired when onboarding completes a league's first successful
  full import: plans a **launch issue** from existing content types — a `season_arc` retrospective, a
  `rivalry_piece` on the most-played/closest H2H pair, a `milestone_record` hall-of-fame/lowlights piece —
  reading pushed canon (`specs/45 §A`) or, for a brand-new league pre-curation, clearly-labeled provider-import
  facts. Idempotent per league; capped; entitlement-aware; lands on the league front + feed so the first thing
  a new league sees is itself.

## F. Notification-stack honesty (iOS reality)
- **Posture (documented in `specs/20`'s living doc + `/you` copy):** web push requires A2HS on iOS; therefore
  the default member journey is **digest + group-chat webhook first**, push as enhancement after install. The
  PWA install prompt copy earns the install ("get scores + drops live") instead of assuming it.
- **NEW (small):** notification preferences groups channels (push / digest / none) per event family so the
  digest job and push fan-out read one preference source.

## G. Ops-readiness appendix (attach to Phase 4 — not built here)
Recorded here so the "obvious later" list survives; each is an explicit Phase-4 line item, not an assumed detail:
1. **Credential-death alerting:** sync-health check notifies owner/steward the day ESPN cookies die (reconnect
   UI exists; detection/alerting doesn't).
2. **Production deployment story:** hosting, domain/TLS, prod migrations, prod backups/DR, error tracking,
   secrets management — none exist yet (CI has no deploy workflow).
3. **Generation latency UX:** cast-orb "writing…" pending states wired to real runs the day real keys flip.
4. **Unit economics:** per-league cost attribution + rollup from the **first real call** (spend counters exist;
   attribution doesn't) — this number is the Phase-6 pricing model.

## H. Design & EXISTS/NEW
- **Design:** AUSPEX per `DESIGN.md`; the teaser frame and OG cards are brand moments — near-pixel fidelity;
  designed logged-out/empty states; a11y; reduced-motion-safe.
- **EXISTS — extend:** invite/claim flow, notification preferences, Inngest cadence, encrypted-credential
  storage pattern, content caps, `specs/45` lifecycle/events.
- **NEW tables:** `league_webhooks`, digest/webhook delivery records (league-scoped RLS + FORCE + canary rows
  day one; delivery records append-only).

## I. Acceptance criteria (testable, fixture-backed)
1. **Unfurl:** every shareable route emits complete OG/Twitter metadata; the OG image endpoint renders
   deterministic cards for article/central/invite/retracted cases (snapshot-tested); league cards never contain
   body text.
2. **Teaser:** logged-out league-article request renders headline/lede/CTA and provably never serializes body or
   member data; logged-in renders full; retracted renders the retracted state.
3. **Webhooks:** commissioner CRUD is role-gated + encrypted; mock delivery records exactly one delivery per
   (webhook, content) across cadence retries; retracted content never delivers; failures are visible.
4. **Digest:** mock digest for a fixture week contains exactly the published-state content the member's
   entitlements allow; opt-out excludes; empty week sends nothing.
5. **Launch edition:** a fresh fixture league connect yields the capped launch set exactly once (idempotent on
   re-import); pieces pass the judge gate; front/feed show them.
6. **Preferences:** channel/event-family matrix drives both push fan-out and digest inclusion from one source.
7. **RLS:** canary covers all new tables; cross-league isolation holds; webhook URLs never appear in logs
   (redacting logger test).
8. **Gates:** typecheck/lint/test/eval:ai:offline (content paths)/build/perf:pwa/ubs/secret-scan all green.

### Needs the later human pass
OG card art direction; teaser copy/CTA; digest visual design; webhook "send now" placement; install-prompt copy;
email provider + domain choice (owner).

## Dependencies / blocked-by
- **`specs/45` §B lifecycle is a hard prerequisite** for §A/§B/§C/§D (share/teaser/delivery must respect
  retraction). §E needs `specs/45 §A` canon reads. §G is Phase-4 planning only.
## Non-goals
- Inbound chat bots / two-way chat integrations; SMS; public SEO for league content (stays private-by-teaser);
  real email/webhook sends before owner-provided keys; App Store wrappers.
