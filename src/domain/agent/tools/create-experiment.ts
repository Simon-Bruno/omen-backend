// @ts-nocheck 
import { tool } from 'ai';
import { z } from 'zod';
import { ExperimentDAL } from '@infra/dal';
import { hypothesisStateManager } from '../hypothesis-state-manager';
import { prisma } from '@infra/prisma';

const createExperimentSchema = z.object({
  name: z.string().describe('The name of the experiment'),
  hypothesis: z.object({
    hypothesis: z.string().describe('The hypothesis statement'),
    rationale: z.string().describe('The rationale behind the hypothesis'),
    measurable_tests: z.string().describe('What can be measured to test this hypothesis'),
    success_metrics: z.string().describe('The success metrics for this hypothesis'),
    oec: z.string().describe('The Overall Evaluation Criterion (OEC)'),
    accessibility_check: z.string().describe('Accessibility considerations for this hypothesis')
  }).optional().describe('The hypothesis object - if not provided, will use the most recently generated hypothesis from state'),
  variants: z.array(z.object({
    variant_label: z.string().describe('The label for this variant'),
    description: z.string().describe('Description of what this variant changes'),
    rationale: z.string().describe('Why this variant might improve performance'),
    accessibility_consideration: z.string().describe('Accessibility considerations for this variant'),
    implementation_notes: z.string().describe('Technical implementation details'),
    css_code: z.string().describe('CSS code for this variant'),
    html_code: z.string().describe('HTML code for this variant'),
    injection_method: z.enum(['selector', 'new_element', 'modify_existing']).describe('How to inject this code'),
    target_selector: z.string().optional().describe('CSS selector to target existing element'),
    new_element_html: z.string().optional().describe('Complete HTML for new element'),
    implementation_instructions: z.string().describe('Step-by-step implementation instructions'),
    screenshot: z.string().optional().describe('URL to the screenshot of the variant applied to the page')
  })).describe('The variants to test')
});

//TODO: Remove implementation instructions

class CreateExperimentExecutor {
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  async execute(input: { 
    name: string; 
    hypothesis?: any; 
    variants: any[] 
  }): Promise<{ experimentId: string; status: string; message: string }> {
    console.log(`[EXPERIMENT_TOOL] Creating experiment: "${input.name}"`);

    // Get hypothesis from state manager (preferred) or input
    let hypothesis = hypothesisStateManager.getCurrentHypothesis();
    
    if (hypothesis) {
      console.log(`[EXPERIMENT_TOOL] Using hypothesis from state manager: "${hypothesis.hypothesis.substring(0, 50)}..."`);
    } else if (input.hypothesis) {
      console.log(`[EXPERIMENT_TOOL] Using hypothesis from input: "${input.hypothesis.hypothesis.substring(0, 50)}..."`);
      hypothesis = input.hypothesis;
    } else {
      console.log(`[EXPERIMENT_TOOL] No hypothesis available in state or input`);
      throw new Error('No hypothesis available. Please generate hypotheses first using the generate_hypotheses tool.');
    }

    // Use hardcoded project ID for now
    const projectId = this.projectId;

    try {
      const experiment = await ExperimentDAL.createExperiment({
        projectId,
        name: input.name,
        oec: hypothesis.oec || 'Improve conversion rate', // Default OEC
        minDays: 7, // Default minimum days
        minSessionsPerVariant: 1000 // Default minimum sessions
      });

      // Create hypothesis
      await prisma.experimentHypothesis.create({
        data: {
          experimentId: experiment.id,
          hypothesis: hypothesis.hypothesis,
          rationale: hypothesis.rationale,
          primaryKpi: hypothesis.success_metrics || 'conversion_rate'
        }
      });

      // Create traffic distribution (equal split for now)
      const variantIds = ['A', 'B', 'C'].slice(0, input.variants.length);
      const percentagePerVariant = 1.0 / variantIds.length;
      
      for (let i = 0; i < variantIds.length; i++) {
        await prisma.experimentTraffic.create({
          data: {
            experimentId: experiment.id,
            variantId: variantIds[i],
            percentage: percentagePerVariant
          }
        });
      }

      // Create variants
      for (let i = 0; i < input.variants.length; i++) {
        const variant = input.variants[i];
        await prisma.experimentVariant.create({
          data: {
            experimentId: experiment.id,
            variantId: variantIds[i],
            selector: variant.target_selector || 'body',
            html: variant.html_code || '',
            css: variant.css_code || '',
            position: 'INNER' // Default position
          }
        });
      }

      console.log(`[EXPERIMENT_TOOL] Experiment created successfully: ${experiment.id}`);

      return {
        experimentId: experiment.id,
        status: experiment.status,
        message: `Experiment "${input.name}" has been created and saved to the database. It's currently in DRAFT status and ready to be published when you're ready.`
      };
    } catch (error) {
      console.error(`[EXPERIMENT_TOOL] Failed to create experiment:`, error);
      throw new Error(`Failed to create experiment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export function createExperiment(projectId: string) {
  const executor = new CreateExperimentExecutor(projectId);

  return tool({
    description: 'Create an experiment in the database with the given hypothesis and variants',
    inputSchema: createExperimentSchema,
    execute: async (input) => {
      try {
        const result = await executor.execute(input);
        return result;
      } catch (error) {
        console.error(`[EXPERIMENT_TOOL] Tool execute failed:`, error);
        throw new Error(error instanceof Error ? error.message : 'Failed to create experiment');
      }
    },
  });
}
