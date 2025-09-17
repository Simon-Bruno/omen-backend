// Main tools file - combines all individual tools
import { createGetProjectInfoTool } from './get-project-info';

// Function to get available tool names
export function getAvailableToolNames(): string[] {
  return ['get_project_info'];
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
  return {
    get_project_info: createGetProjectInfoTool(),
  };
}