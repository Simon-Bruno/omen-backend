// @ts-nocheck
import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@infra/prisma';
import { experimentStateManager } from '../experiment-state-manager';

const getExperimentOverviewSchema = z.object({
  experimentId: z.string().optional().describe('The ID of the experiment to get overview for - if not provided, will use the current experiment from state')
});

class GetExperimentOverviewExecutor {
  async execute(input: { experimentId?: string }): Promise<{
    experiment: any;
    hypothesis: any;
    variants: any[];
    traffic: any[];
    summary: string;
  }> {
    // Get experiment ID from input or state
    const experimentId = input.experimentId || experimentStateManager.getCurrentExperimentId();
    
    if (!experimentId) {
      throw new Error('No experiment ID provided and no current experiment in state. Please create an experiment first or provide an experiment ID.');
    }
    
    console.log(`[EXPERIMENT_OVERVIEW] Getting overview for experiment: ${experimentId}`);
    
    try {
      // Fetch experiment data from database
      const experiment = await prisma.experiment.findUnique({
        where: { id: experimentId },
        include: {
          hypothesis: true,
          traffic: true,
          variants: true,
          goals: true,
        },
      });

      if (!experiment) {
        throw new Error(`Experiment not found: ${experimentId}`);
      }

      console.log(`[EXPERIMENT_OVERVIEW] Found experiment:`, {
        id: experiment.id,
        name: experiment.name,
        status: experiment.status,
        variantCount: experiment.variants.length,
        trafficCount: experiment.traffic.length
      });

      // Create a summary for the user
      const variantSummary = experiment.variants.map((variant, index) => 
        `${variant.variantId}: ${variant.selector}`
      ).join(', ');

      const trafficSummary = experiment.traffic.map(t => 
        `${t.variantId}: ${Math.round(t.percentage * 100)}%`
      ).join(', ');

      const goalsSummary = experiment.goals && experiment.goals.length > 0
        ? experiment.goals.map(g => `- ${g.name} (${g.role})`).join('\n')
        : 'No goals defined yet';

      const summary = `**Experiment Overview: ${experiment.name}**

**Status:** ${experiment.status}
**OEC:** ${experiment.oec}

**Hypothesis:**
${experiment.hypothesis?.hypothesis || 'No hypothesis available'}

**Rationale:**
${experiment.hypothesis?.rationale || 'No rationale available'}

**Success Metrics:**
${experiment.hypothesis?.primaryKpi || 'No metrics defined'}

**Signals/Goals (${experiment.goals?.length || 0}):**
${goalsSummary}

**Variants (${experiment.variants.length}):**
${variantSummary}

**Traffic Distribution:**
${trafficSummary}

**Next Steps:**
This experiment is ready to be published. Once published, it will be live and the SDK can load the variants for testing.`;

      return {
        experiment,
        hypothesis: experiment.hypothesis,
        variants: experiment.variants,
        traffic: experiment.traffic,
        goals: experiment.goals,
        summary
      };
    } catch (error) {
      console.error(`[EXPERIMENT_OVERVIEW] Failed to get experiment overview:`, error);
      throw new Error(`Failed to get experiment overview: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export function createGetExperimentOverviewTool() {
  const executor = new GetExperimentOverviewExecutor();

  return tool({
    description: 'Get a detailed overview of an experiment including hypothesis, variants, traffic distribution, and status. Use this to show users what will be published before they confirm.',
    inputSchema: getExperimentOverviewSchema,
    execute: async (input) => {
      try {
        const result = await executor.execute(input);
        return result;
      } catch (error) {
        console.error(`[EXPERIMENT_OVERVIEW] Tool execute failed:`, error);
        throw new Error(error instanceof Error ? error.message : 'Failed to get experiment overview');
      }
    },
  });
}
