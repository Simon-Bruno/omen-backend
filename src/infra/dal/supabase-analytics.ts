import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AnalyticsEventData,
  AnalyticsQuery,
  ExposureStats,
  FunnelAnalysis,
  ConversionRates,
  PurchaseStats,
  FunnelStep
} from '@domain/analytics/types';
import { AnalyticsRepository } from '@domain/analytics/analytics-service';

// Event type mapping from Supabase (numeric) to backend (string)
const EVENT_TYPE_MAP: Record<number, string> = {
  0: 'EXPOSURE',
  1: 'PAGEVIEW',
  2: 'CONVERSION',
  3: 'CUSTOM',
  4: 'PURCHASE'
};

export class SupabaseAnalyticsRepository implements AnalyticsRepository {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    // Clean and validate the URL
    const cleanUrl = supabaseUrl.trim().replace(/['"]/g, '');
    
    console.log(`[SUPABASE] Raw URL input: "${supabaseUrl}"`);
    console.log(`[SUPABASE] Cleaned URL: "${cleanUrl}"`);
    console.log(`[SUPABASE] Key present: ${supabaseKey ? 'YES' : 'NO'}`);
    console.log(`[SUPABASE] Key length: ${supabaseKey ? supabaseKey.length : 0}`);
    
    if (!cleanUrl || !supabaseKey) {
      throw new Error(`Invalid Supabase configuration: URL="${cleanUrl}", Key="${supabaseKey ? '[PRESENT]' : '[MISSING]'}"`);
    }
    
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      throw new Error(`Invalid Supabase URL format: "${cleanUrl}". Must start with http:// or https://`);
    }
    
    console.log(`[SUPABASE] Initializing client with URL: ${cleanUrl}`);
    
    try {
      this.supabase = createClient(cleanUrl, supabaseKey);
      console.log('[SUPABASE] Client initialized successfully');
    } catch (error) {
      console.error('[SUPABASE] Failed to create client:', error);
      throw new Error(`Failed to initialize Supabase client: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async create(_eventData: Omit<AnalyticsEventData, 'id' | 'createdAt'>): Promise<AnalyticsEventData> {
    // Not implemented - events are created directly via edge function
    throw new Error('Creating individual events not supported via Supabase repository. Use edge function instead.');
  }

  async createMany(_events: Omit<AnalyticsEventData, 'id' | 'createdAt'>[]): Promise<AnalyticsEventData[]> {
    // Not implemented - events are created directly via edge function
    throw new Error('Creating events not supported via Supabase repository. Use edge function instead.');
  }

  async findMany(query: AnalyticsQuery): Promise<AnalyticsEventData[]> {
    let supabaseQuery = this.supabase
      .from('events')
      .select('*')
      .eq('project_id', query.projectId)
      .order('ts', { ascending: false });

    if (query.experimentId) {
      supabaseQuery = supabaseQuery.eq('experiment_id', query.experimentId);
    }

    if (query.sessionId) {
      supabaseQuery = supabaseQuery.eq('session_id', query.sessionId);
    }

    if (query.startDate) {
      supabaseQuery = supabaseQuery.gte('ts', query.startDate.toISOString());
    }

    if (query.endDate) {
      supabaseQuery = supabaseQuery.lte('ts', query.endDate.toISOString());
    }

    if (query.limit) {
      supabaseQuery = supabaseQuery.limit(query.limit);
    }

    if (query.offset) {
      supabaseQuery = supabaseQuery.range(query.offset, query.offset + (query.limit || 100) - 1);
    }

    const { data, error } = await supabaseQuery;

    if (error) {
      console.error('[SUPABASE] Error fetching events:', error);
      throw new Error(`Failed to fetch events: ${error.message}`);
    }

    return (data || []).map(event => this.mapToAnalyticsEventData(event));
  }

  async count(query: AnalyticsQuery): Promise<number> {
    let supabaseQuery = this.supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', query.projectId);

    if (query.experimentId) {
      supabaseQuery = supabaseQuery.eq('experiment_id', query.experimentId);
    }

    if (query.sessionId) {
      supabaseQuery = supabaseQuery.eq('session_id', query.sessionId);
    }

    if (query.startDate) {
      supabaseQuery = supabaseQuery.gte('ts', query.startDate.toISOString());
    }

    if (query.endDate) {
      supabaseQuery = supabaseQuery.lte('ts', query.endDate.toISOString());
    }

    const { count, error } = await supabaseQuery;

    if (error) {
      console.error('[SUPABASE] Error counting events:', error);
      throw new Error(`Failed to count events: ${error.message}`);
    }

    return count || 0;
  }

  async getExposureStats(_projectId: string, experimentId: string): Promise<ExposureStats[]> {
    const { data, error } = await this.supabase.rpc('get_experiment_conversion_rate', {
      exp_id: experimentId,
      start_time: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      end_time: new Date().toISOString()
    });

    if (error) {
      console.error('[SUPABASE] Error fetching exposure stats:', error);
      return [];
    }

    return (data || []).map((stat: any) => ({
      experimentId,
      variantId: stat.variant_key,
      exposures: Number(stat.exposures),
      uniqueSessions: Number(stat.exposures), // Supabase doesn't track unique sessions separately
    }));
  }

  async getFunnelAnalysis(projectId: string, experimentId: string): Promise<FunnelAnalysis> {
    // Use SQL aggregation for funnel analysis
    const { data, error } = await this.supabase.rpc('get_funnel_analysis', {
      p_project_id: projectId,
      p_experiment_id: experimentId
    });

    if (error) {
      console.error('[SUPABASE] Error fetching funnel data:', error);
      return {
        experimentId,
        variants: [],
        overallStats: {
          totalSessions: 0,
          totalExposures: 0,
          totalConversions: 0,
          overallConversionRate: 0,
        },
      };
    }

    const variants = (data || []).map((row: any) => {
      const pageviewCount = Number(row.pageview_sessions) || 0;
      const exposureCount = Number(row.exposure_sessions) || 0;
      const conversionCount = Number(row.conversion_sessions) || 0;

      const steps: FunnelStep[] = [
        {
          stepName: 'Session',
          eventType: 'PAGEVIEW',
          count: pageviewCount,
          percentage: 100,
          dropoffRate: 0,
        },
        {
          stepName: 'Exposure',
          eventType: 'EXPOSURE',
          count: exposureCount,
          percentage: pageviewCount > 0 ? (exposureCount / pageviewCount) * 100 : 0,
          dropoffRate: pageviewCount > 0 ? ((pageviewCount - exposureCount) / pageviewCount) * 100 : 0,
        },
        {
          stepName: 'Conversion',
          eventType: 'CONVERSION',
          count: conversionCount,
          percentage: pageviewCount > 0 ? (conversionCount / pageviewCount) * 100 : 0,
          dropoffRate: exposureCount > 0 ? ((exposureCount - conversionCount) / exposureCount) * 100 : 0,
        },
      ];

      return {
        variantId: row.variant_key,
        steps,
        totalSessions: pageviewCount,
        conversionRate: exposureCount > 0 ? (conversionCount / exposureCount) * 100 : 0,
      };
    });

    const totalSessions = variants.reduce((sum: number, v: any) => sum + v.totalSessions, 0);
    const totalExposures = variants.reduce((sum: number, v: any) => sum + (v.steps.find((s: any) => s.eventType === 'EXPOSURE')?.count || 0), 0);
    const totalConversions = variants.reduce((sum: number, v: any) => sum + (v.steps.find((s: any) => s.eventType === 'CONVERSION')?.count || 0), 0);

    return {
      experimentId,
      variants,
      overallStats: {
        totalSessions,
        totalExposures,
        totalConversions,
        overallConversionRate: totalExposures > 0 ? (totalConversions / totalExposures) * 100 : 0,
      },
    };
  }

  async getConversionRates(_projectId: string, experimentId: string): Promise<ConversionRates[]> {
    const { data, error } = await this.supabase.rpc('get_experiment_conversion_rate', {
      exp_id: experimentId,
      start_time: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date().toISOString()
    });

    if (error) {
      console.error('[SUPABASE] Error fetching conversion rates:', error);
      return [];
    }

    return (data || []).map((stat: any) => ({
      experimentId,
      variantId: stat.variant_key,
      sessions: Number(stat.exposures),
      conversions: Number(stat.conversions),
      conversionRate: Number(stat.conversion_rate) || 0,
      averageValue: 0, // Not tracked in Supabase
      totalValue: 0, // Not tracked in Supabase
    }));
  }

  async getPurchaseStats(projectId: string, experimentId: string): Promise<PurchaseStats[]> {
    // Use SQL aggregation for purchase stats
    const { data, error } = await this.supabase.rpc('get_purchase_stats', {
      p_project_id: projectId,
      p_experiment_id: experimentId
    });

    if (error) {
      console.error('[SUPABASE] Error fetching purchase stats:', error);
      return [];
    }

    return (data || []).map((row: any) => {
      const sessionCount = Number(row.exposure_sessions) || 0;
      const purchaseCount = Number(row.purchase_sessions) || 0;
      const totalRevenue = Number(row.total_revenue) || 0;
      const purchaseEventCount = Number(row.purchase_count) || 0;

      return {
        experimentId,
        variantId: row.variant_key,
        sessions: sessionCount,
        purchases: purchaseCount,
        purchaseRate: sessionCount > 0 ? (purchaseCount / sessionCount) * 100 : 0,
        totalRevenue,
        averageOrderValue: purchaseEventCount > 0 ? totalRevenue / purchaseEventCount : 0,
        revenuePerSession: sessionCount > 0 ? totalRevenue / sessionCount : 0,
      };
    });
  }

  async getUserJourney(projectId: string, sessionId: string): Promise<AnalyticsEventData[]> {
    const { data, error } = await this.supabase
      .from('events')
      .select('*')
      .eq('project_id', projectId)
      .eq('session_id', sessionId)
      .order('ts', { ascending: true });

    if (error) {
      console.error('[SUPABASE] Error fetching user journey:', error);
      return [];
    }

    return (data || []).map(event => this.mapToAnalyticsEventData(event));
  }

  async getEventsWithAttribution(query: AnalyticsQuery): Promise<AnalyticsEventData[]> {
    return this.findMany(query);
  }

  async getExperimentSessions(
    projectId: string,
    experimentId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ sessions: { sessionId: string, eventCount: number }[], total: number }> {
    // Use SQL aggregation instead of fetching all rows
    const { data, error } = await this.supabase.rpc('get_experiment_sessions', {
      p_project_id: projectId,
      p_experiment_id: experimentId,
      p_limit: limit,
      p_offset: offset
    });

    if (error) {
      console.error('[SUPABASE] Error fetching experiment sessions:', error);
      return { sessions: [], total: 0 };
    }

    const result = data || [];
    return {
      sessions: result.map((row: any) => ({
        sessionId: row.session_id,
        eventCount: Number(row.event_count)
      })),
      total: result[0]?.total_count || 0
    };
  }

  async deleteExperimentEvents(projectId: string, experimentId: string): Promise<number> {
    const { error, count } = await this.supabase
      .from('events')
      .delete({ count: 'exact' })
      .eq('project_id', projectId)
      .eq('experiment_id', experimentId);

    if (error) {
      console.error('[SUPABASE] Error deleting experiment events:', error);
      throw new Error(`Failed to delete events: ${error.message}`);
    }

    console.log(`[SUPABASE] Deleted ${count || 0} events for experiment ${experimentId}`);
    return count || 0;
  }

  private mapToAnalyticsEventData(event: any): AnalyticsEventData {
    return {
      id: event.id.toString(),
      projectId: event.project_id,
      experimentId: event.experiment_id || undefined,
      eventType: (EVENT_TYPE_MAP[event.event_type] || 'CUSTOM') as AnalyticsEventData['eventType'],
      sessionId: event.session_id,
      viewId: event.view_id || undefined,
      properties: event.props || {},
      timestamp: new Date(event.ts).getTime(),
      createdAt: new Date(event.created_at || event.ts),
    };
  }
}

