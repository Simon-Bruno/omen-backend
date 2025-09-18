## Hypothesis Generation Service — Architecture and Best Practices

This document outlines how to design a clear, robust Hypothesis Generation service tailored to this codebase. It focuses on boundaries, responsibilities, data flow, and integration points with existing modules such as `features/brand_analysis`, `features/crawler`, the DAL in `src/infra/dal`, and the agent layer in `src/domain/agent`.

### Goals
- **Single responsibility**: Generate testable, prioritized hypotheses from inputs (brand context, site content, historical results).
- **Deterministic integration**: Stable interfaces and schemas at boundaries (input/output contracts, persistence, analytics, and observability).
- **LLM-agnostic core**: Prompting and model specifics are modular so you can swap models or providers.
- **Composability**: Works standalone and as a step in larger workflows (e.g., brand analysis or experimentation pipelines).

### High-level Responsibilities
- **Input aggregation**: Fetch brand, project, and site artifacts (e.g., selected URLs, screenshots, extracted text) via existing services (`features/crawler`, `services/project-info`, `infra/dal`).
- **Context building**: Curate compact, relevant context from raw data (dedup, summarize, rank). Avoid overloading prompts.
- **Hypothesis synthesis**: Use templates and LLMs to generate hypotheses with rationale, expected impact, and confidence.
- **Validation**: Enforce schemas on both input requests and output hypotheses.
- **Prioritization**: Score hypotheses using internal heuristics and (optionally) PostHog analytics signals.
- **Persistence and publishing**: Store hypotheses in the DAL (if needed) and publish events/diagnostics for traceability.

### Recommended Module Layout
- `src/features/hypothesis_generation/`
  - `hypothesis-generation.ts`: Public service interface (single entry point). Pure orchestration; no vendor specifics.
  - `index.ts`: Re-exports typed entry points.
  - `types.ts`: Request/response contracts; internal types.
  - `context-builder.ts`: Gathers and compresses inputs from brand/project/crawler.
  - `prompt-templates.ts`: Contains deterministic templates and guardrails; no API calls.
  - `llm-adapter.ts`: Thin adapter to `src/shared/ai-config.ts` and the agent runtime. Encapsulate provider differences.
  - `prioritizer.ts`: Heuristics and any analytics-based ranking (e.g., from `infra/external/posthog`).
  - `validators.ts`: Zod schemas using existing validation infra (`src/shared/validation`).
  - `observability.ts`: Tracing, metrics, diagnostics (`src/domain/analytics/diagnostics.ts`, `infra/dal/diagnostics.ts`).

This mirrors existing patterns in `features/brand_analysis` for familiarity and reuse.

### Public Interface
- **Function**: `generateHypotheses(request)` in `hypothesis-generation.ts`.
- **Input**: Stable, validated structure (brand id, project id, strategy flags, optional artifacts like selected URLs).
- **Output**: Array of hypotheses with fields: id (deterministic or generated), title, description, rationale, impacted metrics, estimated lift, confidence, evidence links, suggested experiment design.

Rationale: a single entry point minimizes coupling and helps with tracing and retries.

### Data Flow
1. Validate request (`validators.ts`).
2. Build context (`context-builder.ts`):
   - Pull brand/project via `infra/dal` (`project.ts`, `user.ts`, etc.).
   - Pull artifacts via `features/crawler` (`playwright.ts`) and any existing brand analysis outputs (`features/brand_analysis`).
   - Summarize and rank content (e.g., top pages, repeated value props, friction points).
3. Synthesize hypotheses using `prompt-templates.ts` + `llm-adapter.ts`.
4. Validate and normalize outputs (`validators.ts`).
5. Prioritize results (`prioritizer.ts`).
6. Persist and/or publish diagnostics (`infra/dal/diagnostics.ts`, PostHog events, Cloudflare publisher if needed).

### Integration Points
- **Crawler** (`src/features/crawler/`):
  - Consume structured crawl results rather than scraping ad hoc. Reuse existing Playwright flows and types in `types.ts`.
  - Prefer inputs via the `url-selector.ts` used in brand analysis to keep page selection consistent.

- **Brand Analysis** (`src/features/brand_analysis/`):
  - Reuse outputs from `code-analyzer.ts`, `language-analyzer.ts`, and `screenshot-analyzer.ts` where available to cut tokens and improve signal.
  - Keep hypothesis generation decoupled: it should work even if brand analysis has not run, but leverage it when present.

- **Agent Layer** (`src/domain/agent/`):
  - Expose a tool wrapper (similar to `tools/get-project-info.ts`) that calls the public interface. This lets the agent orchestrate hypothesis generation as a step without embedding business logic in the tool itself.
  - Keep prompts in `prompt-templates.ts` and keep the tool thin.

- **DAL** (`src/infra/dal/`):
  - Store hypotheses and their lineage (inputs, prompt version, model, scores) for reproducibility.
  - Use idempotency keys where the same request can be retried.

- **Analytics** (`src/infra/external/posthog/`):
  - Optionally incorporate recent behavioral signals (e.g., bounce on PDP) into prioritization.
  - Emit events when hypotheses are generated and selected for experiments.

### Contracts and Validation
- Define request/response Zod schemas in `validators.ts` using the shared validation infra in `src/shared/validation`.
- Enforce schemas at the entry point and pre-persistence to catch prompt drift.
- Include a `schemaVersion` field in outputs and track `promptVersion` and `modelName` for lineage.

### Prompting and Model Strategy
- Keep provider details in `llm-adapter.ts` and configuration in `src/shared/ai-config.ts`.
- Version prompt templates and document constraints (max tokens, example outputs, strict JSON structures if used).
- Use few-shot examples derived from successful experiments if available.
- Prefer multi-step prompting only when necessary; otherwise use structured single-pass with clear sections (context, objectives, constraints, output format).

### Prioritization Heuristics
- Combine qualitative LLM confidence with quantitative heuristics:
  - Page traffic and funnel stage importance
  - Implementation effort estimates (low effort, high impact favored)
  - Alignment with brand goals and known pain points
  - Past experiment outcomes for similar themes
- Make the scoring function deterministic and testable; keep weights configurable.

### Observability and Diagnostics
- Trace every run with correlation ids (brandId, projectId, sessionId where applicable).
- Log inputs (redacted), prompt version, model, token usage, latency, and output size.
- Persist a compact diagnostic record in `infra/dal/diagnostics.ts` and send key metrics to PostHog.

### Error Handling and Resilience
- Validate early and often; short-circuit on missing prerequisites.
- Use timeouts, retries with jitter, and circuit breakers for LLM calls.
- Return partial results if synthesis succeeds but prioritization fails; surface structured errors otherwise.
- Make the service idempotent (deterministic ids based on request hash + prompt version when feasible).

### Security and Privacy
- Redact PII before sending to LLM providers.
- Respect project-level encryption (`src/infra/encryption.ts`) for stored artifacts where applicable.
- Limit prompt content to minimum necessary; avoid raw HTML dumps when summaries suffice.

### Testing Strategy
- Unit tests for `context-builder.ts`, `prioritizer.ts`, and `validators.ts` using fixtures.
- Snapshot tests for prompts (templates + example contexts) to detect accidental changes.
- Contract tests on the public interface to ensure schema compliance.
- E2E smoke test that runs a full flow against a small synthetic project.

### Performance and Cost Controls
- Summarize and deduplicate inputs aggressively before prompting.
- Cache intermediate artifacts (e.g., page summaries) keyed by content hash.
- Use smaller models where quality permits; gate heavier models behind a config flag.

### Deployment and Configuration
- Centralize config in `src/infra/config/services.ts` and `src/shared/ai-config.ts`.
- Feature flags for model selection, multi-pass prompting, and analytics-driven prioritization.
- Ensure graceful degradation if analytics or crawler data is unavailable.

### API Surface (HTTP Interface)
- If exposing over HTTP (e.g., `src/interfaces/http/`), keep the route thin:
  - Authenticate/authorize via `middleware/auth.ts` and `middleware/authorization.ts`.
  - Validate request using shared schemas.
  - Invoke the service entry point and map results to HTTP responses.
  - Do not embed business logic in controllers.

### Migration Path from Brand Analysis
- Start by calling hypothesis generation at the end of the existing brand analysis flow (`features/brand_analysis/brand-analysis.ts`) as an optional step.
- Gradually extract common utilities (URL selection, content summaries) into shared modules used by both features.

### Success Criteria
- Clear separation between orchestration, prompting, prioritization, and persistence.
- Deterministic, validated contracts with lineage tracking.
- Observable runs with actionable diagnostics.
- Easy provider swaps via an adapter.
- Works as a standalone feature and as part of broader workflows.


