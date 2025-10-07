# Selector Generation Flow - Detailed Explanation

## Overview
The selector generation pipeline has been enhanced to be **hypothesis-aware**, moving from generic selector detection to context-specific element targeting based on the A/B test hypothesis.

## Architecture

```
Hypothesis → DOM Analyzer → Selector Generator → Validation → Code Generator
                    ↓
            [Hypothesis-Aware]  [Multi-Strategy]
             (Primary Path)      (Fallback Path)
```

## Detailed Flow

### 1. **Hypothesis Input**
When a hypothesis is generated, it contains specific information about what element needs to be modified:
```
Example: "Replacing the static 'Engineered for Every Turn' text section with
customer photos will build trust and increase engagement."
```

### 2. **DOM Analyzer Processing** (`dom-analyzer.ts`)

#### Step 2.1: HTML Preparation
```typescript
// Clean HTML by removing scripts, styles, and comments
const $ = cheerio.load(pageSource);
$('script').remove();
$('style').remove();
$('noscript').remove();
const cleanedHTML = $.html();
```

#### Step 2.2: Primary Path - Hypothesis-Aware Selection
```typescript
const hypothesisSelector = createHypothesisAwareSelector(cleanedHTML);
const hypothesisCandidates = await hypothesisSelector.generateSelector(hypothesis);
```

### 3. **Hypothesis-Aware Selector Generation** (`hypothesis-aware-selector.ts`)

#### Step 3.1: AI-Powered Element Identification
The system sends the hypothesis to an AI model (Google Gemini) with a structured prompt:

```typescript
const elementIdentification = await generateObject({
  model: google(aiConfig.model),
  schema: selectorGenerationSchema,
  messages: [{
    role: 'user',
    content: buildIdentificationPrompt(hypothesis)
  }]
});
```

The AI returns:
- `primary_selector`: Most specific CSS selector for the target
- `element_identifier`: Natural language description of what we're looking for
- `search_strategy`: How to find this element (text_content, section_heading, structural, semantic)
- `alternative_selectors`: Fallback selectors in order of preference
- `confidence`: 0-1 confidence score
- `reasoning`: Why this selector was chosen

#### Step 3.2: Candidate Discovery
```typescript
private async findElementCandidates(aiResult): Promise<HypothesisSelector[]> {
  const candidates = [];
  const allSelectors = [aiResult.primary_selector, ...aiResult.alternative_selectors];

  for (const selector of allSelectors) {
    const elements = $(selector);

    if (elements.length === 0) {
      // Selector found nothing - skip
      continue;
    }

    if (elements.length === 1) {
      // Perfect match - create high-confidence candidate
      candidates.push(createCandidate(element, selector, reasoning));
    }

    if (elements.length > 1) {
      // Multiple matches - might be section-level targeting
      // Create candidate with reduced confidence
      candidate.confidence *= 0.5;
      candidates.push(candidate);
    }
  }

  return candidates;
}
```

#### Step 3.3: Fallback Text-Based Search
If no candidates are found via selectors, the system searches by text content:
```typescript
if (candidates.length === 0 && aiResult.element_identifier) {
  const textBasedCandidates = this.findByText(aiResult.element_identifier);
  candidates.push(...textBasedCandidates);
}
```

#### Step 3.4: Selector Generation Strategies
For each found element, multiple selector strategies are generated:

1. **Data Attributes** (Most Reliable)
   ```css
   [data-testid="resource-list-grid"]
   ```

2. **ARIA/Role Attributes** (Very Reliable)
   ```css
   section[role="region"]
   button[aria-label="Shop all"]
   ```

3. **Stable IDs** (Reliable if not generated)
   ```css
   #engineered-section
   ```

4. **Semantic Classes** (Moderately Reliable)
   ```css
   section.feature-section
   .hero__content-wrapper
   ```

5. **Path-Based** (Less Reliable)
   ```css
   main > section:nth-child(3) > div.container
   ```

6. **Text Content** (Least Reliable)
   ```css
   h2:contains("Engineered for Every Turn")
   ```

### 4. **Validation & Ranking**

#### Validation Checks
Each candidate selector is validated for:
- **Exists**: Does the selector match any elements?
- **Unique**: Does it match exactly one element?
- **Stable**: Does it avoid generated IDs/classes?

```typescript
validation: {
  exists: $(selector).length > 0,
  unique: $(selector).length === 1,
  stable: !hasGeneratedPatterns(selector)
}
```

#### Scoring System
Candidates are scored based on:
```typescript
let score = 0;
if (candidate.validation.exists) score += 3;
if (candidate.validation.unique) score += 3;
if (candidate.validation.stable) score += 2;
// Plus relevance to hypothesis text
score += textRelevanceScore * 1;
// Plus AI confidence
score += candidate.confidence * 5;
```

### 5. **Injection Point Creation**
The validated candidates are converted to injection points with rich context:

```typescript
{
  selector: "section.feature-section",
  confidence: 0.85,
  type: "container",
  context: {
    elementText: "Engineered for Every Turn...",
    elementType: "section",
    parentContext: "main",
    htmlSnippet: "<section class='feature-section'>..."
  },
  alternativeSelectors: [
    "#engineered-section",
    "main > section:nth-child(3)",
    ".container:has(h2:contains('Engineered'))"
  ],
  reasoning: "Section containing the exact heading text mentioned in hypothesis",
  selectorReliability: {
    works: true,
    confidence: 0.85,
    reason: "Hypothesis-aware: stable selector"
  }
}
```

### 6. **Fallback Path - Multi-Strategy Detection**
If hypothesis-aware selection fails, the system falls back to the original multi-strategy detector which tries 10 different strategies:
- Role-based detection
- Text-based detection
- Data attributes
- Label-based detection
- Placeholder-based detection
- Title-based detection
- Alt text detection
- Semantic class detection
- Stable ID detection
- Position-based detection

### 7. **Code Generator Integration** (`code-generator.ts`)
The code generator receives enhanced context for each selector:

```javascript
PRIMARY SELECTOR:
- Selector: section.feature-section
- Type: container
- Confidence: 0.85
- Current text: "Engineered for Every Turn..."
- Validation: VALID - Hypothesis-aware: stable selector
- Alternative selectors: #engineered-section, main > section:nth-child(3)
- HTML Context:
  Element HTML: <section class="feature-section">...
  Parent: <main class="main-content">
  Siblings: Previous: <section>, Next: <section>
  Position: 3 of 5 siblings
```

## Key Improvements Over Previous System

### Before (Generic Detection)
```
Hypothesis → Extract Keywords → Search for ANY element with keywords → Generic selectors
Result: [data-testid="resource-list-grid"] (generic container)
```

### After (Hypothesis-Aware)
```
Hypothesis → Understand Context → Find SPECIFIC element mentioned → Precise selectors
Result: section:has(h2:contains("Engineered for Every Turn")) (exact section)
```

## Example: "Engineered for Every Turn" Section

### Previous Approach Output:
```javascript
// Generic selectors without context
[
  "[data-testid='resource-list-grid']",  // Wrong section
  "[data-testid='group-block']",          // Too generic
  "[data-testid='footer-utilities']"      // Completely unrelated
]
```

### New Approach Output:
```javascript
// Hypothesis-specific selectors with context
[
  {
    selector: "section:has(h2:contains('Engineered for Every Turn'))",
    confidence: 0.9,
    reasoning: "Section containing the exact heading mentioned",
    alternatives: [
      ".feature-section",
      "#ResourceListtemplateresourcelist",
      "section.shopify-section:nth-of-type(4)"
    ]
  }
]
```

## Benefits

1. **Precision**: Selectors target the exact elements mentioned in hypotheses
2. **Context**: Rich metadata helps code generator make better decisions
3. **Reliability**: Multiple validation checks ensure selectors work
4. **Fallbacks**: Alternative selectors provide resilience
5. **Intelligence**: AI understands the semantic meaning of the hypothesis

## Configuration

The system uses Google Gemini 2.5 Pro for AI-powered selection with these key parameters:
- Model: `gemini-2.5-pro`
- Max HTML snippet: 30,000 chars
- Max selectors to try: 10
- Confidence range: 0-1

## Error Handling

- Invalid selectors are caught and skipped
- Multi-element matches are handled with reduced confidence
- Text-based fallback for when selectors fail
- Graceful degradation to multi-strategy detection
- Infinite loop prevention with selector limits

## Future Enhancements

1. **Learning System**: Track which selectors work best over time
2. **Visual Validation**: Use screenshots to verify selector accuracy
3. **Dynamic Refinement**: Iteratively improve selectors based on feedback
4. **Cross-Page Stability**: Test selectors across multiple pages
5. **Performance Optimization**: Cache successful selector patterns