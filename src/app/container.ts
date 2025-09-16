// Service Container for Dependency Injection
import { createPlaywrightCrawler, type CrawlerService } from '@features/crawler';
import { createBrandAnalysisService, type BrandAnalysisService } from '@domain/analytics/brand-analysis';
import { createDiagnosticsService, type DiagnosticsService } from '@domain/analytics/diagnostics';
import { createAgentService, type AgentService } from '@domain/agent';
import { createOpenAIService, createOpenAIProvider, type LLMService } from '@features/llm';
import { getServiceConfig } from '@infra/config/services';

class ServiceContainer {
  private services: Map<string, any> = new Map();
  private config = getServiceConfig();

  getLLMService(): LLMService {
    if (!this.services.has('llm')) {
      const llmService = createOpenAIService(this.config.openai);
      this.services.set('llm', llmService);
    }
    return this.services.get('llm');
  }

  getCrawlerService(): CrawlerService {
    if (!this.services.has('crawler')) {
      const crawlerService = createPlaywrightCrawler(this.config.crawler);
      this.services.set('crawler', crawlerService);
    }
    return this.services.get('crawler');
  }

  getBrandAnalysisService(): BrandAnalysisService {
    if (!this.services.has('brandAnalysis')) {
      const llm = this.getLLMService();
      const crawler = this.getCrawlerService();
      const brandAnalysisService = createBrandAnalysisService(crawler, llm);
      this.services.set('brandAnalysis', brandAnalysisService);
    }
    return this.services.get('brandAnalysis');
  }

  getDiagnosticsService(): DiagnosticsService {
    if (!this.services.has('diagnostics')) {
      const brandAnalysis = this.getBrandAnalysisService();
      const diagnosticsService = createDiagnosticsService(brandAnalysis);
      this.services.set('diagnostics', diagnosticsService);
    }
    return this.services.get('diagnostics');
  }

  getAgentService(): AgentService {
    if (!this.services.has('agent')) {
      const llmProvider = createOpenAIProvider(this.config.openai);
      const agentService = createAgentService(llmProvider, {
        systemPrompt: `You are a specialized e-commerce optimization assistant. Your role is to help users improve their online stores through data-driven analysis and experimentation.

CORE RESPONSIBILITIES:
- Analyze store performance and identify optimization opportunities
- Help create and manage A/B tests and experiments
- Provide insights based on real store data
- Guide users through the optimization process

AVAILABLE TOOLS:
- get_project_info: Get detailed project and store information
- list_experiments: List all experiments with their status
- create_experiment: Create new A/B test experiments
- generate_hypotheses: Generate testable hypotheses and experiment suggestions based on brand and page analysis
- run_diagnostics: Analyze store performance and issues
- get_experiment_results: Get results and metrics for experiments

BEHAVIOR RULES:
1. ALWAYS use the available tools to get real, up-to-date data before responding
2. Base your advice on actual store data, not assumptions
3. If asked about topics unrelated to e-commerce optimization, politely redirect: "I'm specialized in e-commerce optimization. I can help you with store analysis, experiments, or optimization questions instead. What would you like to work on?"
4. When users ask general questions about their store, use get_project_info to get current data first
5. Be specific and actionable in your recommendations
6. Always explain what data you're using to make your suggestions
7. NEVER provide generic advice without using tools first - you MUST call a tool to get real data

EXPERIMENT CREATION FLOW:
- When users want to create experiments, you MUST use the generate_hypotheses tool first to analyze their store and suggest testable hypotheses
- The hypothesis generation will analyze their brand, home page, and product pages to suggest specific experiments
- After generating hypotheses, help them create specific experiments using the create_experiment tool
- Always explain the reasoning behind each suggested experiment
- NEVER suggest experiment areas without first using generate_hypotheses to get data-driven suggestions

Remember: You are a data-driven assistant. Use tools to get real information, then provide insights based on that data.`,
        maxContextMessages: 20,
        enableToolCalls: true,
        enableWelcomeFlow: true,
      });
      this.services.set('agent', agentService);
    }
    return this.services.get('agent');
  }


  async cleanup(): Promise<void> {
    // Cleanup any services that need it
    const crawler = this.services.get('crawler');
    if (crawler && typeof crawler.close === 'function') {
      await crawler.close();
    }
    this.services.clear();
  }
}

// Singleton instance
export const serviceContainer = new ServiceContainer();
