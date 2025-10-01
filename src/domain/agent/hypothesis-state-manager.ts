// Hypothesis State Manager - manages hypothesis state across tool calls
import { Hypothesis } from '@features/hypotheses_generation/types';

class HypothesisStateManager {
  private currentHypothesis: Hypothesis | null = null;
  private hypothesisHistory: Hypothesis[] = [];

  /**
   * Set the current hypothesis (from generate_hypotheses tool)
   */
  setCurrentHypothesis(hypothesis: Hypothesis): void {
    console.log(`[STATE_MANAGER] Setting hypothesis: "${hypothesis.title}"`);
    this.currentHypothesis = hypothesis;
    this.hypothesisHistory.push(hypothesis);
    console.log(`[STATE_MANAGER] Hypothesis set: "${hypothesis.title}"`);
    console.log(`[STATE_MANAGER] Current hypothesis count: ${this.hypothesisHistory.length}`);
  }

  /**
   * Get the current hypothesis (for generate_variants and create_experiment tools)
   */
  getCurrentHypothesis(): Hypothesis | null {
    console.log(`[STATE_MANAGER] Getting current hypothesis: ${this.currentHypothesis ? 'FOUND' : 'NOT FOUND'}`);
    return this.currentHypothesis;
  }

  /**
   * Get the most recent hypothesis from history
   */
  getLatestHypothesis(): Hypothesis | null {
    return this.hypothesisHistory.length > 0 
      ? this.hypothesisHistory[this.hypothesisHistory.length - 1] 
      : null;
  }

  /**
   * Clear the current hypothesis
   */
  clearCurrentHypothesis(): void {
    console.log(`[STATE_MANAGER] Clearing current hypothesis`);
    this.currentHypothesis = null;
  }

  /**
   * Clear all hypothesis history
   */
  clearAll(): void {
    console.log(`[STATE_MANAGER] Clearing all hypothesis data`);
    this.currentHypothesis = null;
    this.hypothesisHistory = [];
  }

  /**
   * Get hypothesis history
   */
  getHistory(): Hypothesis[] {
    return [...this.hypothesisHistory];
  }

  /**
   * Check if there's a current hypothesis
   */
  hasCurrentHypothesis(): boolean {
    return this.currentHypothesis !== null;
  }
}

// Singleton instance
export const hypothesisStateManager = new HypothesisStateManager();

// Export the class for testing
export { HypothesisStateManager };
