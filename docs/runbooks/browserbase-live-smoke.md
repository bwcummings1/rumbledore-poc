# Browserbase ESPN live smoke

Status: **owner-only, one hosted session, not yet run**. Keep `MOCK_BROWSERBASE=true` before and after this procedure.
The purpose is to validate the already fixture-proven path from Browserbase session creation through the embedded ESPN
login, cookie capture, ESPN authentication/discovery, encrypted credential persistence, and Browserbase release.

## Safety and cost boundary

- Budget exactly **one Browserbase session creation**, with a maximum lifetime of 15 minutes. The application records
  one `sessions` spend-guard unit when creation is admitted; debug, capture, and release are zero-unit continuations of
  that session. Actual vendor billing depends on the owner's Browserbase plan.
- Do not retry in the same smoke. A failure after Browserbase creates the session may still consume the one-session
  budget; record the failure class and stop.
- Do not import a league during this smoke. Seeing ESPN provider league id `95050` in discovered inventory is enough to
  prove the capture path and avoids an unrelated historical-import run.
- Do not print, paste into a shell, screenshot, copy into a ticket, or save a HAR containing the Browserbase key,
  project id, ESPN cookies, live-view URL, or either application/vendor session id. Record only status codes, elapsed
  times, failure codes, and whether a bot challenge appeared.
- Do not alter any other `MOCK_*` setting.

## Preconditions

1. Run this only after the Track BB branch has been reviewed and merged into the branch the owner is validating.
2. In `.env.local`, use an editor to confirm `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` are both present and
   non-empty. Do not use `echo`, shell tracing, or another command that renders their values.
3. Confirm `MOCK_BROWSERBASE=true`, the local database/Redis stack is healthy, and the intended owner account can sign
   in. The ESPN account used in the hosted browser must have access to provider league id `95050`.
4. Start from no active Browserbase smoke session. The Browserbase dashboard should show no session left running from
   an earlier attempt.

## One-flip procedure

1. Stop the Rumbledore server. In `.env.local`, change only `MOCK_BROWSERBASE=true` to
   `MOCK_BROWSERBASE=false`, then restart it with the normal launcher and `PATH=/usr/bin:$PATH`. Configuration validation
   must stop startup loudly if the key or project id is missing; startup itself does not create a Browserbase session.
2. Request `GET /api/health` and require HTTP 200 with top-level status `ok`. This verifies the ordinary app
   dependencies before spending the session. It does **not** call Browserbase or validate ESPN cookies.
3. Sign in as the intended owner and open `/onboarding/espn`. Open browser developer tools only if needed, with
   response-body preservation and HAR recording disabled.
4. Start a timer, click **Connect ESPN exactly once**, and record only:
   - elapsed time until the hosted frame is usable;
   - whether ESPN renders normally inside the frame;
   - whether a CAPTCHA, bot check, repeated-login loop, blocked-frame message, or other friction appears.
5. Complete the ESPN login inside the hosted frame. Do not enter credentials anywhere else. Once ESPN visibly shows a
   logged-in state, click **Capture exactly once** and record only elapsed time until success or a sanitized error code.
6. Require all of the following success evidence:
   - `POST /api/onboarding/espn/browser/capture` returns HTTP 200;
   - the onboarding UI shows **connected** and discovered inventory includes ESPN provider league id `95050`;
   - `/you` shows ESPN as **Connected**, flow **Hosted browser**, with a current **Validated** date;
   - a second `GET /api/health` remains HTTP 200 / `ok`; and
   - the Browserbase dashboard shows exactly one smoke session and that it was released/closed.
7. Do not click **Import**. Stop the server, change only `MOCK_BROWSERBASE=false` back to
   `MOCK_BROWSERBASE=true`, restart, and confirm `GET /api/health` is healthy again.

The capture response is the credential-validity check for this flow: before returning 200, the server extracts both
ESPN cookies, authenticates them against ESPN's fan API, discovers the account's leagues, encrypts the credentials, and
persists the connection. `/api/health` is deliberately provider-agnostic and cannot substitute for that result.

## Failure classes

| Code or symptom | What it implies | Owner action |
| --- | --- | --- |
| `BROWSERBASE_SPEND_GUARD_CAP` (429) | The configured session-creation cap is exhausted; no new session should have been admitted. | Stop. Check the guard window before scheduling another owner-authorized smoke; do not raise the cap reflexively. |
| `BROWSERBASE_SESSION_EXPIRED` or `ONBOARDING_BROWSER_SESSION_EXPIRED` (410) | The vendor session ended, its WebSocket closed, or the 15-minute app/session window elapsed. | Stop and confirm the session is closed. A later retry is a new one-session smoke. |
| `BROWSERBASE_CAPTURE_TIMEOUT` (504) | The adapter could not establish/read the bounded CDP cookie capture in time. | Record start/capture latency and whether the frame still worked; inspect Browserbase service/session status without copying ids. |
| `BROWSERBASE_COOKIES_NOT_FOUND` (422) | CDP was readable, but both non-empty ESPN-domain `SWID` and `espn_s2` cookies were not present. | Confirm login visibly completed and note any consent, domain, or bot-check detour; do not paste cookies into diagnostics. |
| `BROWSERBASE_REQUEST_FAILED` (502) | Browserbase REST/CDP transport failed or rejected the request. | Check network/vendor status plus key/project authorization in the dashboard; never log request headers or URLs. |
| `BROWSERBASE_INVALID_RESPONSE` (502) | Browserbase returned a shape or secure URL that no longer matches the validated contract. | Treat as vendor API drift and stop; preserve only the error code and timing. |
| `PROVIDER_AUTH_EXPIRED` (401) | ESPN rejected the captured cookie pair. | Treat the cookies/login as invalid, revoke the ESPN session if appropriate, and stop. |
| `PROVIDER_BLOCKED` (503) or `PROVIDER_RATE_LIMITED` (429) | ESPN blocked or throttled validation after bounded retries; this is not proof that credentials are invalid. | Stop and record bot-check/rate-limit context. Do not force a reconnect or repeat calls. |
| Frame never becomes usable | The live-view embed, browser policy, or vendor session failed before login could complete. | Record the browser and elapsed time, close the vendor session from the dashboard if necessary, and stop. |

## Rollback

The configuration rollback is always the same: restore `MOCK_BROWSERBASE=true` and restart the app. Successful capture
requests release the Browserbase session immediately. If the smoke is abandoned or fails before release, close the
session from the Browserbase dashboard or let the 15-minute timeout expire; do not issue a hand-written API request.

No provider credential is persisted unless ESPN authentication and discovery succeed. A successful smoke intentionally
leaves the captured connection encrypted in `provider_credentials`; do not delete database rows as part of this
runbook. If any sensitive value may have escaped into a screenshot, HAR, shell history, or log, stop, rotate/revoke it,
and treat the smoke as failed before doing anything else.
