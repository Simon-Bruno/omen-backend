// Experiment Publisher Service
import { CloudflarePublisher, PublishedExperiment, PublishedVariant } from '@infra/external/cloudflare';
import { prisma } from '@infra/prisma';
import { getContainer } from '@app/container';

export interface ExperimentPublisherService {
  publishExperiment(experimentId: string): Promise<{ success: boolean; error?: string }>;
  unpublishExperiment(experimentId: string, newStatus?: 'DRAFT' | 'PAUSED'): Promise<{ success: boolean; error?: string }>;
}

export class ExperimentPublisherServiceImpl implements ExperimentPublisherService {
  private cloudflarePublisher: CloudflarePublisher;

  constructor(cloudflarePublisher: CloudflarePublisher) {
    this.cloudflarePublisher = cloudflarePublisher;
  }

  async publishExperiment(experimentId: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[EXPERIMENT_PUBLISHER] Starting publish process for experiment: ${experimentId}`);
    
    try {
      // Fetch experiment data from database
      console.log(`[EXPERIMENT_PUBLISHER] Fetching experiment data from database...`);
      const experiment = await prisma.experiment.findUnique({
        where: { id: experimentId },
        include: {
          hypothesis: true,
          traffic: true,
          variants: true,
          goals: true,
        },
      });

      if (!experiment) {
        console.error(`[EXPERIMENT_PUBLISHER] Experiment not found: ${experimentId}`);
        return { success: false, error: 'Experiment not found' };
      }

      // ===== PRE-LAUNCH VALIDATION: Check signals =====
      console.log(`[EXPERIMENT_PUBLISHER] Validating experiment signals...`);
      const container = getContainer();
      const signalService = container.getSignalGenerationOrchestrator();
      const validation = await signalService.validateForPublish(experimentId);

      if (!validation.valid) {
        console.error(`[EXPERIMENT_PUBLISHER] Signal validation failed:`, validation.errors);
        return { success: false, error: validation.errors.join('; ') };
      }

      if (validation.warnings.length > 0) {
        console.warn(`[EXPERIMENT_PUBLISHER] Validation warnings:`, validation.warnings);
      }

      console.log(`[EXPERIMENT_PUBLISHER] ✅ Signal validation passed`);

      console.log(`[EXPERIMENT_PUBLISHER] Found experiment:`, {
        id: experiment.id,
        name: experiment.name,
        status: experiment.status,
        variantCount: experiment.variants.length,
        trafficCount: experiment.traffic.length
      });

      // Can publish DRAFT (new) or PAUSED (resuming) experiments
      if (experiment.status !== 'DRAFT' && experiment.status !== 'PAUSED') {
        console.error(`[EXPERIMENT_PUBLISHER] Experiment ${experimentId} cannot be published from ${experiment.status} status`);
        return { success: false, error: 'Only DRAFT or PAUSED experiments can be published' };
      }

      // Transform database data to published format
      console.log(`[EXPERIMENT_PUBLISHER] Transforming experiment data for Cloudflare...`);
      const publishedExperiment: PublishedExperiment = {
        id: experiment.id,
        projectId: experiment.projectId,
        name: experiment.name,
        status: 'RUNNING', // Published experiments are running
        oec: experiment.oec,
        traffic: this.buildTrafficDistribution(experiment.traffic),
        variants: this.buildVariants(experiment.variants),
        goals: experiment.goals?.map(goal => ({
          name: goal.name,
          type: goal.type as 'conversion' | 'purchase' | 'custom',
          role: (goal as any).role as 'primary' | 'mechanism' | 'guardrail',
          selector: goal.selector,
          eventType: goal.eventType,
          customJs: goal.customJs,
          value: goal.value ? Number(goal.value) : null,
          targetUrls: Array.isArray((goal as any).targetUrls) ? (goal as any).targetUrls : null,
          dataLayerEvent: (goal as any).dataLayerEvent || null,
          valueSelector: goal.valueSelector || null,
          currency: goal.currency || null,
        })),
        targetUrls: this.parseTargetUrls(experiment.targetUrls), // Include URL targeting data
        targeting: (experiment as any).targeting as any | undefined,
      };

      console.log(`[EXPERIMENT_PUBLISHER] Transformed experiment data:`, {
        id: publishedExperiment.id,
        name: publishedExperiment.name,
        status: publishedExperiment.status,
        trafficDistribution: publishedExperiment.traffic,
        variantCount: Object.keys(publishedExperiment.variants).length
      });

      // Publish to Cloudflare
      console.log(`[EXPERIMENT_PUBLISHER] Publishing to Cloudflare...`);
      const result = await this.cloudflarePublisher.publishExperiment(publishedExperiment);

      if (result.success) {
        console.log(`[EXPERIMENT_PUBLISHER] Cloudflare publish successful, updating database status...`);
        // Update experiment status in database
        await prisma.experiment.update({
          where: { id: experimentId },
          data: { 
            status: 'RUNNING',
            publishedAt: new Date(),
          },
        });
        console.log(`[EXPERIMENT_PUBLISHER] Database status updated to RUNNING for experiment: ${experimentId}`);
      } else {
        console.error(`[EXPERIMENT_PUBLISHER] Cloudflare publish failed:`, result.error);
      }

      return { success: result.success, error: result.error };
    } catch (error) {
      console.error(`[EXPERIMENT_PUBLISHER] Failed to publish experiment ${experimentId}:`, error);
      console.error(`[EXPERIMENT_PUBLISHER] Error details:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        experimentId
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async unpublishExperiment(experimentId: string, newStatus?: 'DRAFT' | 'PAUSED'): Promise<{ success: boolean; error?: string }> {
    console.log(`[EXPERIMENT_PUBLISHER] Starting unpublish process for experiment: ${experimentId}`);

    try {
      // Unpublish from Cloudflare
      console.log(`[EXPERIMENT_PUBLISHER] Unpublishing from Cloudflare...`);
      const result = await this.cloudflarePublisher.unpublishExperiment(experimentId);

      if (result.success) {
        console.log(`[EXPERIMENT_PUBLISHER] Cloudflare unpublish successful, updating database status...`);
        // Update experiment status in database (default to DRAFT for backward compatibility)
        const statusToSet = newStatus || 'DRAFT';
        await prisma.experiment.update({
          where: { id: experimentId },
          data: { status: statusToSet },
        });
        console.log(`[EXPERIMENT_PUBLISHER] Database status updated to ${statusToSet} for experiment: ${experimentId}`);
      } else {
        console.error(`[EXPERIMENT_PUBLISHER] Cloudflare unpublish failed:`, result.error);
      }

      return { success: result.success, error: result.error };
    } catch (error) {
      console.error(`[EXPERIMENT_PUBLISHER] Failed to unpublish experiment ${experimentId}:`, error);
      console.error(`[EXPERIMENT_PUBLISHER] Error details:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        experimentId
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private buildTrafficDistribution(traffic: any[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    traffic.forEach(t => {
      distribution[t.variantId] = parseFloat(t.percentage.toString());
    });
    
    // Ensure control variant is included in traffic distribution
    // Control gets traffic allocation but no code storage (implicit control)
    if (!distribution.control) {
      console.warn(`[EXPERIMENT_PUBLISHER] No control variant found in traffic distribution for experiment`);
    }
    
    console.log(`[EXPERIMENT_PUBLISHER] Traffic distribution:`, distribution);
    return distribution;
  }

  private buildVariants(variants: any[]): Record<string, PublishedVariant> {
    const variantMap: Record<string, PublishedVariant> = {};
    variants.forEach(v => {
      variantMap[v.variantId] = {
        selector: v.selector || 'body',
        html: v.html,
        css: v.css || '',
        js: v.js || '', // Always include js field, even if empty
        position: v.position,
      };
    });
    return variantMap;
  }

  private parseTargetUrls(targetUrls: any): string[] | undefined {
    if (!targetUrls) return undefined;
    
    // If it's already an array, return it
    if (Array.isArray(targetUrls)) return targetUrls;
    
    // If it's a string, try to parse it as JSON
    if (typeof targetUrls === 'string') {
      try {
        const parsed = JSON.parse(targetUrls);
        return Array.isArray(parsed) ? parsed : undefined;
      } catch (error) {
        console.warn(`[EXPERIMENT_PUBLISHER] Failed to parse targetUrls JSON: ${targetUrls}`, error);
        return undefined;
      }
    }
    
    return undefined;
  }
}

export function createExperimentPublisherService(cloudflarePublisher: CloudflarePublisher): ExperimentPublisherService {
  return new ExperimentPublisherServiceImpl(cloudflarePublisher);
}
