# AGENTS.md

This is the legacy Chrome extension submodule. Do not work here unless the user explicitly asks for extension behavior or the task cannot be completed without changing the extension.

## Read first

- Outer workspace on home-host: [routing](/Users/jeongjin/Desktop/Project/edgethink/drifty/AGENTS.md), [project map](/Users/jeongjin/Desktop/Project/edgethink/drifty/docs/project-map.md), [development guide](/Users/jeongjin/Desktop/Project/edgethink/drifty/docs/development-guide.md). These paths are outside this repository, including when working in a task worktree.
- Build and manifest: `vite.config.ts`, `src/manifest.ts`
- Extension overview: `README.md`

## Responsibilities

- `src/manifest.ts` owns the generated MV3 manifest; `vite.config.ts` builds and assembles `dist/`.
- `src/background/service-worker.js` owns runtime messages, session storage, and tracking.
- `src/content/` owns content scripts.
- `src/popup/`, `src/dashboard/`, and `src/onboarding/` own React UI entrypoints.
- `src/lib/drifty/`, `src/lib/domain/`, and `src/shared/` own client adapters, types, and shared UI.
- Root `background/`, `common/`, `popup/`, and related deTime assets are historical; check the Vite inputs and manifest before selecting a file.

## Workflow

Run from this extension repository/worktree root:

```bash
npm ci
npm run typecheck
npm run build
```

Load generated `dist/` as unpacked in `chrome://extensions` with Developer Mode enabled. Rebuild and refresh the extension after changes. `npm test` combines typecheck and build; `npm run test:ui` is the separate browser verification script. Verify the actual extension runtime for service-worker, permission, or messaging changes.

## Boundaries

- Preserve the runtime message contracts in `src/lib/drifty/runtimeMessages.ts` and `src/background/service-worker.js`; historical deTime examples are not the current contract.
- Preserve local IndexedDB privacy assumptions unless the task explicitly changes sync behavior.
- Keep this surface secondary to the Mac-first app.
