# Research Prompt: A/B Test Code Generation Pipeline Analysis

## Context
We have an A/B test variant code generation system that creates JavaScript code to modify any website's elements. The system must work universally across different websites, frameworks, and structures.

## Current Code Generation Pipeline

### Inputs to Code Generation
1. **Variant Specification** (from AI-generated variant ideas):
   - `variant_label`: Name of the variant (e.g., "Blue Button", "Larger Text")
   - `description`: What the variant does
   - `rationale`: Why it should improve conversions
   - `ux_approach`: Specific UX strategy
   - `visual_style`: Visual design approach
   - `placement_strategy`: Where/how to place the variant

2. **Hypothesis Context**:
   - `hypothesis.description`: The hypothesis being tested
   - `hypothesis.current_problem`: Current problem to solve
   - `hypothesis.predicted_lift_range`: Expected conversion improvement

3. **Visual Context**:
   - `screenshot`: Base64-encoded screenshot of the current page
   - `designSystem`: Brand colors (primary, secondary, text) - limited extraction

4. **DOM Context**:
   - `injectionPoints`: Pre-validated CSS selectors from DOM analysis (optional)
   - `htmlContent`: Full HTML of the page (cleaned and compressed)

5. **Brand Analysis** (heavily reduced):
   - Only 3 personality words + 1 primary color extracted from full brand analysis
   - Full brand analysis JSON is available but not used

### Current Prompt Structure
The system sends a **174-line prompt** to the LLM containing:
- Hypothesis and variant specifications
- Responsive design requirements (mobile 375px, tablet 768px, desktop 1920px)
- Text rendering considerations
- Brand colors (if available)
- Injection points (if available) or selector generation strategy
- Full HTML content embedded in prompt
- Code formatting requirements
- Example code templates
- Debugging patterns

### Constraints & Requirements
- **Universal Compatibility**: Must work on any website (Shopify, WordPress, custom sites)
- **No Framework Dependencies**: Cannot rely on specific frameworks or libraries
- **Client-Side Only**: JavaScript that runs in browser console
- **Responsive Design**: Must work across all device sizes
- **Non-Destructive**: Cannot break existing layout or hide content
- **Token Limits**: Code must be under 1000 characters
- **Immediate Execution**: No DOMContentLoaded listeners
- **Selector Reliability**: Must generate stable CSS selectors

### Current Output
Returns structured JSON with:
- `variant_label`: Variant name
- `description`: What it does
- `rationale`: Why it helps
- `javascript_code`: Executable JavaScript code
- `target_selector`: CSS selector for target element
- `execution_timing`: When to run (immediate/dom_ready)
- `implementation_instructions`: Brief explanation

## Research Questions

### 1. Prompt Engineering Analysis
- Is the current 174-line prompt optimal for code generation?
- What are the token efficiency issues with embedding full HTML?
- How can we structure prompts for better LLM performance?

### 2. Input Optimization
- What's the optimal amount of HTML context to provide?
- How can we better utilize the full brand analysis data?
- What's the best way to handle injection points vs. HTML analysis?

### 3. Universal Compatibility
- What are the most reliable CSS selector strategies for unknown websites?
- How can we improve selector generation for different website structures?
- What fallback mechanisms work best for selector failures?

### 4. Code Quality & Reliability
- How can we ensure generated code works across different browsers?
- What validation can we add to generated JavaScript?
- How can we improve responsive design implementation?

### 5. Performance & Efficiency
- What's the optimal balance between context and token usage?
- How can we reduce prompt size while maintaining quality?
- What caching strategies could improve performance?

### 6. Alternative Approaches
- Should we use multiple specialized prompts instead of one large prompt?
- Could we use code templates for common patterns?
- What role could static analysis play in improving generation?

## Research Goals
1. **Identify specific improvements** to the current pipeline
2. **Recommend prompt engineering strategies** for better code generation
3. **Suggest input optimization techniques** for universal compatibility
4. **Propose validation and quality assurance methods**
5. **Explore alternative architectural approaches**

## Success Criteria
The research should provide actionable recommendations that:
- Improve code generation quality and reliability
- Maintain universal website compatibility
- Optimize token usage and performance
- Enhance responsive design implementation
- Provide better error handling and fallbacks

Please analyze this pipeline and provide specific, implementable recommendations for improvement.
