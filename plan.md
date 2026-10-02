# plan.md — `nextjs-mux-video-lms`

**Product:** Premium video-course LMS (Masterclass / Teachable feel)
**Stack:** Next.js (App Router) · React · TypeScript · Tailwind CSS · Mux (`@mux/mux-player-react`, `@mux/mux-uploader-react`, `@mux/mux-node`)
**Aesthetic:** Cinematic dark, warm ivory type, gold accent, serif display headlines
**Versioning rule:** every dependency is installed at `latest`. No version numbers appear in this plan or in `package.json` pins by hand. Where an API shape may have shifted (async `params`, Tailwind CSS-first config, Mux Player props), the agent MUST verify against the current official docs at build time instead of relying on memory.

---

## 0. Architecture Decisions (read first)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Hybrid persistence.** Learner state (enrollments, progress, notes, settings, studio-created courses) lives in `localStorage` behind a typed store. Mux operations (direct upload, asset status, signed playback tokens) run in Next.js **Route Handlers** because Mux secrets can never reach the browser. | No BaaS was specified. Mux inherently needs a server boundary. |
| D2 | **No webhooks.** Upload → asset readiness is resolved by client polling with exponential backoff. | There is no database to receive webhook state. |
| D3 | **Seed catalog is static** (typed TS module) and works with zero env vars using public playback IDs. Studio features activate only when Mux env vars exist. | App is demoable out of the box; Studio degrades gracefully. |
| D4 | **Entitlement is local and simulated.** "Enroll" writes to localStorage. Signed playback is supported, but because entitlement is client-side it is **not** real access control. This limitation is documented in the UI footer of Studio and in README. | Honesty over theater. |
| D5 | **Lesson durations may be unknown.** Seed lessons carry `durationSec: null`; the real duration is learned from the player's `loadedmetadata` and cached in a `durations` map. UI shows `—` until known. | Avoids inventing numbers that don't match the video. |
| D6 | **Dark-only theme.** No theme toggle. `color-scheme: dark`. | Premium cinematic identity, fewer states to test. |
| D7 | **Server Components by default.** `"use client"` only at leaves that touch storage, the player, or browser APIs. | Idiomatic modern Next.js. |
| D8 | **Learner identity is anonymous-local.** A `LearnerProfile` with random `id` is created on first visit and passed to Mux Data as `viewer_user_id`. | Gives per-viewer analytics without auth. |

### Environment variables (names only)

| Name | Scope | Required | Purpose |
|------|-------|----------|---------|
| `MUX_TOKEN_ID` | server | Studio only | Mux API access token ID |
| `MUX_TOKEN_SECRET` | server | Studio only | Mux API secret |
| `MUX_SIGNING_KEY_ID` | server | Signed playback only | JWT signing key ID |
| `MUX_PRIVATE_KEY` | server | Signed playback only | Base64 private key for JWT |
| `NEXT_PUBLIC_APP_URL` | public | Studio only | Used as `cors_origin` for direct uploads |
| `NEXT_PUBLIC_MUX_ENV_KEY` | public | Optional | Mux Data environment key |

When a server variable is missing, the related route returns `503` with `{ error: { code: "MUX_NOT_CONFIGURED" } }` and the UI renders the Studio "not configured" empty state.

---

## 1. Folder Structure

```
src/
├─ app/
│  ├─ layout.tsx                    # fonts, <html lang>, viewport, providers, AppShell
│  ├─ globals.css                   # Tailwind import, @theme tokens, base styles
│  ├─ page.tsx                      # Home
│  ├─ not-found.tsx
│  ├─ error.tsx                     # global error boundary (client)
│  ├─ loading.tsx
│  ├─ courses/
│  │  ├─ page.tsx                   # Catalog
│  │  └─ [slug]/page.tsx            # Course detail
│  ├─ learn/[slug]/
│  │  ├─ page.tsx                   # redirects to resume lesson (client resolver)
│  │  └─ [lessonId]/page.tsx        # Player page
│  ├─ my-learning/page.tsx
│  ├─ certificate/[slug]/page.tsx
│  ├─ studio/
│  │  ├─ page.tsx                   # Studio dashboard
│  │  └─ [courseId]/page.tsx        # Course editor
│  └─ api/mux/
│     ├─ upload/route.ts            # POST create direct upload
│     ├─ upload/[id]/route.ts       # GET upload status
│     ├─ asset/[id]/route.ts        # GET asset status (+ DELETE)
│     └─ token/route.ts             # POST signed playback tokens
├─ components/
│  ├─ ui/                           # primitives (Phase 2)
│  ├─ compound/                     # molecules (Phase 3)
│  └─ features/                     # domain features (Phase 3–4)
├─ lib/
│  ├─ types.ts                      # all interfaces
│  ├─ schemas.ts                    # zod validators mirroring types
│  ├─ storage/                      # store factory, keys, migrations
│  ├─ mux/                          # server client, jwt, urls
│  ├─ domain/                       # pure functions (progress, resume, search…)
│  ├─ seed/                         # catalog, instructors, playback constants
│  └─ utils/                        # cn, format, ids, time, a11y
├─ hooks/                           # client hooks
└─ middleware-free                  # no auth middleware in this project
```

Dependencies (all `latest`): `next`, `react`, `react-dom`, `typescript`, `tailwindcss`, `@tailwindcss/postcss`, `@mux/mux-player-react`, `@mux/mux-uploader-react`, `@mux/mux-node`, `zod`, `clsx`, `tailwind-merge`, `lucide-react`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@playwright/test`. No UI kit library. All Mux client components must be dynamically imported with `ssr: false` to prevent React 19 hydration and CustomElement registration conflicts.

---

## 2. Data Schema & TypeScript Interfaces

All entities carry `id`, `createdAt`, `updatedAt` (ISO 8601 UTC strings). IDs are generated with `crypto.randomUUID()` (fallback: timestamp+random for non-secure contexts).

```ts
// lib/types.ts
export type ISODate = string;
export type ID = string;

export type CourseLevel = "beginner" | "intermediate" | "advanced";
export type CourseCategory =
  | "creative" | "business" | "technology" | "writing"
  | "music" | "food" | "wellness" | "science";
export type PlaybackPolicy = "public" | "signed";
export type CourseStatus = "draft" | "published";
export type CourseSource = "seed" | "studio";

export interface Instructor {
  id: ID;
  name: string;               // 2–60 chars
  headline: string;           // 5–120 chars
  bio: string;                // 20–800 chars
  avatarGradient: [string, string]; // two hex colors, rendered as initials avatar
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface LessonResource {
  id: ID;
  label: string;              // 1–80 chars
  url: string;                // https URL
  kind: "pdf" | "link" | "worksheet";
}

export interface Lesson {
  id: ID;
  title: string;              // 3–120 chars
  summary: string;            // 0–400 chars
  order: number;              // 0-based within module, contiguous
  playbackId: string;         // Mux playback ID, 1–200 chars, [A-Za-z0-9]+; "" until a video is attached
  playbackPolicy: PlaybackPolicy;
  muxAssetId: string | null;  // present for studio uploads
  durationSec: number | null; // null = unknown until learned
  isFreePreview: boolean;
  resources: LessonResource[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Module {
  id: ID;
  title: string;              // 3–100 chars
  order: number;
  lessons: Lesson[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Course {
  id: ID;
  slug: string;               // kebab-case, 3–80 chars, unique across seed+studio
  title: string;              // 5–100 chars
  subtitle: string;           // 10–160 chars
  description: string;        // 30–2000 chars
  instructorId: ID;
  category: CourseCategory;
  level: CourseLevel;
  tags: string[];             // 0–6 items, each 2–24 chars lowercase
  heroPlaybackId: string;     // used for poster + trailer; falls back to the first lesson with a video
  heroPolicy: PlaybackPolicy;
  heroPosterTimeSec: number;  // >= 0, default 2
  priceCents: number;         // integer >= 0, 0 = free
  learnOutcomes: string[];    // 3–8 items, each 5–120 chars
  modules: Module[];          // >= 1 to publish
  status: CourseStatus;
  source: CourseSource;
  featured: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface LearnerProfile {
  id: ID;                     // also Mux viewer_user_id
  displayName: string;        // 1–40 chars, default "Learner"
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Enrollment {
  id: ID;
  courseId: ID;
  enrolledAt: ISODate;
  lastLessonId: ID | null;
  completedAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface LessonProgress {
  id: ID;                     // === `${courseId}:${lessonId}`
  courseId: ID;
  lessonId: ID;
  positionSec: number;        // >= 0, last known playhead
  watchedSegments: number[];  // sorted unique 10s-segment indexes
  completed: boolean;
  completedAt: ISODate | null;
  manuallyCompleted: boolean; // user toggled
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Note {
  id: ID;
  courseId: ID;
  lessonId: ID;
  timestampSec: number;       // >= 0
  body: string;               // 1–1000 chars
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface PlayerSettings {
  playbackRate: number;       // one of [0.5,0.75,1,1.25,1.5,1.75,2]
  autoplayNext: boolean;      // default true
  volume: number;             // 0–1
  muted: boolean;
}

export interface ActivityDay {
  id: ID;                     // === YYYY-MM-DD (local date)
  date: string;
  secondsWatched: number;
  lessonsCompleted: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface StudioUploadJob {
  id: ID;                     // local job id
  courseId: ID;
  moduleId: ID;
  lessonTitle: string;
  muxUploadId: string;
  muxAssetId: string | null;
  playbackId: string | null;
  durationSec: number | null;
  state: "uploading" | "processing" | "ready" | "errored";
  errorMessage: string | null;
  policy: PlaybackPolicy;     // persisted so a job resumed after a refresh keeps its policy
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}
export type ApiErrorCode =
  | "MUX_NOT_CONFIGURED" | "VALIDATION_FAILED" | "FORBIDDEN_ORIGIN"
  | "NOT_FOUND" | "UPSTREAM_FAILED" | "RATE_LIMITED";
```

### 2.1 Validation rules
`lib/schemas.ts` exports a zod schema per interface, enforcing the ranges in the comments above. Additional cross-field rules:
- `Course.slug` unique across seed + studio; studio slug auto-suffixed `-2`, `-3` on collision.
- `Module.order` / `Lesson.order` contiguous from 0; re-normalized after every reorder/delete by `normalizeOrder()`.
- A course may be `published` only if it has ≥ 1 module, every module has ≥ 1 lesson, and every lesson has a non-empty `playbackId`.
- `LessonProgress.watchedSegments` is capped to `ceil(duration/10)`; on load, out-of-range indexes are dropped.
- Every read from localStorage is parsed with its schema; invalid records are **dropped individually** (never crash the whole store) and a console warning is emitted once per key.

> **Amendment (Phase 4).** `Lesson.playbackId` and `Course.heroPlaybackId` accept the empty string in the *stored* schema. §6.7.6 requires the Studio to keep text-only drafts — a course that cannot be persisted at all cannot be a draft — so the "1–200 chars" rule moved from storage-time validation to publish-time validation (`publishBlockers`). `heroPlaybackIdFor` resolves an unset hero from the first lesson that has a video, so a published course always has a real poster. `StudioUploadJob` gained a persisted `policy` field: a job resumed after a page refresh has to finish with the playback policy it was created with.

### 2.2 localStorage keys (prefix `lms.v1.`)

| Key | Type | Notes |
|-----|------|-------|
| `lms.v1.profile` | `LearnerProfile` | created on first run |
| `lms.v1.enrollments` | `Record<courseId, Enrollment>` | |
| `lms.v1.progress` | `Record<"courseId:lessonId", LessonProgress>` | |
| `lms.v1.notes` | `Record<ID, Note>` | indexed by lesson at read time |
| `lms.v1.settings` | `PlayerSettings` | |
| `lms.v1.durations` | `Record<lessonId, number>` | learned durations (D5) |
| `lms.v1.activity` | `Record<YYYY-MM-DD, ActivityDay>` | retained 400 days, older pruned |
| `lms.v1.studio.courses` | `Record<courseId, Course>` | user-created courses |
| `lms.v1.studio.jobs` | `Record<ID, StudioUploadJob>` | |
| `lms.v1.schema` | `{ version: number }` | migration cursor |

**Migrations:** `storage/migrations.ts` holds an ordered array `[(db) => db, …]`; on boot compare `lms.v1.schema.version` to array length and run missing steps. Version 1 is the identity baseline.

**Quota safety:** every `setItem` is wrapped in try/catch. On `QuotaExceededError`, prune `activity` older than 90 days, retry once, then surface a non-blocking toast ("Storage is full — progress may not be saved").

---

## 3. Storage Layer (reactive, SSR-safe)

`lib/storage/createStore.ts` — generic factory:

```ts
interface Store<T> {
  get(): T;                       // current snapshot (cached reference)
  set(next: T | ((prev: T) => T)): void;
  subscribe(cb: () => void): () => void;
  getServerSnapshot(): T;         // always the default value
}
```

Algorithm:
1. Cache parsed value in module memory; `get()` returns the **same reference** until a write occurs (required by `useSyncExternalStore`).
2. `set()` validates with zod, writes JSON, updates cache, notifies subscribers, and dispatches a same-tab `CustomEvent("lms:store", { detail: key })`.
3. Subscribe to `window` `storage` events (cross-tab) and the custom event; on either matching the key, invalidate cache, re-parse, notify.
4. `getServerSnapshot()` returns the default so server HTML and first client render match (no hydration mismatch).
5. `useStore(store, selector)` hook wraps `useSyncExternalStore`; `selector` results must be referentially stable (memoize with a last-input/last-output cache inside the hook).
6. `useHydrated()` returns `false` on server and first client render, `true` after mount; screens use it to show skeletons instead of flashing empty states.

Domain hooks built on this (Phase 4): `useProfile`, `useEnrollment(courseId)`, `useCourseProgress(course)`, `useLessonProgress(courseId, lessonId)`, `useNotes(lessonId)`, `usePlayerSettings`, `useDurations`, `useActivity`, `useCatalog` (seed + studio merged), `useStudioCourse(courseId)`.

---

## 4. Mux Server Layer & Route Handlers

`lib/mux/server.ts` — lazily constructs the `@mux/mux-node` client from env; throws a typed `MuxNotConfiguredError` that handlers map to `503`.

Common handler pipeline (`lib/mux/handler.ts`):
1. **Origin check:** reject if `Origin`/`Referer` host differs from `NEXT_PUBLIC_APP_URL` host (allow `localhost` in development) → `403 FORBIDDEN_ORIGIN`.
2. **Validate** body/params with zod → `400 VALIDATION_FAILED`.
3. **Rate limit:** in-memory token bucket per IP (20 req/min). Documented as best-effort on serverless.
4. Execute Mux call; map Mux SDK errors to `502 UPSTREAM_FAILED` without leaking secrets.
5. All responses `Cache-Control: no-store`.

| Route | Method | Request | Response | Behavior |
|-------|--------|---------|----------|----------|
| `/api/mux/upload` | POST | `{ policy: "public"\|"signed" }` | `{ uploadId, url }` | Create direct upload with `cors_origin = NEXT_PUBLIC_APP_URL` and new-asset playback policy from request. |
| `/api/mux/upload/[id]` | GET | — | `{ status, assetId \| null, errorMessage \| null }` | `context: { params: Promise<{ id: string }> }`. Maps Mux upload status (`waiting`, `asset_created`, `errored`, `cancelled`, `timed_out`). Must `await context.params`. |
| `/api/mux/asset/[id]` | GET | — | `{ status: "preparing"\|"ready"\|"errored", playbackId \| null, durationSec \| null, errorMessage \| null }` | `context: { params: Promise<{ id: string }> }`. Reads asset; picks first playback ID. Must `await context.params`. |
| `/api/mux/asset/[id]` | DELETE | — | `{ deleted: true }` | `context: { params: Promise<{ id: string }> }`. Removes asset via SDK; ignores 404 upstream. Must `await context.params`. |
| `/api/mux/token` | POST | `{ playbackId }` | `{ playback, thumbnail, storyboard }` | Signs three JWTs (video, thumbnail, storyboard), 2-hour expiry. `MUX_PRIVATE_KEY` must be decoded via `Buffer.from(key, 'base64').toString('ascii')` prior to signing. |

Mux URL helpers (`lib/mux/urls.ts`, pure): `posterUrl(playbackId, timeSec, width)` → `https://image.mux.com/{id}/thumbnail.webp?time=…&width=…`; `streamUrl(playbackId)`. `next.config` must allow `image.mux.com` under `images.remotePatterns` (verify current config key naming at build time).

---

## 5. Component Architecture

### 5.1 UI primitives (`components/ui/`) — stateless, token-driven, forwardRef where applicable
`Button` (variants: primary gold, secondary outline, ghost, danger; sizes sm/md/lg; `loading`; min height 44px on touch) · `IconButton` (44×44 hit area, required `aria-label`) · `Badge` · `Chip` (toggleable) · `Input` · `Textarea` · `Select` (native `<select>` styled — best touch UX) · `Checkbox` / `Switch` · `Label` / `FieldError` · `ProgressBar` (determinate, `role="progressbar"`) · `ProgressRing` (SVG) · `Skeleton` · `Spinner` · `Card` · `Avatar` (gradient initials) · `Separator` · `VisuallyHidden` · `Container` · `Heading`/`Text` (type scale) · `Toast` primitives.

### 5.2 Compound components (`components/compound/`) — headless-style with context
- `Tabs` (`Tabs.List/Trigger/Panel`, roving tabindex, arrow-key nav, scrollable list on mobile)
- `Accordion` (`Item/Trigger/Content`, single or multiple; animated height via `grid-template-rows`)
- `Dialog` and `Sheet` (bottom sheet on mobile, centered dialog ≥768px; focus trap, Esc, scroll lock, `inert` background, restore focus)
- `Dropdown` (tap-to-open menu, not hover; keyboard support)
- `Tooltip` is **excluded** — no essential info behind hover. Use visible labels.
- `ToastProvider` + `useToast`
- `EmptyState`, `ErrorState` (with retry), `Stepper`
- `Carousel` (CSS scroll-snap, native touch swipe, visible prev/next buttons ≥768px, no hover reveal)

### 5.3 Domain features (`components/features/`)
| Component | Responsibility |
|-----------|----------------|
| `AppShell` | Top bar (logo, search entry, nav, learner avatar), mobile bottom nav (Home, Browse, My Learning, Studio), safe-area padding. |
| `CourseCard` | Poster (Mux thumbnail), title, instructor, level badge, duration (if known), progress bar if enrolled. Entire card is a link; no hover-only content. |
| `CourseRail` | Titled `Carousel` of `CourseCard`s. |
| `HeroBillboard` | Featured course: poster, headline, CTA buttons, optional muted trailer disabled on mobile data-saver. |
| `CatalogFilters` | Search input, category chips, level select, sort select; on mobile collapsed into a `Sheet` opened by a "Filters" button with active-count badge. |
| `CurriculumList` | `Accordion` of modules → lesson rows (index, title, duration, state icon: locked/preview/completed/current). |
| `EnrollPanel` | Price, enroll/continue CTA, "what you'll learn", included lessons count. Sticky bottom bar on mobile. |
| `InstructorCard` | Avatar, name, headline, bio. |
| `VideoPlayer` | Wraps Mux Player (see §6.2). |
| `LessonSidebar` | Curriculum with progress; desktop right column, mobile in `Sheet`. |
| `LessonTabs` | Overview / Notes / Resources. |
| `NotesPanel` | Add note at current timestamp, list, tap timestamp to seek, edit, delete. |
| `AutoplayCountdown` | Overlay after `ended` with 5 s ring + Cancel / Play now. |
| `ContinueWatchingRail` | Top 6 in-progress lessons by `updatedAt`. |
| `StreakCard` | Current streak, weekly mini-bars from `activity`. |
| `CertificateView` | Printable certificate (A4/Letter via `@media print`). |
| `StudioCourseForm`, `ModuleEditor`, `LessonUploader`, `UploadJobList` | Studio authoring (see §6.7). |
| `MuxNotConfigured` | Explains env vars, links nowhere external except docs text. |

---

## 6. Core Feature Logic

### 6.1 Catalog, search & filter (pure, `domain/catalog.ts`)
`filterCourses(courses, { q, category, level, sort })`:
1. Only `status === "published"`.
2. Normalize `q` (lowercase, trim, collapse spaces, strip diacritics). Split into tokens.
3. A course matches if **every** token appears in `title + subtitle + tags + instructor.name`.
4. Score = 5×title hit + 3×tag hit + 2×instructor hit + 1×subtitle hit (summed over tokens); sort by score when `q` non-empty and `sort === "relevance"`.
5. `sort` options: `relevance`, `newest` (`createdAt` desc), `shortest` (known total duration asc; unknown last), `title`.
6. URL is the source of truth: `?q=&category=&level=&sort=` via `useSearchParams` + `router.replace` (debounced 250 ms for `q`). Invalid params are ignored.

### 6.2 Player integration (`VideoPlayer`)
Props: `course`, `lesson`, `startTimeSec`, `onProgressTick`, `onEnded`, `onDuration`.
1. Load Mux Player through the package's lazy entry (or `next/dynamic` with `ssr: false` and a 16:9 skeleton) to keep the initial JS small.
2. Render with `streamType="on-demand"`, `playbackId`, `startTime`, `accentColor` = gold token, `metadata` = `{ video_id: lesson.id, video_title: lesson.title, viewer_user_id: profile.id }`, `poster` from `posterUrl`, `playbackRates` = settings list, `defaultPlaybackRate` from settings, `forwardSeekOffset`/`backwardSeekOffset` = 10, `env-key` when provided.
3. If `lesson.playbackPolicy === "signed"`: before render, `POST /api/mux/token`; pass `tokens` prop. States: `tokenLoading` (skeleton), `tokenError` (ErrorState with retry). Refresh token 5 minutes before expiry.
4. Event wiring: `onLoadedMetadata` → `onDuration(player.duration)` (writes `durations` if differing by > 1 s); `onTimeUpdate` → throttled (see 6.3); `onEnded` → mark complete + autoplay flow; `onError` → `ErrorState` overlay with Retry (re-mounts player via `key` bump) and "Report" disabled (no backend); `onVolumeChange`/`onRateChange` → persist to settings.
5. Keyboard shortcuts (when no input is focused): `Space`/`K` play-pause, `J`/`L` ∓10 s, `←`/`→` ∓5 s, `M` mute, `F` fullscreen, `N` next lesson, `P` previous lesson, `?` shortcut dialog. All are also available as visible buttons (no keyboard-only features).
6. Media Session API: set title/artist/artwork and handlers for play, pause, seekbackward, seekforward, nexttrack, previoustrack.
7. Respect `prefers-reduced-motion` (no autoplay countdown animation, static ring).

### 6.3 Progress tracking algorithm (`domain/progress.ts`)
Constants: `SEGMENT_SEC = 10`, `COMPLETE_RATIO = 0.9`, `TICK_THROTTLE_MS = 5000`, `RESUME_MIN_SEC = 5`, `RESUME_TAIL_SEC = 10`.

On every `timeupdate` (throttled to one write per 5 s, plus forced flush on `pause`, `ended`, `visibilitychange: hidden`, `pagehide`, and route change):
1. `seg = Math.floor(currentTime / 10)`; if `Math.abs(currentTime - lastTick) > 15` treat as a seek: add **no** segments for the jump.
2. Add `seg` to `watchedSegments` (sorted-unique insert).
3. `positionSec = currentTime`.
4. If `!duration || duration <= 0`: set `watchedRatio = 0`. Else: `totalSegments = Math.max(1, Math.ceil(duration / 10))` and `watchedRatio = Math.min(1, watchedSegments.length / totalSegments)`.
5. If `!completed && ((duration && watchedRatio >= 0.9) || ended)` → set `completed = true`, `completedAt = now`, bump `activity.lessonsCompleted`.
6. Add elapsed delta (capped at 6 s per tick) to `activity.secondsWatched` for today.
7. Update `enrollment.lastLessonId`.
8. After a completion, recompute course completion: if all lessons completed → `enrollment.completedAt = now` (fires a one-time toast + certificate CTA).

Manual toggle: "Mark complete / incomplete" button writes `manuallyCompleted` and `completed` explicitly; auto logic never un-completes.

Derived (pure):
- `lessonPercent(progress, duration)` = `completed ? 100 : round(watchedRatio × 100)`.
- `coursePercent(course, progressMap)` = `completedLessons / totalLessons × 100` (lesson-count based; avoids unknown-duration problems).
- `resumeStart(progress, duration)` → `0` if no progress, `< 5`, or `> duration − 10`; else `positionSec`.
- `nextLesson(course, lessonId)` flattens modules by `order`; returns the following lesson or `null`.
- `resolveResumeLesson(course, progressMap, enrollment)`: first the `lastLessonId` if not completed; else first incomplete lesson; else first lesson.
- `streak(activity, today)`: consecutive local-calendar days ending today (or yesterday if today is empty) with `secondsWatched ≥ 60` or `lessonsCompleted ≥ 1`.

### 6.4 Enrollment & access
1. Free preview lessons (`isFreePreview`) are playable without enrollment.
2. Other lessons: if not enrolled, the Player page shows a `LockedLesson` panel (poster + "Enroll to watch" CTA); the player is **not** mounted.
3. Enroll flow: `EnrollPanel` → if `priceCents > 0`, open a `Dialog` titled "Demo checkout" explaining that no payment is processed; confirm creates `Enrollment`. Free courses enroll immediately with a toast.
4. Unenroll is available in My Learning overflow menu with confirm dialog; progress is retained.

### 6.5 Notes
`addNote(courseId, lessonId, timestampSec, body)`: trims, validates 1–1000 chars, inserts, sorts by `timestampSec`. Tapping a note timestamp calls `playerRef.seekTo(timestampSec)`. Notes pause playback while the textarea is focused only if the user has enabled "Pause while typing" (default off). Max 200 notes per lesson; excess shows inline error.

### 6.6 Autoplay-next
On `ended` and `settings.autoplayNext` and `nextLesson` exists and is accessible (free or enrolled): show `AutoplayCountdown` for 5 s → `router.push` to next lesson. Cancel clears the timer. If no next lesson: show "Course complete" panel (when all done) or "End of module" panel.

### 6.7 Studio (authoring with Mux Direct Upload)
1. `StudioCourseForm` validates against `Course` rules; creates a draft with `source: "studio"`, `status: "draft"`.
2. `ModuleEditor`: add/rename/delete modules; reorder via **visible Up/Down buttons** (no drag-only interactions).
3. `LessonUploader` flow:
   a. `POST /api/mux/upload` → `{ uploadId, url }`.
   b. Pass `endpoint={url}` to `MuxUploader`; create `StudioUploadJob { state: "uploading" }`.
   c. On upload success → state `processing`; poll `GET /api/mux/upload/[id]` until `assetId` appears.
   d. Poll `GET /api/mux/asset/[id]` until `ready` (backoff: 2 s → 3 s → 5 s → 8 s, cap 10 s, give up after 15 min → `errored`).
   e. On `ready`: create the `Lesson` with `playbackId`, `muxAssetId`, `durationSec`.
   f. Jobs persist in storage; on Studio load, any `processing` job resumes polling (survives refresh).
4. Deleting a studio lesson calls `DELETE /api/mux/asset/[id]` best-effort, removes locally from module, and purges matching records in `lms.v1.progress`, `lms.v1.notes`, and `lms.v1.durations`. Deleting a course purges all associated module lessons and `lms.v1.enrollments` for that `courseId`.
5. Publish button enabled only when validation in §2.1 passes; shows a checklist of blockers otherwise.
6. When `MUX_NOT_CONFIGURED`, Studio can still create text-only drafts and attach an **existing playback ID** manually (validated against `[A-Za-z0-9]+`).

### 6.8 Certificates
Available when `enrollment.completedAt` is set. `/certificate/[slug]` renders learner `displayName`, course title, instructor, completion date; "Print / Save as PDF" button triggers `window.print()`; `@media print` hides the shell and enforces landscape. If the learner hasn't finished, show an `EmptyState` with progress and a "Continue course" button.

### 6.9 State matrix (every screen must implement all)

| Screen | Loading | Empty | Error |
|--------|---------|-------|-------|
| Home | Hero + rail skeletons until hydrated | "Continue watching" hidden when none; catalog always has seed | Boundary with Retry |
| Catalog | Card grid skeleton (6) | "No courses match" + Clear filters | `ErrorState` |
| Course detail | Skeleton layout | Unknown slug → `not-found` | Boundary |
| Player | 16:9 skeleton, sidebar skeleton | Course with no lessons → EmptyState | Player error overlay, token error, unknown lesson → redirect to resume lesson |
| My Learning | Skeleton rows | "You haven't enrolled yet" + Browse CTA | `ErrorState` |
| Notes | Inline skeleton | "No notes yet — jot one at 0:42" | Inline validation / quota toast |
| Studio | Skeleton | "Create your first course" | `MuxNotConfigured`, per-job error with Retry |
| Certificate | Skeleton | Not-complete panel | Boundary |

---

## 7. Pages & Routing Details

- **Next.js idioms:** Server Components fetch/compose static seed data; `params` and `searchParams` are asynchronous in current Next.js — always `await` them. Use `generateStaticParams` for seed course slugs and `generateMetadata` per course (title, description, Open Graph image from `posterUrl`). Studio-created courses (client-only) resolve on the client: the course page uses a client resolver when the slug is not in seed, then `notFound()` behavior is replicated by rendering the not-found UI.
- `/learn/[slug]` is a client resolver that waits for hydration, runs `resolveResumeLesson`, then `router.replace`.
- Metadata: `viewport` export with `viewportFit: "cover"`, `themeColor` = background token.
- Fonts via `next/font`: display serif **Fraunces**, UI sans **Manrope**; `display: swap`; exposed as CSS variables.

---

## 8. Design System (Tailwind CSS, CSS-first `@theme`)

Tokens defined in `globals.css` (no JS config unless the current Tailwind docs require it):

| Token | Value | Use |
|-------|-------|-----|
| `--color-bg` | `#0B0B0D` | page |
| `--color-surface` | `#131316` | cards |
| `--color-elevated` | `#1B1B20` | menus, sheets |
| `--color-line` | `#2A2A31` | borders |
| `--color-ink` | `#F4F1EA` | primary text (warm ivory) |
| `--color-muted` | `#A3A3AD` | secondary text (≥ 4.5:1 on surface) |
| `--color-gold` | `#E3B04B` | accent / primary CTA |
| `--color-gold-ink` | `#1A1405` | text on gold |
| `--color-danger` | `#F26B6B` | errors |
| `--color-success` | `#5FD39A` | completed |

- Radii: `sm 8px`, `md 12px`, `lg 20px`; shadows are subtle black with 1px inner border highlight (`inset 0 0 0 1px rgb(255 255 255 / .04)`).
- Type scale: display `clamp(2rem, 6vw, 4.5rem)` serif; headings serif; body Manrope 16px min (prevents iOS zoom on inputs).
- Focus ring: 2px gold, 2px offset, always visible on `:focus-visible`.
- Motion: 150–250 ms ease-out; wrapped by `prefers-reduced-motion`.
- Cinematic details: poster gradient scrims (`from-bg via-bg/60 to-transparent`), subtle film-grain overlay (static SVG noise data URI at 4% opacity), gold hairline dividers.
- Spacing: container `max-w-7xl`, horizontal padding `px-4` (≤430), `px-6` (768), `px-8` (1024+).

### 8.1 Responsive & interaction contract (mandatory validation)

| Viewport | Layout rules |
|----------|--------------|
| **360px** | Single column. Bottom nav hidden on `/learn/[slug]/[lessonId]` to prevent vertical viewport exhaustion; visible on all other routes. Catalog grid 1 col (poster full-width). Course detail: `EnrollPanel` as sticky bottom bar (respects `env(safe-area-inset-bottom)`). Player: sticky 16:9 at top, tabs below, curriculum opens in bottom `Sheet`. Curriculum rows enforce `min-w-0` on title containers to prevent flexbox overflow. No horizontal scroll. |
| **390px** | As 360 with larger paddings; rails show ~1.15 cards to hint swipe. |
| **430px** | As 390; catalog may use 2 columns of compact cards only if card min width ≥ 180px. |
| **768px** | 2-col catalog grid; top nav replaces bottom nav; Player: video full width, sidebar becomes a collapsible panel under the tabs; filters inline row. |
| **1024px+** | 3–4 col grid; Player page 2-column: video + tabs (flex-1) and 360px sticky curriculum sidebar; hero billboard taller; max container 1280px. |

Rules that apply at every size:
- **No hover dependence:** every action visible/tappable; hover only enhances (color shift/scale).
- Touch targets ≥ 44×44 px; spacing ≥ 8 px between adjacent targets.
- Use `dvh` (not `vh`) for full-height layouts; honor safe-area insets on top bar, bottom nav, sheets.
- Inputs: 16 px font size minimum.
- Lists of 50+ rows (long curriculum): `content-visibility: auto` on rows.
- Playwright viewport matrix tests: 360×740, 390×844, 430×932, 768×1024, 1280×800; assert no horizontal overflow (`scrollWidth <= clientWidth`), visible CTA, and nav presence on every top-level route.

### 8.2 Accessibility
Semantic landmarks (`header`, `nav`, `main`), skip-to-content link, `aria-current="page"` in nav, Accordion/Tabs/Dialog per WAI-ARIA APG, focus trap + restore in Dialog/Sheet, live region for toasts and autoplay countdown, completed state conveyed by icon **and** text (not color alone), captions: Mux Player exposes text tracks when present — `lang` attributes set.

---

## 9. Seed Content (typed module, `lib/seed/`)

- `lib/seed/playback.ts` exports `SEED_PLAYBACK_ID` — one public Mux playback ID (use Mux's public demo ID from the current Mux Player documentation; Phase 1 acceptance includes confirming `https://stream.mux.com/{id}.m3u8` responds, otherwise replace with any public playback ID from the owner's Mux account via `NEXT_PUBLIC_SEED_PLAYBACK_ID`).
- 4 instructors (fictional): *Elena Marquez* (creative direction), *Dr. Idris Okafor* (data & tech), *Hana Whitfield* (writing), *Marcus Lindqvist* (business).
- 6 published seed courses across ≥ 4 categories, each with 3–4 modules × 3–5 lessons, 1–2 `isFreePreview` lessons (first lesson of module 1 always free), realistic titles/summaries/outcomes, 1 featured. All lessons reuse `SEED_PLAYBACK_ID` and `durationSec: null` (D5).
- Seed timestamps are fixed constants (not `new Date()`), keeping server/client HTML identical.

---

## 10. Testing Plan (executed within phases, no exceptions)

- **Unit (Vitest):** `filterCourses`, `resumeStart`, `nextLesson`, `resolveResumeLesson`, `streak`, segment insertion, `normalizeOrder`, schema validators, store cache identity, migration runner, poll backoff schedule, `posterUrl`.
- **Component (Testing Library):** Tabs/Accordion/Dialog keyboard and focus behavior, CatalogFilters URL sync, NotesPanel add/edit/delete, EnrollPanel flows.
- **Route handlers:** origin rejection, validation errors, `MUX_NOT_CONFIGURED`, upstream failure mapping (Mux client mocked).
- **E2E (Playwright):** viewport matrix (§8.1); enroll → watch → resume → complete → certificate path using the seed course; reload persistence; cross-tab sync smoke test.

---

## 11. Five-Phase Sequential Queue

> Each phase must finish with: type-check clean, lint clean, its tests green, and a manual check at 360 / 390 / 430 / 768 / 1024+. No phase may leave `// TODO`, stubs, or elided code. Later phases may not modify earlier-phase public APIs without updating this plan.

### Phase 1 — Types, Storage/API Client Config, Base Utilities
Deliverables:
1. `lib/types.ts` (all interfaces in §2) and `lib/schemas.ts` (zod mirrors with the rules in §2.1).
2. `lib/storage/` — `keys.ts`, `createStore.ts`, `migrations.ts`, concrete stores (`profileStore`, `enrollmentsStore`, `progressStore`, `notesStore`, `settingsStore`, `durationsStore`, `activityStore`, `studioCoursesStore`, `studioJobsStore`), `useStore`, `useHydrated`.
3. `lib/mux/` — `server.ts`, `handler.ts` (pipeline), `jwt.ts`, `urls.ts`, errors; the four Route Handlers in §4 fully implemented.
4. `lib/domain/` — pure functions: catalog filter, progress math, resume, next-lesson, streak, `normalizeOrder`, poll backoff.
5. `lib/utils/` — `cn`, `formatDuration`, `formatPrice`, `formatRelativeDate`, `slugify`, `uid`, `localDateKey`, `clamp`.
6. `lib/seed/` — instructors, playback constant, 6 courses.
7. `next.config` image remote pattern for Mux thumbnails; env validation module (`lib/env.ts`) that parses env lazily with zod.
8. Vitest setup + all Phase 1 unit tests.

Exit criteria: every pure function has tests; store cache identity test passes; seed validates against schemas; route handler tests green.

### Phase 2 — Design Foundation & Atomic UI Primitives
Deliverables:
1. `globals.css` with Tailwind import, `@theme` tokens (§8), base resets, focus ring, film-grain utility, reduced-motion rules, safe-area utilities.
2. `app/layout.tsx` with `next/font` (Fraunces + Manrope), viewport export, `color-scheme: dark`, skip link.
3. All primitives in §5.1 with typed props, `forwardRef`, variant maps via a small `cva`-style helper written in-house (no extra dependency).
4. A `/dev/primitives` route **excluded from production builds** (guarded by `process.env.NODE_ENV`) rendering every primitive and state, used for visual verification at the five viewports.

Exit criteria: contrast ≥ 4.5:1 for all text tokens; every interactive primitive ≥ 44 px tall on touch; keyboard focus visible everywhere.

### Phase 3 — Compound Molecules & Feature Components
Deliverables:
1. Compound components in §5.2 (`Tabs`, `Accordion`, `Dialog`, `Sheet`, `Dropdown`, `Carousel`, `Toast`, `EmptyState`, `ErrorState`, `Stepper`).
2. Presentational feature components: `CourseCard`, `CourseRail`, `HeroBillboard`, `CatalogFilters`, `CurriculumList`, `EnrollPanel`, `InstructorCard`, `LessonSidebar`, `LessonTabs` shell, `AutoplayCountdown`, `StreakCard`, `CertificateView`, `MuxNotConfigured`, `AppShell` (top nav + bottom nav).
3. Components accept data via props only (no store access yet) so they are testable in isolation; each has loading/empty/error variants where relevant.
4. Component tests for keyboard/focus behavior.

Exit criteria: Dialog/Sheet focus trap verified; Carousel usable by swipe and by visible buttons; no component relies on hover.

### Phase 4 — Domain Logic, Reactive State, and Specialized APIs
Deliverables:
1. Domain hooks in §3 bound to stores; `useCatalog` merges seed + studio and memoizes.
2. `VideoPlayer` with the full integration in §6.2 (Mux Player events, signed tokens with refresh, keyboard shortcuts, Media Session, duration learning, error overlay).
3. Progress engine hook `useProgressTracker` implementing §6.3 exactly (throttle, seek detection, flush on `pagehide`/`visibilitychange`, completion, activity updates).
4. `NotesPanel` with seek integration; autoplay-next controller (§6.6); enrollment actions (§6.4).
5. Studio logic: `useUploadJobs` (create, persist, resume polling, backoff), `LessonUploader` with `@mux/mux-uploader-react`, `ModuleEditor`, `StudioCourseForm`, publish validation.
6. Toast wiring for quota errors and course completion.

Exit criteria: refresh mid-lesson resumes at the saved position; seeking does not inflate watched segments; a studio upload survives a page refresh; two tabs stay in sync.

### Phase 5 — Complete Page/Screen Assembly & Responsive Shell
Deliverables:
1. All routes in §1 fully assembled: Home, Catalog, Course detail, Player (+ resolver), My Learning, Studio dashboard/editor, Certificate, `not-found`, `error`, `loading`.
2. `generateStaticParams` + `generateMetadata` for seed courses; `await` of `params`/`searchParams`.
3. Responsive behavior per §8.1: sticky mobile enroll bar, bottom nav ↔ top nav switch, Player layout variants, filter sheet.
4. Full state matrix (§6.9) implemented on every screen with hydration-safe skeletons.
5. README (usage, env vars, D4 limitation) and Playwright E2E suite per §10.
6. Final pass: Lighthouse-style checks (performance budget: Player route initial JS lazy-loads Mux Player; LCP image preloaded with `priority`), accessibility audit with landmark/ARIA verification.

Exit criteria: full learner journey (browse → enroll → watch → resume → complete → certificate) passes at all five viewports; no horizontal overflow anywhere; Studio works end-to-end with valid Mux env vars and degrades correctly without them.

---

## 12. Known Risks & Mitigations (pre-empting the adversarial audit)

| Risk | Mitigation |
|------|-----------|
| Hydration mismatch from localStorage | `getServerSnapshot` returns defaults; `useHydrated` gates user-specific UI. |
| `useSyncExternalStore` infinite loops | Cached snapshot identity + memoized selectors, tested explicitly. |
| Progress inflated by scrubbing | Seek detection (> 15 s jump adds no segments); segment-set model instead of max-position. |
| Lost progress on tab close | Forced flush on `pause`, `visibilitychange`, `pagehide`, route change. |
| Unknown durations | D5 learned-duration cache; course percent uses lesson counts. |
| Mux secrets exposure | Secrets only in Route Handlers; no `NEXT_PUBLIC_` secret; responses `no-store`. |
| Local entitlement is spoofable | Documented limitation (D4); signed playback shown as capability, not security. |
| Large Mux Player bundle | Lazy entry / `next/dynamic`; Player mounted only on Player and trailer surfaces. |
| Upload polling runaway | Backoff cap + 15-minute timeout + job state persisted. |
| localStorage quota | Prune activity, retry, toast; all writes try/catch. |
| API shape drift (Next.js, Tailwind, Mux) | "Verify against current docs" rule at every phase start; no version pinning. |
| Drag-and-drop on touch | Not used; reorder via explicit Up/Down controls. |