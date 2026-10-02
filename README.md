# Aura — a cinematic video-course LMS

A premium course platform built with Next.js (App Router), React 19 and TypeScript,
streaming from [Mux](https://mux.com). Browse a catalog, enrol, watch with resume
position and real progress tracking, take notes against timestamps, and earn a
printable certificate — plus a Studio for authoring your own courses.

The design brief this implements is [`plan.md`](./plan.md); it is the source of
truth for architecture decisions and the responsive contract.

---

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

No configuration is required. The seed catalog ships with the build and streams
from a public Mux demo asset, so the whole learner journey works immediately.

To run against a production build:

```bash
pnpm build
pnpm start        # http://localhost:3000
```

---

## Environment variables

Everything has a working default. Set only what you need.

| Name | Scope | Purpose |
|------|-------|---------|
| `MUX_TOKEN_ID` | server | Mux API access token ID. Enables Studio uploads. |
| `MUX_TOKEN_SECRET` | server | Mux API secret. Enables Studio uploads. |
| `MUX_SIGNING_KEY_ID` | server | Signing key ID. Enables signed playback. |
| `MUX_PRIVATE_KEY` | server | Base64-encoded private key for signing JWTs. |
| `NEXT_PUBLIC_APP_URL` | public | Page origin, used as `cors_origin` for direct uploads. |
| `NEXT_PUBLIC_MUX_ENV_KEY` | public | Mux Data environment key. Optional. |
| `NEXT_PUBLIC_SEED_PLAYBACK_ID` | public | Overrides the demo playback ID for every seed course. |

**Without Mux credentials the app still does everything except upload.** The
Studio detects this on load and says so; courses can be authored as text-only
drafts and a known playback ID can be attached by hand. See `MuxNotConfigured`.

Secrets are only ever read inside Route Handlers. There is no `NEXT_PUBLIC_`
variable that carries a credential, and no Mux secret is present in any client
bundle.

### Route behaviour when credentials are missing

Every Mux route returns `503` with `{ "error": { "code": "MUX_NOT_CONFIGURED" } }`.
`GET /api/mux/upload` is the exception: it answers `{ configured, signing }` so
the Studio can choose its mode before the author commits to anything.

---

## Architecture

| Layer | Location | Rule |
|-------|----------|------|
| Types & schemas | `src/lib/types.ts`, `src/lib/schemas.ts` | Every entity is typed; every stored record is validated by zod. |
| Storage | `src/lib/storage/` | One reactive store per `localStorage` key, behind `useSyncExternalStore`. |
| Domain | `src/lib/domain/` | Pure functions: search, progress, resume, streak, ordering. No I/O. |
| Mux | `src/lib/mux/` | `client.ts` is browser-safe; `server.ts`, `jwt.ts` and `handler.ts` are server-only. |
| Primitives | `src/components/ui/` | Stateless, token-driven, `forwardRef` where it matters. |
| Compounds | `src/components/compound/` | Behaviour only — keyboard, focus, scroll. Props in, no stores. |
| Features | `src/components/features/` | Domain components. Props in, still no stores. |
| Hooks | `src/hooks/`, `src/lib/storage/useStore.ts` | The only place storage is read. |

Server Components own everything knowable ahead of time — course data, metadata,
static params — and mount client islands only at the leaves that touch
`localStorage`, the player, or a browser API.

### Where state lives, and why

Learner state (profile, enrollments, progress, notes, settings, learned
durations, activity, Studio courses and upload jobs) is in `localStorage` behind
a typed store. Mux operations run in Route Handlers because a Mux secret can
never reach a browser.

**This is not access control.** Enrollment is a local record. Anyone with access
to the browser's storage can edit it, and signed playback is demonstrated as a
capability rather than presented as a security boundary. The checkout dialog says
so in as many words, because a demo that pretends otherwise teaches the wrong
thing.

### Progress accounting

Watched time is a **set of 10-second segment indexes**, not a maximum position,
so scrubbing to the end credits one segment rather than the whole video. A tick
more than 15 seconds from the last one is treated as a seek and credits nothing.
Writes are throttled to one per 5 seconds and then force-flushed on pause, on
`ended`, when the tab is hidden, on `pagehide` and on unmount — the five ways a
learner actually leaves a lesson. Course completion is counted by lesson, not by
watched seconds, because a lesson's duration is unknown until it has been played
once.

---

## Project layout

```
src/
├─ app/                     routes, API handlers, global CSS
│  └─ api/mux/              upload, upload/[id], asset/[id], token
├─ components/
│  ├─ ui/                   atoms
│  ├─ compound/             molecules (Tabs, Accordion, Dialog, Sheet, Dropdown, Carousel)
│  └─ features/             domain components and screen islands
├─ hooks/                   stores in, reactive view models out
├─ lib/
│  ├─ domain/               pure functions
│  ├─ mux/                  server client, JWT, URL builders, browser client
│  ├─ seed/                 instructors and the six seed courses
│  ├─ storage/              store factory, keys, migrations, concrete stores
│  └─ utils/                cn, format, time, ids, a11y helpers
└─ tests/                   unit, component and end-to-end suites
```

---

## Verification

```bash
pnpm run typecheck     # tsc --noEmit
pnpm run test          # vitest: unit + component
pnpm run build         # production build
pnpm run verify        # all three, in order

pnpm run test:e2e      # Playwright, against a production build
pnpm run verify:responsive   # viewport matrix, 5 sizes x N routes, headless
pnpm run audit               # touch targets, focus, landmarks, contrast
```

The Playwright suite covers the full learner journey (browse → enrol → watch →
resume → complete → certificate), reload persistence, cross-tab sync, the Studio
draft flow, and the responsive contract at 360 / 390 / 430 / 768 / 1280.

`scripts/verify.mjs` and `scripts/audit.mjs` drive a Playwright-managed headless
Chromium in its own profile. They never attach to a browser you already have
open.

### What is actually verified

Some things a type-checker cannot prove, so they are tested rather than asserted:

- **Dialogs are clickable.** Every modal marks background content `inert`. The
  overlay's own wrapper must *not* be marked — doing so removes the dialog from
  hit-testing entirely. jsdom does not implement `inert`, so only the browser
  suite catches a regression here.
- **Nothing overflows horizontally** at any of the five viewports, on any route.
- **Touch targets are at least 44 px**, inputs are at least 16 px (iOS zoom), and
  every text token meets 4.5:1 against its real background.
- **Resume actually resumes.** The progress engine refuses to write before the
  player reports a duration, because the first tick arrives with a playhead of
  zero and would otherwise overwrite the position the learner came back for.

---

## Accessibility

Semantic landmarks with a skip link, `aria-current` in navigation, APG-conformant
Tabs, Accordion, Dialog, Dropdown and Menu Button patterns, focus trapping with
restoration, a live region for toasts and the autoplay countdown, and 44 px
targets throughout.

State is never conveyed by colour alone: a completed lesson shows a check icon
*and* the word "Completed"; a locked one shows a lock *and* the word "Locked".

---

Nothing is reachable only by hover, only by keyboard, or only by pointer. The
player's shortcuts all have matching visible buttons; the curriculum reorders
with explicit Up/Down controls rather than drag handles; the drop-down menus
flip above their trigger when there is no room below.

---

## Known limitations

- **Enrollment is local and simulated.** See above. This is the one thing a
  reader should not mistake for a security boundary.
- **No payment processing.** Paid checkout is a dialog that says it processes
  nothing.
- **No webhooks.** Upload → asset readiness is resolved by client polling on a
  fixed 2s/3s/5s/8s schedule, capped at 10s and abandoned after 15 minutes.
- **Rate limiting is best-effort.** The Mux routes use an in-memory token
  bucket per IP; on a serverless runtime that is one bucket per warm instance,
  so it is a brake against a runaway poll loop rather than a control.
- **Lesson durations start unknown.** Seed lessons carry `durationSec: null` and
  the UI shows `—` until the player reports the real duration. No number is ever
  invented to fill the gap.
- **Chromium only.** The Playwright projects run Chromium at a desktop and a
  mobile viewport. WebKit and Firefox would re-prove the same CSS at twice the
  runtime.