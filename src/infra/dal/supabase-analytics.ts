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
import { GoalsBreakdownResponse } from '@domain/analytics/types';
import { SignalDAL } from '@infra/dal/signal';

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

    // Filter by experimentId using the new experiment_ids array column
    if (query.experimentId) {
      supabaseQuery = supabaseQuery.contains('experiment_ids', [query.experimentId]);
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

    // Filter by experimentId using the new experiment_ids array column
    if (query.experimentId) {
      supabaseQuery = supabaseQuery.contains('experiment_ids', [query.experimentId]);
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

  async getExposureStats(projectId: string, experimentId: string): Promise<ExposureStats[]> {
    // Refresh materialized view to ensure latest data
    await this.supabase.rpc('refresh_experiment_summary');
    
    const { data, error } = await this.supabase
      .from('experiment_summary')
      .select('*')
      .eq('project_id', projectId)
      .eq('experiment_id', experimentId);

    if (error) {
      console.error('[SUPABASE] Error fetching exposure stats:', error);
      return [];
    }

    return (data || []).map((stat: any) => ({
      experimentId,
      variantId: stat.variant_id,
      exposures: Number(stat.exposure_count),
      uniqueSessions: Number(stat.unique_sessions),
    }));
  }

  async getFunnelAnalysis(projectId: string, experimentId: string): Promise<FunnelAnalysis> {
    // For funnel analysis, we need to query the raw events to understand user journeys
    // The materialized view doesn't give us the sequential flow data we need
    
    // Fetch experiment goals (signals) to support URL-based conversion goals
    const goals = await SignalDAL.getSignalsByExperiment(experimentId);
    const urlPatterns: RegExp[] = [];
    for (const goal of goals) {
      if (goal.targetUrls && goal.targetUrls.length > 0) {
        for (const pattern of goal.targetUrls) {
          try {
            // Treat stored strings as regex patterns
            urlPatterns.push(new RegExp(pattern));
          } catch {
            // Ignore invalid patterns
          }
        }
      }
    }

    // First, get all sessions that have events for this experiment
    const { data: sessionsData, error: sessionsError } = await this.supabase
      .from('events')
      .select('session_id')
      .eq('project_id', projectId)
      .contains('experiment_ids', [experimentId])
      .not('session_id', 'is', null);

    if (sessionsError) {
      console.error('[SUPABASE] Error fetching experiment sessions:', sessionsError);
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

    const sessionIds = [...new Set((sessionsData || []).map(s => s.session_id))];
    
    if (sessionIds.length === 0) {
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

    // Get all events for these sessions
    const { data: eventsData, error: eventsError } = await this.supabase
      .from('events')
      .select('session_id, event_type, experiment_ids, variant_keys, url')
      .eq('project_id', projectId)
      .in('session_id', sessionIds)
      .in('event_type', [0, 1, 2]); // EXPOSURE, PAGEVIEW, CONVERSION

    if (eventsError) {
      console.error('[SUPABASE] Error fetching events for funnel analysis:', eventsError);
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

    // Group events by variant and session
    const variantStats = new Map<string, {
      sessions: Set<string>;
      pageviews: Set<string>;
      exposures: Set<string>;
      conversions: Set<string>;
    }>();

    for (const event of eventsData || []) {
      // Convert array columns back to assignedVariants format for processing
      const assignedVariants = event.experiment_ids && event.variant_keys 
        ? event.experiment_ids.map((expId: string, index: number) => ({
            experimentId: expId,
            variantId: event.variant_keys[index] || null
          }))
        : [];
      const experimentVariant = assignedVariants.find((av: {experimentId: string, variantId: string | null}) => av.experimentId === experimentId);
      
      if (!experimentVariant) continue;
      
      const variantId = experimentVariant.variantId;
      if (!variantStats.has(variantId)) {
        variantStats.set(variantId, {
          sessions: new Set(),
          pageviews: new Set(),
          exposures: new Set(),
          conversions: new Set(),
        });
      }

      const stats = variantStats.get(variantId)!;
      stats.sessions.add(event.session_id);

      if (event.event_type === 0) { // EXPOSURE
        stats.exposures.add(event.session_id);
      } else if (event.event_type === 1) { // PAGEVIEW
        stats.pageviews.add(event.session_id);
        // Treat pageviews that match any goal targetUrls as conversions for navigation goals
        if (urlPatterns.length > 0 && typeof event.url === 'string') {
          for (const regex of urlPatterns) {
            if (regex.test(event.url)) {
              stats.conversions.add(event.session_id);
              break;
            }
          }
        }
      } else if (event.event_type === 2) { // CONVERSION
        stats.conversions.add(event.session_id);
      }
    }

    // Build funnel for each variant
    const variants = Array.from(variantStats.entries()).map(([variantId, stats]) => {
      const pageviewCount = stats.pageviews.size;
      const exposureCount = stats.exposures.size;
      const conversionCount = stats.conversions.size;

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
        variantId,
        steps,
        totalSessions: pageviewCount,
        conversionRate: exposureCount > 0 ? (conversionCount / exposureCount) * 100 : 0,
      };
    });

    const totalSessions = variants.reduce((sum, v) => sum + v.totalSessions, 0);
    const totalExposures = variants.reduce((sum, v) => sum + (v.steps.find(s => s.eventType === 'EXPOSURE')?.count || 0), 0);
    const totalConversions = variants.reduce((sum, v) => sum + (v.steps.find(s => s.eventType === 'CONVERSION')?.count || 0), 0);

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

  async getConversionRates(projectId: string, experimentId: string): Promise<ConversionRates[]> {
    // Refresh materialized view to ensure latest data
    await this.supabase.rpc('refresh_experiment_summary');
    
    const { data, error } = await this.supabase
      .from('experiment_summary')
      .select('*')
      .eq('project_id', projectId)
      .eq('experiment_id', experimentId);

    if (error) {
      console.error('[SUPABASE] Error fetching conversion rates:', error);
      return [];
    }

    return (data || []).map((stat: any) => ({
      experimentId,
      variantId: stat.variant_id,
      sessions: Number(stat.unique_sessions),
      conversions: Number(stat.conversion_count),
      conversionRate: Number(stat.unique_sessions) > 0 ? (Number(stat.conversion_count) / Number(stat.unique_sessions)) * 100 : 0,
      averageValue: Number(stat.avg_conversion_value) || 0,
      totalValue: Number(stat.total_conversion_value) || 0,
    }));
  }

  async getPurchaseStats(projectId: string, experimentId: string): Promise<PurchaseStats[]> {
    // Refresh materialized view to ensure latest data
    await this.supabase.rpc('refresh_experiment_summary');
    
    const { data, error } = await this.supabase
      .from('experiment_summary')
      .select('*')
      .eq('project_id', projectId)
      .eq('experiment_id', experimentId);

    if (error) {
      console.error('[SUPABASE] Error fetching purchase stats:', error);
      return [];
    }

    return (data || []).map((stat: any) => {
      const sessionCount = Number(stat.unique_sessions) || 0;
      const purchaseCount = Number(stat.purchase_count) || 0;
      const totalRevenue = Number(stat.total_revenue) || 0;
      const avgOrderValue = Number(stat.avg_order_value) || 0;

      return {
        experimentId,
        variantId: stat.variant_id,
        sessions: sessionCount,
        purchases: purchaseCount,
        purchaseRate: sessionCount > 0 ? (purchaseCount / sessionCount) * 100 : 0,
        totalRevenue,
        averageOrderValue: avgOrderValue,
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
      .contains('experiment_ids', [experimentId]);

    if (error) {
      console.error('[SUPABASE] Error deleting experiment events:', error);
      throw new Error(`Failed to delete events: ${error.message}`);
    }

    console.log(`[SUPABASE] Deleted ${count || 0} events for experiment ${experimentId}`);
    return count || 0;
  }

  private mapToAnalyticsEventData(event: any): AnalyticsEventData {
    // Convert array columns back to assignedVariants format for compatibility
    const assignedVariants = event.experiment_ids && event.variant_keys 
      ? event.experiment_ids.map((expId: string, index: number) => ({
          experimentId: expId,
          variantId: event.variant_keys[index] || null
        }))
      : undefined;

    return {
      id: event.id.toString(),
      projectId: event.project_id,
      eventType: (EVENT_TYPE_MAP[event.event_type] || 'CUSTOM') as AnalyticsEventData['eventType'],
      sessionId: event.session_id,
      properties: event.props || {},
      assignedVariants: assignedVariants,
      url: event.url || undefined,
      userAgent: event.user_agent || undefined,
      timestamp: new Date(event.ts).getTime(),
      createdAt: new Date(event.created_at || event.ts),
    };
  }

  async getGoalsBreakdown(projectId: string, experimentId: string): Promise<GoalsBreakdownResponse> {
    // Load goals
    const goals = await SignalDAL.getSignalsByExperiment(experimentId);

    // Get sessions for this experiment
    const { data: sessionsData, error: sessionsError } = await this.supabase
      .from('events')
      .select('session_id')
      .eq('project_id', projectId)
      .contains('experiment_ids', [experimentId])
      .not('session_id', 'is', null);

    if (sessionsError) {
      console.error('[SUPABASE] Error fetching sessions for goals breakdown:', sessionsError);
      return { experimentId, variants: [], goals: [] };
    }

    const sessionIds = [...new Set((sessionsData || []).map(s => s.session_id))];
    if (sessionIds.length === 0) {
      return { experimentId, variants: [], goals: [] };
    }

    // Fetch relevant events: PAGEVIEW and CONVERSION
    const { data: eventsData, error: eventsError } = await this.supabase
      .from('events')
      .select('session_id, event_type, experiment_ids, variant_keys, url, props')
      .eq('project_id', projectId)
      .in('session_id', sessionIds)
      .in('event_type', [1, 2]);

    if (eventsError) {
      console.error('[SUPABASE] Error fetching events for goals breakdown:', eventsError);
      return { experimentId, variants: [], goals: [] };
    }

    // Determine variants present
    const variantsSet = new Set<string>();

    // Prepare matchers per goal
    const matchers = goals.map(goal => {
      const urlRegexes: RegExp[] = [];
      if (goal.targetUrls && goal.targetUrls.length > 0) {
        for (const pattern of goal.targetUrls) {
          try { urlRegexes.push(new RegExp(pattern)); } catch {}
        }
      }
      return { goal, urlRegexes };
    });

    // Count conversions per goal per variant by unique session
    const counts = new Map<string, Map<string, Set<string>>>(); // goalName -> variantId -> Set(sessionId)

    for (const event of eventsData || []) {
      const assignedVariants = event.experiment_ids && event.variant_keys
        ? event.experiment_ids.map((expId: string, index: number) => ({
            experimentId: expId,
            variantId: event.variant_keys[index] || null
          }))
        : [];

      const experimentVariant = assignedVariants.find((av: {experimentId: string, variantId: string | null}) => av.experimentId === experimentId);
      if (!experimentVariant) continue;
      const variantId = experimentVariant.variantId;
      variantsSet.add(variantId);

      // Check each goal
      for (const { goal, urlRegexes } of matchers) {
        let isConversion = false;

        if (event.event_type === 2) {
          // Explicit conversion events: match by props.goal
          const goalName = event.props?.goal || event.props?.properties?.goal;
          if (goalName && typeof goalName === 'string' && goalName === goal.name) {
            isConversion = true;
          }
        } else if (event.event_type === 1 && urlRegexes.length > 0 && typeof event.url === 'string') {
          // Navigation goals: PAGEVIEW url matches any pattern
          for (const r of urlRegexes) {
            if (r.test(event.url)) { isConversion = true; break; }
          }
        }

        if (isConversion) {
          if (!counts.has(goal.name)) counts.set(goal.name, new Map());
          const perVariant = counts.get(goal.name)!;
          if (!perVariant.has(variantId)) perVariant.set(variantId, new Set());
          perVariant.get(variantId)!.add(event.session_id);
        }
      }
    }

    // Build response
    const variants = Array.from(variantsSet);
    const goalsResponse = goals.map(g => {
      const perVariantMap = counts.get(g.name) || new Map();
      const perVariant = variants.map(variantId => ({
        variantId,
        conversions: (perVariantMap.get(variantId)?.size) || 0,
      }));
      return {
        name: g.name,
        type: g.type,
        perVariant,
      };
    });

    return { experimentId, variants, goals: goalsResponse };
  }
}

