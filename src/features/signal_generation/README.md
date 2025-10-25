# Shopify Signal Generation System

## Overview

This system provides intelligent, LLM-powered signal generation for Shopify A/B tests. It automatically selects the most relevant Shopify events to track based on experiment context, without requiring historical data.

## Key Features

### 🧠 **LLM Intelligence**
- Uses Google Gemini 2.5 Pro to intelligently choose Shopify events
- Analyzes experiment intent, page type, and variant changes
- Provides clear reasoning for signal selection
- No hardcoded patterns - completely adaptive

### 🎯 **Smart Event Selection**
- **Primary Events**: Main metrics that directly measure experiment success
- **Mechanism Events**: Additional events that explain WHY the variant works
- **Guardrail Events**: Events that prevent false wins (e.g., ensure purchases still happen)

### 🌐 **Completely Adaptive URL Detection**
- Detects ANY custom URL mentioned in intent or variant description
- Works with full URLs, paths, query parameters, and nested paths
- Automatically adds URL targeting for clickthrough rate experiments
- Examples: `/bespoke`, `/summer-sale-2024`, `/products/special-offers`, `/search?category=shoes`

## Available Shopify Events

The system can choose from these Shopify events:

1. **`page_viewed`** - Tracks every page view on the storefront
2. **`product_added_to_cart`** - Tracks when customers add products to cart  
3. **`checkout_completed`** - Tracks when customers complete a purchase

## How It Works

### 1. **Context Analysis**
The LLM analyzes:
- Experiment intent (what you're trying to achieve)
- Page type (homepage, product page, checkout, etc.)
- Variant changes (what you're modifying)
- Available Shopify events

### 2. **Intelligent Selection**
The LLM chooses:
- **Primary Event**: The main metric for success
- **Measurement Strategy**: How to measure the event
- **Mechanism Events**: Additional tracking for insights
- **Guardrail Events**: Protection against false wins

### 3. **URL Targeting**
For clickthrough experiments, the system automatically:
- Detects destination URLs from intent/description
- Adds `url:` targeting to `page_viewed` events
- Supports any URL pattern (custom paths, query params, etc.)

## Example Usage

```typescript
const input: SignalGenerationInput = {
  projectId: 'proj-123',
  pageType: PageType.HOME,
  url: 'https://shop.com',
  intent: 'Increase clickthrough rate to /collections page by adding a prominent CTA',
  dom: '<div class="hero">...</div>',
  variant: {
    changeType: 'addElement',
    selector: '.cta-button',
    description: 'Add prominent "Shop Now" button linking to /collections',
    rationale: 'Visible CTAs drive more traffic to collections'
  }
};

const generator = createShopifySignalGenerator(analyticsRepo);
const signals = await generator.generateSignals(input);
```

## Generated Signals Example

```typescript
{
  primary: {
    name: 'page_viewed',
    type: 'conversion',
    selector: 'url:/collections*'  // Automatically targets collections pages
  },
  mechanisms: [
    {
      name: 'product_added_to_cart',
      type: 'conversion'
    },
    {
      name: 'cta_button_click',
      type: 'conversion',
      selector: '.cta-button'  // Tracks actual button clicks
    }
  ],
  guardrails: [
    {
      name: 'checkout_completed',
      type: 'purchase'
    }
  ],
  rationale: 'The experiment\'s primary goal is to increase clicks from homepage to collections page...'
}
```

## Benefits

### ✅ **No Historical Data Required**
- Works immediately for new stores
- No need to wait for conversion data
- LLM infers the right signals from context

### ✅ **Completely Adaptive**
- Works with any custom URL structure
- No hardcoded patterns to maintain
- Adapts to any experiment type

### ✅ **Intelligent Reasoning**
- Clear explanations for every choice
- Considers business context and user journey
- Balances primary goals with mechanisms and guardrails

### ✅ **Production Ready**
- Handles LLM failures with smart fallbacks
- Type-safe with comprehensive validation
- Integrates seamlessly with existing analytics

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Experiment    │───▶│  LLM Analysis    │───▶│  Signal Output  │
│   Context       │    │  & Selection     │    │  with Targeting │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

The system is designed to be:
- **Lean**: No unnecessary complexity
- **Elegant**: Clean, readable code
- **Adaptive**: Works with any experiment type
- **Intelligent**: LLM-powered decision making
