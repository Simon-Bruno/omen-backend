// @ts-nocheck 
// Main tools file - combines all individual tools
import { createGetProjectInfoTool } from './get-project-info';
import { generateHypotheses } from './generate-hypotheses';
import { generateVariants } from './generate-variants';
import { createExperiment } from './create-experiment';
import { createGetBrandAnalysisTool } from './get-brand-analysis';
import { createGetBrandSourcesTool } from './get-brand-sources';
import { createGetExperimentOverviewTool } from './get-experiment-overview';
import { createPreviewExperimentTool } from './preview-experiment';

// Function to get available tool names
export function getAvailableToolNames(): string[] {
  return ['get_project_info', 'generate_hypotheses', 'generate_variants', 'preview_experiment', 'create_experiment', 'get_brand_analysis', 'get_brand_sources', 'get_experiment_overview'];
}


// Function to get tools configuration for LLM
export function getToolsConfiguration(projectId: string) {
  return {
    tools: createEcommerceAgentTools(projectId),
    availableTools: getAvailableToolNames(),
  };
}

// Create all tools
export function createEcommerceAgentTools(projectId: string) {
  console.log(`[TOOLS_CONFIG] Creating tools for project: ${projectId}`);
  const tools = {
    get_project_info: createGetProjectInfoTool(projectId),
    generate_hypotheses: generateHypotheses(projectId),
    generate_variants: generateVariants(projectId),
    preview_experiment: createPreviewExperimentTool(projectId),
    create_experiment: createExperiment(projectId),
    get_brand_analysis: createGetBrandAnalysisTool(projectId),
    get_brand_sources: createGetBrandSourcesTool(projectId),
    get_experiment_overview: createGetExperimentOverviewTool(),
  };
  console.log(`[TOOLS_CONFIG] Tools created successfully:`, Object.keys(tools));
  return tools;
}