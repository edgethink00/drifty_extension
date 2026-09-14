# Extension working guide

Follow [AGENTS.md](AGENTS.md) for the current source map, build, and verification.
The MV3 manifest is generated from [src/manifest.ts](src/manifest.ts) by
[vite.config.ts](vite.config.ts); load `dist/` after building.

Use [runtimeMessages.ts](src/lib/drifty/runtimeMessages.ts) and the
[service worker](src/background/service-worker.js) for current messaging/storage
contracts, and [src/lib/drifty/](src/lib/drifty/) for the UI adapters. The legacy
root deTime files and historical README sections are reference material, not
proof that a behavior is present in the current build.
