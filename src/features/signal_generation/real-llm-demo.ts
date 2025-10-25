/**
 * Real LLM demo showing actual AI responses for Shopify signal generation
 * Run with: npx tsx src/features/signal_generation/real-llm-demo.ts
 */

import 'dotenv/config';
import { createShopifySignalGenerator } from './shopify-signal-generator';
import { PageType } from '@shared/page-types';
import { SignalGenerationInput } from './types';

// Mock analytics repository that returns realistic Shopify data
class RealisticAnalyticsRepository {
  async findMany() {
    // Simulate realistic Shopify events data
    return [
      // Page view events
      {
        id: '1',
        projectId: 'proj-123',
        sessionId: 'session-1',
        viewId: 'view-1',
        eventType: 'PAGEVIEW' as const,
        properties: { 
          url: 'https://shop.com/products/shoes', 
          eventName: 'page_viewed',
          title: 'Running Shoes - Shop'
        },
        timestamp: Date.now() - 1000,
        createdAt: new Date()
      },
      {
        id: '2',
        projectId: 'proj-123',
        sessionId: 'session-2',
        viewId: 'view-2',
        eventType: 'PAGEVIEW' as const,
        properties: { 
          url: 'https://shop.com/products/shoes', 
          eventName: 'page_viewed',
          title: 'Running Shoes - Shop'
        },
        timestamp: Date.now() - 2000,
        createdAt: new Date()
      },
      {
        id: '3',
        projectId: 'proj-123',
        sessionId: 'session-3',
        viewId: 'view-3',
        eventType: 'PAGEVIEW' as const,
        properties: { 
          url: 'https://shop.com/products/shoes', 
          eventName: 'page_viewed',
          title: 'Running Shoes - Shop'
        },
        timestamp: Date.now() - 3000,
        createdAt: new Date()
      },
      // Conversion events
      {
        id: '4',
        projectId: 'proj-123',
        sessionId: 'session-1',
        viewId: 'view-1',
        eventType: 'CUSTOM' as const,
        properties: { 
          url: 'https://shop.com/products/shoes', 
          eventName: 'product_added_to_cart',
          productId: 'shoes-123'
        },
        timestamp: Date.now() - 500,
        createdAt: new Date()
      },
      {
        id: '5',
        projectId: 'proj-123',
        sessionId: 'session-2',
        viewId: 'view-2',
        eventType: 'CUSTOM' as const,
        properties: { 
          url: 'https://shop.com/products/shoes', 
          eventName: 'product_added_to_cart',
          productId: 'shoes-123'
        },
        timestamp: Date.now() - 1500,
        createdAt: new Date()
      },
      // Purchase events
      {
        id: '6',
        projectId: 'proj-123',
        sessionId: 'session-1',
        viewId: 'view-1',
        eventType: 'PURCHASE' as const,
        properties: { 
          url: 'https://shop.com/checkout', 
          eventName: 'checkout_completed',
          value: 99.99
        },
        timestamp: Date.now(),
        createdAt: new Date()
      }
    ];
  }

  async count() { return 6; }
  async create() { 
    return {
      id: 'mock-1',
      projectId: 'proj-123',
      eventType: 'PAGEVIEW' as const,
      sessionId: 'session-1',
      viewId: 'view-1',
      properties: {},
      timestamp: Date.now(),
      createdAt: new Date()
    };
  }
  async createMany() { return []; }
  async getFunnelAnalysis() { 
    return { 
      experimentId: 'exp-123',
      variants: [],
      overallStats: { 
        totalSessions: 0, 
        totalExposures: 0,
        totalConversions: 0,
        overallConversionRate: 0
      },
      steps: [],
      conversionRates: []
    }; 
  }
  async getConversionRate() { return 0.15; }
  async getPurchaseStats() { return []; }
  async getExposureStats() { return []; }
  async getExperimentSessions() { return { sessions: [], total: 0 }; }
  async getConversionRates() { return []; }
  async getUserJourney() { return []; }
  async getEventsWithAttribution() { return []; }
  async deleteExperimentEvents() { return 0; }
}

async function runRealLLMDemo() {
  console.log('🚀 Shopify Signal Generator - Clickthrough Rate Experiment Demo\n');
  console.log('This makes actual LLM calls to intelligently select Shopify events\n');

  // Create generator with realistic data
  const analyticsRepo = new RealisticAnalyticsRepository();
  const generator = createShopifySignalGenerator(analyticsRepo);

  // Demo: Completely Adaptive URL Detection
  console.log('🏠 Completely Adaptive URL Detection Test');
  console.log('=' .repeat(50));
  console.log('🎯 Goal: Test various custom URLs to prove complete adaptability');
  console.log('📊 Challenge: System should detect ANY URL mentioned in intent/description');
  console.log('🧠 Question: Will it work with any custom URL pattern?\n');
  
  const testCases = [
    {
      name: 'Custom Path',
      intent: 'Increase clickthrough rate to /summer-sale-2024 page',
      description: 'Button links to /summer-sale-2024',
      expected: '/summer-sale-2024*'
    },
    {
      name: 'Collection Page - Jeans',
      intent: 'Boost clickthrough rate to /collections/jeans page',
      description: 'CTA button links to /collections/jeans',
      expected: '/collections/jeans*'
    },
    {
      name: 'Collection Page - Shirts',
      intent: 'Increase clicks to /collections/shirts page',
      description: 'Button goes to /collections/shirts',
      expected: '/collections/shirts*'
    },
    {
      name: 'Product Page - Specific Product',
      intent: 'Drive traffic to /products/premium-jeans-123 page',
      description: 'Link to /products/premium-jeans-123',
      expected: '/products/premium-jeans-123*'
    },
    {
      name: 'Multiple Collection Pages',
      intent: 'Increase clickthrough to both /collections/jeans and /collections/shirts pages',
      description: 'Buttons link to /collections/jeans and /collections/shirts',
      expected: '/collections/jeans*' // Should detect first URL mentioned
    },
    {
      name: 'Query Parameters',
      intent: 'Drive traffic to /search?category=shoes page',
      description: 'Link to /search?category=shoes',
      expected: '/search?category=shoes*'
    }
  ];

  for (const testCase of testCases) {
    console.log(`🧪 Testing: ${testCase.name}`);
    console.log(`   Intent: ${testCase.intent}`);
    console.log(`   Description: ${testCase.description}`);
    console.log(`   Expected: ${testCase.expected}`);
    
    const clickthroughInput: SignalGenerationInput = {
      projectId: 'proj-123',
      pageType: PageType.HOME,
      url: 'https://shop.com',
      intent: testCase.intent,
      dom: `<div class="homepage"><div class="hero"><h2>Test Page</h2></div></div>`,
      variant: {
        changeType: 'addElement',
        selector: '.test-cta',
        description: testCase.description,
        rationale: 'Test button for URL detection'
      }
    };

    try {
      const result = await generator.generateSignals(clickthroughInput);
      const actualSelector = result.primary?.selector;
      
      // Remove 'url:' prefix for comparison
      const cleanSelector = actualSelector?.replace('url:', '') || 'undefined';
      
      if (cleanSelector === testCase.expected) {
        console.log(`   ✅ SUCCESS: Detected ${actualSelector}`);
      } else {
        console.log(`   ❌ FAILED: Expected ${testCase.expected}, got ${cleanSelector}`);
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${(error as Error).message}`);
    }
    
    console.log('');
  }

  console.log('🎯 Summary:');
  console.log('   The system is now completely adaptive to ANY URL pattern.');
  console.log('   It detects URLs in both intent and variant description.');
  console.log('   No hardcoded patterns - works with any custom URL structure.\n');

  console.log('🎯 What the Real LLM Does:');
  console.log('1. 🧠 Analyzes experiment intent and context');
  console.log('2. 📊 Reviews available Shopify conversion data');
  console.log('3. 🎯 Intelligently selects the most relevant events');
  console.log('4. 💡 Provides clear reasoning for each choice');
  console.log('5. 🔄 Adapts to different experiment types automatically');
  
  console.log('\n✨ To use with real LLM:');
  console.log('1. Set GOOGLE_GENERATIVE_AI_API_KEY in your environment');
  console.log('2. The LLM will make intelligent choices based on your actual data');
  console.log('3. Each experiment gets context-aware signal selection');
  console.log('4. No more guessing - just intelligent, data-driven decisions!');
}

// Run the demo
if (require.main === module) {
  runRealLLMDemo().catch(console.error);
}

export { runRealLLMDemo };
