// Experiment State Manager - manages experiment state across tool calls
import { Experiment } from '@infra/dal/types';

class ExperimentStateManager {
  private currentExperiment: Experiment | null = null;
  private experimentHistory: Experiment[] = [];

  /**
   * Set the current experiment (from create_experiment tool)
   */
  setCurrentExperiment(experiment: Experiment): void {
    console.log(`[EXPERIMENT_STATE_MANAGER] Setting experiment: "${experiment.name}" (${experiment.id})`);
    this.currentExperiment = experiment;
    this.experimentHistory.push(experiment);
    console.log(`[EXPERIMENT_STATE_MANAGER] Experiment set: "${experiment.name}"`);
    console.log(`[EXPERIMENT_STATE_MANAGER] Current experiment count: ${this.experimentHistory.length}`);
  }

  /**
   * Get the current experiment (for get_experiment_overview and publish_experiment tools)
   */
  getCurrentExperiment(): Experiment | null {
    console.log(`[EXPERIMENT_STATE_MANAGER] Getting current experiment: ${this.currentExperiment ? 'FOUND' : 'NOT FOUND'}`);
    return this.currentExperiment;
  }

  /**
   * Get the most recent experiment from history
   */
  getLatestExperiment(): Experiment | null {
    return this.experimentHistory.length > 0 
      ? this.experimentHistory[this.experimentHistory.length - 1] 
      : null;
  }

  /**
   * Get current experiment ID
   */
  getCurrentExperimentId(): string | null {
    return this.currentExperiment?.id || null;
  }

  /**
   * Clear the current experiment
   */
  clearCurrentExperiment(): void {
    console.log(`[EXPERIMENT_STATE_MANAGER] Clearing current experiment`);
    this.currentExperiment = null;
  }

  /**
   * Clear all experiment history
   */
  clearAll(): void {
    console.log(`[EXPERIMENT_STATE_MANAGER] Clearing all experiment data`);
    this.currentExperiment = null;
    this.experimentHistory = [];
  }

  /**
   * Get experiment history
   */
  getHistory(): Experiment[] {
    return [...this.experimentHistory];
  }

  /**
   * Check if there's a current experiment
   */
  hasCurrentExperiment(): boolean {
    return this.currentExperiment !== null;
  }
}

// Singleton instance
export const experimentStateManager = new ExperimentStateManager();
