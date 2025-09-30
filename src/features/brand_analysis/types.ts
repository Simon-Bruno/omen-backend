// Brand Analysis Types
import { z } from 'zod';

// Brand intelligence schema
export const brandIntelligenceSchema = z.object({
  brand_description: z.string(),
  brand_personality_words: z.array(z.string()).length(4),
  brand_trait_scores: z.object({
    premium: z.object({
      score: z.number().min(1).max(100),
      explanation: z.string()
    }),
    energetic: z.object({
      score: z.number().min(1).max(100),
      explanation: z.string()
    }),
    innovator: z.object({
      score: z.number().min(1).max(100),
      explanation: z.string()
    }),
    social_proof: z.object({
      score: z.number().min(1).max(100),
      explanation: z.string()
    }),
    curated: z.object({
      score: z.number().min(1).max(100),
      explanation: z.string()
    }),
    serious: z.object({
      score: z.number().min(1).max(100),
      explanation: z.string()
    })
  }),
  brand_colors: z.array(z.object({
    color: z.string(),
    description: z.string(),
    usage_type: z.enum(['primary', 'secondary', 'tertiary', 'accent']),
    hex_code: z.string()
  })).min(3).max(4)
});

export type BrandIntelligenceData = z.infer<typeof brandIntelligenceSchema>;

// Synthesis schema for combining multiple page analyses
export const synthesisSchema = z.object({
  brand_description: z.string(),
  brand_personality_words: z.array(z.string()).length(4),
  brand_trait_scores: z.object({
    premium: z.object({
      score: z.number().min(1).max(100),
      explanation: z.string()
    }),
    energetic: z.object({
      score: z.number().min(1).max(100),
      explanation: z.string()
    }),
    innovator: z.object({
      score: z.number().min(1).max(100),
      explanation: z.string()
    }),
    social_proof: z.object({
      score: z.number().min(1).max(100),
      explanation: z.string()
    }),
    curated: z.object({
      score: z.number().min(1).max(100),
      explanation: z.string()
    }),
    serious: z.object({
      score: z.number().min(1).max(100),
      explanation: z.string()
    })
  }),
  brand_colors: z.array(z.object({
    color: z.string(),
    description: z.string(),
    usage_type: z.enum(['primary', 'secondary', 'tertiary', 'accent']),
    hex_code: z.string()
  })).min(3).max(4),
  synthesis_notes: z.string().optional()
});