# Implementation Plan

- [ ] 1. Extend Experiment DAL with preview functionality
  - Add `getPreviewableVariants` method to ExperimentDAL class
  - Implement query to fetch experiment with variants filtered by DRAFT/COMPLETED status
  - Return variants in proper format with variantId, selector, html, css, position fields
  - _Requirements: 1.1, 1.6, 1.7_

- [ ] 2. Create preview HTTP route handler
  - Create new file `src/interfaces/http/experiments/preview.ts`
  - Implement GET endpoint for `/api/experiments/:experimentId/preview`
  - Handle experiment ID parameter extraction and validation
  - Call DAL method and return formatted response
  - _Requirements: 1.1, 1.2_

- [ ] 3. Add error handling for preview endpoint
  - Implement 404 response when experiment not found or not previewable
  - Implement 500 response for internal errors
  - Return consistent error response format with error and message fields
  - _Requirements: 2.5, 2.6_

- [ ] 4. Register preview routes in HTTP interface
  - Create experiments directory structure under `src/interfaces/http/`
  - Export preview routes from experiments module
  - Register experiment routes in main HTTP router
  - _Requirements: 1.1_

- [ ] 5. Add TypeScript interfaces for preview responses
  - Define PreviewResponse interface with experimentId and variants fields
  - Define PreviewVariant interface with required variant fields
  - Define ErrorResponse interface for consistent error handling
  - Export interfaces for use across the application
  - _Requirements: 1.1, 1.2_