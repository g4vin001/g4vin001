# Free, ad-supported launch

The product decision is **free single-song identification for visitors**. AudD's per-request price is an operating cost paid by the website, not a customer checkout. No paid scan package, subscription, or rewarded-ad promise is active. Longer surveys and continuous scans currently share the free allowance.

## Current state

The recognizer and scan workflows are implemented, but the production account has no AudD token. Uploaded clips cannot yet be identified publicly. The site also has no connected ad-network account, publisher ID or sponsorship destination. Ownership verification support is implemented; network ads and ad revenue are not live.

The immediate dependency is an owner-controlled AudD account/token. No code change is needed to add that token as the server-side `AUDD_API_TOKEN` secret and republish. Do not use a public demo token, put a secret in source control, or expose it in client configuration.

## Activate with a bounded budget

1. Obtain the owner token from https://dashboard.audd.io/ and configure the Site secret `AUDD_API_TOKEN`.
2. Keep the launch settings at `GLOBAL_DAILY_SCAN_LIMIT=100`, `VISITOR_DAILY_SCAN_LIMIT=5`, `IP_DAILY_SCAN_LIMIT=20`, `TOTAL_SCAN_LIMIT=300`.
3. Republish. `/api/health` reports configuration/budget state without calling the provider. `configured` does not mean token validity has been tested.
4. Make one real identification from a known short recording, then one no-music recording. Check the result, provider usage and saved result after reload. This validates activation, not accuracy.
5. Run the labeled [benchmark](benchmark.md) with an explicit request ceiling. Its operator requests bypass the website's caps; account for them separately in the provider dashboard.
6. The cumulative ceiling does not reset daily. New paid calls stop when 300 reservations have been made. To add another 100 calls, increase the ceiling to 400 after reviewing usage and funding. Do not reset/delete the meter to refill it. Set a cap to zero to pause recognition.

The total meter counts requests before submission, including failed/time-out attempts. Cache hits, silence and duplicate request replies do not increment it. A conservative reservation may count even if a provider call did not complete. This is a request ceiling, not a billing balance. The source of truth for charges is the provider account.

AudD currently advertises 300 evaluation requests without a card, followed by $5 per 1,000 standard requests at the initial pay-as-you-go rate. Confirm the account's actual plan and evaluation terms before public activation. At $0.005/request, a 300-reservation app ceiling corresponds to about $1.50 of recognition usage, before hosting and other costs. Do not assume trials fund an ongoing production service. Source, checked September 29, 2026: https://audd.io/ .

## Connect advertising

Create/use the owner's AdSense account at https://www.google.com/adsense/start/ and add the site in its Sites section. Set the exact assigned `ca-pub-` ID as `ADSENSE_CLIENT_ID` and republish. The app then emits the ownership meta tag and matching authorized-seller record at `/ads.txt`. These verification records do not call Google, show ads, or collect visitor data.

Use the dashboard's verification/review process. Hosting-domain acceptance and site approval are not established by code; if a domain under the owner's control is required, configure one before review. Do not invent an approval or an ad-network account. After approval, configure Google's consent messaging or an appropriate certified CMP, install real serving code, update the privacy disclosure, and test placements on desktop and phone. Identity/payment details, if requested by the ad account, require the account owner.

Start with a labeled display placement below the finder/results and a desktop side placement. Keep the upload, microphone, play and identify controls visually distinct from ads. Expand placements only after measuring revenue and visitor completion. Rewarded ads require a provider that actually supports that format and validated completion; a timer alone is not an earned ad view.

Official onboarding/verification instructions:

- https://support.google.com/adsense/answer/12169212?hl=en
- https://support.google.com/adsense/answer/12171612?hl=en

## Decide whether free scans support themselves

Use realized page RPM (revenue per thousand pageviews), not an advertised CPM or the number of ad slots. Multiple placements can change RPM, but cannot be counted as automatic extra pageviews.

`Revenue per visitor = pageviews per visitor × realized page RPM / 1,000`

`Recognition cost per visitor = uncached provider requests per visitor × actual cost per request`

At two pageviews per visitor and $0.005 per request, the recognition-only break-even page RPM is:

| Uncached requests per visitor | Required page RPM |
| ---: | ---: |
| 1 | $2.50 |
| 2 | $5.00 |
| 5 | $12.50 |

These are arithmetic thresholds, not predicted revenue. Hosting, fees, ad blockers, missing ad fill and other expenses still matter; use realized revenue and total visits so those effects are represented. Keep the daily and cumulative budgets low until measured revenue covers costs. The app does not yet collect ad-impression or earnings telemetry, so profitability is unmeasured.
