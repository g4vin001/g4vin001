# WhatSongIsThis?

A music finder with microphone and browser-tab recording, audio/video clip preparation, AudD recognition, real song/artist search, saved finds, and explicit cost controls.

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

## Important boundaries

- No paid calls without a server-side provider key.
- No full audio/video persistence.
- Duplicate and cached requests do not blindly issue new provider calls.
- Global, visitor and network allowances are reserved in an atomic SQL statement.
- Saved finds are isolated by an anonymous browser identifier.
- Direct social page extraction and complete long-video scanning are not in this release.
- No ad or payment credentials are invented; those surfaces remain disabled until configured.
