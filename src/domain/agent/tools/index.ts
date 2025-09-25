// Main tools file - combines all individual tools
import { createGetProjectInfoTool } from './get-project-info';
import { generateHypotheses } from './generate-hypotheses';
import { generateVariants } from './generate-variants';
import { createExperiment } from './create-experiment';
import { createGetBrandAnalysisTool } from './get-brand-analysis';

// Function to get available tool names
export function getAvailableToolNames(): string[] {
  return ['get_project_info', 'generate_hypotheses', 'generate_variants', 'create_experiment', 'get_brand_analysis'];
}

// Function to get tools configuration for LLM
export function getToolsConfiguration() {
  return {
    tools: createEcommerceAgentTools(),
    availableTools: getAvailableToolNames(),
  };
}

// Create all tools
export function createEcommerceAgentTools() {
  const tools = {
    get_project_info: createGetProjectInfoTool(),
    generate_hypotheses: generateHypotheses(),
    generate_variants: generateVariants(),
    create_experiment: createExperiment(),
    get_brand_analysis: createGetBrandAnalysisTool(),
  };
  return tools;
}