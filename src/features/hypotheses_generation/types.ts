// Types for hypotheses generation
export interface Hypothesis {
  title: string;
  description: string;
  primary_outcome: string;
  current_problem: string;
  why_it_works: Array<{
    reason: string;
  }>;
  baseline_performance: number;
  predicted_lift_range: {
    min: number;
    max: number;
  };
}
