# Aura — Next.js Mux Video LMS

A cinematic, production-grade video learning management system built with Next.js (App Router), React 19, TypeScript, Tailwind CSS, and Mux Video. Designed for immersive courses with seamless playback, scrub-proof progress tracking, interactive timestamped notes, student streak mechanics, printable certificates, and an integrated instructor authoring studio.

- Live Application: https://nextjs-mux-video-lms.vercel.app
- Source Repository: https://github.com/mmy-lana/nextjs-mux-video-lms

---

## Overview

Aura implements a complete course consumption and authoring workflow without external backend dependencies. It operates on a hybrid architecture: learner state (enrollments, progress, notes, settings, and local course drafts) persists in `localStorage` behind a reactive, SSR-safe store, while secure media workflows (direct uploads, asset polling, signed JWT tokens, and asset deletion) run through Next.js server-side Route Handlers.

The application works out of the box with zero required environment variables using an open developer training video asset. Connecting Mux API credentials activates direct video uploads and signed asset delivery in the Instructor Studio.

---

## Key Features

### Video Player & Learning Experience
- Powered by `@mux/mux-player-react` loaded dynamically (`ssr: false`) to avoid hydration conflicts.
- HLS adaptive bitrate streaming with automatic quality switching and low-latency playback.
- Scrub-proof progress tracking: watches are measured in discrete 10-second segment sets rather than playhead maximums, preventing scrub exploitation.
- Automatic resume calculation: restores saved playhead position upon returning to a lesson.
- Interactive timestamped notes: click any note timestamp to seek the video; optional pause-while-typing mode.
- Autoplay countdown overlay (5 seconds) with accessible live region announcements and static mode under `prefers-reduced-motion`.
- Keyboard navigation shortcuts matching visible on-screen buttons (Space, K, J, L, Arrow keys, M, F, N, P).
- System-level MediaSession API integration for native OS lock screen controls and metadata.
- Printable completion certificates generated at `@media print` with landscape optimization.

### Instructor Studio
- Complete course authoring: modules, lessons, summaries, price presets, and outcomes.
- Visible Up/Down controls for curriculum reordering (no touch-hostile drag-and-drop).
- Direct chunked video uploading via `@mux/mux-uploader-react` without exposing server secrets.
- Automated client polling with exponential backoff (`2s -> 3s -> 5s -> 8s -> 10s`, capped at 15 minutes).
- Pre-publish validation checklist preventing empty modules, missing videos, or disordered lessons.
- Capability-secured asset deletion: asset removals require a cryptographically signed deletion token generated at upload time.
- Cascading deletion engine: purging a course automatically cleans up associated Mux assets, local modules, enrollments, progress, notes, and duration caches.

### Enterprise Security & Architecture
- Strict Origin enforcement: blocks non-browser, cross-origin, or spoofed state-mutating requests (`POST`, `DELETE`, `PUT`, `PATCH`).
- In-memory sliding-window token bucket rate limiter (20 requests/minute per client IP) with automatic TTL eviction.
- Normalized IP extraction mitigating proxy header spoofing vulnerabilities.
- Signed playback tokens: server-side JWT minting using RS256 private keys with explicit 2-hour expirations.
- SSR-safe state synchronization: `useSyncExternalStore` integration with referentially stable client/server snapshot caching to prevent React hydration infinite loops.

---

## Tech Stack

- Framework: Next.js (App Router, Server & Client Components)
- UI Library: React 19
- Language: TypeScript (Strict mode enabled)
- Styling: Tailwind CSS v4 (CSS-first `@theme` design tokens)
- Video Infrastructure: Mux (`@mux/mux-player-react`, `@mux/mux-uploader-react`, `@mux/mux-node`)
- Schema Validation: Zod
- Icons: Lucide React
- Unit & Component Testing: Vitest, Testing Library, JSDOM
- End-to-End Testing: Playwright (Headless Chromium matrix across 5 viewports)

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Hybrid Persistence | Learner records live in `localStorage` via a reactive store. Mux direct uploads, status checks, and token minting execute in server Route Handlers to protect API secrets. |
| Client Polling over Webhooks | Eliminates the requirement for an external database or public webhook endpoint; upload-to-asset readiness is resolved client-side with exponential backoff. |
| Zero-Config Seed Catalog | Ships with a static typed catalog streaming verified educational demo assets, allowing immediate demonstration without API keys. |
| Simulated Local Entitlement | Course enrollment and access control are local records. The platform demonstrates signed playback capabilities while maintaining clear transparency regarding client-side access simulation. |
| Learned Duration Cache | Seed lessons begin with unknown durations (`durationSec: null`). The real duration is learned upon media load and cached, preventing invented runtimes. |
| Strict Dark Palette | Cinematic dark theme (`--color-bg: #0B0B0D`, `--color-ink: #F4F1EA`, `--color-gold: #E3B04B`) with high-contrast type tokens (>= 4.5:1 ratio). |

---

## Directory Structure

```
src/
├── app/
│   ├── api/mux/
│   │   ├── asset/[id]/route.ts       # GET status / DELETE asset (capability-verified)
│   │   ├── token/route.ts            # POST mint signed JWT playback tokens
│   │   └── upload/
│   │       ├── [id]/route.ts         # GET upload polling status
│   │       └── route.ts              # POST create direct upload & delete capability
│   ├── certificate/[slug]/page.tsx   # Printable course certificate
│   ├── courses/
│   │   ├── [slug]/page.tsx           # Course landing page & curriculum breakdown
│   │   └── page.tsx                  # Search, filter, and catalog grid
│   ├── dev/primitives/page.tsx       # Design system verification bench
│   ├── learn/[slug]/
│   │   ├── [lessonId]/page.tsx       # Core video player & learning workspace
│   │   └── page.tsx                  # Dynamic resume resolver route
│   ├── my-learning/page.tsx          # Enrolled courses, streaks, and profile management
│   ├── studio/
│   │   ├── [courseId]/page.tsx       # Course curriculum editor & upload management
│   │   └── page.tsx                  # Instructor dashboard & draft index
│   ├── globals.css                   # Tailwind v4 theme tokens & base styles
│   └── layout.tsx                    # Root layout, fonts, metadata, skip-link
├── components/
│   ├── compound/                     # Headless primitives (Accordion, Tabs, Dialog, Carousel)
│   ├── features/                     # Domain modules (VideoPlayer, CatalogFilters, Studio)
│   └── ui/                           # Base UI elements (Button, Input, Badge, Progress)
├── hooks/                            # Reactive store hooks and playback engines
├── lib/
│   ├── domain/                       # Pure logic (progress math, catalog search, purge)
│   ├── mux/                          # Server Mux client, JWT signing, URL builders
│   ├── seed/                         # Seed instructors, courses, and playback fixtures
│   ├── storage/                      # LocalStorage reactive store factory and migrations
│   └── utils/                        # Formatting, IDs, accessibility, and math helpers
scripts/
├── audit.mjs                         # Playwright accessibility & touch target audit
├── verify-playback.ts                # Standalone script to verify Mux playback assets
└── verify.mjs                        # Responsive contract verification runner
tests/
├── component/                        # Component interaction & accessibility tests
├── e2e/                              # Playwright user flows & responsive matrix tests
└── unit/                             # Unit tests for domain math, schemas, and security
```

---

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- pnpm 9.x or higher (Strictly enforced; do not use npm or yarn)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/mmy-lana/nextjs-mux-video-lms.git
   cd nextjs-mux-video-lms
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the local development server:
   ```bash
   pnpm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Variables

Copy `.env.example` to `.env.local` to configure production or custom Mux integration:

```bash
cp .env.example .env.local
```

| Variable | Scope | Required | Purpose |
|----------|-------|----------|---------|
| `MUX_TOKEN_ID` | Server | Studio Only | Mux API access token ID for direct uploads. |
| `MUX_TOKEN_SECRET` | Server | Studio Only | Mux API access token secret. |
| `MUX_SIGNING_KEY_ID` | Server | Optional | Mux JWT signing key ID for signed playback. |
| `MUX_PRIVATE_KEY` | Server | Optional | Base64-encoded RSA private key for JWT signing. |
| `NEXT_PUBLIC_APP_URL` | Client/Server | Production | Canonical site URL (default: `http://localhost:3000`). Used for CORS verification. |
| `NEXT_PUBLIC_MUX_ENV_KEY` | Client | Optional | Mux Data environment key for video viewer analytics. |
| `NEXT_PUBLIC_SEED_PLAYBACK_ID` | Client | Optional | Custom Mux playback ID to override the default bundled seed asset. |

---

## Verification & Testing

The repository contains an automated test and validation pipeline covering unit, component, responsive layout, and end-to-end integration boundaries:

```bash
# Type check TypeScript without emitting files
pnpm run typecheck

# Run Vitest unit and component test suites
pnpm run test

# Run all verification steps (typecheck, tests, and production build)
pnpm run verify

# Verify that a custom Mux playback ID meets resolution, duration, and aspect ratio requirements
pnpm run verify:playback -- <PLAYBACK_ID>

# Run Playwright end-to-end tests against a production server
pnpm run test:e2e

# Run headless responsive matrix verification across 360px, 390px, 430px, 768px, and 1280px
pnpm run verify:responsive

# Run automated accessibility, touch target (>= 44px), and contrast audits
pnpm run audit
```

---

## Security Considerations

- Secret Isolation: No Mux credentials or private keys are exposed to the client bundle. All privileged operations execute exclusively inside `server-only` Route Handlers.
- State-Modifying Origin Enforcement: Requests attempting to write, delete, or sign tokens without a valid matching origin or referer are rejected immediately with `403 FORBIDDEN_ORIGIN`.
- Capability-Based Asset Deletion: Direct upload creation issues a 256-bit cryptographically random capability token. `DELETE /api/mux/asset/[id]` requires this token via the `x-mux-delete-capability` header, preventing arbitrary asset purging on the upstream Mux account.
- Rate Limiting: High-frequency poll and token endpoints are constrained by IP token buckets to prevent service degradation and denial-of-service attempts.

---

## License

This project is licensed under the MIT License.
