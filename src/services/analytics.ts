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
  SQSAnalyticsMessage 
} from '@domain/analytics/types';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
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

  async getUserJourney(projectId: string, sessionId: string): Promise<AnalyticsEventData[]> {
    return this.repository.getUserJourney(projectId, sessionId);
  }

  async getExperimentSessions(projectId: string, experimentId: string, limit?: number, offset?: number): Promise<{ sessions: { sessionId: string, eventCount: number }[], total: number }> {
    return this.repository.getExperimentSessions(projectId, experimentId, limit, offset);
  }

  async processSQSEvent(message: SQSAnalyticsMessage): Promise<void> {
    try {
      await this.createEvent({
        projectId: message.projectId,
        experimentId: message.experimentId,
        eventType: message.eventType,
        sessionId: message.sessionId,
        viewId: message.viewId,
        properties: message.properties,
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
        experimentId: message.experimentId,
        eventType: message.eventType,
        sessionId: message.sessionId,
        viewId: message.viewId,
        properties: message.properties,
        timestamp: message.timestamp,
      }));
      
      const createdEvents = await this.createEvents(events);
      console.log(`[ANALYTICS] Successfully created ${createdEvents.length} analytics events`);
      
    } catch (error) {
      console.error('Failed to process SQS batch:', error);
      
      // Don't throw error to prevent SQS message from being reprocessed indefinitely
      // The analytics repository now handles invalid experiment IDs gracefully
      if (error instanceof Error && error.message.includes('Foreign key constraint')) {
        console.warn('[ANALYTICS] Foreign key constraint error - some events may have been filtered out');
        return; // Continue processing other batches
      }
      
      // For other errors, still throw to trigger retry mechanism
      throw error;
    }
  }
}

export class SQSConsumerServiceImpl implements SQSConsumerService {
  private isRunningFlag = false;
  private pollInterval: any = null;
  private sqsClient: SQSClient;
  private analyticsService: AnalyticsService;

  constructor(
    private config: ServiceConfig['sqs'],
    analyticsService: AnalyticsService
  ) {
    this.sqsClient = new SQSClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
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
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.config.queueUrl,
        MaxNumberOfMessages: this.config.batchSize,
        VisibilityTimeout: this.config.visibilityTimeout,
        WaitTimeSeconds: 5, // Long polling
      });

      const response = await this.sqsClient.send(command);

      if (!response.Messages || response.Messages.length === 0) {
        return;
      }

      console.log(`Received ${response.Messages.length} messages from SQS`);

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
            console.log('Skipping malformed SQS message:', {
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
          console.error('Failed to parse SQS message:', error);
          console.log('Raw message body:', message.Body);
          // Delete malformed messages
          if (message.ReceiptHandle) {
            await this.deleteMessage(message.ReceiptHandle);
          }
        }
      }

      if (messages.length > 0) {
        await this.analyticsService.processSQSBatch(messages);
        
        // Delete successfully processed messages
        for (const receiptHandle of receiptHandles) {
          await this.deleteMessage(receiptHandle);
        }
      }
    } catch (error) {
      console.error('Error polling SQS messages:', error);
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
      ['EXPOSURE', 'PAGEVIEW', 'CONVERSION', 'CUSTOM'].includes(message.eventType)
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
