// Hypothesis State Manager - manages hypothesis state across tool calls
import { Hypothesis } from '@features/hypotheses_generation/types';
import { extractHypothesisFromHistory, ConversationMessage } from './conversation-state';

class HypothesisStateManager {
  private currentHypothesis: Hypothesis | null = null;
  private hypothesisHistory: Hypothesis[] = [];
  private currentHypothesisUrl: string | null = null; // Track the URL used for hypothesis generation

  /**
   * Set the current hypothesis (from generate_hypotheses tool)
   */
  setCurrentHypothesis(hypothesis: Hypothesis, url?: string): void {
    console.log(`[STATE_MANAGER] Setting hypothesis: "${hypothesis.title}"`);
    this.currentHypothesis = hypothesis;
    this.hypothesisHistory.push(hypothesis);
    if (url) {
      this.currentHypothesisUrl = url;
      console.log(`[STATE_MANAGER] Hypothesis URL set: ${url}`);
    }
    console.log(`[STATE_MANAGER] Hypothesis set: "${hypothesis.title}"`);
    console.log(`[STATE_MANAGER] Current hypothesis count: ${this.hypothesisHistory.length}`);
  }

  /**
   * Get the current hypothesis (for generate_variants and create_experiment tools)
   * Now supports extracting from conversation history as a fallback
   */
  async getCurrentHypothesis(conversationHistory?: ConversationMessage[]): Promise<Hypothesis | null> {
    // First try in-memory state (fast path for same-request calls)
    if (this.currentHypothesis) {
      console.log(`[STATE_MANAGER] Getting current hypothesis from memory: FOUND`);
      return this.currentHypothesis;
    }

    // Fallback to conversation history (for cross-request state)
    if (conversationHistory) {
      console.log(`[STATE_MANAGER] Memory empty, checking conversation history...`);
      const hypothesis = await extractHypothesisFromHistory(conversationHistory);
      if (hypothesis) {
        console.log(`[STATE_MANAGER] Found hypothesis in conversation history: "${hypothesis.title}"`);
        // Cache it in memory for performance
        this.currentHypothesis = hypothesis;
        return hypothesis;
      }
    }

    console.log(`[STATE_MANAGER] Getting current hypothesis: NOT FOUND`);
    return null;
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
   * Get the URL used for the current hypothesis
   */
  getCurrentHypothesisUrl(): string | null {
    return this.currentHypothesisUrl;
  }

  /**
   * Clear the current hypothesis
   */
  clearCurrentHypothesis(): void {
    console.log(`[STATE_MANAGER] Clearing current hypothesis`);
    this.currentHypothesis = null;
    this.currentHypothesisUrl = null;
  }

  /**
   * Clear all hypothesis history
   */
  clearAll(): void {
    console.log(`[STATE_MANAGER] Clearing all hypothesis data`);
    this.currentHypothesis = null;
    this.currentHypothesisUrl = null;
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
