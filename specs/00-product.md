# Spec 00 — Product

> Outcomes spec. Canonical vision/stack details: `docs/PROGRESS.md`. This file defines WHAT, not HOW.

## One-liner
A sandboxed, per-league fantasy-football companion: connect your existing league, get a living home page,
an AI blogger that knows your league, paper-money betting, and a cross-league competitive arena.

## The two planes
1. **Per-league sandbox** — each league has isolated data, AI memory, content, and bankrolls. No cross-league reads.
2. **Central plane** — league-agnostic NFL/fantasy news hub, and the inter-league paper-betting arena (league-vs-league + individual leaderboards).

## Core experiences
- **League home base** — a live, ESPN-homepage-style front page for *this* league (standings, scores, movers, storylines).
- **AI blogger + feeds** — per-league blogger with personas (Commissioner, Analyst, Narrator, Trash-Talker, Betting-Advisor) blending league storylines with real NFL news; a central news hub; a league-tailored feed.
- **Paper betting** — real odds, fake money, DraftKings-style markets; weekly **rolling-minimum bankroll** (floor e.g. $10k; lose all → reset to floor; finish above → carry forward).
- **Inter-league arena** — central league-vs-league + individual betting leaderboards/competition.
- **League records** — all-time records from ~10 years of history.

## Onboarding (the make-or-break)
- Connect once → auto-discover ALL your leagues → invite leaguemates. Must work on **mobile** with zero console/cookie digging.
- A league member can be designated **data steward** to review/clean their league's data.

## Principles
- Mobile-first PWA, desktop parity, snappy, modern. Distributed via a shareable link.
- League isolation is sacred (DB-enforced). Data integrity over features.
- Provider-agnostic from day one (ESPN now; Sleeper, Yahoo later).
- Real auth, real tests, real gates — always.

## Personas / users
Fantasy league members (casual → die-hard), on phones, reading fast, who love their league's banter and history.

## Success criteria (MVP)
- A real user connects their ESPN league on a phone in < 60s and sees accurate standings/stats.
- The league home + at least one AI blog post that references real league specifics.
- Place + settle a paper bet against real odds; bankroll updates with the rolling-minimum rule.
- Two leagues compete on the central arena leaderboard.

## Non-goals (for MVP)
- Real-money anything. Native app stores (PWA first). Sleeper/Yahoo (later). Non-NFL sports.
