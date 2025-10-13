# Testing the Variant Generation Pipeline

This document explains how to test the hypothesis → variant → JavaScript code generation pipeline without using the agent.

## Quick Start

```bash
# Test with any available project from database
npm run test:variants

# Test with a specific project
TEST_PROJECT_ID=your-project-id npm run test:variants

# Simple test (just AI generation, no database)
npm run test:variants:simple
```

## Test Files

### 1. `test-variant-pipeline.ts`
Full end-to-end test using real projects from database:
- Automatically lists available projects
- Uses real brand analysis from database
- Generates hypothesis from project URL
- Generates variant ideas
- Generates JavaScript code
- Validates code and saves results

### 2. `test-variant-simple.ts`
Lightweight test focusing on AI generation:
- No database required
- Uses hardcoded hypothesis
- Tests variant and code generation
- Quick validation

## How It Works

### Using Real Projects

The pipeline test now:
1. **Lists all projects** from your database
2. **Auto-selects** the most recent project (or uses TEST_PROJECT_ID)
3. **Checks for brand analysis** (warns if missing)
4. **Generates hypothesis** from the project's homepage
5. **Creates variants** using the real brand analysis
6. **Validates JavaScript** and saves results

### Project Selection

```bash
# Will list all projects and auto-select the most recent
npm run test:variants

# Use a specific project
TEST_PROJECT_ID=clxxxxx npm run test:variants
```

Output example:
```
📋 Fetching available projects from database...

Available projects:
────────────────────────────────────────────────────────────
1. shop.omen.so
   ID: cl123abc456
   Created: 1/15/2024

2. another-store.myshopify.com
   ID: cl789def012
   Created: 1/10/2024

➡️  Auto-selecting most recent project: shop.omen.so
```

### In `test-variant-simple.ts`:
```typescript
const TEST_HYPOTHESIS: Hypothesis = {
    title: "Your hypothesis title",
    description: "What you want to test",
    // ... modify as needed
};
```

## Demo Mode

When `DEMO_CONDITION` is `true` (in `src/shared/demo-config.ts`):
- Targets the "Shop all" button specifically
- Uses button-focused prompts
- Generates button-specific variants

When `DEMO_CONDITION` is `false`:
- Uses AI to detect relevant elements
- General variant generation
- More flexible targeting

## Output

### Pipeline Test Output
- Console output with detailed progress
- JSON file saved to `./test-output/variant-test-[timestamp].json`
- Contains hypothesis, variants, and JavaScript code

### Simple Test Output
- Console output only
- Shows variant ideas and JavaScript preview
- Validates syntax

## Example Output

```
🚀 Starting Variant Generation Pipeline Test

📦 Step 1: Initializing services...
✅ Services initialized

🎯 Step 2: Setting up hypothesis...
📝 Using custom hypothesis: Enhance Shop All Button with Urgency

🎨 Step 3: Generating variants...
  Demo Mode: ENABLED
✅ Generated 3 variants

📊 Step 4: Results

🔹 Variant 1: Urgency Timer Button
  Description: Adds a countdown timer to create urgency
  JavaScript Code Preview:
    (function() {
      'use strict';
      ...
    })();

✨ Pipeline test completed successfully!
```

## Troubleshooting

### API Key Issues
Make sure your `.env` file contains:
```
GOOGLE_GEMINI_API_KEY=your-key-here
```

### Module Import Errors
Run:
```bash
npm install
npm run db:generate
```

### Demo Mode Not Working
Check `src/shared/demo-config.ts`:
```typescript
export const DEMO_CONDITION = true;  // Should be true for demo
```

## What Gets Tested

1. **Hypothesis Processing**: Validates hypothesis structure and data
2. **Variant Generation**: Tests AI prompt generation and response parsing
3. **JavaScript Generation**: Tests code generation for each variant
4. **Code Validation**: Basic syntax checking of generated JavaScript
5. **Selector Validation**: Checks if selectors are valid
6. **Demo Mode**: Tests both demo and normal modes

## Extending the Tests

To add more test cases, modify the hypothesis in either test file:

```typescript
const MY_HYPOTHESIS: Hypothesis = {
    title: "Test Something New",
    description: "Your test description",
    current_problem: "The problem to solve",
    predicted_lift_range: { min: 10, max: 30 },
    // ... etc
};
```

Or test different URLs by changing:
```typescript
TEST_CONFIG.url = 'https://your-test-site.com';
```