## 1) What the backend must do

- **Auth:** Auth0 for user sessions (no custom auth).
- **Project setup:** On first login (outside the agent), store Shopify shop domain + token (from the Shopify app’s OAuth flow).
- **Diagnostics:** Lightweight crawl (Home + a few PDPs) → return brand summary
- **Experiments:** Create draft (from agent), **publish** to Cloudflare KV (live), **pause/finish**.
- **Status:** Return simple per-variant sessions and primary KPI from PostHog.
- **Safety & limits:** Sanitize variant payloads, enforce tiny caps.

---

## 2) Data model (only the essentials)

### Project

- `id` — string
- `shopDomain` — unique string
- `accessTokenEnc` — encrypted string (Shopify token)
- `createdAt` — timestamp

### Experiment

- `id` — string
- `projectId` — string (FK → Project)
- `name` — string
- `status` — `draft | running | paused | finished`
- `dsl` — JSON (the experiment spec)
- `createdAt` — timestamp
- `publishedAt` — timestamp (nullable)
- `finishedAt` — timestamp (nullable)

### DiagnosticsRun (one latest is enough for pilot)

- `id` — string
- `projectId` — string
- `status` — `pending | completed | failed`
- `startedAt / finishedAt` — timestamps
- `summary` — JSON (brand profile)
- `pages` — JSON array of `{ url, screenshotUrl }` (HTML storage optional)

### ChatSession (for agent integration)

- `id` — string
- `projectId` — FK → Project
- `createdAt` — timestamp
- `updatedAt` — timestamp
- `status` — `active | closed`

### ChatMessage

- `id` — string
- `sessionId` — FK → ChatSession
- `role` — enum: `user | agent | tool | system`
- `content` — JSON (string for user/agent, structured for tool calls/responses)
- `createdAt` — timestamp

**Indexes/limits**

- Unique: `Project.shopDomain`
- Composite: `Experiment(projectId, status, createdAt)`
- Caps: `dsl` ≤ **100 KB**, per-variant HTML ≤ **5 KB**, per-experiment CSS total ≤ **10 KB**, **1–3 variants** max (A/B/C), **max 3 targets**.

---

## 3) Single-Op DSL (one op that can change anything)

We collapse variant changes to **one op**: “**render**” a block. This covers every use case by letting a variant fully redefine the target element (or place markup before/after it) and attach **scoped CSS**.

### Top-level (experiment)

- `experimentId` — string
- `projectId` — string
- `name` — string
- `status` — managed by backend (`draft|running|paused|finished`)
- `match` — where to run
    - `host` — optional (defaults to project store domain)
    - `path` — string (exact, prefix `…/*`, or `/products/*`)
- `traffic` — `{ A: 0.333, B: 0.333, C: 0.334 }` (must sum ≈ 1.0)
- `assignment` — cookie config
    - `cookieName` — e.g., `omen_EXP_123`
    - `ttlDays` — e.g., `365`
- `targets` — array (1–3) of target blocks (see below)
- `kpi` — `{ primary: "add_to_cart_click", secondary?: [] }`
- `runtime` — `{ minDays, minSessionsPerVariant, endAt? }`
- `analytics` — `{ posthog: { enabled, host }, eventProps: ["experimentId","variantId","projectId","page"] }`
- `guardrails?` — `{ watch: ["lcp","js_errors","cls"] }` (optional)

### Target (what to modify)

- `selector` — CSS selector (MVP default: **first match** in DOM)
- `apply` — `"first"` (default) or `"all"` (only if we really need it)
- `variants` — `{ A: Variant, B: Variant, C: Variant }`

### Variant = **single op**

- `mode` — always `"render"` (the single op)
- `render` — the entire instruction:
    - `position` — where to render relative to the selected element
        - `"inner"` — replace **innerHTML** (default)
        - `"outer"` — replace the **entire node** (tag swap allowed)
        - `"before"` — insert before the node
        - `"after"` — insert after the node
    - `html` — sanitized HTML snippet (≤ **5 KB**)
    - `css?` — optional **scoped CSS** (≤ **10 KB** total per experiment). Must be **namespaced** with `.omen-…`
    - `oncePerResponse?` — boolean (default `true`): inject this variant’s CSS only once per HTML response (even if multiple targets)

> With one “render” op, you can:
> 
> - Replace the button/section entirely (structure, copy, icons, microcopy)
> - Add trust rows before/after a CTA
> - Change classes/attributes/styles by emitting the desired HTML
> - Style it safely with scoped CSS
>     
>     No separate “ops” list needed.
>     

### Sanitization (strict, but simple)

- **Disallowed HTML** in `render.html`: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<style>`, event attributes (`on*`), `srcdoc`, `javascript:` URLs.
- **Allowed HTML**: standard tags (div, span, p, strong, em, img, a, ul/ol/li, button, small, etc.).
- **CSS** in `render.css`: required `.omen-*` prefix; no `@import`; HTTPS URLs only; no fonts in MVP.

### Limits (re-stated)

- Targets: **max 3**
- Variants: **3**
- `html`: ≤ **5 KB** per variant per target
- `css`: ≤ **10 KB** combined per experiment
- DSL total: ≤ **100 KB**
- Default `apply`: `"first"` (safe); `"all"` only when you’re absolutely certain

---

## 4) Validation (backend enforces)

- **Structure:** all required fields present; traffic sums to ~1.0; cookieName safe.
- **Selectors:** valid CSS; target count ≤ 3.
- **Variants:** each has `mode:"render"` and a valid `render` block.
- **Sanitization:** reject disallowed tags/attributes/URLs; enforce CSS `.omen-` namespace.
- **Limits:** reject if any size/count caps are exceeded.
- **Analytics host:** allowed PostHog host only.

**Common error codes**

- `INVALID_DSL_STRUCTURE`
- `INVALID_SELECTOR`
- `UNSAFE_HTML`
- `UNSCOPED_CSS`
- `LIMIT_EXCEEDED`
- `INVALID_TRAFFIC`

---

## 5) Endpoints (no code, just contract)

- **Auth:** handled by **Auth0**; backend trusts the session/JWT.
- **POST /auth/shopify/callback** — store/update project (`shopDomain`, encrypted token, currency, timezone), then redirect `/admin`.
- **POST /diagnostics/start** — `{ projectId }`; start the light crawl; return `{ runId }`.
- **GET /diagnostics/result?projectId=…** — returns `{ brand: { colors[], fonts[], components[], voice?[] }, pages: [{ url, screenshotUrl }] }`.
- **POST /experiments** — body: `{ dsl }`; create `draft`; return `{ id }`.
- **POST /experiments/:id/publish** — write `EXP_<id>` to KV and add to `CONFIG_INDEX`; set `running`.
- **POST /experiments/:id/pause** — remove from `CONFIG_INDEX`; set `paused`.
- **POST /experiments/:id/finish** — remove from `CONFIG_INDEX`; set `finished`.
- **GET /experiments/:id/status** — return `state`, `traffic`, per-variant `{ sessions, primary { name, rate } }`, and guardrails if available.

---

## 6) KV contract (edge consumes this)

- `CONFIG_INDEX` → `["EXP_<id1>", "EXP_<id2>"]` (running only)
- `EXP_<id>` → the **validated single-op DSL JSON**
    
    **Order:** write `EXP_<id>` first, then add to `CONFIG_INDEX`. On pause/finish, only remove from `CONFIG_INDEX`.
    

---

## 7) Diagnostics (what we actually store/return)

- Scope: `/` and **2–5 PDPs** (just enough to inform the agent).
- Artifacts:
    - Screenshots (desktop; mobile optional) → return URLs
    - Raw HTML (optional; keep for prompting)
- Summary (BrandProfile): `colors` (≤6), `fonts` (≤2), `components` (presence tags like Hero/CTA/Trust/Reviews), `voice?` (optional)

---

## 8) Status (how we compute it, simply)

- Events captured in PostHog must include: `experimentId`, `variantId`, `projectId`, `page`.
- Primary KPI (pilot default on PDP): `add_to_cart_click`.
- **Sessions/variant:** use pageviews for the matched `path` as denominator (document this in the response).
- **Rate:** `primary_event_count / sessions` per variant.
- **Guardrails:** if you capture `lcp`/`js_errors`, return a basic label (normal/elevated).

**Response always includes:**

`state`, `traffic`, `variants[]` (id, sessions, primary { name, rate }), and optional `leader` + `liftVsA`.

---

## 9) Safety & constraints (MVP discipline)

- **No arbitrary JS** in variants (ever).
- **Scoped CSS only** (`.omen-*`), small payloads.
- **Defaults safe:** `apply:"first"`, `position:"inner"`.
- **Rate-limit publishes** to avoid thrash.
- **Auth0 only** for user auth; Shopify token handling stays minimal and encrypted.