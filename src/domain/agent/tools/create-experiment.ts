// @ts-nocheck 
import { tool } from 'ai';
import { z } from 'zod';
import { ExperimentDAL } from '@infra/dal';
import { hypothesisStateManager } from '../hypothesis-state-manager';
import { variantStateManager } from '../variant-state-manager';
import { prisma } from '@infra/prisma';
import { createExperimentPublisherService } from '@services/experiment-publisher';
import { createCloudflarePublisher } from '@infra/external/cloudflare';
import { getServiceConfig } from '@infra/config/services';

const createExperimentSchema = z.object({
  name: z.string().optional().describe('The name of the experiment - if not provided, will be auto-generated from the hypothesis'),
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
  })).optional().describe('The variants to test - if not provided, will use the most recently generated variants from state')
});

//TODO: Remove implementation instructions

class CreateExperimentExecutor {
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  async execute(input: { 
    name?: string; 
    hypothesis?: any; 
    variants?: any[] 
  }): Promise<{ experimentId: string; status: string; message: string }> {
    console.log(`[EXPERIMENT_TOOL] ===== EXPERIMENT CREATION INPUT =====`);
    console.log(`[EXPERIMENT_TOOL] Full input received:`, JSON.stringify(input, null, 2));
    console.log(`[EXPERIMENT_TOOL] Input variants length:`, input.variants ? input.variants.length : 'undefined');
    
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

    // Get variants from state manager (preferred) or input
    let variants = variantStateManager.getCurrentVariants();
    
    console.log(`[EXPERIMENT_TOOL] State manager variants:`, variants ? `${variants.length} variants` : 'null');
    console.log(`[EXPERIMENT_TOOL] Input variants:`, input.variants ? `${input.variants.length} variants` : 'undefined');
    
    if (variants && variants.length > 0) {
      console.log(`[EXPERIMENT_TOOL] Using ${variants.length} variants from state manager`);
      console.log(`[EXPERIMENT_TOOL] Variant labels:`, variants.map(v => v.variant_label));
    } else if (input.variants && input.variants.length > 0) {
      console.log(`[EXPERIMENT_TOOL] Using ${input.variants.length} variants from input`);
      console.log(`[EXPERIMENT_TOOL] Input variant labels:`, input.variants.map(v => v.variant_label || 'unnamed'));
      variants = input.variants;
    } else {
      console.log(`[EXPERIMENT_TOOL] No variants available in state or input`);
      console.log(`[EXPERIMENT_TOOL] State manager has variants:`, variantStateManager.hasCurrentVariants());
      console.log(`[EXPERIMENT_TOOL] State manager variant count:`, variantStateManager.getCurrentVariantCount());
      throw new Error('No variants available. Please generate variants first using the generate_variants tool.');
    }
    
    console.log(`[EXPERIMENT_TOOL] ======================================`);

    // Auto-generate experiment name from hypothesis if not provided
    let experimentName = input.name;
    if (!experimentName) {
      // Extract key words from hypothesis to create a meaningful name
      const hypothesisText = hypothesis.hypothesis.toLowerCase();
      let name = 'Button Optimization';
      
      if (hypothesisText.includes('button')) {
        if (hypothesisText.includes('contrast')) {
          name = 'Button Contrast Optimization';
        } else if (hypothesisText.includes('color')) {
          name = 'Button Color Optimization';
        } else if (hypothesisText.includes('size')) {
          name = 'Button Size Optimization';
        } else {
          name = 'Button Optimization';
        }
      } else if (hypothesisText.includes('cta') || hypothesisText.includes('call-to-action')) {
        name = 'CTA Optimization';
      } else if (hypothesisText.includes('form')) {
        name = 'Form Optimization';
      } else if (hypothesisText.includes('checkout')) {
        name = 'Checkout Optimization';
      } else if (hypothesisText.includes('navigation') || hypothesisText.includes('menu')) {
        name = 'Navigation Optimization';
      } else {
        name = 'Conversion Optimization';
      }
      
      experimentName = name;
      console.log(`[EXPERIMENT_TOOL] Auto-generated experiment name: "${experimentName}"`);
    } else {
      console.log(`[EXPERIMENT_TOOL] Using provided experiment name: "${experimentName}"`);
    }

    // Use hardcoded project ID for now
    const projectId = this.projectId;

    try {
      const experiment = await ExperimentDAL.createExperiment({
        projectId,
        name: experimentName,
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
      const variantIds = ['A', 'B', 'C'].slice(0, variants.length);
      const percentagePerVariant = 1.0 / variantIds.length;
      
      console.log(`[EXPERIMENT_TOOL] Creating traffic distribution for ${variants.length} variants`);
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
      console.log(`[EXPERIMENT_TOOL] Creating ${variants.length} variants in database`);
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        console.log(`[EXPERIMENT_TOOL] Creating variant ${i + 1}: ${variant.variant_label}`);
        console.log(`[EXPERIMENT_TOOL] Variant data:`, JSON.stringify({
          variant_label: variant.variant_label,
          target_selector: variant.target_selector,
          has_css: !!variant.css_code,
          has_html: !!variant.html_code,
          injection_method: variant.injection_method
        }, null, 2));
        
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

      // Publish to Cloudflare
      console.log(`[EXPERIMENT_TOOL] Publishing experiment to Cloudflare...`);
      try {
        const config = getServiceConfig();
        const cloudflarePublisher = createCloudflarePublisher(config.cloudflare);
        const experimentPublisher = createExperimentPublisherService(cloudflarePublisher);
        
        const publishResult = await experimentPublisher.publishExperiment(experiment.id);
        
        if (publishResult.success) {
          console.log(`[EXPERIMENT_TOOL] Experiment published to Cloudflare successfully`);
          return {
            experimentId: experiment.id,
            status: 'RUNNING',
            message: `Experiment "${experimentName}" has been created, saved to the database, and published to Cloudflare. It's now live and the SDK can load the variants.`
          };
        } else {
          console.error(`[EXPERIMENT_TOOL] Failed to publish to Cloudflare:`, publishResult.error);
          return {
            experimentId: experiment.id,
            status: experiment.status,
            message: `Experiment "${experimentName}" has been created and saved to the database, but failed to publish to Cloudflare: ${publishResult.error}. The experiment is in DRAFT status.`
          };
        }
      } catch (publishError) {
        console.error(`[EXPERIMENT_TOOL] Error publishing to Cloudflare:`, publishError);
        return {
          experimentId: experiment.id,
          status: experiment.status,
          message: `Experiment "${experimentName}" has been created and saved to the database, but failed to publish to Cloudflare: ${publishError instanceof Error ? publishError.message : 'Unknown error'}. The experiment is in DRAFT status.`
        };
      }
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
