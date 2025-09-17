import { generateObject } from "ai";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { getAIConfig } from "@shared/ai-config";

export const DEFAULT_BRAND_ANALYSIS = {
    "success": true,
    "brandSummary": {
        "screenshot": {
            "visualStyle": {
                "overallAesthetic": "The brand's visual identity showcases a sleek, modern, and minimalistic aesthetic with an emphasis on athleticism and elegance.",
                "colorPalette": [
                    "black",
                    "white",
                    "neutral tones"
                ],
                "typography": "The typography is simple and elegant, utilizing a serif font that adds a touch of sophistication.",
                "imagery": "Images are dynamic and energetic, featuring running and athletic activities. They convey a sense of movement and vitality."
            },
            "brandElements": {
                "logo": "The logo is minimalistic, consisting of a simple wordmark that complements the overall clean design.",
                "keyComponents": [
                    "headers",
                    "buttons",
                    "subscribe pop-up",
                    "privacy notification"
                ],
                "layout": "The layout is clean and organized, with a focus on balance and whitespace to highlight content effectively."
            },
            "brandPersonality": {
                "adjectives": [
                    "modern",
                    "sophisticated",
                    "energetic",
                    "clean",
                    "minimalistic"
                ],
                "targetAudience": "The brand targets a modern, active, and style-conscious audience, likely interested in premium athletic apparel."
            }
        },
        "language": {
            "voice": {
                "tones": [
                    "elegant",
                    "inspirational",
                    "authoritative"
                ],
                "keyPhrases": [
                    "beauty in motion",
                    "precision tailored",
                    "running as ceremony",
                    "temple of running",
                    "origins of running",
                    "elevating running to the realm of the sacred"
                ]
            },
            "brandPersonality": {
                "adjectives": [
                    "elegant",
                    "refined",
                    "inspirational",
                    "exclusive"
                ],
                "values": [
                    "heritage",
                    "excellence",
                    "aesthetics",
                    "performance",
                    "ritual"
                ],
                "targetAudience": "Active women who value performance apparel with a strong cultural and historical significance."
            },
            "valueProposition": {
                "primaryMessage": "Performance apparel inspired by the ancient Greek ideal of beauty in motion.",
                "supportingBenefits": [
                    "Precision tailored from the finest fabrics in France",
                    "Technical excellence",
                    "Refined aesthetics"
                ],
                "differentiators": [
                    "Ancient Greek inspiration",
                    "Connection of past and present",
                    "Cultural and historical depth"
                ],
                "proofElements": [
                    "Designed for women",
                    "Flagship in Amsterdam called 'the most beautiful running store in the world'"
                ]
            },
            "messaging": {
                "headlines": [
                    "September Drop Now Available",
                    "New Releases",
                    "Philos Temple of Running"
                ],
                "ctas": [
                    "Explore our collection",
                    "Discover the Philos running experience",
                    "Visit our flagship store"
                ],
                "contentThemes": [
                    "Historical inspiration",
                    "Cultural significance",
                    "Performance and aesthetics",
                    "Connection of past and present"
                ],
                "trustSignals": [
                    "French fabric craftsmanship",
                    "Marketed exclusivity",
                    "Cultural and historical narrative"
                ]
            }
        }
    }
};

const HypothesisGeneratorSchema = z.object({
    success: z.boolean(),
    experiments: z.object({
        hypotheses: z.array(z.object({
            experimentName: z.string().describe("The name of the experiment"),
            hypothesis: z.string().describe("If we [change X], then [outcome Y] will happen because [reason Z]"),
            elementSelector: z.string().describe("The element to change, .specific-css-selector"),
            changeType: z.enum(["text", "color", "layout", "cta", "image", "form"]).describe("The type of change to make"),
            changeDescription: z.string().describe("The specific change to make"),
            expectedImpact: z.string().describe("Expected % improvement on [metric]"),
        })),
    }),
});

export class HypothesisGenerator {
    private aiConfig: ReturnType<typeof getAIConfig>;

    constructor() {
        this.aiConfig = getAIConfig();
    }

    async getNecessaryData() {
        return {
            brandAnalysis: DEFAULT_BRAND_ANALYSIS,
        };
    }

    async generateHypotheses(): Promise<any[]> {

        const brandAnalysis = await this.getNecessaryData();
        const result = await generateObject({
            model: openai(this.aiConfig.model),
            schema: HypothesisGeneratorSchema,
            messages: [
                { 
                    role: 'user', 
                    content: `Based on this brand analysis, generate 4 specific UI/visual experiments focused on visual elements, not messaging:

BRAND ANALYSIS:
${JSON.stringify(brandAnalysis.brandAnalysis, null, 2)}

Focus on these VISUAL UI areas:
1. Button styling (size, color, shadows, hover effects)
2. Typography improvements (font sizing, hierarchy, contrast)
3. Layout & spacing (whitespace, alignment, grid systems)
4. Color usage (contrast, visual hierarchy, brand palette implementation)
5. Component styling (forms, navigation, cards, headers)

Generate experiments that test VISUAL changes like:
- Button size/color/shadow adjustments
- Typography scale improvements
- Spacing and layout refinements
- Color contrast enhancements
- Visual hierarchy improvements

Avoid text/messaging changes - focus purely on visual UI elements that can be tested with CSS changes.`
                }
            ],
        });

        return result.object.experiments.hypotheses;
    }

}