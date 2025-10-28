import {
  AnalyticsEventData,
  AnalyticsQuery,
  ExposureStats,
  FunnelAnalysis,
  ConversionRates,
  PurchaseStats,
  SQSAnalyticsMessage
} from './types';
import { GoalsBreakdownResponse } from './types';

export interface AnalyticsService {
  // Event Management
  createEvent(eventData: Omit<AnalyticsEventData, 'id' | 'createdAt'>): Promise<AnalyticsEventData>;
  createEvents(events: Omit<AnalyticsEventData, 'id' | 'createdAt'>[]): Promise<AnalyticsEventData[]>;

  // Query Methods
  getEvents(query: AnalyticsQuery): Promise<AnalyticsEventData[]>;
  getEventsWithAttribution(query: AnalyticsQuery): Promise<AnalyticsEventData[]>;
  getEventCount(query: AnalyticsQuery): Promise<number>;

  // Analytics Methods
  getExposureStats(projectId: string, experimentId: string): Promise<ExposureStats[]>;
  getFunnelAnalysis(projectId: string, experimentId: string): Promise<FunnelAnalysis>;
  getConversionRates(projectId: string, experimentId: string): Promise<ConversionRates[]>;
  getPurchaseStats(projectId: string, experimentId: string): Promise<PurchaseStats[]>;
  getUserJourney(projectId: string, sessionId: string): Promise<AnalyticsEventData[]>;
  getGoalsBreakdown(projectId: string, experimentId: string): Promise<GoalsBreakdownResponse>;

  // Session Management
  getExperimentSessions(projectId: string, experimentId: string, limit?: number, offset?: number): Promise<{ sessions: { sessionId: string, eventCount: number }[], total: number }>;

  // Event Management - Reset
  resetExperimentEvents(projectId: string, experimentId: string): Promise<{ deletedCount: number }>;

  // SQS Integration
  processSQSEvent(message: SQSAnalyticsMessage): Promise<void>;
  processSQSBatch(messages: SQSAnalyticsMessage[]): Promise<void>;
}

export interface SQSConsumerService {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export interface AnalyticsRepository {
  create(eventData: Omit<AnalyticsEventData, 'id' | 'createdAt'>): Promise<AnalyticsEventData>;
  createMany(events: Omit<AnalyticsEventData, 'id' | 'createdAt'>[]): Promise<AnalyticsEventData[]>;
  findMany(query: AnalyticsQuery): Promise<AnalyticsEventData[]>;
  count(query: AnalyticsQuery): Promise<number>;
  getExposureStats(projectId: string, experimentId: string): Promise<ExposureStats[]>;
  getFunnelAnalysis(projectId: string, experimentId: string): Promise<FunnelAnalysis>;
  getConversionRates(projectId: string, experimentId: string): Promise<ConversionRates[]>;
  getPurchaseStats(projectId: string, experimentId: string): Promise<PurchaseStats[]>;
  getUserJourney(projectId: string, sessionId: string): Promise<AnalyticsEventData[]>;
  getEventsWithAttribution(query: AnalyticsQuery): Promise<AnalyticsEventData[]>;
  getExperimentSessions(projectId: string, experimentId: string, limit?: number, offset?: number): Promise<{ sessions: { sessionId: string, eventCount: number }[], total: number }>;
  deleteExperimentEvents(projectId: string, experimentId: string): Promise<number>;
  getGoalsBreakdown(projectId: string, experimentId: string): Promise<GoalsBreakdownResponse>;
}
