# WhatSongIsThis?

A music finder with microphone and browser-tab recording, audio/video clip preparation, AudD recognition, real song/artist search, saved finds, resumable song timelines, and explicit cost controls.

Built from the MusicAPp / Compare Website Ideas brief. See [the launch guide](docs/launch.md) for deployment, provider activation, economics and scope. The public UI clearly labels audio matching as awaiting activation until an owner-provided recognition token is configured.

Published early access: https://whatsong-finder.paz-peter.chatgpt.site

## Commands

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

The bundled Sites runtime serves the application with Vinext/Cloudflare Workers and D1. Preserve `sites()` in `vite.config.ts`, the D1 migration history, and `.openai/hosting.json` when editing this existing site. `.env.example` lists only non-secret defaults and empty integrations.

Recognition accuracy is not yet measured. The [benchmark runner](docs/benchmark.md) validates a labeled corpus without calling the provider by default, and requires an explicit request ceiling for live experiments.

## Important boundaries

- No paid calls without a server-side provider key.
- No full audio/video persistence; scan plans and results expire after seven days.
- Duplicate and cached requests do not blindly issue new provider calls.
- Global, visitor and network allowances are reserved in an atomic SQL statement. A persistent cumulative ceiling starts at 300 provider reservations and survives request-history cleanup.
- Saved finds are isolated by an anonymous browser identifier.
- Survey and continuous scans show real checked coverage, gaps and unresolved sections. The tab must remain open while processing; reselect the original file to resume.
- Direct social page extraction is not included. Local files are limited to 40 MB / 20 minutes and the remaining request allowance.
- Single-song recognition is free to visitors when activated. Provider fees are operating costs, not a per-song customer checkout.
- AdSense ownership metadata and ads.txt are ready for a real publisher ID; ad serving still requires account approval and consent configuration.
- No ad or payment credentials are invented; those surfaces remain disabled until configured.
