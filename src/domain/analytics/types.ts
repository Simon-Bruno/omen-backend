// Analytics Event Types - matches Prisma EventType enum
export type AnalyticsEventType =
  | 'EXPOSURE'
  | 'PAGEVIEW'
  | 'CONVERSION'
  | 'PURCHASE'
  | 'CUSTOM';

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
  expId: string;
  variantKey: string;
  userKey: string;
  device?: 'desktop' | 'mobile' | 'tablet';
}

export interface PageviewEventProperties {
  url: string;
  title?: string;
  referrer?: string;
  viewport?: {
    width: number;
    height: number;
  };
  device?: 'desktop' | 'mobile' | 'tablet';
}

export interface ConversionEventProperties {
  goal: string;
  value?: number;
  properties?: Record<string, any>;
  device?: 'desktop' | 'mobile' | 'tablet';
}

export interface PurchaseEventProperties {
  orderId: string;
  revenue: number;
  currency: string;
  items?: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
  }>;
  device?: 'desktop' | 'mobile' | 'tablet';
}

export interface CustomEventProperties {
  eventName: string;
  properties?: Record<string, any>;
  device?: 'desktop' | 'mobile' | 'tablet';
}

// Analytics Query Types
export interface AnalyticsQuery {
  projectId: string;
  experimentId?: string;
  startDate?: Date;
  endDate?: Date;
  sessionId?: string;
  eventType?: string;
  limit?: number;
  offset?: number;
}

export interface ExposureStats {
  experimentId: string;
  variantId: string;
  exposures: number;
  uniqueSessions: number;
}

export interface FunnelStep {
  stepName: string;
  eventType: string;
  count: number;
  percentage: number;
  dropoffRate: number;
}

export interface FunnelAnalysis {
  experimentId: string;
  variants: {
    variantId: string;
    steps: FunnelStep[];
    totalSessions: number;
    conversionRate: number;
  }[];
  overallStats: {
    totalSessions: number;
    totalExposures: number;
    totalConversions: number;
    overallConversionRate: number;
  };
}

export interface ConversionRates {
  experimentId: string;
  variantId: string;
  sessions: number;
  conversions: number;
  conversionRate: number;
  averageValue?: number;
  totalValue?: number;
}

export interface PurchaseStats {
  experimentId: string;
  variantId: string;
  sessions: number;
  purchases: number;
  purchaseRate: number;
  totalRevenue: number;
  averageOrderValue: number;
  revenuePerSession: number;
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
