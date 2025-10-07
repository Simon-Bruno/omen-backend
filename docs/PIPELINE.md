# Omen Experimentation Pipeline - Complete Documentation

## Overview

The Omen experimentation pipeline is an end-to-end automated system for running A/B tests and conversion rate optimization (CRO) experiments on e-commerce websites. The pipeline leverages AI models to analyze brands, generate hypotheses, create variants, and deploy experiments automatically.

## Architecture Overview

```
┌─────────────────┐      ┌──────────────────┐      ┌───────────────────┐
│  Brand Analysis │ ───> │    Hypothesis    │ ───> │     Variant       │
│     Phase       │      │    Generation    │      │    Generation     │
└─────────────────┘      └──────────────────┘      └───────────────────┘
         │                        │                          │
         ▼                        ▼                          ▼
   Brand Intelligence       Test Hypotheses            Code & Selectors
                                                              │
                                                              ▼
                                                   ┌───────────────────┐
                                                   │    Experiment     │
                                                   │    Deployment     │
                                                   └───────────────────┘
```

---

## Phase 1: Brand Analysis

### Purpose
Extract comprehensive brand intelligence from target websites to understand brand personality, positioning, and visual identity.

### Input
- **Shop Domain**: The target website URL (e.g., `omen-mvp.myshopify.com`)
- **Project ID**: Unique identifier for the project
- **Authentication**: Optional Shopify password for protected stores

### Process

#### 1.1 Web Crawling with Firecrawl
- **Service**: `FirecrawlService` (`omen-backend/src/features/brand_analysis/firecrawl-service.ts`)
- **Tool**: Firecrawl API with Mendable SDK
- **Actions**:
  - Navigate to website with authentication if needed
  - Wait for page load (5 seconds)
  - Extract HTML, markdown, and screenshot

```typescript
// Example Firecrawl configuration
const result = await firecrawl.scrape(websiteUrl, {
    onlyMainContent: true,
    actions: [
        { "type": "write", "selector": "#password", "text": "reitri" },
        { "type": "executeJavascript", "script": "..." },
        { "type": "wait", "milliseconds": 5000 }
    ],
    formats: ["json", "screenshot", "html"]
});
```

#### 1.2 Brand Intelligence Extraction
- **Model**: Google Gemini (via structured generation)
- **Schema**: `BrandIntelligenceData`
- **Extraction Components**:

```typescript
interface BrandIntelligenceData {
    brand_description: string;           // 1-2 sentences about the brand
    brand_personality_words: string[];   // 4 words capturing character
    brand_trait_scores: {
        premium: { score: number; explanation: string };
        energetic: { score: number; explanation: string };
        innovator: { score: number; explanation: string };
        social_proof: { score: number; explanation: string };
        curated: { score: number; explanation: string };
        serious: { score: number; explanation: string };
    };
    brand_colors: Array<{
        color: string;
        description: string;
        usage_type: 'primary' | 'secondary' | 'tertiary' | 'accent';
        hex_code: string;
    }>;
}
```

#### 1.3 Storage
- Screenshots stored with metadata
- Brand analysis saved to database
- HTML and markdown content preserved

### Output
- **Brand Analysis JSON**: Complete brand intelligence profile
- **Screenshot**: Full-page screenshot (base64 encoded)
- **HTML Content**: Simplified HTML for later analysis
- **Markdown**: Extracted text content

### Example Output
```json
{
  "brand_description": "Your brand offers premium organic dog food products targeting health-conscious pet owners who prioritize natural ingredients and sustainable sourcing.",
  "brand_personality_words": ["Natural", "Caring", "Premium", "Trustworthy"],
  "brand_trait_scores": {
    "premium": {
      "score": 75,
      "explanation": "Strong premium signals through minimalist design, high-quality product photography, and emphasis on organic ingredients"
    },
    "social_proof": {
      "score": 45,
      "explanation": "Moderate social proof with customer testimonials visible but lacks prominent review counts or trust badges"
    }
  },
  "brand_colors": [
    {
      "color": "Forest Green",
      "description": "Primary brand color used in headers and CTAs",
      "usage_type": "primary",
      "hex_code": "#2D5016"
    }
  ]
}
```

---

## Phase 2: Hypothesis Generation

### Purpose
Generate data-driven hypotheses for A/B testing based on the brand analysis and current website state.

### Input
- **URL**: Target page for experimentation
- **Project ID**: Links to brand analysis
- **Brand Analysis**: Retrieved from Phase 1
- **Active Targets**: Existing experiments to avoid conflicts

### Process

#### 2.1 Page Analysis
- **Service**: `HypothesesGenerationService` (`omen-backend/src/features/hypotheses_generation/hypotheses-generation.ts`)
- **Crawler**: Playwright-based crawler for dynamic content
- **Screenshot**: High-quality capture (1920x1080)

```typescript
const crawlResult = await this.crawlerService.crawlPage(url, {
    viewport: { width: 1920, height: 1080 },
    waitFor: 3000,
    screenshot: { fullPage: true, quality: 80 },
    authentication: {
        type: 'shopify_password',
        password: 'reitri',
        shopDomain: 'omen-mvp.myshopify.com'
    }
});
```

#### 2.2 AI Hypothesis Generation
- **Model**: Google Gemini with structured output
- **Context Provided**:
  - Brand analysis from Phase 1
  - Current page screenshot
  - Simplified HTML
  - Active experiment targets (for conflict avoidance)

#### 2.3 Hypothesis Schema
```typescript
interface Hypothesis {
    title: string;                    // Clear hypothesis name
    description: string;               // One sentence breakdown
    primary_outcome: string;           // OEC (20 chars max)
    current_problem: string;           // Current issue identified
    why_it_works: Array<{
        reason: string;                // 5-7 word explanations
    }>;
    baseline_performance: number;      // Estimated current conversion %
    predicted_lift_range: {
        min: number;                   // Minimum expected lift
        max: number;                   // Maximum expected lift
    };
}
```

### Demo Mode
When `DEMO_CONDITION` is enabled:
- Focuses on specific target elements
- Uses predefined selectors
- Constrains hypothesis to button variations

### Output
- **Hypotheses Array**: 3-5 test hypotheses
- **Stored Screenshots**: Saved with HTML for variant generation
- **State Management**: First hypothesis stored for pipeline continuation

### Example Output
```json
{
  "hypotheses": [
    {
      "title": "Urgency-Driven Add to Cart",
      "description": "Adding urgency messaging to the add-to-cart button will increase conversions",
      "primary_outcome": "Add to Cart Rate",
      "current_problem": "Users lack motivation to make immediate purchase decisions",
      "why_it_works": [
        { "reason": "Creates fear of missing out" },
        { "reason": "Reduces decision paralysis time" }
      ],
      "baseline_performance": 3.2,
      "predicted_lift_range": { "min": 0.15, "max": 0.35 }
    }
  ]
}
```

---

## Phase 3: Variant Generation

### Purpose
Generate executable A/B test variants with code, selectors, and implementation details.

### Input
- **Hypothesis**: Selected from Phase 2
- **Project ID**: For retrieving context
- **Brand Analysis**: Design guidance
- **Screenshot & HTML**: Page state

### Process

#### 3.1 DOM Analysis
- **Service**: `DOMAnalyzerService` (`omen-backend/src/features/variant_generation/dom-analyzer.ts`)
- **Element Detection**: Identifies targetable elements
- **Injection Points**: Finds safe modification points

```typescript
interface InjectionPoint {
    selector: string;           // CSS selector
    confidence: number;         // 0-1 confidence score
    elementType: string;        // button, link, heading, etc.
    attributes: Record<string, string>;
    textContent?: string;
    position: { x: number; y: number; width: number; height: number };
}
```

#### 3.2 Variant Schema Generation
- **Service**: `VariantGenerationService` (`omen-backend/src/features/variant_generation/variant-generation.ts`)
- **AI Model**: Google Gemini
- **Output Schema**:

```typescript
interface Variant {
    variant_label: string;      // e.g., "Control", "Variant A"
    description: string;        // What changes
    rationale: string;          // Why it should work
    visual_changes: string[];   // List of visual modifications
    psychological_triggers: string[];  // Behavioral principles
}
```

#### 3.3 Code Generation
- **Service**: `VariantCodeGenerator` (`omen-backend/src/features/variant_generation/code-generator.ts`)
- **Pattern**: Self-contained IIFE JavaScript
- **Safety Features**:
  - Error handling with try-catch
  - Selector validation
  - Media guardrails (no external URLs)
  - Link preservation

```javascript
// Generated code structure
(function() {
  'use strict';

  function initVariant() {
    try {
      const baseElement = document.querySelector('[selector]');
      if (!baseElement) {
        console.warn('Target element not found');
        return;
      }

      // Variant implementation
      baseElement.textContent = 'New Text';
      baseElement.style.backgroundColor = '#FF0000';

    } catch (error) {
      console.error('Variant error:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVariant);
  } else {
    initVariant();
  }
})();
```

#### 3.4 Selector Strategy
Multiple approaches for robust element targeting:

1. **CSS Path Generator**: Creates specific paths
2. **Hypothesis-Aware Selector**: Context-based selection
3. **Smart Screenshot Strategy**: Visual recognition
4. **Demo Mode**: Fixed selectors for testing

### Output
- **Variants Array**: Control + test variants
- **JavaScript Code**: Implementation for each variant
- **Target Selectors**: CSS selectors for modifications
- **Execution Instructions**: Timing and setup details

### Example Output
```json
{
  "variants": [
    {
      "variant_label": "Control",
      "description": "Original button unchanged",
      "javascript_code": "// No changes for control",
      "target_selector": "body"
    },
    {
      "variant_label": "Variant A",
      "description": "Add urgency text to button",
      "javascript_code": "(function() { /* ... */ })();",
      "target_selector": ".add-to-cart-button",
      "visual_changes": ["Button text changed", "Red accent added"],
      "psychological_triggers": ["Urgency", "Scarcity"]
    }
  ]
}
```

---

## Phase 4: Experiment Creation & Deployment

### Purpose
Package variants into a complete experiment and deploy to the A/B testing platform.

### Input
- **Hypothesis**: Complete hypothesis object
- **Variants**: Generated code and configurations
- **Experiment Metadata**: Name, duration, traffic allocation

### Process

#### 4.1 Experiment Configuration
```typescript
interface ExperimentConfig {
    name: string;
    oec: string;                    // Overall Evaluation Criterion
    minDays: number;                 // Minimum test duration
    minSessionsPerVariant: number;  // Statistical significance threshold
    targetUrls: string[];           // Where to run the test
    targeting?: {
        match: 'all' | 'any';
        timeoutMs: number;
        rules: TargetingRule[];
    };
    hypothesis: Hypothesis;
    variants: Variant[];
    trafficDistribution: Record<string, number>;  // e.g., {"control": 0.5, "variant_a": 0.5}
}
```

#### 4.2 Targeting Rules
Support for advanced targeting:
- DOM element presence/absence
- Text content matching
- Meta tags
- Cookies
- URL parameters
- Local storage values

```typescript
type TargetingRule =
  | { type: 'selectorExists'; selector: string }
  | { type: 'textContains'; selector: string; text: string }
  | { type: 'cookie'; name: string; value: string }
  | { type: 'urlParam'; name: string; value: string };
```

#### 4.3 Cloudflare Worker Deployment
- **Publisher**: `CloudflarePublisher` (`omen-backend/src/infra/external/cloudflare/cloudflare-publisher.ts`)
- **KV Storage**: Experiment data stored in Cloudflare KV
- **Edge Execution**: Tests run at CDN edge

```typescript
// Deployment process
await cloudflarePublisher.publishExperiment({
    experimentId: experiment.id,
    projectId: project.id,
    variants: transformedVariants,
    targeting: experiment.targeting,
    status: 'ACTIVE'
});
```

### Output
- **Experiment ID**: Unique identifier
- **Deployment Status**: Success/failure
- **Preview URLs**: Test variant previews
- **Analytics Setup**: Tracking configuration

---

## Integration Points

### Frontend (Next.js)
- **Location**: `omen-frontend/app/api/`
- **Endpoints**:
  - `/api/brand-summary`: Initiate brand analysis
  - `/api/experiments`: Create/list experiments
  - `/api/chat`: AI assistant interface

### SDK (JavaScript)
- **Location**: `omen-js-sdk/`
- **Components**:
  - User identification
  - Variant assignment
  - Analytics tracking
  - Preview management

### Worker (Cloudflare)
- **Location**: `omen-sdk-worker/`
- **Functions**:
  - Variant serving
  - User bucketing
  - Analytics collection
  - A/B test execution

---

## Data Flow

```mermaid
graph LR
    A[User Request] --> B[Frontend API]
    B --> C[Backend Services]
    C --> D[Brand Analysis]
    D --> E[Hypothesis Generation]
    E --> F[Variant Generation]
    F --> G[Experiment Creation]
    G --> H[Cloudflare Deployment]
    H --> I[SDK Execution]
    I --> J[Analytics Collection]
```

---

## Key Technologies

### AI/ML
- **Google Gemini**: Primary language model
- **Structured Generation**: Type-safe AI outputs
- **Vision Models**: Screenshot analysis

### Web Technologies
- **Playwright**: Browser automation
- **Firecrawl**: Web scraping
- **Cloudflare Workers**: Edge computing

### Data Storage
- **PostgreSQL**: Primary database
- **Cloudflare KV**: Edge data store
- **Screenshot Storage**: Base64 encoded images

### Languages & Frameworks
- **TypeScript**: Primary language
- **Next.js**: Frontend framework
- **Prisma**: ORM
- **Zod**: Schema validation

---

## Configuration & Settings

### Environment Variables
```bash
# AI Configuration
AI_MODEL="gemini-1.5-pro"
GOOGLE_AI_API_KEY="..."

# Services
BACKEND_URL="http://localhost:3001"
FIRECRAWL_API_KEY="..."

# Cloudflare
CLOUDFLARE_ACCOUNT_ID="..."
CLOUDFLARE_API_TOKEN="..."
CLOUDFLARE_KV_NAMESPACE_ID="..."

# Database
DATABASE_URL="postgresql://..."
```

### Demo Mode
Toggle in `src/shared/demo-config.ts`:
```typescript
export const DEMO_CONDITION = true;  // Enable demo mode
export const DEMO_TARGET_ELEMENT = {
    selector: 'a[href="/collections/all"]',
    description: 'Shop All button'
};
```

---

## Error Handling & Recovery

### Retry Logic
- Automatic retries for transient failures
- Exponential backoff for API calls
- Fallback to cached data when available

### Validation
- Zod schemas for all data structures
- Input sanitization
- Selector validation before code execution

### Monitoring
- Comprehensive logging at each phase
- Error tracking with context
- Performance metrics collection

---

## Security Considerations

### Code Execution
- Sandboxed JavaScript execution
- No external resource loading
- DOM modification restrictions

### Data Protection
- Authentication via Auth0
- Encrypted storage for sensitive data
- Session-based access control

### Rate Limiting
- API call throttling
- Resource usage monitoring
- Concurrent execution limits

---

## Performance Optimizations

### Caching
- Brand analysis results (5-minute TTL)
- Screenshots and HTML
- AI responses for similar queries

### Parallel Processing
- Concurrent variant generation
- Batch API calls where possible
- Asynchronous pipeline stages

### Resource Management
- Browser instance pooling
- Memory-efficient image handling
- Lazy loading of heavy dependencies

---

## Future Enhancements

### Planned Features
1. **Multi-page experiments**: Test across entire user journey
2. **Personalization**: User segment targeting
3. **Mobile-specific variants**: Responsive test variations
4. **Visual editor**: GUI for variant creation
5. **Statistical significance calculator**: Real-time test analysis

### Technical Improvements
1. **WebAssembly modules**: Performance-critical operations
2. **GraphQL API**: Flexible data fetching
3. **Event streaming**: Real-time analytics
4. **ML model fine-tuning**: Domain-specific optimization
5. **Distributed processing**: Horizontal scaling

---

## Conclusion

The Omen experimentation pipeline represents a sophisticated, AI-driven approach to conversion rate optimization. By automating the entire process from brand analysis to variant deployment, it enables rapid, data-driven experimentation at scale. The modular architecture ensures flexibility and maintainability while the comprehensive safety measures guarantee reliable execution in production environments.