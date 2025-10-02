// @ts-nocheck 
import { tool } from 'ai';
import { z } from 'zod';
import { variantStateManager } from '../variant-state-manager';
import { VariantJobDAL } from '@infra/dal';

const checkVariantsSchema = z.object({
  projectId: z.string().optional().describe('The project ID to check variants for - if not provided, will use the current project')
});

class CheckVariantsExecutor {
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  async execute(input: { projectId?: string }): Promise<{ 
    status: string; 
    message: string; 
    variantsFound: number;
    variants: any[];
    jobsStatus: any;
  }> {
    const projectId = input.projectId || this.projectId;
    
    console.log(`[CHECK_VARIANTS] ===== CHECKING VARIANTS STATUS =====`);
    console.log(`[CHECK_VARIANTS] Project ID: ${projectId}`);
    
    try {
      // Check current state manager status
      const currentVariants = variantStateManager.getCurrentVariants();
      const hasCurrentVariants = variantStateManager.hasCurrentVariants();
      const variantCount = variantStateManager.getCurrentVariantCount();
      
      console.log(`[CHECK_VARIANTS] State manager status:`);
      console.log(`[CHECK_VARIANTS] - Has current variants: ${hasCurrentVariants}`);
      console.log(`[CHECK_VARIANTS] - Current variant count: ${variantCount}`);
      console.log(`[CHECK_VARIANTS] - Current variants: ${currentVariants ? currentVariants.length : 'null'}`);
      
      // Check jobs status
      const jobs = await VariantJobDAL.getJobsByProject(projectId);
      const jobsByStatus = jobs.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const completedJobs = jobs.filter(job => job.status === 'COMPLETED' && job.result);
      const runningJobs = jobs.filter(job => job.status === 'RUNNING');
      const pendingJobs = jobs.filter(job => job.status === 'PENDING');
      const failedJobs = jobs.filter(job => job.status === 'FAILED');
      
      console.log(`[CHECK_VARIANTS] Jobs status:`);
      console.log(`[CHECK_VARIANTS] - Total jobs: ${jobs.length}`);
      console.log(`[CHECK_VARIANTS] - Completed: ${completedJobs.length}`);
      console.log(`[CHECK_VARIANTS] - Running: ${runningJobs.length}`);
      console.log(`[CHECK_VARIANTS] - Pending: ${pendingJobs.length}`);
      console.log(`[CHECK_VARIANTS] - Failed: ${failedJobs.length}`);
      
      // Try to load variants from completed jobs
      let variantsFound = 0;
      let loadedVariants: any[] = [];
      let message = '';
      
      if (completedJobs.length > 0) {
        console.log(`[CHECK_VARIANTS] Attempting to load variants from completed jobs...`);
        
        // Try to load variants from specific job IDs first (most precise)
        const currentJobIds = variantStateManager.getCurrentJobIds();
        
        if (currentJobIds && currentJobIds.length > 0) {
          console.log(`[CHECK_VARIANTS] Loading variants from specific job IDs:`, currentJobIds);
          loadedVariants = await variantStateManager.loadVariantsFromJobIds(currentJobIds);
        } else {
          console.log(`[CHECK_VARIANTS] No specific job IDs found, loading from all completed jobs`);
          loadedVariants = await variantStateManager.loadVariantsFromJobs(projectId);
        }
        
        variantsFound = loadedVariants.length;
        
        if (variantsFound > 0) {
          message = `Successfully loaded ${variantsFound} variants from completed jobs. Variants are now available in the state manager.`;
          console.log(`[CHECK_VARIANTS] ${message}`);
        } else if (runningJobs.length > 0) {
          message = `Found ${runningJobs.length} running jobs. Variants are still being generated. Please wait for completion.`;
          console.log(`[CHECK_VARIANTS] ${message}`);
        } else {
          message = `Found ${completedJobs.length} completed jobs but no variants could be extracted. This might indicate an issue with the job results.`;
          console.log(`[CHECK_VARIANTS] ${message}`);
        }
      } else if (runningJobs.length > 0 || pendingJobs.length > 0) {
        message = `Found ${runningJobs.length} running and ${pendingJobs.length} pending jobs. Variants are still being processed. Please wait for completion.`;
        console.log(`[CHECK_VARIANTS] ${message}`);
      } else if (failedJobs.length > 0) {
        message = `Found ${failedJobs.length} failed jobs. No variants were generated successfully.`;
        console.log(`[CHECK_VARIANTS] ${message}`);
      } else {
        message = `No variant jobs found for this project. Please generate variants first using the generate_variants tool.`;
        console.log(`[CHECK_VARIANTS] ${message}`);
      }
      
      console.log(`[CHECK_VARIANTS] ======================================`);
      
      return {
        status: variantsFound > 0 ? 'SUCCESS' : 'NO_VARIANTS',
        message,
        variantsFound,
        variants: loadedVariants,
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
      console.error(`[CHECK_VARIANTS] Failed to check variants:`, error);
      return {
        status: 'ERROR',
        message: `Failed to check variants: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variantsFound: 0,
        variants: [],
        jobsStatus: {}
      };
    }
  }
}

export function checkVariants(projectId: string) {
  const executor = new CheckVariantsExecutor(projectId);

  return tool({
    description: 'Check the current status of variant generation jobs and load completed variants into the state manager',
    inputSchema: checkVariantsSchema,
    execute: async (input) => {
      try {
        const result = await executor.execute(input);
        return result;
      } catch (error) {
        console.error(`[CHECK_VARIANTS] Tool execute failed:`, error);
        throw new Error(error instanceof Error ? error.message : 'Failed to check variants');
      }
    },
  });
}
