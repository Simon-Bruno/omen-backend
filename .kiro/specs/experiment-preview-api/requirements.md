# Requirements Document

## Introduction

This feature provides a minimal backend API capability to support preview of experiments and variants. The system will enable frontend SDKs to fetch experiment variant data for preview purposes without affecting live traffic allocation or edge-worker rules. The focus is on speed, minimal surface area, and backwards compatibility with existing experiment storage models.

## Requirements

### Requirement 1

**User Story:** As a frontend SDK, I want to fetch previewable variants for a given experiment, so that I can render preview overlays without affecting live experiment traffic.

#### Acceptance Criteria

1. WHEN a request is made to the preview endpoint with a valid experiment ID THEN the system SHALL return all previewable variants for that experiment
2. WHEN variants are returned THEN the system SHALL preserve the experiment's configured variant order with control variant first
3. WHEN the request is processed THEN the system SHALL bypass all runtime traffic allocation and edge-worker rules
4. WHEN variants are filtered THEN the system SHALL only include variants flagged as previewable
5. IF the caller lacks permissions THEN the system SHALL omit draft variants from the response

### Requirement 2

**User Story:** As a system administrator, I want the preview API to enforce proper authorization, so that experiment data is only accessible to authorized callers within the correct organizational boundaries.

#### Acceptance Criteria

1. WHEN an experiment is requested THEN the system SHALL verify the experiment is accessible to the caller's organization/project
2. IF an experiment is archived or locked THEN the system SHALL still allow read access for preview if permitted by the caller's role
3. WHEN access is denied THEN the system SHALL return sanitized errors that never leak resource existence across organizational boundaries
4. WHEN authentication fails THEN the system SHALL return a 401 status code
5. WHEN authorization fails THEN the system SHALL return a 403 status code
6. WHEN an experiment is not found or not visible THEN the system SHALL return a 404 status code

### Requirement 3

**User Story:** As a frontend developer, I want the preview API to support query parameters for filtering, so that I can limit the result set to specific variants when needed.

#### Acceptance Criteria

1. WHEN optional query parameters are provided THEN the system SHALL support filtering to include only specific variant IDs
2. WHEN no query parameters are provided THEN the system SHALL return all previewable variants
3. WHEN invalid query parameters are provided THEN the system SHALL return appropriate error responses
4. WHEN filtering is applied THEN the system SHALL maintain the configured variant ordering

### Requirement 4

**User Story:** As a system operator, I want the preview API to meet performance requirements, so that the user experience remains fast and responsive.

#### Acceptance Criteria

1. WHEN processing requests THEN the system SHALL achieve p95 response times under 150ms for payloads between 1KB-50KB
2. WHEN responses are generated THEN the system SHALL support HTTP caching with ETag/Last-Modified headers
3. WHEN caching is enabled THEN the system SHALL set Cache-Control headers to "private, max-age=30"
4. WHEN conditional requests are made THEN the system SHALL support 304 Not Modified responses to reduce payload sizes
5. WHEN content is served THEN the system SHALL support gzip and brotli compression

### Requirement 5

**User Story:** As a system administrator, I want comprehensive observability for the preview API, so that I can monitor performance, usage, and troubleshoot issues effectively.

#### Acceptance Criteria

1. WHEN requests are processed THEN the system SHALL log structured data including experimentId, variant count, caller orgId/projectId, cache status, and latency
2. WHEN metrics are collected THEN the system SHALL track request counts, error rates, p95/average latency, and rate-limit hits
3. WHEN preview fetches occur THEN the system SHALL optionally create audit trail entries recording who accessed what and when
4. WHEN errors occur THEN the system SHALL include correlation IDs in 5xx responses for troubleshooting

### Requirement 6

**User Story:** As a backend developer, I want the preview API to integrate seamlessly with existing systems, so that implementation is straightforward and maintains system consistency.

#### Acceptance Criteria

1. WHEN implementing the API THEN the system SHALL remain backwards-compatible with existing experiment storage models
2. WHEN new database tables are considered THEN the system SHALL avoid creating them unless strictly necessary
3. WHEN responses are formatted THEN the system SHALL use existing internal model serialization without new response shape discussions
4. WHEN the API is deployed THEN the system SHALL remain stateless and cache-friendly
5. WHEN errors occur THEN the system SHALL return 409 status codes for version inconsistencies or locked resources

### Requirement 7

**User Story:** As a system architect, I want clear boundaries for what this API does not handle, so that scope creep is avoided and responsibilities are well-defined.

#### Acceptance Criteria

1. WHEN the API is implemented THEN the system SHALL NOT include edge-worker integration for preview functionality
2. WHEN endpoints are created THEN the system SHALL NOT include mutation endpoints in this implementation
3. WHEN responses are generated THEN the system SHALL NOT handle overlay UI concerns, leaving those entirely to frontend SDKs
4. WHEN authentication is implemented THEN the system SHALL NOT require authentication for fetching previews initially, but SHALL verify URL-to-project relationships