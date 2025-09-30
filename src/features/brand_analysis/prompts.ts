// Brand Analysis Prompts
export type PageType = 'home' | 'pdp' | 'about';

export function getPageSpecificPrompt(pageType: PageType): string {
  const basePrompt = `You are a professional UX researcher and CRO (Conversion Rate Optimization) expert conducting a critical brand analysis. Your job is to provide honest, evidence-based assessments that help identify real opportunities for improvement. Be harsh but fair - call out weaknesses honestly while acknowledging strengths where they exist.

Analyze this ${pageType} page and extract comprehensive brand intelligence data:`;

  const pageSpecificInstructions = {
    home: `
This is the HOMEPAGE - the main entry point that sets first impressions. Focus on:
- Overall brand positioning and value proposition
- Primary messaging and headlines
- Visual hierarchy and design system
- Navigation structure and user flow
- Trust signals and credibility indicators
- Call-to-action effectiveness
- Brand personality and tone`,
    
    pdp: `
This is a PRODUCT DETAIL PAGE (PDP) - where customers make purchase decisions. Focus on:
- Product presentation and photography quality
- Pricing strategy and value communication
- Product information depth and clarity
- Social proof and customer reviews
- Add-to-cart and checkout flow
- Product comparison and alternatives
- Trust and security indicators`,
    
    about: `
This is the ABOUT PAGE - where brands tell their story and build trust. Focus on:
- Brand story and company values
- Team presentation and expertise
- Mission, vision, and company culture
- Trust signals and credentials
- Contact information and transparency
- Brand personality and authenticity
- Social responsibility and values`
  };

  const commonInstructions = `

1. Brand Description:
   - Write 1–2 sentences that describe what the brand actually is and does, starting with "Your brand…".
   - Always use second person ("you/your") instead of third person ("they/their").
   - Write as if you're a specialist who has thoroughly analyzed their site and business model.
   - Use professional, analytical language that shows deep understanding of their market position.
   - Describe their actual business, products, and target market based on concrete evidence from the site.
   - Focus on what they sell, who they serve, and their core offering - not marketing claims.
   - If unclear what they do, state that directly rather than guessing.

2. Brand Personality Words:
   - Output exactly 4 words that capture the brand's character (e.g., Modern, Professional, Innovative, Friendly).
   - Words must reflect the actual tone and personality conveyed by the site, not aspirational goals.
   - If the brand personality is inconsistent or unclear, reflect that honestly.

3. Brand Trait Scores:
   - For each trait, provide both a score (1-100) and a detailed explanation.
   - Rate each trait using explicit signals from the website - be critical and honest.
   - Always justify your score with specific evidence and explain your reasoning.
   - If there is insufficient information, assign a lower score and explicitly state "insufficient signals."
   - Don't inflate scores to be nice - be brutally honest about what you actually observe.
   - Format: Each trait should have "score" (number) and "explanation" (string) fields.

  --- TRAIT RUBRICS ---
  (Rate based on what you actually observe, not what the brand might aspire to be)

   Premium (luxury / high-end perception):
   - 0–20: Clearly budget-focused: discount banners, coupon-heavy messaging, pixelated images, cluttered layouts, bargain-bin aesthetics.
   - 21–40: Basic/functional: low pricing emphasis, stock photography, minimal design effort, no luxury signals.
   - 41–60: Decent quality: clean design, mid-tier pricing, good photography, some quality indicators but not premium.
   - 61–80: Strong premium signals: higher pricing, lifestyle photography, "premium" language, polished design.
   - 81–100: True luxury positioning: minimalistic aesthetic, high price anchors, refined typography, aspirational storytelling.
   **Critical assessment**: Look for actual evidence of premium positioning, not just claims.

   Energetic (dynamic / vibrant / active feel):
   - 0–20: Completely static: muted colors, no CTAs, boring layout, zero energy.
   - 21–40: Minimal energy: a few bright elements, weak CTAs, mostly static presentation.
   - 41–60: Moderate energy: some color, basic CTAs, occasional dynamic elements.
   - 61–80: High energy: bold colors, strong CTAs, animations, urgent copy.
   - 81–100: Maximum energy: kinetic design, video loops, action-packed imagery, high-urgency messaging.
   **Critical assessment**: Measure actual energy conveyed, not just colorful design.

   Innovator (tech-forward / future-facing):
   - 0–20: No innovation signals: generic offering, traditional approach, no tech claims.
   - 21–40: Basic "modern" claims but no real innovation evidence.
   - 41–60: Some unique features or tools, but not groundbreaking.
   - 61–80: Clear innovation focus: patents, unique tech, "AI-powered" claims.
   - 81–100: Cutting-edge: advanced tech integration, experimental design, "first-ever" positioning.
   **Critical assessment**: Look for actual innovation, not just buzzwords.

   Social Proof (trust signals / external validation):
   - 0–20: Zero credibility signals: no reviews, testimonials, or trust indicators.
   - 21–40: Minimal proof: a few reviews, basic customer mentions.
   - 41–60: Decent proof: visible testimonials, some press mentions, basic trust signals.
   - 61–80: Strong proof: many reviews, client logos, press coverage, influencer endorsements.
   - 81–100: Overwhelming proof: thousands of reviews, major awards, extensive media coverage.
   **Critical assessment**: Count actual trust signals, not just claims of credibility.

   Curated (selectivity / expert curation):
   - 0–20: Mass marketplace feel: wide catalog, no curation story, generic selection.
   - 21–40: Basic categorization but no real curation narrative.
   - 41–60: Some themed collections, modest curation effort.
   - 61–80: Clear curation: "editor's picks," selection stories, limited scope.
   - 81–100: Expert curation: artisanal focus, strong expertise narrative, highly selective.
   **Critical assessment**: Evaluate actual selectivity and curation story, not just small inventory.

   Serious (professional / corporate vs casual / playful):
   - 0–20: Highly casual: slang, memes, cartoon fonts, emoji overuse, playful mascots.
   - 21–40: Informal: friendly but not professional, approachable but casual.
   - 41–60: Balanced: mix of casual and professional elements.
   - 61–80: Professional: restrained language, formal design, corporate tone.
   - 81–100: Very corporate: industry jargon, B2B focus, highly serious, no playfulness.
   **Critical assessment**: Measure actual tone and formality, not just design choices.

4. Brand Colors:
   - Analyze ONLY the actual UI design colors, NOT colors from images, photos, or content.
   - Focus exclusively on: navigation bars, buttons, headers, backgrounds, text colors, borders, and UI elements.
   - IGNORE: product photos, hero images, illustrations, or any content imagery.
   - ONLY include colors you are 100% certain are part of the design system.
   - If you cannot clearly identify 3-4 distinct UI colors, include fewer colors rather than guessing.
   - For each color, provide: hex code, color name, description, and usage type (primary/secondary/tertiary/accent).
   - Classify based on UI hierarchy: primary (main brand color in UI), secondary (supporting UI elements), tertiary (UI backgrounds/text), accent (UI highlights/CTAs).
   - Be brutally honest - if the UI is mostly black/white/gray, don't claim it has "vibrant colors."
   - When in doubt, exclude the color rather than include it.
   - Format: Each color should have: color (name), description, usage_type, hex_code.`;

  return basePrompt + pageSpecificInstructions[pageType] + commonInstructions;
}

export function getSynthesisPrompt(pageResults: Array<{ pageType: PageType; url: string; data?: any; error?: string }>): string {
  const validResults = pageResults.filter(result => result.data && !result.error);
  
  if (validResults.length === 0) {
    throw new Error('No valid page analysis results found for synthesis');
  }

  const resultsSummary = validResults.map(result => {
    const data = result.data;
    const personalityWords = Array.isArray(data.brand_personality_words) 
      ? data.brand_personality_words.join(', ') 
      : 'Not available';
    const colors = Array.isArray(data.brand_colors) 
      ? data.brand_colors.map((c: any) => `${c.color} (${c.hex_code})`).join(', ')
      : 'Not available';
    
    return `
${result.pageType.toUpperCase()} PAGE (${result.url}):
- Brand Description: ${data.brand_description || 'Not available'}
- Personality Words: ${personalityWords}
- Premium Score: ${data.brand_trait_scores?.premium?.score || 'N/A'} (${data.brand_trait_scores?.premium?.explanation || 'Not available'})
- Energetic Score: ${data.brand_trait_scores?.energetic?.score || 'N/A'} (${data.brand_trait_scores?.energetic?.explanation || 'Not available'})
- Innovator Score: ${data.brand_trait_scores?.innovator?.score || 'N/A'} (${data.brand_trait_scores?.innovator?.explanation || 'Not available'})
- Social Proof Score: ${data.brand_trait_scores?.social_proof?.score || 'N/A'} (${data.brand_trait_scores?.social_proof?.explanation || 'Not available'})
- Curated Score: ${data.brand_trait_scores?.curated?.score || 'N/A'} (${data.brand_trait_scores?.curated?.explanation || 'Not available'})
- Serious Score: ${data.brand_trait_scores?.serious?.score || 'N/A'} (${data.brand_trait_scores?.serious?.explanation || 'Not available'})
- Brand Colors: ${colors}
`;
  }).join('\n');

  return `You are a professional brand strategist conducting a comprehensive brand analysis synthesis. You have analyzed multiple pages of a website and now need to synthesize these findings into a cohesive, accurate brand intelligence report.

ANALYSIS RESULTS FROM MULTIPLE PAGES:
${resultsSummary}

SYNTHESIS INSTRUCTIONS:

Your task is to create a unified brand intelligence report that combines insights from all analyzed pages. Consider the following:

1. **Brand Description**: 
   - Create a comprehensive description that captures the brand's essence across all pages
   - Give primary weight (60%) to homepage messaging and positioning
   - Supplement with insights from PDP (20%) and about page (20%)
   - If different pages show different aspects, synthesize them into a complete picture
   - Use evidence from all pages to support your description

2. **Brand Personality Words**:
   - Select 4 words that best represent the brand across all pages
   - Prioritize homepage personality (60% weight) but consider consistency across all pages
   - If there are variations, lean toward the homepage interpretation
   - Choose words that capture the overall brand personality

3. **Brand Trait Scores**:
   - For each trait, calculate a weighted average using these weights:
     * HOMEPAGE: 60% weight (primary brand positioning)
     * PDP: 20% weight (product quality and pricing insights)
     * ABOUT: 20% weight (brand story and trust signals)
   - Look for patterns and consistency across pages
   - If there are conflicts, explain your reasoning for the final score
   - Provide detailed explanations that reference evidence from multiple pages
   - Example calculation: If homepage scores 80, PDP scores 60, about scores 40, then final score = (80×0.6) + (60×0.2) + (40×0.2) = 68

4. **Brand Colors**:
   - Identify the STANDARDIZED brand color palette that should be consistent across all pages
   - Use the HOMEPAGE as the primary source (60% weight) since it represents the main brand design system
   - Verify consistency across other pages - if colors differ significantly, flag this as a brand inconsistency
   - Focus on the core UI design colors (navigation, buttons, headers, backgrounds, text)
   - The final palette should represent the brand's official design system, not a combination
   - If other pages show different colors, note this as a brand consistency issue

5. **Synthesis Notes** (optional):
   - Highlight any significant differences between pages
   - Note any inconsistencies in brand presentation
   - Mention which pages provided the strongest evidence for each trait

Be thorough, analytical, and evidence-based in your synthesis. The final report should feel like a comprehensive brand analysis that only comes from analyzing multiple touchpoints.`;
}
