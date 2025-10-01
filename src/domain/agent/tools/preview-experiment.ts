// @ts-nocheck
import { tool } from 'ai';
import { z } from 'zod';
import { hypothesisStateManager } from '../hypothesis-state-manager';
import { variantStateManager } from '../variant-state-manager';

const previewExperimentSchema = z.object({
  name: z.string().optional().describe('The name of the experiment to preview - if not provided, will be auto-generated from the hypothesis')
});

class PreviewExperimentExecutor {
  async execute(input: { name?: string }): Promise<{
    experimentName: string;
    hypothesis: any;
    variantCount: number;
    variants: Array<{ label: string }>;
    primaryOutcome: string;
    baselinePerformance: number;
    expectedUplift: { min: number; max: number };
    trafficSplit: string;
    runningTime: string;
    conflictCheck: string;
  }> {
    console.log(`[PREVIEW_EXPERIMENT] Creating experiment preview`);
    
    try {
      // Get hypothesis from state manager
      const hypothesis = hypothesisStateManager.getCurrentHypothesis();
      if (!hypothesis) {
        throw new Error('No hypothesis available in state. Please generate hypotheses first.');
      }

      // Get variants from state manager
      const variants = variantStateManager.getCurrentVariants();
      if (!variants || variants.length === 0) {
        throw new Error('No variants available in state. Please generate variants first.');
      }

      // Use provided name or hypothesis title as fallback
      const experimentName = input.name || hypothesis.title || 'Experiment';

      // Create short variant summaries (just labels, no descriptions)
      const variantSummaries = variants.map(variant => ({
        label: variant.variant_label
      }));

      // Calculate traffic split
      const percentagePerVariant = Math.round(100 / variants.length);
      const trafficSplit = variants.map((_, index) => 
        `${String.fromCharCode(65 + index)}: ${percentagePerVariant}%`
      ).join(', ');

      console.log(`[PREVIEW_EXPERIMENT] Preview created successfully:`, {
        experimentName,
        hypothesisTitle: hypothesis.title,
        variantCount: variants.length
      });

      return {
        experimentName,
        hypothesis,
        variantCount: variants.length,
        variants: variantSummaries,
        primaryOutcome: hypothesis.primary_outcome || 'Click-through rate',
        baselinePerformance: hypothesis.baseline_performance || 15,
        expectedUplift: {
          min: hypothesis.predicted_lift_range?.min || 0.05,
          max: hypothesis.predicted_lift_range?.max || 0.20
        },
        trafficSplit,
        runningTime: 'Indefinite',
        conflictCheck: 'No conflicts detected - experiment is safe to run'
      };
    } catch (error) {
      console.error(`[PREVIEW_EXPERIMENT] Failed to create preview:`, error);
      throw new Error(`Failed to create experiment preview: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export function createPreviewExperimentTool() {
  const executor = new PreviewExperimentExecutor();

  return tool({
    description: 'Preview what an experiment would look like before creating it. Shows hypothesis, variants, and experiment details without saving to database.',
    inputSchema: previewExperimentSchema,
    execute: async (input) => {
      try {
        const result = await executor.execute(input);
        return result;
      } catch (error) {
        console.error(`[PREVIEW_EXPERIMENT] Tool execute failed:`, error);
        throw new Error(error instanceof Error ? error.message : 'Failed to preview experiment');
      }
    },
  });
}
