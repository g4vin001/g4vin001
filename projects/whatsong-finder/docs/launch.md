# WhatSongIsThis? launch and operating guide

Status: working early-access website. Audio recognition is implemented but deliberately unavailable to visitors until an owner-provided AudD token is configured. No paid subscriptions, purchases, ad network account, or guaranteed revenue are implied.

Published URL: https://whatsong-finder.paz-peter.chatgpt.site . Sites reported a successful public deployment on September 27, 2026. The execution environment cannot open the production origin (edge response 403 / 1010), so publication success is not an end-to-end production search check.

## What is implemented

- Microphone capture and desktop browser-tab audio capture where supported (HTTPS required).
- Audio/video selection, local decoding, waveform, start time, volume normalization and coupled speed/pitch control.
- Mono 22,050 Hz WAV preparation, up to 12 seconds, in the visitor's browser. Full files are not uploaded.
- Standard AudD recognition endpoint, direct-media URL recognition, listening links, automatic saving of matches.
- Adjustable surveys and continuous scans across local files, with a request/coverage estimate before starting.
- Seven-day private scan history, pause/resume with the original file, checked-section timelines, local replay, and CSV/JSON export.
- A validation-first recognition benchmark CLI using the production adapter; see [benchmark instructions](benchmark.md).
- iTunes song/artist search with cached, real results and music-service search links.
- Server-backed anonymous saved finds, CSV export and collection deletion.
- Cost limits, input limits, same-origin checks, idempotency, bounded cleanup, secure secret handling.
- Optional labeled direct sponsorship and support destination, both hidden until real values exist.
- Help, support, privacy, terms, favicon, metadata, robots and sitemap.
- WebMCP catalog-search tool using the same visible search flow.

## Architecture

React 19 / Next-compatible Vinext runs on a Cloudflare Worker through Sites. D1 stores song metadata, recognition cache, allowance reservations, and seven-day scan plans/results. R2 is intentionally not enabled: audio is streamed through memory to the recognition provider and not persisted. The browser handles clip decoding and preparation. There is no FFmpeg server, Supabase project or paid worker queue to operate for this initial release.

Existing RestaurantApp/Vercel/Supabase projects are unrelated and were not modified.

## Activate real recognition

1. Sign in or create an account at https://dashboard.audd.io/ and obtain your own API token. Account terms and any paid plan are the owner's decision.
2. Set `AUDD_API_TOKEN` as a server-side secret in this Site's environment. Never commit it, paste it into source, or prefix it with `NEXT_PUBLIC_`.
3. Set the allowance variables from `.env.example`: `GLOBAL_DAILY_SCAN_LIMIT=100`, `VISITOR_DAILY_SCAN_LIMIT=5`, `IP_DAILY_SCAN_LIMIT=20`, and `TOTAL_SCAN_LIMIT=300`. The total ceiling survives request cleanup and never resets automatically.
4. Republish to apply the environment. The UI automatically enables recognition when a non-test token is configured and the daily/total configured limits are positive. This detects configuration, not token validity; perform a real scan to verify the key.
5. Verify on a physical phone over HTTPS: microphone permission, 12-second automatic stop, preview, identification, listening link, and saved result after reload.
6. Verify desktop tab audio by selecting a playing tab with Share tab audio enabled.
7. Set the global limit to `0` and redeploy to pause paid calls immediately. Provider-side quotas should also be enabled when available.

AudD's public `test` token is rejected by production recognition code. The public sample was used separately for a real connectivity test and is not an unapproved production fallback.

## Cost model and revenue

Checked September 27, 2026 against https://audd.io/ and https://docs.audd.io/ . AudD lists 300 evaluation requests and standard pay-as-you-go recognition at $5 per 1,000 requests, with volume discounts. Confirm the current dashboard plan before spending. One standard request is approximately $0.005; the app sends at most 12 seconds. Provider charges can still apply to no-match and failed/timed-out requests.

Recognition cost only, assuming every allowance is consumed at $0.005/request:

| Global daily cap | Approx. maximum per 30 days |
| --- | ---: |
| 100 | $15 |
| 200 | $30 |
| 1,000 | $150 |

These estimates exclude hosting, domain, taxes, payment fees and operational overhead. Rolling windows, provider billing and price changes mean this is a planning model, not an account spending guarantee.

An ad-supported session is sustainable only if earned revenue exceeds paid calls and other variable costs. Example assumptions, not a forecast: at 2 pageviews/session and a $3 page RPM, revenue is $0.006/session. One uncached standard scan consumes $0.005, leaving $0.001 before all other costs. At a $1 RPM the same session loses money. Five-section surveys consume up to $0.025, so broad ad-only access to long scanning is unsuitable at low RPMs.

Launch recommendation: keep a small global recognition cap, validate usage and match success, use a real direct sponsor/support account if available, and raise caps only when cash revenue supports them. Do not promise unlimited scans. The confirmed launch model is free single-song identification for visitors, funded by ads or sponsorship. Any later optional paid offer for heavier usage should follow provider benchmarking and a verified payment account, with server-side entitlements and verified webhooks before selling anything.

## Scan operation and limits

Full files remain in the browser. Consecutive windows are at most 12 seconds; survey windows leave explicit gaps. Plans must fit the currently remaining allowance, though cache hits and silent sections can save calls. Each request rechecks the shared budget. Default five-visitor / twenty-network / one-hundred-global limits are unchanged. The visitor ceiling can be configured up to 200 and network ceiling up to 500; do not raise them without measuring real cost. The current twenty-minute file maximum needs at most 100 continuous windows and must still fit all three remaining allowances.

Processing is browser-driven, not a background queue. Keep the tab open. Pause finishes the in-flight section. Resume requires the same file fingerprint; completed sections are never charged again. A stored operation response can recover a lost browser reply. An abandoned claim becomes unresolved after two minutes; it is not blindly billed again. Request timeouts can still incur provider charges.

History and results expire after seven days and are tied to the anonymous cookie. Export before expiry or clearing cookies. Provider errors are distinct from no-match and silence. Reported coverage counts only sections with completed recognition responses, including cache reuse, not skipped silence or failures.

Migration `drizzle/0001_small_korvac.sql` adds scan tables and indexes; preserve the existing migration journal.

## Current revenue activation

- Direct sponsorship: set `SPONSOR_LABEL`, `SPONSOR_URL`, `SPONSOR_DESCRIPTION`. The labeled advertisement appears below the results.
- Optional support: set `SUPPORT_URL` to an owner-controlled, real contribution page. No payment destination was fabricated.
- AdSense is not active. Setting a real `ADSENSE_CLIENT_ID` publishes the `google-adsense-account` ownership meta tag and matching `/ads.txt` line. Empty/invalid/placeholder IDs produce no meta tag and a 404 at `/ads.txt`. This does not load advertising code, confirm approval, or start earnings. Complete account/site approval and consent setup before installing serving code. See [free launch](free-launch.md).
- A custom domain is desirable for branding and ad onboarding; no domain was purchased.

Google primary guidance: https://support.google.com/adsense/answer/9724 , https://support.google.com/adsense/answer/7584263 , https://support.google.com/adsense/answer/13554116 , https://support.google.com/adsense/answer/12171612 .

## Honest scope boundaries

No humming recognition, vocal separation, universal social URL downloading, background processing after the tab closes, automatic remix reversal, billing/subscriptions, or public recognition-accuracy claim. No content is seeded as a fake match. The provider's track timecode is not mislabeled as a video timestamp: displayed ranges are the submitted audio windows. Adjacent matches to the same song merge; gaps, no-match results and errors are never bridged. Scanned coverage is not a claim to have detected every track.

Supported local files depend on browser codecs. A 40 MB compressed file can require more memory to decode; mobile devices may need shorter clips. Direct media URLs can expire or require credentials; the service never fetches arbitrary user URLs itself, but passes an eligible URL to AudD. Only public media URLs should be submitted.

## Development and verification

Use Node 24 and the checked-in pnpm lockfile. Install dependencies with the project runtime's supported installer or `pnpm install --frozen-lockfile` outside the managed image.

- `pnpm check`: TypeScript.
- `pnpm test`: actual server route handlers against a SQLite-backed D1 adapter and stubbed external provider responses. This proves handling and spending boundaries; it does not measure recognition accuracy.
- `pnpm build`: production Worker/client build.
- For local D1, generate migrations with `pnpm db:generate`, build the configuration, then apply each new migration once to `.wrangler/state` using Wrangler's `d1 execute --local`.
- Store local secrets only in ignored `.env` / `.dev.vars`; configure production secrets through Sites.

## Release gates still requiring owner accounts or physical devices

- AudD production token and a real user-recording test.
- Microphone and tab sharing on HTTPS physical devices.
- Sponsor/support or approved ad/payment account activation.
- A dedicated GitHub repository remains optional. Progress is saved in `g4vin001/g4vin001`, branch `musicapp/whatsong-initial`, under `projects/whatsong-finder/`; the default branch and profile content are preserved. The connector cannot create a new repository. The Site's own source repository is the deployment source of truth.

## Verification evidence

TypeScript and the production Worker build passed. The automated suite reports 41 passing tests (38 cases and three parent tests), covering actual route code, SQLite, stubbed paid responses, persistent scans, recovery, allowance exhaustion, silence, privacy, coverage math, and benchmark scoring/CLI spending gates. It does not measure real recognition quality. A real request to AudD using its public example and public test token returned Everybody Wants To Rule The World by Tears For Fears. This is connectivity evidence, not an accuracy benchmark or visitor-recognition activation.

The browser verified rendering, tab navigation, WAV upload/decoding and edited-audio preview. The local HTTP preview does not expose a secure microphone context. Its Worker fails the outbound catalog fetch with an internal runtime error; the exact iTunes request returned 12 real results in the main runtime. Production search remains unverified because the execution environment is blocked at the production edge; production Worker logs reported no error events during this check. Open the published website in an ordinary browser and search for a song before promoting this release. WebMCP tooling was unavailable in this browser context, so the optional registration could not be exercised here.


September 28 timeline release: browser QA verified a 72-second WAV upload, survey planning (five windows / sixty seconds), continuous planning (six requests / full duration), over-budget blocking, and keyboard-adjustable sample count. The local HTTP preview permits clip preparation/planning; start/resume requires HTTPS file hashing. Provider calls remain disabled without a private key. Full timeline route flows were checked with controlled fixtures, not a live recognition corpus.


Free-launch follow-up: `drizzle/0002_fixed_susan_delgado.sql` adds an anonymous cumulative provider reservation counter. An atomic insert trigger increments it only for newly accepted recognition reservations. Request-history cleanup never reduces it; silence, cache reuse, plan creation and duplicate replies do not increment it. Failures still count. The initial counter includes retained pre-migration reservations; it cannot reconstruct previously deleted history. This site had no production recognition key before the migration. Runtime settings use a 300-request cumulative ceiling alongside the daily caps. The benchmark CLI calls AudD independently and remains outside these app limits.
