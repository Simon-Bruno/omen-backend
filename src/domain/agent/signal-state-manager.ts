// Signal State Manager - manages signal proposals across tool calls
import type { LLMSignalProposal } from '@features/signal_generation/types';

class SignalStateManager {
  private currentProposal: LLMSignalProposal | null = null;

  /**
   * Set the current signal proposal (from preview_experiment tool)
   */
  setCurrentProposal(proposal: LLMSignalProposal): void {
    console.log(`[SIGNAL_STATE_MANAGER] Setting signal proposal`);
    this.currentProposal = proposal;
    console.log(`[SIGNAL_STATE_MANAGER] Signals:`, {
      primary: proposal.primary?.name,
      mechanisms: proposal.mechanisms?.length || 0,
      guardrails: proposal.guardrails?.length || 0,
    });
  }

  /**
   * Get the current signal proposal (for create_experiment tool)
   */
  getCurrentProposal(): LLMSignalProposal | null {
    console.log(`[SIGNAL_STATE_MANAGER] Getting signal proposal:`, this.currentProposal ? 'FOUND' : 'NOT FOUND');
    return this.currentProposal;
  }

  /**
   * Check if there is a current proposal
   */
  hasCurrentProposal(): boolean {
    return this.currentProposal !== null;
  }

  /**
   * Clear the current proposal
   */
  clearCurrentProposal(): void {
    console.log(`[SIGNAL_STATE_MANAGER] Clearing signal proposal`);
    this.currentProposal = null;
  }

  /**
   * Clear all signal data
   */
  clearAll(): void {
    this.clearCurrentProposal();
  }
}

// Singleton instance
export const signalStateManager = new SignalStateManager();

// Export the class for testing
export { SignalStateManager };

