// Agent Tools - Function definitions and implementations
import type { ProjectInfo } from './types';

export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      required?: boolean;
      items?: {
        type: string;
      };
    }>;
    required: string[];
  };
}

export interface ToolCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface AgentToolsService {
  getAvailableTools(): AgentTool[];
  executeTool(toolName: string, args: Record<string, unknown>, projectId: string): Promise<ToolCallResult>;
}

// Tool definitions
export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'get_project_info',
    description: 'Get detailed information about the current project including Shopify store details and experiment statistics',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_experiments',
    description: 'List all experiments for the current project with their status and details',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter experiments by status (DRAFT, RUNNING, PAUSED, FINISHED)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of experiments to return (default: 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'create_experiment',
    description: 'Create a new A/B test experiment for the project',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the experiment',
        },
        description: {
          type: 'string',
          description: 'Description of what the experiment tests',
        },
        page_url: {
          type: 'string',
          description: 'URL of the page to run the experiment on',
        },
        element_selector: {
          type: 'string',
          description: 'CSS selector for the element to modify',
        },
        variant_changes: {
          type: 'string',
          description: 'JSON string describing the changes for the variant',
        },
      },
      required: ['name', 'description', 'page_url', 'element_selector', 'variant_changes'],
    },
  },
  {
    name: 'generate_hypotheses',
    description: 'Generate testable hypotheses and experiment suggestions based on brand analysis and page analysis',
    parameters: {
      type: 'object',
      properties: {
        focus_area: {
          type: 'string',
          description: 'Focus area for hypothesis generation (conversion, engagement, trust, navigation, cta)',
        },
        include_brand_analysis: {
          type: 'boolean',
          description: 'Whether to include brand analysis in hypothesis generation',
        },
        analyze_pages: {
          type: 'boolean',
          description: 'Whether to analyze home page and product pages',
        },
      },
      required: [],
    },
  },
  {
    name: 'run_diagnostics',
    description: 'Run store diagnostics to analyze performance and identify optimization opportunities',
    parameters: {
      type: 'object',
      properties: {
        pages: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Array of page URLs to analyze (optional, defaults to key pages)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_experiment_results',
    description: 'Get results and metrics for a specific experiment',
    parameters: {
      type: 'object',
      properties: {
        experiment_id: {
          type: 'string',
          description: 'ID of the experiment to get results for',
        },
      },
      required: ['experiment_id'],
    },
  },
];

export class AgentToolsServiceImpl implements AgentToolsService {
  constructor(
    private getProjectInfo: (projectId: string) => Promise<ProjectInfo>,
    private getExperiments: (projectId: string, filters?: unknown) => Promise<unknown[]>,
    private createExperiment: (projectId: string, data: unknown) => Promise<unknown>,
    private runDiagnostics: (projectId: string, options?: unknown) => Promise<unknown>,
    private getExperimentResults: (experimentId: string) => Promise<unknown>
  ) {}

  getAvailableTools(): AgentTool[] {
    return AGENT_TOOLS;
  }

  async executeTool(toolName: string, args: Record<string, unknown>, projectId: string): Promise<ToolCallResult> {
    try {
      switch (toolName) {
        case 'get_project_info':
          return await this.handleGetProjectInfo(args, projectId);
        case 'list_experiments':
          return await this.handleListExperiments(args, projectId);
        case 'create_experiment':
          return await this.handleCreateExperiment(args, projectId);
        case 'run_diagnostics':
          return await this.handleRunDiagnostics(args, projectId);
        case 'get_experiment_results':
          return await this.handleGetExperimentResults(args, projectId);
        case 'generate_hypotheses':
          return await this.handleGenerateHypotheses(args, projectId);
        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private async handleGetProjectInfo(args: Record<string, unknown>, projectId: string): Promise<ToolCallResult> {
    try {
      const projectInfo = await this.getProjectInfo(projectId);
      return {
        success: true,
        data: projectInfo,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch project information',
      };
    }
  }

  private async handleListExperiments(args: Record<string, unknown>, projectId: string): Promise<ToolCallResult> {
    return {
      success: true,
      data: {
        message: 'List experiments tool called - implementation needed with project context',
        args,
        projectId,
      },
    };
  }

  private async handleCreateExperiment(args: Record<string, unknown>, projectId: string): Promise<ToolCallResult> {
    return {
      success: true,
      data: {
        message: 'Create experiment tool called - implementation needed with project context',
        args,
        projectId,
      },
    };
  }

  private async handleRunDiagnostics(args: Record<string, unknown>, projectId: string): Promise<ToolCallResult> {
    return {
      success: true,
      data: {
        message: 'Run diagnostics tool called - implementation needed with project context',
        args,
        projectId,
      },
    };
  }

  private async handleGetExperimentResults(args: Record<string, unknown>, projectId: string): Promise<ToolCallResult> {
    return {
      success: true,
      data: {
        message: 'Get experiment results tool called - implementation needed with project context',
        args,
        projectId,
      },
    };
  }

  private async handleGenerateHypotheses(args: Record<string, unknown>, projectId: string): Promise<ToolCallResult> {
    return {
      success: true,
      data: {
        message: 'Generate hypotheses tool called - implementation needed with project context',
        args,
        projectId,
        note: 'This will integrate with the hypothesis generation service to analyze brand and pages',
      },
    };
  }
}

export function createAgentToolsService(
  getProjectInfo: (projectId: string) => Promise<ProjectInfo>,
  getExperiments: (projectId: string, filters?: unknown) => Promise<unknown[]>,
  createExperiment: (projectId: string, data: unknown) => Promise<unknown>,
  runDiagnostics: (projectId: string, options?: unknown) => Promise<unknown>,
  getExperimentResults: (experimentId: string) => Promise<unknown>
): AgentToolsService {
  return new AgentToolsServiceImpl(
    getProjectInfo,
    getExperiments,
    createExperiment,
    runDiagnostics,
    getExperimentResults
  );
}
