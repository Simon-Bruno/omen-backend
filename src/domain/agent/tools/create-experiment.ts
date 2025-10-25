// @ts-nocheck
import { tool } from 'ai';
import { z } from 'zod';
import { ExperimentDAL } from '@infra/dal';
import { hypothesisStateManager } from '../hypothesis-state-manager';
import { variantStateManager } from '../variant-state-manager';
import { experimentStateManager } from '../experiment-state-manager';
import { prisma } from '@infra/prisma';
import { createExperimentPublisherService } from '@services/experiment-publisher';
import { createCloudflarePublisher } from '@infra/external/cloudflare';
import { getServiceConfig } from '@infra/config/services';
import { findConflicts, ConflictError } from '@features/conflict_guard';
import { getConversationHistory } from '../request-context';
import { normalizeUrlToPattern } from '@shared/normalization/url';
import { getContainer } from '@app/container';
import { detectPageType } from '@shared/page-types';
import { signalStateManager } from '../signal-state-manager';

const createExperimentSchema = z.object({
  name: z.string().describe('A clear, descriptive name for the experiment that captures the essence of what is being tested (e.g., "Homepage Hero CTA Color Test", "PDP Add-to-Cart Button Size Optimization"). Generate this based on the hypothesis and variants.'),
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
  })).optional().describe('The variants to test - if not provided, will use the most recently generated variants from state'),
  jobIds: z.array(z.string()).optional().describe('Specific job IDs to load variants from - if provided, will load variants from these exact jobs instead of searching all project jobs'),
  targetUrls: z.array(z.string()).optional().describe('URL patterns where this experiment should run (e.g., ["/products/*", "/checkout", "^/collections/shoes$"]). If not provided, will auto-detect based on hypothesis and variants.')
});

//TODO: Remove implementation instructions

// Extract URL patterns from the specific URL used for variant generation
async function extractURLPatternsFromScreenshots(projectId: string, _variants: any[]): Promise<string[]> {
  try {
    // Get the most recent hypothesis to find the URL that was used
    const latestHypothesis = await prisma.experimentHypothesis.findFirst({
      where: { 
        experiment: {
          projectId: projectId
        }
      },
      orderBy: { createdAt: 'desc' },
      select: { 
        experiment: {
          select: { targetUrls: true }
        }
      }
    });

    if (latestHypothesis?.experiment?.targetUrls) {
      console.log(`[EXPERIMENT_TOOL] Using existing target URLs from hypothesis:`, latestHypothesis.experiment.targetUrls);
      return latestHypothesis.experiment.targetUrls;
    }

                  // Use the URL that was actually used for hypothesis generation
    // This ensures perfect consistency between hypothesis and experiment
    const { hypothesisStateManager } = await import('../hypothesis-state-manager');
    const hypothesisUrl = hypothesisStateManager.getCurrentHypothesisUrl();
    
    if (hypothesisUrl) {
      console.log(`[EXPERIMENT_TOOL] Using URL from hypothesis generation: ${hypothesisUrl}`);
      const pattern = normalizeUrlToPattern(hypothesisUrl);
      console.log(`[EXPERIMENT_TOOL] Generated pattern: ${pattern}`);
      return [pattern];
    }
    
    // Fallback: Use the same logic as hypothesis generation
    console.log(`[EXPERIMENT_TOOL] No hypothesis URL found, using shop domain fallback`);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { shopDomain: true }
    });
    
    if (!project) {
      console.log(`[EXPERIMENT_TOOL] Project not found, using fallback pattern`);
      return ['/*'];
    }
    
    const url = project.shopDomain.startsWith('http') ? project.shopDomain : `https://${project.shopDomain}`;
    console.log(`[EXPERIMENT_TOOL] Using shop domain URL: ${url}`);
    
    const pattern = normalizeUrlToPattern(url);
    console.log(`[EXPERIMENT_TOOL] Generated pattern: ${pattern}`);
    return [pattern];

  } catch (error) {
    console.error(`[EXPERIMENT_TOOL] Error extracting URL patterns:`, error);
    return ['/*']; // Fallback to all pages
  }
}


class CreateExperimentExecutor {
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  async execute(input: {
    name: string;
    hypothesis?: any;
    variants?: any[];
    jobIds?: string[];
  }): Promise<{ experimentId: string; status: string; message: string }> {
    console.log(`[EXPERIMENT_TOOL] ===== EXPERIMENT CREATION INPUT =====`);
    console.log(`[EXPERIMENT_TOOL] Full input received:`, JSON.stringify(input, null, 2));
    console.log(`[EXPERIMENT_TOOL] Input variants length:`, input.variants ? input.variants.length : 'undefined');

    // Get conversation history from request context
    const conversationHistory = getConversationHistory();
    console.log(`[EXPERIMENT_TOOL] Conversation history available: ${conversationHistory ? `${conversationHistory.length} messages` : 'NO'}`);

    // Get hypothesis from state manager (with conversation history fallback) or input
    let hypothesis = await hypothesisStateManager.getCurrentHypothesis(conversationHistory);

    if (hypothesis) {
      console.log(`[EXPERIMENT_TOOL] Using hypothesis: "${hypothesis.title}"`);
    } else if (input.hypothesis) {
      console.log(`[EXPERIMENT_TOOL] Using hypothesis from input: "${input.hypothesis.title}"`);
      hypothesis = input.hypothesis;
    } else {
      console.log(`[EXPERIMENT_TOOL] No hypothesis available in state, conversation history, or input`);
      throw new Error('No hypothesis available. Please generate hypotheses first using the generate_hypotheses tool.');
    }

    // CRITICAL FIX: Load variants from jobs first (same as preview does in checkVariantsStatus)
    console.log(`[EXPERIMENT_TOOL] Loading variants from jobs (same as preview)...`);
    try {
      // Priority 1: Use jobIds from input (most explicit)
      if (input.jobIds && input.jobIds.length > 0) {
        console.log(`[EXPERIMENT_TOOL] Loading variants from input job IDs:`, input.jobIds);
        await variantStateManager.loadVariantsFromJobIds(input.jobIds);
      }
      // Priority 2: Use jobIds from state manager (with conversation history fallback)
      else {
        const currentJobIds = variantStateManager.getCurrentJobIds(conversationHistory);
        if (currentJobIds && currentJobIds.length > 0) {
          console.log(`[EXPERIMENT_TOOL] Loading variants from job IDs (state manager or conversation history):`, currentJobIds);
          await variantStateManager.loadVariantsFromJobIds(currentJobIds);
        } else {
          console.log(`[EXPERIMENT_TOOL] No specific job IDs found, falling back to all project jobs`);
          await variantStateManager.loadVariantsFromJobs(this.projectId);
        }
      }
    } catch (loadError) {
      console.error(`[EXPERIMENT_TOOL] Failed to load variants from jobs:`, loadError);
      // Continue - we'll check if variants are available below
    }

    // Now get variants from state manager (after loading)
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
      console.log(`[EXPERIMENT_TOOL] No variants available in state, input, or jobs`);
      throw new Error('No variants available. Please generate variants first using the generate_variants tool.');
    }

    console.log(`[EXPERIMENT_TOOL] ======================================`);

    // Use the LLM-generated experiment name
    const experimentName = input.name;
    console.log(`[EXPERIMENT_TOOL] Using experiment name: "${experimentName}"`);

    // Use hardcoded project ID for now
    const projectId = this.projectId;

    try {
      // Final conflict check before creating experiment
      console.log(`[EXPERIMENT_TOOL] Performing final conflict check...`);
      const activeTargets = await ExperimentDAL.getActiveTargets(projectId);

      // Check conflicts for each variant
      for (const variant of variants) {
        const conflicts = findConflicts(activeTargets, {
          url: '/', // Default URL, can be enhanced with actual target URL
          selector: variant.target_selector,
          role: undefined // Role can be extracted from variant metadata
        });

        if (conflicts.length > 0) {
          const onConflictQueue = process.env.ON_CONFLICT_QUEUE === 'true';

          if (onConflictQueue) {
            console.log(`[EXPERIMENT_TOOL] Conflict detected, queuing experiment...`);
            // Create experiment in queued status
            const experiment = await ExperimentDAL.createExperiment({
              projectId,
              name: experimentName + ' (Queued due to conflict)',
              oec: hypothesis.oec || 'Improve conversion rate',
              minDays: 7,
              minSessionsPerVariant: 1000,
              status: 'DRAFT' // Keep as draft when conflicted
            });

            return {
              experimentId: experiment.id,
              status: 'QUEUED',
              message: `Experiment "${experimentName}" has been queued due to conflicts with experiment ${conflicts[0].experimentId}. It will be activated once the conflicting experiment completes.`
            };
          } else {
            // Throw error with conflict details
            throw new ConflictError('CONFLICT_OVERLAP', conflicts,
              `Cannot create experiment: conflicts with active experiment ${conflicts[0].experimentId} targeting "${conflicts[0].label}"`
            );
          }
        }
      }

      console.log(`[EXPERIMENT_TOOL] No conflicts detected, proceeding with experiment creation`);

      // Auto-detect URL patterns if not provided
      let targetUrls = input.targetUrls;
      if (!targetUrls || targetUrls.length === 0) {
        targetUrls = await extractURLPatternsFromScreenshots(this.projectId, variants);
        console.log(`[EXPERIMENT_TOOL] Auto-detected URL patterns from screenshots:`, targetUrls);
      }

      const experiment = await ExperimentDAL.createExperiment({
        projectId,
        name: experimentName,
        oec: hypothesis.primary_outcome || 'Improve conversion rate', // Use primary_outcome as OEC
        minDays: 7, // Default minimum days
        minSessionsPerVariant: 1000, // Default minimum sessions
        targetUrls: targetUrls.length > 0 ? targetUrls : null
      });

      // Create hypothesis
      await prisma.experimentHypothesis.create({
        data: {
          experimentId: experiment.id,
          hypothesis: hypothesis.description,
          rationale: hypothesis.current_problem, // Use current_problem as rationale
          primaryKpi: hypothesis.primary_outcome || 'conversion_rate'
        }
      });

      // Create traffic distribution with control group
      const generateVariantIds = (variantCount: number): string[] => {
        const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']; // Support up to 8 variants
        return ids.slice(0, variantCount);
      };

      const variantIds = generateVariantIds(variants.length);
      const totalVariants = variants.length + 1; // +1 for control group
      const percentagePerVariant = 1.0 / totalVariants;

      console.log(`[EXPERIMENT_TOOL] Creating traffic distribution for ${variants.length} test variants + 1 control group`);
      console.log(`[EXPERIMENT_TOOL] Total variants: ${totalVariants}, percentage per variant: ${(percentagePerVariant * 100).toFixed(2)}%`);

      // Create traffic for control group (always gets equal share)
      await prisma.experimentTraffic.create({
        data: {
          experimentId: experiment.id,
          variantId: 'control',
          percentage: percentagePerVariant
        }
      });
      console.log(`[EXPERIMENT_TOOL] Control group allocated ${(percentagePerVariant * 100).toFixed(2)}% traffic`);

      // Create traffic for test variants
      for (let i = 0; i < variantIds.length; i++) {
        await prisma.experimentTraffic.create({
          data: {
            experimentId: experiment.id,
            variantId: variantIds[i],
            percentage: percentagePerVariant
          }
        });
        console.log(`[EXPERIMENT_TOOL] Variant ${variantIds[i]} allocated ${(percentagePerVariant * 100).toFixed(2)}% traffic`);
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
            js: variant.javascript_code || '', // Map javascript_code to js field
            position: 'INNER' // Default position
          }
        });
      }

      console.log(`[EXPERIMENT_TOOL] Experiment created successfully: ${experiment.id}`);

      // Store experiment in state manager for future reference
      experimentStateManager.setCurrentExperiment(experiment);

        // ===== PERSIST SIGNALS (GOALS) =====
      console.log(`[EXPERIMENT_TOOL] Persisting signals for experiment...`);
      const container = getContainer();
      const signalService = container.getSignalGenerationOrchestrator();
      let signalsGenerated = false;
      let signalError: string | undefined;

      try {
        // Check if we have a cached proposal from preview
        const cachedProposal = signalStateManager.getCurrentProposal();
        
        if (cachedProposal) {
          console.log(`[EXPERIMENT_TOOL] ✅ Using cached signal proposal from preview (skipping LLM call)`);
          
          // Just validate and persist the cached proposal - NO LLM CALL
            // Use hypothesis URL to get the correct screenshot
            const hypothesisUrl = hypothesisStateManager.getCurrentHypothesisUrl();
            console.log(`[EXPERIMENT_TOOL] Looking for screenshot matching hypothesis URL: ${hypothesisUrl}`);
            
            const screenshot = await prisma.screenshot.findFirst({
              where: { 
                projectId,
                url: hypothesisUrl
              },
              select: { url: true, htmlContent: true },
              orderBy: { createdAt: 'desc' }
            });

            if (hypothesisUrl && screenshot?.htmlContent) {
              const pageType = detectPageType(screenshot.url);
              console.log(`[EXPERIMENT_TOOL] Validating cached signals for page type: ${pageType}`);
            
            // Validate the cached proposal
            const validationResult = await signalService.validator.validateProposal(cachedProposal, {
              pageType,
              controlDOM: screenshot.htmlContent,
              purchaseTrackingActive: true,
            });

            if (validationResult.valid && validationResult.primary?.valid) {
              // Persist valid signals from cached proposal
              const signalsToCreate = [];
              if (validationResult.primary?.valid) {
                signalsToCreate.push({ ...validationResult.primary.signal, role: 'primary' });
              }
              validationResult.mechanisms.forEach(m => {
                if (m.valid) signalsToCreate.push(m.signal);
              });
              validationResult.guardrails.forEach(g => {
                if (g.valid) signalsToCreate.push(g.signal);
              });

              const { SignalDAL } = await import('@infra/dal/signal');
              await SignalDAL.createSignals(
                signalsToCreate.map(signal => SignalDAL.fromSignal(signal, experiment.id))
              );

              signalsGenerated = true;
              console.log(`[EXPERIMENT_TOOL] ✅ Persisted ${signalsToCreate.length} cached signals`);
            } else {
              // Log detailed validation errors
              console.error(`[EXPERIMENT_TOOL] ❌ Cached proposal validation failed`);
              if (validationResult.primary?.errors?.length > 0) {
                console.error(`[EXPERIMENT_TOOL] Primary errors:`, validationResult.primary.errors);
              }
              if (validationResult.overallErrors?.length > 0) {
                console.error(`[EXPERIMENT_TOOL] Overall errors:`, validationResult.overallErrors);
              }
              signalError = `Validation failed: ${validationResult.primary?.errors?.join('; ') || 'Unknown error'}`;
            }
            
            // Clear cached proposal after use
            signalStateManager.clearCurrentProposal();
          }
        } else {
          // Fallback: generate fresh if no cached proposal
          console.log(`[EXPERIMENT_TOOL] No cached proposal, generating signals...`);
          
          // Use hypothesis URL to get the correct screenshot
          const hypothesisUrl = hypothesisStateManager.getCurrentHypothesisUrl();
          console.log(`[EXPERIMENT_TOOL] Looking for screenshot matching hypothesis URL: ${hypothesisUrl}`);
          
          const screenshot = await prisma.screenshot.findFirst({
            where: { 
              projectId,
              url: hypothesisUrl
            },
            select: { url: true, htmlContent: true },
            orderBy: { createdAt: 'desc' }
          });

          if (hypothesisUrl && screenshot?.url && screenshot.htmlContent) {
            const variantsForValidation = variants.map(v => ({
              selector: v.target_selector || 'body',
              html: v.html_code || '',
              css: v.css_code,
              js: v.javascript_code,
              description: v.description,
              rationale: v.rationale,
              position: 'INNER',
            }));

            const signalIntent = `${hypothesis.description}. Primary goal: ${hypothesis.primary_outcome}`;
            
            const result = await signalService.tryAutoGenerateForAllVariants(
              experiment.id,
              screenshot.url,
              signalIntent,
              screenshot.htmlContent,
              variantsForValidation,
              true,
              projectId
            );

            signalsGenerated = result.success;
            signalError = result.error;
          } else {
            signalError = 'No screenshot data available';
          }
        }

        if (signalsGenerated) {
          console.log(`[EXPERIMENT_TOOL] ✅ Signals persisted successfully`);
        } else {
          console.log(`[EXPERIMENT_TOOL] ⚠️ Signal persistence failed: ${signalError}`);
        }
      } catch (err) {
        console.error(`[EXPERIMENT_TOOL] Signal persistence error:`, err);
        signalError = err instanceof Error ? err.message : 'Unknown error';
      }

      // Automatically publish the experiment after creation (only if signals were successfully generated)
      if (!signalsGenerated) {
        console.log(`[EXPERIMENT_TOOL] ⚠️ Skipping auto-publish because signal generation failed`);
        return {
          experimentId: experiment.id,
          status: 'DRAFT',
          message: `Experiment "${experimentName}" has been created but cannot be published yet. Signal auto-generation failed: ${signalError}. Please add signals manually before publishing.`
        };
      }

      console.log(`[EXPERIMENT_TOOL] Auto-publishing experiment: ${experiment.id}`);
      try {
        const config = getServiceConfig();
        const cloudflarePublisher = createCloudflarePublisher(config.cloudflare);
        const experimentPublisher = createExperimentPublisherService(cloudflarePublisher);

        const publishResult = await experimentPublisher.publishExperiment(experiment.id);

        if (publishResult.success) {
          console.log(`[EXPERIMENT_TOOL] Experiment published successfully with auto-generated signals`);
          return {
            experimentId: experiment.id,
            status: 'RUNNING',
            message: `Experiment "${experimentName}" has been created with auto-generated signals and published to Cloudflare! It's now live and tracking user interactions.`
          };
        } else {
          console.error(`[EXPERIMENT_TOOL] Failed to publish:`, publishResult.error);
          return {
            experimentId: experiment.id,
            status: 'DRAFT',
            message: `Experiment "${experimentName}" has been created with signals but failed to publish to Cloudflare: ${publishResult.error}. The experiment remains in DRAFT status.`
          };
        }
      } catch (publishError) {
        console.error(`[EXPERIMENT_TOOL] Error publishing experiment:`, publishError);
        return {
          experimentId: experiment.id,
          status: 'DRAFT',
          message: `Experiment "${experimentName}" has been created with signals but failed to publish: ${publishError instanceof Error ? publishError.message : 'Unknown error'}. The experiment remains in DRAFT status.`
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
    description: 'Create an experiment in the database with the given hypothesis and variants. If you have job IDs from a previous generate_variants call, pass them in the jobIds parameter to load the specific variants from those jobs.',
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
  
