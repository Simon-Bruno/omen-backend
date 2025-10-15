/**
 * Hypothesis Template System
 * Modular, extensible framework for generating page-specific hypotheses
 */

export * from './base';
export * from './pdp-templates';
export * from './collection-templates';
export * from './home-templates';
export * from './strategy-factory';

import { HypothesisStrategyFactory } from './strategy-factory';

// Create and export a singleton instance
let strategyFactoryInstance: HypothesisStrategyFactory | null = null;

/**
 * Get the singleton instance of the hypothesis strategy factory
 */
export function getHypothesisStrategyFactory(): HypothesisStrategyFactory {
  if (!strategyFactoryInstance) {
    strategyFactoryInstance = new HypothesisStrategyFactory();
  }
  return strategyFactoryInstance;
}

/**
 * Reset the strategy factory (useful for testing)
 */
export function resetHypothesisStrategyFactory(): void {
  strategyFactoryInstance = null;
}