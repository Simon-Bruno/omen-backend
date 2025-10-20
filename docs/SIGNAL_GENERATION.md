# Signal Generation System

## Overview

The **Signal Generation System** automatically proposes, validates, and persists experiment goals (called "signals") for A/B tests. It ensures experiments have valid, measurable success criteria before they go live.

## Core Concepts

### What is a Signal?

A **signal** is a measurable user action that indicates experiment success or failure. Examples:
- Click on "Add to Cart" button
- Navigate from PDP to Cart
- Complete a purchase

### Signal Roles

Every signal has one of three roles:

| Role | Purpose | Requirements | Example |
|------|---------|--------------|---------|
| **Primary** | Main success metric shared between control & all variants | Must exist in control DOM | `add_to_cart_click` |
| **Mechanism** | Variant-specific behavior tracking | Can be variant-only | `scroll_to_reviews` |
| **Guardrail** | Ensure no negative side effects | Typically commerce events | `purchase_completed` |

### Signal Types

- **`conversion`**: User interaction (click, navigation)
  - Requires: `selector` and `eventType`
- **`purchase`**: E-commerce transaction
  - Requires: `purchaseTrackingActive` to be true
- **`custom`**: JavaScript-based tracking
  - Requires: `customJs` code

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Signal Generation Flow                    │
└─────────────────────────────────────────────────────────────┘

1. LLM Generation (generator.ts)
   ↓
   Gemini 2.0 Flash proposes signals based on:
   - Page type (PDP, Collection, Cart, etc.)
   - URL and intent
   - Control DOM structure
   - Variant description
   - Signal catalog constraints

2. Validation (validator.ts)
   ↓
   Validates against:
   - Signal catalog (allowed signals per page type)
   - Control DOM (selectors must exist)
   - Business rules (max 2 mechanisms, purchase tracking, etc.)

3. Persistence (orchestrator.ts → dal/signal.ts)
   ↓
   Saves to database with all metadata

4. Publishing (experiment-publisher.ts)
   ↓
   Pre-flight checks before deploying to Cloudflare
```

## Key Files

### Core Logic
- **`orchestrator.ts`** - Main entry point, coordinates all signal operations
- **`generator.ts`** - LLM-based signal proposal using Gemini
- **`validator.ts`** - Validates signals against catalog and DOM
- **`catalog.ts`** - Canonical list of allowed signals per page type

### Supporting Files
- **`types.ts`** - TypeScript interfaces and Zod schemas
- **`src/infra/dal/signal.ts`** - Database operations (CRUD)
- **`src/shared/utils/dom.ts`** - DOM selector validation using Cheerio

## How It Works

### 1. Signal Generation

**Entry Point:** `orchestrator.tryAutoGenerateForAllVariants()`

```typescript
// Intent is built from hypothesis: description + primary_outcome
const signalIntent = `${hypothesis.description}. Primary goal: ${hypothesis.primary_outcome}`;

const result = await signalService.tryAutoGenerateForAllVariants(
  experimentId,
  url,           // e.g., "https://shop.com/products/shoes"
  signalIntent,  // e.g., "Larger CTA button. Primary goal: Conversion rate"
  dom,           // Control page HTML
  variants,      // Array of variant definitions
  purchaseTrackingActive
);
```

**Hypothesis → Signal Connection:**

The system links hypothesis to signals through the `primary_outcome`:

| Hypothesis Field | Signal Field | Example |
|-----------------|--------------|---------|
| `primary_outcome` | `name` (from catalog) | "Conversion rate" → `add_to_cart_click` |
| `description` | `intent` context | "Larger CTA button" |
| Both combined | LLM prompt | "Larger CTA button. Primary goal: Conversion rate" |

**What it does:**
1. Detects page type from URL (PDP, Collection, Cart, etc.)
2. Sends prompt to Gemini with:
   - Page context (URL, type, intent)
   - Control DOM structure
   - Variant description
   - Signal catalog (constraints)
3. LLM returns structured proposal with:
   - 1 primary signal
   - 0-2 mechanism signals
   - 0+ guardrail signals

### 2. Signal Validation

**Key Principle:** We only validate against **control DOM** because variants are JavaScript code that runs on the client. We can't predict the final DOM structure.

**Validation Checks:**
- ✅ Signal name exists in catalog for this page type
- ✅ Signal role is allowed for this signal type
- ✅ Required fields present (selector for conversion, customJs for custom, etc.)
- ✅ Selector exists in control DOM (using Cheerio)
- ✅ Purchase tracking active if using purchase signals
- ✅ Maximum 2 mechanism signals
- ⚠️ Warnings for brittle selectors (nth-child, etc.)

### 3. Signal Persistence

**Database Schema** (`experiment_goals` table):

```typescript
{
  id: string;
  experimentId: string;
  name: string;              // e.g., "add_to_cart_click"
  type: string;              // "conversion" | "purchase" | "custom"
  role: string;              // "primary" | "mechanism" | "guardrail"
  selector?: string;         // CSS selector (for conversion)
  eventType?: string;        // "click" | "submit" | etc.
  targetUrls?: string[];     // URL patterns for navigation tracking
  dataLayerEvent?: string;   // Analytics event name
  customJs?: string;         // JavaScript code (for custom)
  valueSelector?: string;    // Selector for numeric value
  currency?: string;         // Currency code
  existsInControl: boolean;  // Validated against control DOM
  existsInVariant: boolean;  // Assumed true (JS runs on client)
  createdAt: DateTime;
}
```

### 4. Publishing Pre-flight

Before publishing an experiment to Cloudflare, the system validates:

```typescript
const validation = await signalService.validateForPublish(experimentId);

// Checks:
// - At least 1 signal exists
// - Exactly 1 primary signal
// - Primary signal exists in both control and variant
```

## Signal Catalog

The **Signal Catalog** (`catalog.ts`) defines allowed signals per page type.

### Example: PDP Page Type

```typescript
[PageType.PDP]: {
  primaryCandidates: [
    {
      name: 'add_to_cart_click',
      type: 'conversion',
      description: 'User clicked add to cart on PDP',
      defaultRole: 'primary',
      allowedRoles: ['primary'],
      requiresSelector: true,
      requiresPurchaseTracking: false,
    },
    {
      name: 'pdp_to_cart_navigation',
      type: 'conversion',
      description: 'User navigated from PDP to cart',
      defaultRole: 'primary',
      allowedRoles: ['primary'],
      requiresTargetUrls: true,
      requiresPurchaseTracking: false,
    }
  ],
  mechanisms: [
    {
      name: 'product_image_click',
      type: 'conversion',
      description: 'User clicked product image',
      defaultRole: 'mechanism',
      allowedRoles: ['mechanism'],
      requiresSelector: true,
    }
  ],
  guardrails: [
    {
      name: 'purchase_completed',
      type: 'purchase',
      description: 'User completed a purchase',
      defaultRole: 'guardrail',
      allowedRoles: ['guardrail'],
      requiresPurchaseTracking: true,
    }
  ]
}
```

**Why a catalog?**
- Prevents LLM hallucinations
- Ensures consistent naming
- Enforces business rules per page type
- Makes signals discoverable

## Integration Points

### 1. Agent Tool (create-experiment.ts)

When the AI agent creates an experiment, signals are auto-generated:

```typescript
const result = await signalService.tryAutoGenerateForAllVariants(
  experiment.id,
  screenshot.url,
  hypothesis.description,
  screenshot.htmlContent,
  variantsForValidation,
  true
);

if (result.success) {
  // Experiment can be published
} else {
  // Signal generation failed, stay in DRAFT
}
```

### 2. Experiment Publisher

Before publishing, validates signals:

```typescript
const validation = await signalService.validateForPublish(experimentId);

if (!validation.valid) {
  return { 
    success: false, 
    error: validation.errors.join('; ') 
  };
}
```

### 3. Cloudflare Publishing

Signals are transformed to `PublishedGoal` format:

```typescript
{
  name: 'add_to_cart_click',
  type: 'conversion',
  role: 'primary',
  selector: '.btn-add-to-cart',
  eventType: 'click',
  targetUrls: ['/products/*'],
  dataLayerEvent: 'add_to_cart',
}
```

## Testing

Run the signal generation tests:

```bash
npm run test:signals
```

**What it tests:**
- ✅ DOM selector checking
- ✅ Primary signal validation
- ✅ Invalid signal rejection
- ✅ Mechanism signals
- ✅ Purchase tracking requirements

## Common Scenarios

### Scenario 1: PDP Add-to-Cart Test

```typescript
// Input
url: "https://shop.com/products/shoes"
intent: "Increase add-to-cart clicks with larger button"
pageType: PDP
dom: "<button class='add-to-cart'>Add to Cart</button>"

// Generated Signals
primary: {
  name: "add_to_cart_click",
  type: "conversion",
  role: "primary",
  selector: ".add-to-cart",
  eventType: "click",
  existsInControl: true,
  existsInVariant: true
}
```

### Scenario 2: Collection Page with Scroll Tracking

```typescript
// Generated Signals
primary: {
  name: "collection_to_pdp_navigation",
  type: "conversion",
  role: "primary",
  targetUrls: ["/products/*"]
}

mechanisms: [{
  name: "scroll_to_bottom",
  type: "custom",
  role: "mechanism",
  customJs: "window.scrollY > document.body.scrollHeight * 0.8",
  existsInControl: false,  // Variant-only behavior
  existsInVariant: true
}]
```

### Scenario 3: Checkout with Guardrails

```typescript
// Generated Signals
primary: {
  name: "checkout_complete_click",
  type: "conversion",
  role: "primary",
  selector: "#complete-order"
}

guardrails: [{
  name: "purchase_completed",
  type: "purchase",
  role: "guardrail",
  existsInControl: true,
  existsInVariant: true
}]
```

## Design Decisions

### Why Only Validate Control DOM?

**Problem:** Variants are JavaScript code that runs on the client. We can't predict what the DOM will look like after JS executes.

**Solution:** Only validate selectors exist in control DOM. Trust the LLM and variant code not to break signals.

**Result:** Simple, fast validation without trying to "render" variant DOMs server-side.

### Why a Signal Catalog?

**Problem:** LLMs can hallucinate signal names, making analytics inconsistent.

**Solution:** Define canonical signals per page type. LLM must choose from catalog.

**Result:** Consistent naming, predictable behavior, no hallucinations.

### Why 3 Roles (Primary/Mechanism/Guardrail)?

**Problem:** Need to distinguish between:
- What we're trying to improve (primary)
- How the variant works (mechanism)
- What we can't break (guardrail)

**Solution:** Explicit roles with different validation rules.

**Result:** Clear experiment intent, better analytics segmentation.

## FAQ

**Q: Can I have multiple primary signals?**  
A: No. Experiments should have exactly 1 primary signal for clear success criteria.

**Q: What if my variant breaks the primary signal selector?**  
A: The experiment will fail to track correctly. This is a variant bug, not a signal issue.

**Q: Can mechanism signals exist only in variants?**  
A: Yes! That's their purpose - tracking variant-specific behavior.

**Q: How do I add a new signal to the catalog?**  
A: Edit `src/features/signal_generation/catalog.ts` and add it to the appropriate page type.

**Q: How are hypothesis primary_outcome and signals connected?**  
A: The hypothesis `primary_outcome` guides signal selection. The LLM is instructed to choose a primary signal from the catalog that aligns with the stated primary outcome.

**Q: Why aren't signals generated immediately after hypothesis generation?**  
A: Signals need both variants AND an experiment to exist first. They're generated during experiment creation because they need an `experimentId` to persist to the database.

**Q: Can I manually override auto-generated signals?**  
A: Yes, via the DAL (`SignalDAL.createSignal()`) but auto-generation is recommended.

## Troubleshooting

### "No valid primary signal found"

**Cause:** LLM proposed a signal that doesn't exist in the catalog or selector not found in DOM.

**Fix:** Check that:
1. Signal name exists in catalog for this page type
2. Selector exists in control DOM
3. Page type detection is correct

### "Cannot publish without signals"

**Cause:** Experiment has no signals in database.

**Fix:** Ensure `tryAutoGenerateForAllVariants` succeeded during experiment creation.

### "Primary signal must exist in both control and variant"

**Cause:** `existsInControl` or `existsInVariant` is false.

**Fix:** This shouldn't happen with auto-generation. Check if signal was manually created with wrong flags.

## Future Enhancements

- [ ] Add signal preview in agent UI
- [ ] Support A/A tests (control-only signals)
- [ ] Signal importance weighting
- [ ] Custom signal validation rules per project
- [ ] Signal performance analytics (which signals convert best)

## Related Documentation

- [Page Type Detection](../src/shared/page-types.ts)
- [Experiment Publishing](./EXPERIMENT_PUBLISHING.md)
- [Agent Tools](./AGENT_TOOLS.md)

