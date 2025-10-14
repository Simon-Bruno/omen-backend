// @ts-nocheck
import { tool } from 'ai';
import { z } from 'zod';
import { hypothesisStateManager } from '../hypothesis-state-manager';
import { variantStateManager } from '../variant-state-manager';
import { VariantJobDAL } from '@infra/dal';
import { ExperimentDAL } from '@infra/dal';
import { findConflicts, formatConflictError } from '@features/conflict_guard';

const previewExperimentSchema = z.object({
  name: z.string().optional().describe('The name of the experiment to preview - if not provided, will be auto-generated from the hypothesis'),
  projectId: z.string().optional().describe('The project ID to check variants and conflicts for - if not provided, will use the current project')
});

class PreviewExperimentExecutor {
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  async execute(input: { name?: string; projectId?: string }): Promise<{
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
    variantStatus: {
      status: string;
      message: string;
      variantsFound: number;
      jobsStatus: any;
    };
  }> {
    const projectId = input.projectId || this.projectId;
    console.log(`[PREVIEW_EXPERIMENT] Creating experiment preview for project: ${projectId}`);
    
    try {
      // Get hypothesis from state manager
      const hypothesis = hypothesisStateManager.getCurrentHypothesis();
      if (!hypothesis) {
        throw new Error('No hypothesis available in state. Please generate hypotheses first.');
      }

      // Check variants status and load if needed
      console.log(`[PREVIEW_EXPERIMENT] Checking variants status...`);
      const variantStatus = await this.checkVariantsStatus(projectId);
      
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

      // Check for conflicts
      console.log(`[PREVIEW_EXPERIMENT] Checking for conflicts...`);
      const conflictCheck = await this.checkConflicts(projectId, variants);

      console.log(`[PREVIEW_EXPERIMENT] Preview created successfully:`, {
        experimentName,
        hypothesisTitle: hypothesis.title,
        variantCount: variants.length,
        variantStatus: variantStatus.status,
        conflictCheck: conflictCheck.includes('No conflicts') ? 'CLEAN' : 'CONFLICTS'
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
        conflictCheck,
        variantStatus
      };
    } catch (error) {
      console.error(`[PREVIEW_EXPERIMENT] Failed to create preview:`, error);
      throw new Error(`Failed to create experiment preview: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check variants status and load if needed (integrated from check-variants tool)
   */
  private async checkVariantsStatus(projectId: string): Promise<{
    status: string;
    message: string;
    variantsFound: number;
    jobsStatus: any;
  }> {
    console.log(`[PREVIEW_EXPERIMENT] Checking variants status for project: ${projectId}`);
    
    try {
      // Check current state manager status
      const currentVariants = variantStateManager.getCurrentVariants();
      const hasCurrentVariants = variantStateManager.hasCurrentVariants();
      const variantCount = variantStateManager.getCurrentVariantCount();
      
      console.log(`[PREVIEW_EXPERIMENT] State manager status:`, {
        hasCurrentVariants,
        variantCount,
        currentVariantsLength: currentVariants ? currentVariants.length : 0
      });
      
      // MEMORY OPTIMIZATION: Only get recent jobs to avoid loading too much data
      const jobs = await VariantJobDAL.getJobsByProject(projectId, 10); // Limit to 20 most recent
      const jobsByStatus = jobs.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // MEMORY OPTIMIZATION: Count by status without checking result field
      const completedJobs = jobs.filter(job => job.status === 'COMPLETED');
      const runningJobs = jobs.filter(job => job.status === 'RUNNING');
      const pendingJobs = jobs.filter(job => job.status === 'PENDING');
      const failedJobs = jobs.filter(job => job.status === 'FAILED');
      
      console.log(`[PREVIEW_EXPERIMENT] Jobs status:`, {
        total: jobs.length,
        completed: completedJobs.length,
        running: runningJobs.length,
        pending: pendingJobs.length,
        failed: failedJobs.length
      });
      
      // Try to load variants from completed jobs if not already loaded
      let variantsFound = variantCount;
      let message = '';
      
      if (hasCurrentVariants && variantCount > 0) {
        message = `Variants already loaded in state manager (${variantCount} variants).`;
      } else if (completedJobs.length > 0) {
        console.log(`[PREVIEW_EXPERIMENT] Attempting to load variants from completed jobs...`);
        
        // Try to load variants from specific job IDs first (most precise)
        const currentJobIds = variantStateManager.getCurrentJobIds();
        
        if (currentJobIds && currentJobIds.length > 0) {
          console.log(`[PREVIEW_EXPERIMENT] Loading variants from specific job IDs:`, currentJobIds);
          const loadedVariants = await variantStateManager.loadVariantsFromJobIds(currentJobIds);
          variantsFound = loadedVariants.length;
        } else {
          console.log(`[PREVIEW_EXPERIMENT] No specific job IDs found, loading from all completed jobs`);
          const loadedVariants = await variantStateManager.loadVariantsFromJobs(projectId);
          variantsFound = loadedVariants.length;
        }
        
        if (variantsFound > 0) {
          message = `Successfully loaded ${variantsFound} variants from completed jobs.`;
        } else {
          message = `Found ${completedJobs.length} completed jobs but no variants could be extracted.`;
        }
      } else if (runningJobs.length > 0 || pendingJobs.length > 0) {
        message = `Found ${runningJobs.length} running and ${pendingJobs.length} pending jobs. Variants are still being processed.`;
      } else if (failedJobs.length > 0) {
        message = `Found ${failedJobs.length} failed jobs. No variants were generated successfully.`;
      } else {
        message = `No variant jobs found for this project. Please generate variants first.`;
      }
      
      return {
        status: variantsFound > 0 ? 'SUCCESS' : 'NO_VARIANTS',
        message,
        variantsFound,
        jobsStatus: {
          total: jobs.length,
          completed: completedJobs.length,
          running: runningJobs.length,
          pending: pendingJobs.length,
          failed: failedJobs.length,
          byStatus: jobsByStatus
        }
      };
    } catch (error) {
      console.error(`[PREVIEW_EXPERIMENT] Failed to check variants status:`, error);
      return {
        status: 'ERROR',
        message: `Failed to check variants status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variantsFound: 0,
        jobsStatus: {}
      };
    }
  }

  /**
   * Check for conflicts with active experiments
   */
  private async checkConflicts(projectId: string, variants: any[]): Promise<string> {
    try {
      // Get active targets from existing experiments
      const activeTargets = await ExperimentDAL.getActiveTargets(projectId);
      
      if (activeTargets.length === 0) {
        return 'No conflicts detected - no active experiments found';
      }

      console.log(`[PREVIEW_EXPERIMENT] Found ${activeTargets.length} active targets to check against`);

      // Check each variant for conflicts
      const allConflicts: any[] = [];
      
      for (const variant of variants) {
        if (variant.selector && variant.selector !== 'body') {
          const conflicts = findConflicts(activeTargets, {
            url: '/*', // Default to all pages for now
            selector: variant.selector,
            role: variant.role
          });
          
          if (conflicts.length > 0) {
            allConflicts.push(...conflicts);
            console.log(`[PREVIEW_EXPERIMENT] Found ${conflicts.length} conflicts for variant: ${variant.variant_label}`);
          }
        }
      }

      if (allConflicts.length === 0) {
        return 'No conflicts detected - experiment is safe to run';
      } else {
        return formatConflictError(allConflicts);
      }
    } catch (error) {
      console.error(`[PREVIEW_EXPERIMENT] Failed to check conflicts:`, error);
      return `Conflict check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}

export function createPreviewExperimentTool(projectId: string) {
  const executor = new PreviewExperimentExecutor(projectId);

  return tool({
    description: 'Preview what an experiment would look like before creating it. Shows hypothesis, variants, experiment details, variant status, and conflict checks without saving to database.',
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
