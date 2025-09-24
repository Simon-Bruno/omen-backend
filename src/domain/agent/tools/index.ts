// Main tools file - combines all individual tools
import { createGetProjectInfoTool } from './get-project-info';
import { generateHypotheses } from './generate-hypotheses';

// Function to get available tool names
export function getAvailableToolNames(): string[] {
  return ['get_project_info', 'generate_hypotheses'];
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
  };
  return tools;
}