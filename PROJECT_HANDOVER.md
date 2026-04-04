# Atlas Battlegrounds Project Handover

Last updated: 2026-04-04

This is a best-effort handover based on the repository, Git history, deployment docs, and the currently visible Codex thread context. It is not a literal export of every prior Codex conversation.

## What This Project Is

Atlas Battlegrounds is a Hearthstone Battlegrounds companion site that combines:

- curated build and combo content
- a live card/library browser for heroes, minions, quests, rewards, anomalies, spells, trinkets, and Timewarp
- community/account features
- a support/donation surface
- an internal admin and analytics layer

At a high level, the project started as a Battlegrounds-focused data/browser app and then evolved into a branded product with editorial strategy content, user accounts, community features, moderation/admin tooling, and a production deployment pipeline.

## Story So Far

### 1. Initial import and rename

Git history shows the repo landed on 2026-03-26 with an initial upload, then was immediately renamed from a more generic Hearthstone identity to Atlas Battlegrounds.

That fits the codebase too: there is still a `blizzard-battlegrounds.html` snapshot in the repo, which looks like a source/reference artifact from Blizzard's Battlegrounds page, while the live app branding and deploy targets are now all Atlas-specific.

### 2. Productization and deployment

On 2026-03-29 the focus shifted from "local app" to "real product":

- GitHub Actions deployment was added
- the deployment workflow was iterated several times the same day
- production hosting was standardized around `atlasbattlegrounds.com`
- the app was documented as a single Node server behind `nginx` and `systemd`
- persistent SQLite storage was moved outside the repo for safe deploys

This is the point where the project stopped being just a front-end experiment and became an actual deployable service.

### 3. Community, account, and admin expansion

Also on 2026-03-29, the backend grew into a real application layer with admin dashboard and analytics support.

By 2026-03-30, most of the visible iteration was around user-facing product polish:

- redesigned community account and profile flows
- unified community feed layouts
- simplified account and support page presentation
- reordered primary navigation

This suggests the project matured from "content browser" into a broader community product around Battlegrounds strategy.

### 4. Latest committed polish

The latest committed change, dated 2026-03-31, fixes linked card thumbnails and spell tier filters.

That reads like a cleanup pass on discoverability and content navigation rather than a foundational architecture change.

### 5. Current uncommitted state

The working tree is currently dirty and the in-progress edits are substantial. As of this handover, uncommitted changes touch:

- `app.js`
- `server.mjs`
- `styles.css`
- `index.html`
- `ad-config.js`
- `DEPLOY.md`
- `data/season12-top-builds.js`
- `data/season12-top-builds.json`
- `scripts/sync-battlegrounds-catalog.mjs`

The diff stat is large enough that this should be treated as an active follow-on iteration, not a clean handoff point.

## Current Architecture

### Front end

The front end is a plain JavaScript app with no build step:

- `index.html` wires the app together
- `app.js` is the main UI/router/application logic
- `styles.css` holds the site styling
- `account-client.js` and `community-client.js` support account/community interactions

The visible page model includes:

- builds
- combos
- community
- account
- support
- privacy
- library
- heroes

### Data layer

The `data/` folder contains large checked-in snapshots for the Battlegrounds catalog plus curated strategy data:

- battlegrounds catalog snapshots
- season build data
- combo data
- build guide details
- tier plans

There is also a sync script at `scripts/sync-battlegrounds-catalog.mjs`, which appears to be part of the data refresh workflow.

### Backend

`server.mjs` is a single Node server that serves both the static app and the API.

The backend uses `node:sqlite` and stores data in `atlas-community.sqlite` under the configured storage directory. The schema includes support for:

- sessions
- community posts and comments
- submissions/review queue
- analytics events
- admin-related user data

There is also bootstrap logic for an admin account using environment variables.

### Deployment

Deployment is production-oriented and already documented:

- runtime: Node 22+
- reverse proxy: `nginx`
- service manager: `systemd`
- production host: `atlasbattlegrounds.com`
- persistent storage: `/var/lib/atlas-battlegrounds`
- app root on server: `/opt/atlas-battlegrounds`

Pushes to `master` can deploy through GitHub Actions once the droplet and secrets are configured.

## What Matters Most For A New Maintainer

### Product direction

The project is no longer just "show Battlegrounds cards." It is now trying to be a Battlegrounds destination:

- strategy content first
- reference data second
- community/account features around that core
- monetization/support surfaces present but not positioned as paywalled gameplay benefits

### Operational posture

This is a simple stack by design:

- no front-end framework
- no build pipeline
- one Node server
- SQLite for persistence
- deploy-by-archive to a Linux droplet

That simplicity is a strength. Any future work should be careful not to overcomplicate the stack unless there is a clear operational payoff.

### Current risks / caveats

- There is no obvious automated test suite in `package.json`.
- The repo is mid-change right now, with a large uncommitted diff.
- Production behavior depends on environment configuration for admin bootstrap and storage location.
- The moved repo currently does not have a `.codex` folder, so repo-local Codex project settings did not move with it.

## Recommended Next Steps

1. Review and either commit or discard the current uncommitted changes before doing anything else.
2. Open the new project path in Codex: `D:\www\Atlas_Battlegrounds`.
3. Recreate any useful Codex-local project setup in a new `.codex` folder if you want project-scoped settings again.
4. Treat this file as the starting context document for any new Codex thread.

## Useful Files

- `D:\www\Atlas_Battlegrounds\PROJECT_HANDOVER.md`
- `D:\www\Atlas_Battlegrounds\DEPLOY.md`
- `D:\www\Atlas_Battlegrounds\server.mjs`
- `D:\www\Atlas_Battlegrounds\app.js`
- `D:\www\Atlas_Battlegrounds\index.html`
- `D:\www\Atlas_Battlegrounds\styles.css`
- `D:\www\Atlas_Battlegrounds\scripts\sync-battlegrounds-catalog.mjs`
- `D:\www\Atlas_Battlegrounds\.github\workflows\deploy.yml`

## Previous Codex Chat Threads/Session ID

- codex://threads/019d5958-0c7c-7860-b789-1a56e7c4536a / 019d5958-0c7c-7860-b789-1a56e7c4536a
- codex://threads/019d58e3-f646-7290-a67e-92975a3df4da / 019d58e3-f646-7290-a67e-92975a3df4da
- codex://threads/019d5453-9215-7452-9cda-c3ea7975c2a7 / 019d5453-9215-7452-9cda-c3ea7975c2a7
- codex://threads/019d43d6-1e0a-7941-bb8e-a59ba622a91d / 019d43d6-1e0a-7941-bb8e-a59ba622a91d
- codex://threads/019d2bb7-bd9f-74d0-a655-e501193819c8 / 019d2bb7-bd9f-74d0-a655-e501193819c8
- codex://threads/019d2506-7e8f-7390-a9fd-bbefa2f8fba5 / 019d2506-7e8f-7390-a9fd-bbefa2f8fba5
- codex://threads/019d1bc2-7f29-7871-b59a-b7e81347576a / 019d1bc2-7f29-7871-b59a-b7e81347576a
- codex://threads/019d1069-7c39-7a81-aa39-8e8823c12686 / 019d1069-7c39-7a81-aa39-8e8823c12686
- codex://threads/019d0cd0-772b-7291-bba0-70586c778acf / 019d0cd0-772b-7291-bba0-70586c778acf