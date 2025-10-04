// Analytics Event Types
export type AnalyticsEventType = 
  | 'exposure'
  | 'conversion'
  | 'page_view'
  | 'revenue'
  | 'click'
  | 'scroll'
  | 'form_submit'
  | 'custom';

export interface AnalyticsEventData {
  id: string;
  projectId: string;
  experimentId?: string;
  eventType: AnalyticsEventType;
  sessionId: string;
  viewId?: string;
  properties: Record<string, any>; // Flexible properties for any event type
  timestamp: number;
  createdAt: Date;
}

// Event Properties Interfaces
export interface ExposureEventProperties {
  experimentId: string;
  variantId: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  pageUrl?: string;
  userAgent?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  referrer?: string;
}

// Analytics Query Types
export interface AnalyticsQuery {
  projectId: string;
  experimentId?: string;
  startDate?: Date;
  endDate?: Date;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export interface ExposureStats {
  experimentId: string;
  variantId: string;
  exposures: number;
  uniqueSessions: number;
}

// SQS Message Types
export interface SQSAnalyticsMessage {
  projectId: string;
  experimentId?: string;
  eventType: AnalyticsEventType;
  sessionId: string;
  viewId?: string;
  properties: Record<string, any>; // Flexible properties for any event type
  timestamp: number;
}

export interface SQSMessage {
  MessageId: string;
  ReceiptHandle: string;
  Body: string;
  Attributes: Record<string, string>;
  MessageAttributes: Record<string, any>;
}
