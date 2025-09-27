// Variant State Manager - manages variant state across tool calls
import { Variant } from '@features/variant_generation/types';

class VariantStateManager {
  private currentVariants: Variant[] | null = null;
  private variantHistory: Variant[][] = [];

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
   * Clear all variant history
   */
  clearAll(): void {
    console.log(`[STATE_MANAGER] Clearing all variant data`);
    this.currentVariants = null;
    this.variantHistory = [];
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
}

// Singleton instance
export const variantStateManager = new VariantStateManager();

// Export the class for testing
export { VariantStateManager };
