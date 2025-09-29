// Variant State Manager - manages variant state across tool calls
import { Variant } from '@features/variant_generation/types';
import { VariantJobDAL } from '@infra/dal';

class VariantStateManager {
  private currentVariants: Variant[] | null = null;
  private variantHistory: Variant[][] = [];
  private currentJobIds: string[] | null = null;

  /**
   * Set the current variants (from generate_variants tool)
   */
  setCurrentVariants(variants: Variant[]): void {
    console.log(`[STATE_MANAGER] ===== SETTING VARIANTS =====`);
    console.log(`[STATE_MANAGER] Input variants type:`, typeof variants);
    console.log(`[STATE_MANAGER] Input variants length:`, variants ? variants.length : 'null/undefined');
    console.log(`[STATE_MANAGER] Input variants:`, JSON.stringify(variants.map(v => ({ 
      label: v.variant_label, 
      description: v.description.substring(0, 50) + '...' 
    })), null, 2));
    this.currentVariants = variants;
    this.variantHistory.push(variants);
    console.log(`[STATE_MANAGER] Variants set: ${variants.length} variants`);
    console.log(`[STATE_MANAGER] Current variant set count: ${this.variantHistory.length}`);
    console.log(`[STATE_MANAGER] ================================`);
  }

  /**
   * Set the current job IDs (from generate_variants tool)
   */
  setCurrentJobIds(jobIds: string[]): void {
    console.log(`[STATE_MANAGER] ===== SETTING JOB IDS =====`);
    console.log(`[STATE_MANAGER] Job IDs:`, jobIds);
    this.currentJobIds = jobIds;
    console.log(`[STATE_MANAGER] ==========================`);
  }

  /**
   * Get the current job IDs
   */
  getCurrentJobIds(): string[] | null {
    console.log(`[STATE_MANAGER] ===== GETTING JOB IDS =====`);
    console.log(`[STATE_MANAGER] Current job IDs:`, this.currentJobIds);
    console.log(`[STATE_MANAGER] ===========================`);
    return this.currentJobIds;
  }

  /**
   * Get the current variants (for create_experiment tool)
   */
  getCurrentVariants(): Variant[] | null {
    console.log(`[STATE_MANAGER] ===== GETTING VARIANTS =====`);
    console.log(`[STATE_MANAGER] Current variants: ${this.currentVariants ? `${this.currentVariants.length} variants FOUND` : 'NOT FOUND'}`);
    if (this.currentVariants) {
      console.log(`[STATE_MANAGER] Variant labels:`, this.currentVariants.map(v => v.variant_label));
    }
    console.log(`[STATE_MANAGER] ==============================`);
    return this.currentVariants;
  }

  /**
   * Get the most recent variants from history
   */
  getLatestVariants(): Variant[] | null {
    return this.variantHistory.length > 0 
      ? this.variantHistory[this.variantHistory.length - 1] 
      : null;
  }

  /**
   * Clear the current variants
   */
  clearCurrentVariants(): void {
    console.log(`[STATE_MANAGER] Clearing current variants`);
    this.currentVariants = null;
  }

  /**
   * Clear the current job IDs
   */
  clearCurrentJobIds(): void {
    console.log(`[STATE_MANAGER] Clearing current job IDs`);
    this.currentJobIds = null;
  }

  /**
   * Clear all variant history
   */
  clearAll(): void {
    console.log(`[STATE_MANAGER] Clearing all variant data`);
    this.currentVariants = null;
    this.variantHistory = [];
    this.currentJobIds = null;
  }

  /**
   * Get variant history
   */
  getHistory(): Variant[][] {
    return [...this.variantHistory];
  }

  /**
   * Check if there are current variants
   */
  hasCurrentVariants(): boolean {
    return this.currentVariants !== null && this.currentVariants.length > 0;
  }

  /**
   * Get the number of current variants
   */
  getCurrentVariantCount(): number {
    return this.currentVariants ? this.currentVariants.length : 0;
  }

  /**
   * Retrieve completed variants from specific job IDs and populate state manager
   */
  async loadVariantsFromJobIds(jobIds: string[]): Promise<Variant[]> {
    console.log(`[STATE_MANAGER] ===== LOADING VARIANTS FROM SPECIFIC JOBS =====`);
    console.log(`[STATE_MANAGER] Job IDs:`, jobIds);
    
    try {
      const variants: Variant[] = [];
      const completedJobIds: string[] = [];
      
      for (const jobId of jobIds) {
        try {
          const job = await VariantJobDAL.getJobById(jobId);
          if (!job) {
            console.log(`[STATE_MANAGER] Job ${jobId} not found`);
            continue;
          }
          
          if (job.status === 'COMPLETED' && job.result) {
            if (job.result.variantsSchema && job.result.variantsSchema.variants) {
              const jobVariants = job.result.variantsSchema.variants;
              console.log(`[STATE_MANAGER] Job ${jobId} has ${jobVariants.length} variants`);
              variants.push(...jobVariants);
              completedJobIds.push(jobId);
            } else {
              console.log(`[STATE_MANAGER] Job ${jobId} completed but has no variants in result`);
            }
          } else {
            console.log(`[STATE_MANAGER] Job ${jobId} status: ${job.status}, has result: ${!!job.result}`);
          }
        } catch (error) {
          console.error(`[STATE_MANAGER] Error loading job ${jobId}:`, error);
        }
      }

      console.log(`[STATE_MANAGER] Extracted ${variants.length} variants from ${completedJobIds.length}/${jobIds.length} completed jobs`);
      
      if (variants.length > 0) {
        // Set the variants in the state manager
        this.setCurrentVariants(variants);
        console.log(`[STATE_MANAGER] Successfully loaded ${variants.length} variants into state manager`);
      }

      console.log(`[STATE_MANAGER] ================================================`);
      return variants;
    } catch (error) {
      console.error(`[STATE_MANAGER] Failed to load variants from job IDs:`, error);
      return [];
    }
  }

  /**
   * Retrieve completed variants from jobs for a project and populate state manager
   * @deprecated Use loadVariantsFromJobIds for more precise control
   */
  async loadVariantsFromJobs(projectId: string): Promise<Variant[]> {
    console.log(`[STATE_MANAGER] ===== LOADING VARIANTS FROM ALL PROJECT JOBS =====`);
    console.log(`[STATE_MANAGER] Project ID: ${projectId}`);
    
    try {
      // Get all completed jobs for this project
      const jobs = await VariantJobDAL.getJobsByProject(projectId);
      const completedJobs = jobs.filter(job => job.status === 'COMPLETED' && job.result);
      
      console.log(`[STATE_MANAGER] Found ${jobs.length} total jobs, ${completedJobs.length} completed`);
      
      if (completedJobs.length === 0) {
        console.log(`[STATE_MANAGER] No completed variant jobs found`);
        return [];
      }

      // Extract variants from completed jobs
      const variants: Variant[] = [];
      for (const job of completedJobs) {
        try {
          if (job.result && job.result.variantsSchema && job.result.variantsSchema.variants) {
            const jobVariants = job.result.variantsSchema.variants;
            console.log(`[STATE_MANAGER] Job ${job.id} has ${jobVariants.length} variants`);
            variants.push(...jobVariants);
          }
        } catch (error) {
          console.error(`[STATE_MANAGER] Error extracting variants from job ${job.id}:`, error);
        }
      }

      console.log(`[STATE_MANAGER] Extracted ${variants.length} total variants from jobs`);
      
      if (variants.length > 0) {
        // Set the variants in the state manager
        this.setCurrentVariants(variants);
        console.log(`[STATE_MANAGER] Successfully loaded ${variants.length} variants into state manager`);
      }

      console.log(`[STATE_MANAGER] ==========================================`);
      return variants;
    } catch (error) {
      console.error(`[STATE_MANAGER] Failed to load variants from jobs:`, error);
      return [];
    }
  }

  /**
   * Check if there are completed variant jobs for a project
   */
  async hasCompletedJobs(projectId: string): Promise<boolean> {
    try {
      const jobs = await VariantJobDAL.getJobsByProject(projectId);
      return jobs.some(job => job.status === 'COMPLETED' && job.result);
    } catch (error) {
      console.error(`[STATE_MANAGER] Error checking completed jobs:`, error);
      return false;
    }
  }
}

// Singleton instance
export const variantStateManager = new VariantStateManager();

// Export the class for testing
export { VariantStateManager };
