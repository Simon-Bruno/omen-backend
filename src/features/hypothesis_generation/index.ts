import { HypothesisGenerator, DEFAULT_BRAND_ANALYSIS } from './hypothesis-generation';

export { HypothesisGenerator, DEFAULT_BRAND_ANALYSIS };

export function createHypothesisGeneratorService(): HypothesisGenerator {
  return new HypothesisGenerator();
}

export type HypothesisGeneratorService = HypothesisGenerator;
