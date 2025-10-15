# Product Detail Page (PDP) Experimentation Support Plan

## Executive Summary

This document outlines a comprehensive plan to add full Product Detail Page (PDP) experimentation support to the Omen platform. While the system already has basic PDP detection and some infrastructure in place, this plan details the enhancements needed to provide robust, PDP-specific A/B testing capabilities optimized for e-commerce conversion rate optimization.

### Current State
- Basic PDP page type detection exists but misclassifies collection pages
- PDP-specific brand analysis prompts exist but multi-page analysis is disabled
- Generic hypothesis and variant generation works but lacks PDP-specific optimizations
- URL targeting supports patterns like `/products/*` but needs refinement

### Target State
- Accurate page type detection with proper classification of PDPs vs collections
- PDP-optimized hypothesis generation focused on product conversion
- Smart variant generation targeting PDP-specific elements (price, ATC button, reviews)
- Advanced targeting capabilities for product categories and attributes

### Estimated Effort: 3-4 Sprint Weeks (16-22 development hours)

---

## Phase 1: Foundation & Infrastructure (Week 1)

### 1.1 Centralize Page Type System

**Problem**: Page type detection logic is duplicated across 5 different files, making maintenance difficult and prone to inconsistencies.

**Solution**: Create a centralized page type module that serves as the single source of truth.

#### Implementation Steps:

1. **Create `/src/shared/page-types.ts`** with:
   - Unified `PageType` enum including new types (collection, category, cart, checkout)
   - `PageTypeConfig` interface with CRO focus areas
   - Single `detectPageType()` function
   - Export constants for page-specific configurations

2. **Refactor existing files** to import from central module:
   - `/src/features/brand_analysis/prompts.ts`
   - `/src/features/hypotheses_generation/hypotheses-generation.ts`
   - `/src/features/variant_generation/variant-generation.ts`
   - `/src/services/variant-job-processor.ts`
   - `/src/shared/screenshot-config.ts`

3. **Fix collection misclassification**:
   - Separate `/collections/` URLs into their own `collection` type
   - Keep `/products/` URLs as true PDPs
   - Add proper detection for category pages

#### Code Structure:
```typescript
// /src/shared/page-types.ts
export enum PageType {
  HOME = 'home',
  PDP = 'pdp',
  COLLECTION = 'collection',
  CATEGORY = 'category',
  CART = 'cart',
  CHECKOUT = 'checkout',
  ABOUT = 'about',
  OTHER = 'other'
}

export interface PageTypeConfig {
  type: PageType;
  label: string;
  urlPatterns: RegExp[];
  croFocus: string[];
  elementPriorities: string[];
}

export const PAGE_CONFIGS: Record<PageType, PageTypeConfig> = {
  [PageType.PDP]: {
    type: PageType.PDP,
    label: 'Product Detail Page',
    urlPatterns: [
      /\/products?\//,
      /\/p\//,
      /\/item\//
    ],
    croFocus: [
      'Add-to-cart conversion',
      'Product imagery',
      'Price presentation',
      'Social proof',
      'Product information clarity',
      'Trust signals',
      'Urgency/scarcity'
    ],
    elementPriorities: [
      '.add-to-cart',
      '.product-price',
      '.product-title',
      '.product-reviews',
      '.product-images'
    ]
  },
  // ... other page types
};

export function detectPageType(url: string): PageType {
  // Implementation with proper pattern matching
}
```

### 1.2 Database & Schema Verification

**Current State**: Schema already supports PDP experiments through flexible JSON fields.

**Verification Tasks**:
1. Confirm `Screenshot.pageType` field properly stores new page types
2. Verify `Experiment.targetUrls` JSON field can handle complex patterns
3. Ensure `Experiment.targeting` JSON field supports product-specific rules
4. Test that variant storage handles PDP-specific selectors

**No schema changes required** - current structure is flexible enough.

---

## Phase 2: Brand Analysis Enhancement (Week 2)

### 2.1 Re-enable Multi-Page Analysis

**Problem**: PDP analysis is commented out in brand-analysis.ts, limiting brand insights to homepage only.

**Solution**: Restore and enhance multi-page brand analysis with PDP support.

#### Implementation Steps:

1. **Uncomment lines 37-63** in `/src/features/brand_analysis/brand-analysis.ts`
2. **Implement URL selection logic**:
   - Extract product URLs from homepage
   - Prioritize best-selling or featured products
   - Select 1-2 representative PDPs for analysis

3. **Create URL selector service** (`/src/features/brand_analysis/url-selector.ts`):
```typescript
export class UrlSelector {
  async selectUrls(candidates: string[]): Promise<SelectedUrls> {
    // Categorize URLs by type
    const categorized = this.categorizeUrls(candidates);

    // Select best representative URLs
    return {
      pdp: this.selectBestPDP(categorized.pdps),
      collection: this.selectBestCollection(categorized.collections),
      about: categorized.about[0]
    };
  }

  private selectBestPDP(pdpUrls: string[]): string | null {
    // Prioritize:
    // 1. Featured products (check for /featured/ in URL)
    // 2. Best sellers (check for /best-sellers/)
    // 3. First available product
  }
}
```

### 2.2 Enhance PDP-Specific Brand Analysis

**Goal**: Extract product-specific brand insights that inform better PDP experiments.

#### New Analysis Dimensions:

1. **Product Presentation Style**:
   - Image gallery format (carousel, grid, zoom)
   - Video usage
   - 360° views or AR features

2. **Pricing Strategy**:
   - Discount presentation
   - Compare-at pricing
   - Bundle offers
   - Payment plan visibility

3. **Social Proof Patterns**:
   - Review placement and format
   - User-generated content
   - Trust badges and certifications
   - "X customers viewing" indicators

4. **Information Architecture**:
   - Tab vs accordion vs linear layout
   - Specification presentation
   - Size/variant selection UI
   - Shipping information placement

#### Update Prompts:
```typescript
// /src/features/brand_analysis/prompts.ts
const PDP_ANALYSIS_PROMPT = `
Analyze this Product Detail Page for CRO opportunities:

PRODUCT PRESENTATION:
- Hero image quality and format
- Gallery navigation (thumbnails, arrows, dots)
- Image zoom functionality
- Video or 3D model usage

PURCHASE FLOW:
- Add-to-cart button design and placement
- Variant/option selection clarity
- Quantity selector visibility
- Price display and discount messaging

TRUST & SOCIAL PROOF:
- Review stars and count placement
- Customer testimonials format
- Trust badges (security, shipping, returns)
- Urgency indicators (stock, limited time)

INFORMATION HIERARCHY:
- Product title and description clarity
- Feature bullets vs paragraphs
- Technical specifications format
- Shipping and return policy visibility

MOBILE OPTIMIZATION:
- Sticky add-to-cart on mobile
- Image swipe functionality
- Collapsed/expanded content sections
`;
```

---

## Phase 3: PDP-Optimized Hypothesis Generation (Week 2-3)

### 3.1 Create PDP-Specific Hypothesis Templates

**Goal**: Generate hypotheses that target common PDP conversion issues.

#### Implementation:

1. **Create hypothesis template library** (`/src/features/hypotheses_generation/templates/pdp.ts`):

```typescript
export const PDP_HYPOTHESIS_TEMPLATES = [
  {
    category: 'URGENCY',
    templates: [
      {
        title: 'Add Stock Scarcity Indicator',
        problem: 'Users lack urgency to purchase',
        solution: 'Display "Only X left in stock" message',
        metric: 'Add-to-cart rate',
        expectedLift: { min: 0.08, max: 0.15 }
      },
      {
        title: 'Implement Countdown Timer for Sale',
        problem: 'Sale urgency not communicated',
        solution: 'Add countdown timer for limited-time offers',
        metric: 'Conversion rate',
        expectedLift: { min: 0.10, max: 0.20 }
      }
    ]
  },
  {
    category: 'SOCIAL_PROOF',
    templates: [
      {
        title: 'Highlight Review Count',
        problem: 'Review visibility too low',
        solution: 'Make review stars and count more prominent',
        metric: 'Add-to-cart rate',
        expectedLift: { min: 0.05, max: 0.12 }
      },
      {
        title: 'Add Recent Purchase Notifications',
        problem: 'No social validation of purchases',
        solution: 'Show "X people bought this today" message',
        metric: 'Conversion rate',
        expectedLift: { min: 0.06, max: 0.14 }
      }
    ]
  },
  {
    category: 'ADD_TO_CART',
    templates: [
      {
        title: 'Sticky Add-to-Cart Button',
        problem: 'ATC button not always visible',
        solution: 'Make ATC button sticky on scroll',
        metric: 'Add-to-cart rate',
        expectedLift: { min: 0.12, max: 0.25 }
      },
      {
        title: 'Enhance ATC Button Design',
        problem: 'ATC button not prominent enough',
        solution: 'Increase size, contrast, and add cart icon',
        metric: 'Add-to-cart rate',
        expectedLift: { min: 0.07, max: 0.15 }
      }
    ]
  }
];
```

2. **Update hypothesis generation prompt** to reference PDP templates when appropriate:

```typescript
// /src/features/hypotheses_generation/hypotheses-generation.ts
private buildHypothesesGenerationPrompt(
  reservedPayload?: any,
  userInput?: string,
  pageType?: PageType
): string {
  if (pageType === PageType.PDP) {
    return this.buildPDPHypothesesPrompt(reservedPayload, userInput);
  }
  // ... existing logic
}

private buildPDPHypothesesPrompt(
  reservedPayload?: any,
  userInput?: string
): string {
  return `
  You are a PDP optimization specialist. Generate hypotheses for product page conversion.

  Focus Areas (in priority order):
  1. Add-to-cart button optimization
  2. Price and discount presentation
  3. Product image and gallery enhancements
  4. Social proof and reviews
  5. Stock and urgency indicators
  6. Trust badges and guarantees
  7. Product information clarity
  8. Shipping and returns visibility

  Common PDP Issues to Consider:
  - ATC button below fold on mobile
  - Reviews hidden in tabs
  - No urgency or scarcity
  - Unclear shipping costs
  - Missing size/fit guides
  - No product comparisons
  - Weak value proposition

  ${userInput ? `User Direction: ${userInput}` : ''}

  Avoid modifying: ${JSON.stringify(reservedPayload?.reserved_targets || [])}
  `;
}
```

### 3.2 Implement Smart Hypothesis Scoring

**Goal**: Rank hypotheses based on PDP-specific impact potential.

```typescript
interface HypothesisScore {
  impact: number;      // Expected conversion lift
  confidence: number;  // Based on industry benchmarks
  ease: number;        // Implementation complexity
  total: number;       // Weighted score
}

function scorePDPHypothesis(hypothesis: Hypothesis): HypothesisScore {
  let impact = hypothesis.predicted_lift_range.max;
  let confidence = 0.5; // Base confidence
  let ease = 0.5;       // Base ease

  // Boost confidence for proven patterns
  if (hypothesis.title.includes('Add-to-Cart')) confidence += 0.2;
  if (hypothesis.title.includes('Review')) confidence += 0.15;
  if (hypothesis.title.includes('Urgency')) confidence += 0.15;

  // Adjust ease based on implementation
  if (hypothesis.description.includes('CSS only')) ease += 0.3;
  if (hypothesis.description.includes('new element')) ease -= 0.2;

  return {
    impact,
    confidence,
    ease,
    total: (impact * 0.5) + (confidence * 0.3) + (ease * 0.2)
  };
}
```

---

## Phase 4: PDP-Specific Variant Generation (Week 3)

### 4.1 Enhanced DOM Analysis for PDPs

**Goal**: Identify and prioritize PDP-specific elements for modification.

#### Implementation:

1. **Create PDP DOM analyzer** (`/src/features/variant_generation/pdp-dom-analyzer.ts`):

```typescript
export class PDPDomAnalyzer {
  async analyzePDPElements(html: string): Promise<PDPElements> {
    const $ = cheerio.load(html);

    return {
      addToCart: this.findAddToCartButton($),
      price: this.findPriceElement($),
      title: this.findProductTitle($),
      images: this.findProductImages($),
      reviews: this.findReviewSection($),
      description: this.findDescription($),
      variants: this.findVariantSelectors($),
      shipping: this.findShippingInfo($),
      trust: this.findTrustBadges($)
    };
  }

  private findAddToCartButton($: CheerioAPI): ElementInfo {
    // Smart detection with fallbacks
    const selectors = [
      'button[type="submit"][name="add"]',  // Shopify standard
      '.add-to-cart',
      '#AddToCart',
      'button:contains("Add to Cart")',
      'button:contains("Add to Bag")',
      '[data-add-to-cart]'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        return {
          selector,
          exists: true,
          position: this.getElementPosition(element),
          visibility: this.checkVisibility(element)
        };
      }
    }

    return { exists: false };
  }

  // Similar methods for other elements...
}
```

2. **Update injection point detection** to prioritize PDP elements:

```typescript
// /src/features/variant_generation/dom-analyzer.ts
async analyzeForHypothesisWithHtml(
  url: string,
  hypothesis: string,
  projectId: string,
  htmlContent: string | null,
  authentication?: any
): Promise<InjectionPoint[]> {
  const pageType = detectPageType(url);

  if (pageType === PageType.PDP) {
    return this.analyzePDPInjectionPoints(htmlContent, hypothesis);
  }

  // Existing logic...
}

private async analyzePDPInjectionPoints(
  html: string,
  hypothesis: string
): Promise<InjectionPoint[]> {
  const pdpAnalyzer = new PDPDomAnalyzer();
  const elements = await pdpAnalyzer.analyzePDPElements(html);
  const points: InjectionPoint[] = [];

  // Prioritize based on hypothesis focus
  if (hypothesis.toLowerCase().includes('cart')) {
    if (elements.addToCart.exists) {
      points.push({
        selector: elements.addToCart.selector,
        type: 'button',
        operation: 'replace',
        confidence: 0.9,
        description: 'Primary add-to-cart button'
      });
    }
  }

  if (hypothesis.toLowerCase().includes('price')) {
    if (elements.price.exists) {
      points.push({
        selector: elements.price.selector,
        type: 'price',
        operation: 'wrap',
        confidence: 0.85,
        description: 'Product price display'
      });
    }
  }

  // Add more element-specific logic...

  return points;
}
```

### 4.2 PDP-Specific Code Generation

**Goal**: Generate variant code optimized for common PDP modifications.

#### Code Generation Templates:

```typescript
// /src/features/variant_generation/templates/pdp-templates.ts

export const PDP_CODE_TEMPLATES = {
  STICKY_ATC: {
    description: 'Sticky add-to-cart bar',
    css: `
      .sticky-atc-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: white;
        box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
        padding: 15px;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
    `,
    js: `
      (function() {
        const originalButton = document.querySelector('{{selector}}');
        if (!originalButton) return;

        const stickyBar = document.createElement('div');
        stickyBar.className = 'sticky-atc-bar';
        stickyBar.innerHTML = \`
          <div class="product-info">
            <span class="product-title">\${document.querySelector('.product-title').textContent}</span>
            <span class="product-price">\${document.querySelector('.product-price').textContent}</span>
          </div>
          <button class="sticky-atc-button">Add to Cart</button>
        \`;

        // Show/hide based on scroll
        window.addEventListener('scroll', function() {
          const buttonRect = originalButton.getBoundingClientRect();
          if (buttonRect.top < -100) {
            stickyBar.style.display = 'flex';
          } else {
            stickyBar.style.display = 'none';
          }
        });

        document.body.appendChild(stickyBar);
      })();
    `
  },

  URGENCY_BANNER: {
    description: 'Stock urgency indicator',
    css: `
      .urgency-banner {
        background: #fff3cd;
        border: 1px solid #ffc107;
        padding: 10px;
        margin: 10px 0;
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .urgency-icon {
        color: #ff6b6b;
        font-size: 18px;
      }
    `,
    js: `
      (function() {
        const targetElement = document.querySelector('{{selector}}');
        if (!targetElement) return;

        const stockLevel = Math.floor(Math.random() * 5) + 2; // Simulate stock
        const urgencyBanner = document.createElement('div');
        urgencyBanner.className = 'urgency-banner';
        urgencyBanner.innerHTML = \`
          <span class="urgency-icon">⚡</span>
          <span>Only \${stockLevel} left in stock - order soon!</span>
        \`;

        targetElement.parentNode.insertBefore(urgencyBanner, targetElement);
      })();
    `
  },

  REVIEW_HIGHLIGHT: {
    description: 'Enhanced review visibility',
    css: `
      .review-highlight {
        background: #f0f9ff;
        border-left: 4px solid #3b82f6;
        padding: 15px;
        margin: 15px 0;
      }
      .review-stars {
        color: #fbbf24;
        font-size: 20px;
      }
    `,
    js: `
      (function() {
        const reviewSection = document.querySelector('{{selector}}');
        if (!reviewSection) return;

        const rating = reviewSection.querySelector('.rating');
        const count = reviewSection.querySelector('.review-count');

        if (rating && count) {
          const highlight = document.createElement('div');
          highlight.className = 'review-highlight';
          highlight.innerHTML = \`
            <div class="review-stars">★★★★★</div>
            <strong>\${rating.textContent} out of 5</strong>
            <span>(\${count.textContent} verified reviews)</span>
          \`;

          reviewSection.parentNode.insertBefore(highlight, reviewSection);
        }
      })();
    `
  }
};
```

---

## Phase 5: Advanced Targeting & Experiment Configuration (Week 4)

### 5.1 Product-Specific Targeting

**Goal**: Enable experiments to target specific product categories or attributes.

#### Implementation:

1. **Extend targeting schema**:

```typescript
// /src/types/experiment-targeting.ts
export interface PDPTargeting {
  // URL-based targeting
  urlPatterns?: string[];

  // Product attribute targeting
  products?: {
    ids?: string[];           // Specific product IDs
    skus?: string[];          // Specific SKUs
    categories?: string[];    // Product categories
    tags?: string[];          // Product tags
    collections?: string[];   // Shopify collections
    priceRange?: {
      min?: number;
      max?: number;
      currency?: string;
    };
    inventory?: {
      inStock?: boolean;
      lowStock?: boolean;     // Less than X units
      threshold?: number;
    };
  };

  // Page element targeting
  elements?: {
    hasReviews?: boolean;
    hasVideo?: boolean;
    hasMultipleImages?: boolean;
    hasVariants?: boolean;
  };

  // User targeting
  user?: {
    isReturning?: boolean;
    cartValue?: number;
    previousPurchaser?: boolean;
  };
}
```

2. **Implement targeting evaluation**:

```typescript
// /src/features/targeting/pdp-targeting.ts
export class PDPTargetingEvaluator {
  evaluate(
    targeting: PDPTargeting,
    context: PDPContext
  ): boolean {
    // URL pattern matching
    if (targeting.urlPatterns) {
      if (!this.matchesUrlPatterns(context.url, targeting.urlPatterns)) {
        return false;
      }
    }

    // Product attribute matching
    if (targeting.products) {
      if (!this.matchesProductCriteria(context.product, targeting.products)) {
        return false;
      }
    }

    // Element presence matching
    if (targeting.elements) {
      if (!this.matchesElementCriteria(context.pageElements, targeting.elements)) {
        return false;
      }
    }

    return true;
  }

  private matchesProductCriteria(
    product: Product,
    criteria: ProductCriteria
  ): boolean {
    if (criteria.categories?.length) {
      const hasCategory = criteria.categories.some(cat =>
        product.categories.includes(cat)
      );
      if (!hasCategory) return false;
    }

    if (criteria.priceRange) {
      if (criteria.priceRange.min && product.price < criteria.priceRange.min) {
        return false;
      }
      if (criteria.priceRange.max && product.price > criteria.priceRange.max) {
        return false;
      }
    }

    // More criteria checks...

    return true;
  }
}
```

### 5.2 Experiment Analytics & Tracking

**Goal**: Track PDP-specific metrics and events.

#### PDP Metrics:

```typescript
// /src/types/pdp-metrics.ts
export interface PDPMetrics {
  // Primary metrics
  addToCartRate: number;
  conversionRate: number;
  averageOrderValue: number;

  // Engagement metrics
  timeOnPage: number;
  scrollDepth: number;
  imageInteractions: number;

  // Product interaction metrics
  variantChanges: number;
  quantityChanges: number;
  reviewsViewed: boolean;

  // Micro-conversions
  addedToWishlist: boolean;
  sharedProduct: boolean;
  viewedSizeGuide: boolean;
  comparedProducts: boolean;
}
```

#### Event Tracking:

```typescript
// /src/services/analytics/pdp-analytics.ts
export class PDPAnalytics {
  trackEvent(event: PDPEvent): void {
    // Send to analytics platform
    analytics.track({
      event: event.type,
      properties: {
        experimentId: event.experimentId,
        variantId: event.variantId,
        productId: event.productId,
        category: event.category,
        value: event.value,
        ...event.metadata
      }
    });
  }

  trackAddToCart(context: PDPContext): void {
    this.trackEvent({
      type: 'product_added_to_cart',
      experimentId: context.experimentId,
      variantId: context.variantId,
      productId: context.product.id,
      category: context.product.category,
      value: context.product.price,
      metadata: {
        quantity: context.quantity,
        variant: context.selectedVariant
      }
    });
  }

  calculateMetrics(events: PDPEvent[]): PDPMetrics {
    // Calculate PDP-specific metrics from events
    const sessions = this.groupEventsBySessions(events);
    const withAddToCart = sessions.filter(s =>
      s.events.some(e => e.type === 'product_added_to_cart')
    );

    return {
      addToCartRate: withAddToCart.length / sessions.length,
      // ... calculate other metrics
    };
  }
}
```

---

## Phase 6: Testing & Quality Assurance (Ongoing)

### 6.1 Unit Tests

Create comprehensive test coverage for new PDP functionality:

```typescript
// /src/features/hypotheses_generation/__tests__/pdp-hypotheses.test.ts
describe('PDP Hypothesis Generation', () => {
  it('should generate PDP-specific hypotheses', async () => {
    const result = await generateHypotheses(
      'https://shop.example.com/products/test-product',
      'project-123'
    );

    expect(result.hypotheses[0].primary_outcome).toMatch(
      /Add.to.Cart|Conversion|Purchase/i
    );
  });

  it('should avoid reserved targets', async () => {
    const reserved = [{ selector: '.add-to-cart' }];
    const result = await generateHypotheses(url, projectId, null, reserved);

    const usesReserved = result.hypotheses.some(h =>
      h.target_selector === '.add-to-cart'
    );
    expect(usesReserved).toBe(false);
  });
});
```

### 6.2 Integration Tests

Test the complete PDP experimentation flow:

```typescript
// /src/__tests__/integration/pdp-flow.test.ts
describe('PDP Experimentation Flow', () => {
  it('should complete full PDP experiment creation', async () => {
    // 1. Brand analysis with PDP
    const brandAnalysis = await analyzeProject(projectId, shopDomain);
    expect(brandAnalysis.sources).toContainEqual(
      expect.objectContaining({ pageType: 'pdp' })
    );

    // 2. Generate PDP hypothesis
    const hypotheses = await generateHypotheses(pdpUrl, projectId);
    expect(hypotheses.hypotheses[0].title).toContain('Add to Cart');

    // 3. Generate variants
    const variants = await generateVariants(
      hypotheses.hypotheses[0],
      projectId
    );
    expect(variants.variants[0].target_selector).toBeTruthy();

    // 4. Create experiment
    const experiment = await createExperiment({
      name: 'PDP Test',
      hypothesis: hypotheses.hypotheses[0],
      variants: variants.variants,
      targetUrls: ['/products/*']
    });
    expect(experiment.status).toBe('DRAFT');
  });
});
```

### 6.3 E2E Tests

Test with real Shopify stores:

```typescript
// /src/__tests__/e2e/pdp-shopify.test.ts
describe('Shopify PDP Tests', () => {
  const testStores = [
    'https://example-store-1.myshopify.com',
    'https://example-store-2.myshopify.com'
  ];

  testStores.forEach(store => {
    it(`should analyze PDP for ${store}`, async () => {
      const pdpUrl = `${store}/products/test-product`;
      const screenshot = await crawlPage(pdpUrl);
      expect(screenshot).toBeTruthy();

      const pageType = detectPageType(pdpUrl);
      expect(pageType).toBe('pdp');

      const elements = await analyzePDPElements(screenshot.html);
      expect(elements.addToCart.exists).toBe(true);
      expect(elements.price.exists).toBe(true);
    });
  });
});
```

---

## Implementation Timeline

### Week 1: Foundation
- [ ] Day 1-2: Create centralized page type system
- [ ] Day 3: Refactor existing files to use central module
- [ ] Day 4: Fix collection/PDP classification
- [ ] Day 5: Testing and validation

### Week 2: Brand Analysis & Hypotheses
- [ ] Day 1-2: Re-enable multi-page brand analysis
- [ ] Day 3: Implement URL selection logic
- [ ] Day 4: Create PDP hypothesis templates
- [ ] Day 5: Update hypothesis generation prompts

### Week 3: Variant Generation
- [ ] Day 1-2: Create PDP DOM analyzer
- [ ] Day 3: Implement PDP-specific injection points
- [ ] Day 4: Create PDP code templates
- [ ] Day 5: Integration testing

### Week 4: Advanced Features & Polish
- [ ] Day 1-2: Implement product-specific targeting
- [ ] Day 3: Add PDP analytics tracking
- [ ] Day 4: Create comprehensive tests
- [ ] Day 5: Documentation and deployment

---

## Success Metrics

### Technical Metrics
- **Page Type Accuracy**: >95% correct classification
- **Hypothesis Relevance**: >80% of generated hypotheses are PDP-specific
- **Variant Success Rate**: >90% of variants apply correctly
- **Test Coverage**: >80% code coverage for new features

### Business Metrics
- **Experiment Creation Time**: <5 minutes for PDP experiments
- **Hypothesis Quality Score**: Average score >7/10 from users
- **Variant Application Rate**: >85% of variants work without modification
- **PDP Conversion Lift**: Average 10-15% lift in experiments

---

## Risk Mitigation

### Technical Risks

1. **DOM Structure Variations**
   - Risk: Different e-commerce platforms have varying HTML structures
   - Mitigation: Create flexible selectors with multiple fallbacks

2. **Performance Impact**
   - Risk: Complex PDP analysis slows down hypothesis generation
   - Mitigation: Implement caching and parallel processing

3. **False Positives**
   - Risk: Non-PDP pages classified as PDPs
   - Mitigation: Multiple validation checks and URL pattern testing

### Business Risks

1. **User Adoption**
   - Risk: Users don't understand PDP-specific features
   - Mitigation: Create tutorials and example experiments

2. **Quality Control**
   - Risk: Poor quality PDP experiments damage credibility
   - Mitigation: Implement review process and quality scoring

---

## Future Enhancements

### Phase 7: Advanced PDP Features (Future)

1. **Product Recommendation Testing**
   - A/B test recommendation algorithms
   - Test placement and design of recommended products

2. **Dynamic Pricing Experiments**
   - Test different pricing strategies
   - Bundle and discount optimization

3. **Personalization**
   - User segment-specific experiments
   - Behavioral targeting based on browsing history

4. **Multi-variate Testing**
   - Test multiple PDP elements simultaneously
   - Statistical significance calculations

5. **AI-Powered Insights**
   - Automatic hypothesis generation from analytics
   - Predictive modeling for experiment outcomes

---

## Conclusion

This comprehensive plan provides a roadmap for adding robust PDP experimentation support to the Omen platform. The phased approach ensures that foundational work is completed before advanced features, minimizing risk and maximizing value delivery.

The implementation focuses on:
1. **Accuracy**: Proper page type detection and classification
2. **Relevance**: PDP-specific hypotheses and variants
3. **Quality**: Well-tested, production-ready code
4. **Scalability**: Flexible architecture for future enhancements

With an estimated 3-4 weeks of development effort, the Omen platform will have industry-leading PDP experimentation capabilities that drive meaningful conversion improvements for e-commerce clients.