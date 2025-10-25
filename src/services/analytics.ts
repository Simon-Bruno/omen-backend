import {
  AnalyticsService,
  SQSConsumerService,
  AnalyticsRepository
} from '@domain/analytics/analytics-service';
import {
  AnalyticsEventData,
  AnalyticsQuery,
  ExposureStats,
  FunnelAnalysis,
  ConversionRates,
  PurchaseStats,
  SQSAnalyticsMessage
} from '@domain/analytics/types';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import { ServiceConfig } from '@infra/config/services';

export class AnalyticsServiceImpl implements AnalyticsService {
  constructor(private repository: AnalyticsRepository) {}

  async createEvent(eventData: Omit<AnalyticsEventData, 'id' | 'createdAt'>): Promise<AnalyticsEventData> {
    return this.repository.create(eventData);
  }

  async createEvents(events: Omit<AnalyticsEventData, 'id' | 'createdAt'>[]): Promise<AnalyticsEventData[]> {
    return this.repository.createMany(events);
  }

  async getEvents(query: AnalyticsQuery): Promise<AnalyticsEventData[]> {
    return this.repository.findMany(query);
  }

  async getEventsWithAttribution(query: AnalyticsQuery): Promise<AnalyticsEventData[]> {
    return this.repository.getEventsWithAttribution(query);
  }

  async getEventCount(query: AnalyticsQuery): Promise<number> {
    return this.repository.count(query);
  }

  async getExposureStats(projectId: string, experimentId: string): Promise<ExposureStats[]> {
    return this.repository.getExposureStats(projectId, experimentId);
  }

  async getFunnelAnalysis(projectId: string, experimentId: string): Promise<FunnelAnalysis> {
    return this.repository.getFunnelAnalysis(projectId, experimentId);
  }

  async getConversionRates(projectId: string, experimentId: string): Promise<ConversionRates[]> {
    return this.repository.getConversionRates(projectId, experimentId);
  }

  async getPurchaseStats(projectId: string, experimentId: string): Promise<PurchaseStats[]> {
    return this.repository.getPurchaseStats(projectId, experimentId);
  }

  async getUserJourney(projectId: string, sessionId: string): Promise<AnalyticsEventData[]> {
    return this.repository.getUserJourney(projectId, sessionId);
  }

  async getExperimentSessions(projectId: string, experimentId: string, limit?: number, offset?: number): Promise<{ sessions: { sessionId: string, eventCount: number }[], total: number }> {
    return this.repository.getExperimentSessions(projectId, experimentId, limit, offset);
  }

  async resetExperimentEvents(projectId: string, experimentId: string): Promise<{ deletedCount: number }> {
    const deletedCount = await this.repository.deleteExperimentEvents(projectId, experimentId);
    return { deletedCount };
  }

  async processSQSEvent(message: SQSAnalyticsMessage): Promise<void> {
    try {
      await this.createEvent({
        projectId: message.projectId,
        eventType: message.eventType,
        sessionId: message.sessionId,
        properties: message.properties,
        assignedVariants: message.assignedVariants,
        url: message.url,
        userAgent: message.userAgent,
        timestamp: message.timestamp,
      });
    } catch (error) {
      console.error('Failed to process SQS event:', error);
      throw error;
    }
  }

  async processSQSBatch(messages: SQSAnalyticsMessage[]): Promise<void> {
    try {
      console.log(`[ANALYTICS] Processing ${messages.length} SQS messages`);
      
      const events = messages.map(message => ({
        projectId: message.projectId,
        eventType: message.eventType,
        sessionId: message.sessionId,
        properties: message.properties,
        assignedVariants: message.assignedVariants,
        url: message.url,
        userAgent: message.userAgent,
        timestamp: message.timestamp,
      }));
      
      const createdEvents = await this.createEvents(events);
      console.log(`[ANALYTICS] Successfully created ${createdEvents.length} analytics events`);
      
    } catch (error) {
      console.error('Failed to process SQS batch:', error);
      throw error;
    }
  }
}

export class SQSConsumerServiceImpl implements SQSConsumerService {
  private isRunningFlag = false;
  private pollInterval: any = null;
  private sqsClient: SQSClient;
  private analyticsService: AnalyticsService;
  private isProcessing = false; // Backpressure flag

  constructor(
    private config: ServiceConfig['sqs'],
    analyticsService: AnalyticsService
  ) {
    // Create custom HTTPS agent with optimized socket pool for memory efficiency
    const agent = new https.Agent({
      maxSockets: 5, // Reduced from 25 - sufficient for single SQS queue polling pattern
      keepAlive: true,
      maxFreeSockets: 2, // Reduced from 5 - only keep 2 idle connections
      timeout: 60000, // Socket timeout: 60 seconds
    });

    this.sqsClient = new SQSClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      requestHandler: new NodeHttpHandler({
        httpsAgent: agent,
        connectionTimeout: 3000,
        requestTimeout: 10000,
        socketAcquisitionWarningTimeout: 3000, // Warn if waiting >3s for socket
      }),
      maxAttempts: 2, // Reduce retries to prevent queue buildup
    });
    this.analyticsService = analyticsService;
  }

  async start(): Promise<void> {
    if (this.isRunningFlag) {
      console.log('SQS Consumer is already running');
      return;
    }

    this.isRunningFlag = true;
    console.log('Starting SQS Consumer...');

    this.pollInterval = (global as any).setInterval(async () => {
      await this.pollMessages();
    }, this.config.pollInterval);

    console.log('SQS Consumer started');
  }

  async stop(): Promise<void> {
    if (!this.isRunningFlag) {
      console.log('SQS Consumer is not running');
      return;
    }

    this.isRunningFlag = false;
    
    if (this.pollInterval) {
      (global as any).clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    console.log('SQS Consumer stopped');
  }

  isRunning(): boolean {
    return this.isRunningFlag;
  }

  private async pollMessages(): Promise<void> {
    // Skip polling if already processing (backpressure)
    // This is normal with long polling (WaitTimeSeconds: 5)
    if (this.isProcessing) {
      return;
    }

    const startTime = Date.now();

    // Set a timeout to force-reset if something hangs
    const timeoutId = setTimeout(() => {
      console.error('[SQS] TIMEOUT! Poll took longer than 60 seconds - force resetting');
      this.isProcessing = false;
    }, 60000); // 60 second timeout

    try {
      this.isProcessing = true;

      const command = new ReceiveMessageCommand({
        QueueUrl: this.config.queueUrl,
        MaxNumberOfMessages: this.config.batchSize,
        VisibilityTimeout: this.config.visibilityTimeout,
        WaitTimeSeconds: 5, // Long polling
      });

      const response = await this.sqsClient.send(command);

      if (!response.Messages || response.Messages.length === 0) {
        // Queue is empty - no need to log every time
        return;
      }

      console.log(`[SQS] Received ${response.Messages.length} messages from queue`);

      // Process messages in batch
      const messages: SQSAnalyticsMessage[] = [];
      const receiptHandles: string[] = [];
      const malformedMessages: any[] = [];

      for (const message of response.Messages) {
        try {
          const rawMessage = JSON.parse(message.Body || '{}');

          // Validate that this looks like an analytics message
          if (this.isValidAnalyticsMessage(rawMessage)) {
            const analyticsMessage: SQSAnalyticsMessage = rawMessage;
            messages.push(analyticsMessage);
            receiptHandles.push(message.ReceiptHandle || '');
          } else {
            // Log malformed message for debugging
            console.log('[SQS] Skipping malformed message:', {
              messageId: message.MessageId,
              body: rawMessage,
              reason: 'Invalid analytics message format'
            });
            malformedMessages.push({
              messageId: message.MessageId,
              body: rawMessage,
              timestamp: new Date().toISOString()
            });
            // Delete malformed messages
            if (message.ReceiptHandle) {
              await this.deleteMessage(message.ReceiptHandle);
            }
          }
        } catch (error) {
          console.error('[SQS] Failed to parse message:', error);
          console.log('[SQS] Raw message body:', message.Body);
          // Delete malformed messages
          if (message.ReceiptHandle) {
            await this.deleteMessage(message.ReceiptHandle);
          }
        }
      }

      if (malformedMessages.length > 0) {
        console.log(`[SQS] Filtered out ${malformedMessages.length} malformed messages`);
      }

      if (messages.length > 0) {
        const processingStart = Date.now();
        await this.analyticsService.processSQSBatch(messages);
        console.log(`[SQS] Batch processing took ${Date.now() - processingStart}ms`);

        // Delete successfully processed messages
        const deleteStart = Date.now();
        for (const receiptHandle of receiptHandles) {
          await this.deleteMessage(receiptHandle);
        }
        console.log(`[SQS] Deletion took ${Date.now() - deleteStart}ms`);
      } else {
        console.log('[SQS] No valid messages to process');
      }

      const totalTime = Date.now() - startTime;
      console.log(`[SQS] Poll completed in ${totalTime}ms`);
    } catch (error) {
      console.error('[SQS] Error polling SQS messages:', error);
      const totalTime = Date.now() - startTime;
      console.error(`[SQS] Poll failed after ${totalTime}ms`);
    } finally {
      // Clear the timeout and reset processing flag
      clearTimeout(timeoutId);
      this.isProcessing = false;
    }
  }

  private isValidAnalyticsMessage(message: any): boolean {
    // Check if the message has the required fields for analytics
    return (
      message &&
      typeof message.projectId === 'string' &&
      typeof message.eventType === 'string' &&
      typeof message.sessionId === 'string' &&
      typeof message.timestamp === 'number' &&
      message.properties &&
      typeof message.properties === 'object' &&
      // Validate eventType is one of our supported types
      ['EXPOSURE', 'PAGEVIEW', 'CONVERSION', 'PURCHASE', 'CUSTOM'].includes(message.eventType) &&
      // assignedVariants is optional but if present should be an array
      (message.assignedVariants === undefined || Array.isArray(message.assignedVariants))
    );
  }

  private async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.config.queueUrl,
        ReceiptHandle: receiptHandle,
      });
      await this.sqsClient.send(command);
    } catch (error) {
      console.error('Failed to delete SQS message:', error);
    }
  }

}

export function createAnalyticsService(repository: AnalyticsRepository): AnalyticsService {
  return new AnalyticsServiceImpl(repository);
}

// Export the interfaces for use in handlers and other services
export type { AnalyticsService, SQSConsumerService } from '@domain/analytics/analytics-service';

export function createSQSConsumerService(
  config: ServiceConfig['sqs'],
  analyticsService: AnalyticsService
): SQSConsumerService {
  return new SQSConsumerServiceImpl(config, analyticsService);
}
