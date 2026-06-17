# Spec 24 — Mobile PWA Shell (installable, shareable, snappy)

> Outcomes spec. Defines WHAT the installable, mobile-first PWA shell delivers — not the line-by-line HOW, and
> **not** the visual design language (that is the later human-paired Soul phase; see Scope boundary).
> Read `docs/NORTH-STAR.md` FIRST. Rumbledore is **mobile-first**, **distributed by a shareable link**, and
> **snappy — nothing dated**: the product spreads *phone-to-phone*. A leaguemate gets a text, taps a link, lands
> in the right place in under a couple seconds, and can pin Rumbledore to their home screen so it lives where
> their group chat lives. The shell is the vehicle for the show, not the show.
> References: `specs/10` (App Router shell + two-scope IA/nav — EXISTS), `specs/16` (viral invite/claim loop —
> EXISTS), `specs/20` (realtime/push — the SW hosts Web Push). Real modules: `src/app/manifest.ts`,
> `public/sw.js`, `src/components/pwa/service-worker-registration.tsx`, `src/lib/pwa.ts`, `src/app/offline/page.tsx`,
> `src/app/layout.tsx`, `src/navigation/navigation-shell.tsx`, `src/app/invite/[leagueId]/[token]/page.tsx`,
> `src/app/you/you-account-view.tsx`.

## Why this spec exists (the soul)
The North Star says the product *spreads phone-to-phone*. That is a technical claim as much as a cultural one: the
moment a leaguemate taps the share link must feel like opening an app, not loading a website. If the cold start is
a white screen and a spinner, the spectacle dies before the first joke lands. This spec makes the shell **feel
like an installed app** — instant frame, skeletoned content, a home-screen icon — so the cast's writing arrives in
a container worthy of it. Installability and speed are not chrome; they are how the show reaches the next phone.

## What EXISTS today (do not rebuild — extend)
- **App Router shell + two-scope IA/nav** (`specs/10`): `src/app/layout.tsx`, `src/navigation/navigation-shell.tsx`,
  the league switcher, Global vs League scopes. Mobile-first layout (safe-area utilities, `min-h-dvh`,
  `viewportFit: "cover"`) is already present on key surfaces.
- **Web App Manifest** — `src/app/manifest.ts` (Next `MetadataRoute.Manifest`): `name`, `short_name`, `id`,
  `start_url`/`scope` `/`, `display: "standalone"`, `orientation: "portrait"`, theme/background from
  `PWA_BACKGROUND_HEX` (`src/lib/pwa.ts`), 192/512/maskable icons in `public/icons/`. Apple meta
  (`appleWebApp`, `apple-touch-icon`) set in `layout.tsx`.
- **Service worker** — `public/sw.js`: versioned shell/pages/assets caches, `install`/`activate`/`fetch` handlers
  (network-first navigations → cached page → `/offline` fallback; cache-first for `/_next/static/` and `/icons/`),
  plus `push` + `notificationclick` for Web Push (`specs/20`). Registered production-only via
  `src/components/pwa/service-worker-registration.tsx` (mounted in `layout.tsx`).
- **Offline shell page** — `src/app/offline/page.tsx` (static, precached as the navigation fallback).
- **Push opt-in** — `src/components/pwa/league-notification-toggle.tsx` subscribes via `/api/push/*` (`specs/20`).
- **Share/invite landing** — `src/app/invite/[leagueId]/[token]/page.tsx`: public preview, routes authed users to
  accept and unauthed users to `/onboarding/[provider]` (`specs/16`).

## What is NEW / CHANGES (this spec's deltas)
1. **Install affordance** (NEW) — a first-class "Add to home screen" UX on Android (`beforeinstallprompt`) and a
   documented iOS Share→Add flow; surfaced in **You** and contextually after a meaningful first session.
2. **Service worker hardening** (CHANGES) — make app-shell caching provably safe for an authed, RLS app: never
   cache another user's or league's data; precache a tiny *shell* only; update flow that doesn't strand users on
   stale chunks.
3. **Share-link routing** (NEW/extend) — a documented contract for the link types that drop a user into the right
   scope (league / invite / article) and bounce unauthed users into onboarding, preserving the destination.
4. **Perf budget** (NEW) — measurable "snappy" targets (cold start, route transition, skeleton-first), checkable
   in CI/Lighthouse.

---

## A. Installability

The app must satisfy browser installability criteria and offer a clear, non-nagging way to install on both
platforms — acknowledging that **iOS has no install-prompt API**.

- **Manifest validity (EXISTS, lock it).** Served at `/manifest.webmanifest`, linked from the document head (Next
  emits this from `src/app/manifest.ts`). Must keep: `name`, `short_name` (≤ 12 chars so the home-screen label
  isn't truncated), `start_url`/`scope` (`/`), `display: "standalone"`, `theme_color` + `background_color` as
  6-digit sRGB hex (oklch is not valid in a manifest — conversion lives in `src/lib/pwa.ts`), and icons including a
  192px, a 512px, and a **maskable** 512px (Android adaptive icons). `id` is set so the install identity is stable
  across `start_url` changes.
- **Splash / launch.** `background_color` + `theme_color` + the 512 icon drive the OS-generated splash; the cold
  boot must paint the brand background immediately, never a white flash (ties to the perf budget below).
- **Apple standalone (EXISTS, lock it).** `appleWebApp.capable`, status-bar style, `apple-touch-icon.png`, and
  `viewportFit: "cover"` keep the standalone iOS frame edge-to-edge under the notch; content opts back in via
  safe-area utilities. Verify no surface clips under the home indicator / status bar.
- **Android install affordance (NEW).** Capture the `beforeinstallprompt` event (preventing the default mini-infobar),
  stash the deferred prompt, and expose an **"Add to home screen"** control in **You** (`src/app/you/you-account-view.tsx`)
  and optionally a dismissible banner after a qualifying session. Tapping calls `prompt()`; reflect the
  `userChoice` outcome; hide the control once `appinstalled` fires or when already running standalone
  (`window.matchMedia("(display-mode: standalone)")` or `navigator.standalone`). Persist dismissal so we don't nag.
- **iOS install affordance (NEW — no API exists).** iOS Safari exposes **no** `beforeinstallprompt`. When we detect
  iOS Safari **and** not-standalone, show concise **instructions**: tap the **Share** button → **Add to Home
  Screen**. Do not show a fake "install" button that can't trigger the OS. Detection must be feature/UA-based and
  must not render the instructions inside an already-installed standalone session, nor inside non-Safari iOS
  browsers (which can't add to home screen reliably).
- **No nagging.** The affordance is opt-in and dismissible; never block content behind an install wall. The viral
  loop must work fully in a plain browser tab — install is an upgrade, not a gate.

## B. Service worker (snappy cold start + safe offline shell)

The SW exists to (1) make repeat cold starts instant by serving a cached **shell**, (2) provide a graceful
**offline state** (not full offline data), and (3) host Web Push (`specs/20`). Caching must be **safe for an
authed, RLS app**.

- **App-shell precache (EXISTS, keep minimal).** Precache only the offline page, the manifest, and icons — the
  static frame. The shell is the chrome; it must contain **zero** user- or league-specific data.
- **Runtime caching strategy (CHANGES — make it RLS-safe).**
  - *Navigations*: network-first (fresh wins online), falling back to a cached page and finally `/offline`.
  - *Static build output* (`/_next/static/`, `/icons/`): cache-first (content-hashed, immutable per deploy).
  - **Never cache authed or league-scoped responses.** This is the hard rule. The SW MUST NOT cache:
    `/api/*`; any `POST`/non-`GET`; any cross-origin request; and any response carrying a `Vary` / `Cache-Control:
    private` / `no-store` signal. League/user HTML pages may be served from the *pages* cache only as an
    offline fallback for the *same* navigation; they must not leak across users on a shared device — on sign-out
    the app MUST clear the pages cache (and unsubscribe push) so the next user starts clean. A cached page is a
    fallback frame, never a data source of record.
  - Cross-origin and `Authorization`/cookie-sensitive third-party requests pass straight through (the SW only
    handles same-origin GETs).
- **Update flow (CHANGES).** Bump the cache `VERSION` when the strategy changes; `activate` deletes stale caches.
  Avoid stranding a user on stale JS: a deploy that changes hashed chunks must be picked up (the SW takes control
  via `clients.claim()`); surface an unobtrusive "refresh for the latest" cue rather than silently serving old code
  across a hard route boundary. **Dev stays unregistered** (registration is production-only) so HMR/hot reload isn't
  masked.
- **Offline state (EXISTS, keep honest).** `/offline` is a calm, branded "you're offline — reconnect to see live
  league data" frame — explicitly NOT a promise of cached league content. Do not fake offline data.
- **Push (EXISTS — owned by `specs/20`).** `push` builds a sanitized notification (safe defaults for
  title/body/tag/url, ignore malformed payloads), `notificationclick` focuses an existing window or opens the
  target URL, clamped to our origin. This spec does not change push mechanics; it guarantees the SW that hosts them
  ships and registers.

## C. Shareable entry (deep links → right scope, or onboarding)

The link in the group chat is the front door. Every share/deep link resolves to the **correct scope** (`specs/10`)
and, if the user isn't signed in, routes them through onboarding **without losing the destination** — the viral
invite loop (`specs/16`).

- **Link types & destinations.**
  - *Invite link* — `/invite/[leagueId]/[token]` (EXISTS): public preview of the league + the claimable team;
    authed → accept/claim, unauthed → `/onboarding/[provider]` then back to claim (`specs/16`).
  - *League-scoped link* — `/leagues/[leagueId]/…` (Home, The Press + a specific post, Bet, Records, Members):
    drops the user into that league's section under its RLS context. A non-member or unauthed user must hit a
    **clean gated state** (sign-in / no-access / 404), never a leak or a blank page — reusing the `specs/10` auth
    guards and league-section access states.
  - *Article / central link* — `/news/...` and league `press/[postId]`: open-read where the IA allows; deep-link
    straight to the piece so a shared recap lands on the recap.
- **Auth bounce preserves intent (NEW contract).** An unauthenticated user hitting any protected deep link is sent
  to sign-in / onboarding with the **original destination preserved** (e.g. a `redirect`/`next` param or the invite
  token), and returned there on success. No "you must sign in" dead-ends that drop the share's payload.
- **Standalone continuity.** Links opened from outside the installed app (a browser tab from the group chat) behave
  identically to in-app navigation; once installed, in-scope links navigate within the standalone window. The
  manifest `scope` keeps in-scope URLs inside the installed app rather than kicking out to the browser.
- **Shareability primitive.** Surfaces that are meant to spread (an invite, a notable article) expose a copy-link /
  native-share affordance (Web Share API where available, copy-to-clipboard fallback) so the phone-to-phone loop
  has a one-tap path. (Invite-channel mechanics — SMS/email/copy — are owned by `specs/16`; this spec ensures the
  shell can hand a clean URL to the OS share sheet.)

## D. Perf budget (the "snappy" bar)

"Snappy, nothing dated" is measurable. Targets are mobile-first (mid-tier Android, throttled 4G) unless noted, and
are CI/Lighthouse-checkable.

- **Cold start (first contentful paint):** ≤ ~1.8s on throttled 4G / mid-tier mobile; **no white flash** — the
  brand background paints immediately (manifest `background_color` + themed `<html>`).
- **Repeat cold start (installed/SW-warm):** shell frame visible ≤ ~1s (precached shell + cached static chunks).
- **Route transition:** interactive within ~300ms perceived — **skeletons over spinners**. Every data-backed route
  shows a layout-stable skeleton immediately (App Router `loading.tsx` / Suspense) rather than a blank or a
  centered spinner. The frame (nav shell) never blanks between routes.
- **Layout stability:** CLS < 0.1; skeletons reserve final dimensions so content doesn't jump when it arrives.
- **Input latency:** tap targets ≥ 44px; INP within a "good" budget on mobile; no main-thread jank on the switcher
  or nav.
- **Bundle discipline:** keep the shell/route JS lean (server components by default per AGENTS conventions; client
  components only where needed). A budget regression on the shell entry bundle should be visible in CI.
- **Lighthouse PWA + Performance:** the installable-PWA criteria pass; Performance meets the above. These run as a
  checkable gate (Lighthouse CI or equivalent) on the shell routes.

## Scope boundary (FUNCTIONAL shell only — defer the Soul)
This spec delivers the **functional app-feel**: installability, a safe/snappy service worker, share-link routing,
and a measurable perf budget. It explicitly **DEFERS the visual design overhaul** — final color/type/motion
language, iconography polish, splash art, install-banner styling, skeleton choreography, and copy voice — to the
later human-paired **Soul** phase (North Star "functionality first, surface soul later"; AUSPEX-fidelity per
`docs/design/rumbledore-design-language.md` and human-in-the-room taste ride that pass). Where this spec says "branded," it means *uses the existing tokens*, not
*introduces a design language*.

## Acceptance criteria (testable)
1. **Manifest valid + installable.** `/manifest.webmanifest` parses; has `name`, `short_name` (≤ 12 chars),
   `start_url`/`scope` `/`, `display: "standalone"`, 6-digit-hex `theme_color` + `background_color`, and 192/512 +
   maskable icons each pointing at a real file in `public/` (extends `src/app/manifest.test.ts`). A Lighthouse/PWA
   installability check passes on the shell.
2. **Install affordance, both platforms.** On Android, an "Add to home screen" control appears only when
   `beforeinstallprompt` fired and the app isn't already standalone, calls the deferred `prompt()`, and hides after
   `appinstalled`. On iOS Safari (non-standalone) the Share→Add instructions render; they do **not** render in an
   installed standalone session, on non-Safari iOS, or on desktop where install is handled by the browser UI.
3. **SW caches shell + serves offline state.** The SW registers (production), precaches the offline shell, serves
   `/_next/static/` and `/icons/` cache-first, and falls back to `/offline` when a navigation fails offline
   (extends the existing `manifest.test.ts` SW assertions for `install`/`activate`/`fetch`/`push`/`notificationclick`
   + `/offline`).
4. **No authed-data leak in caches.** Tests assert the SW never caches `/api/*`, non-GET, cross-origin, or
   `private`/`no-store` responses, and that sign-out clears the pages cache (and unsubscribes push). A second user
   on the same device sees no first user's cached page content.
5. **Share link → right scope or onboarding.** A league/invite/article deep link routes an authed member to the
   correct scope; an unauthed user is bounced to sign-in/onboarding with the destination preserved and returned
   there after auth; a non-member hits a clean gated state (sign-in / no-access / 404), never a leak or blank page.
6. **Perf targets defined + checkable.** The budget (cold start, repeat start, route transition, CLS, INP, bundle)
   is encoded as a runnable check (Lighthouse CI / budget assertion) on the shell routes; data-backed routes render
   a skeleton (not a spinner) on first paint; no white flash on cold boot.
7. **Gates green.** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm secret-scan`, `ubs` (exit 0)
   all pass, and (UI touched) the surface holds AUSPEX-fidelity per `docs/design/rumbledore-design-language.md`.

### Needs the later human UI pass (not gate-verifiable here)
The *feel* of installation and motion: install-banner timing/copy/styling, the splash/launch polish, skeleton
shimmer and choreography, offline-state art and tone, and the final design language. This spec fixes **structure,
safety, routing, and measurable speed**; taste is tuned with a human in the room (Soul phase).

## Dependencies / blocked-by
- **`specs/10` IA & Navigation (EXISTS)** — the App Router shell, two-scope nav, and league switcher this wraps;
  the auth guards / league-section access states the share-link gated states reuse.
- **`specs/16` Onboarding Completeness (EXISTS)** — the invite/claim landing and auth-bounce-into-onboarding loop
  that share links feed; this spec preserves destination intent through it.
- **`specs/20` Realtime & Push (EXISTS in code)** — the Web Push the SW hosts (`push`/`notificationclick`,
  `/api/push/*`); this spec ships/registers that SW but does not own push delivery mechanics.

## Non-goals
- Full offline **data** (offline reading of league content, queued writes, background sync) — out of scope; the
  offline state is honest about needing a connection.
- The **visual design overhaul** / final voice (the Soul phase — see Scope boundary).
- Native app-store apps (iOS/Android native, Capacitor/wrappers) — Rumbledore is a PWA.
- New push categories or notification content rules (`specs/20`/`specs/12`).
- Changes to invite-channel mechanics (SMS/email/copy) or onboarding flow logic (`specs/16`).
