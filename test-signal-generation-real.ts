/**
 * Test Signal Generation with Real Database Data
 * 
 * Run with: npm run test:signals:real
 * 
 * This pulls actual experiment data from your database and tests signal generation
 * without going through the full agent flow.
 */

// Load environment variables
import 'dotenv/config';

import { createSignalGenerationService } from './src/features/signal_generation/generator';
import { PageType, detectPageType } from './src/shared/page-types';
import { prisma } from './src/infra/prisma';

console.log('\n🧪 Testing Signal Generation with REAL Database Data');
console.log('='.repeat(70) + '\n');

async function testWithRealData() {
  try {
    // Get the most recent experiment with variants
    console.log('📊 Fetching real experiment data...');
    
    const experiment = await prisma.experiment.findFirst({
      where: {
        variants: {
          some: {}
        }
      },
      include: {
        hypothesis: true,
        variants: {
          take: 1 // Just get the first variant for testing
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!experiment) {
      console.log('❌ No experiments found with variants. Create an experiment first!');
      process.exit(1);
    }

    console.log(`✅ Found experiment: "${experiment.name}"`);
    console.log(`   Hypothesis: "${experiment.hypothesis?.hypothesis}"`);
    console.log(`   Primary Outcome: "${experiment.hypothesis?.primaryKpi}"`);
    console.log(`   Variants: ${experiment.variants.length}\n`);

    // Get the most recent screenshot for this project that matches the experiment's target page type
    const targetUrlPattern = experiment.targetUrls?.[0] || '/';
    // Convert URL pattern to page type
    const targetPageType = targetUrlPattern.includes('/products/') ? 'pdp' : 
                          targetUrlPattern === '/' ? 'home' : 'other';
    
    const screenshot = await prisma.screenshot.findFirst({
      where: { 
        projectId: experiment.projectId,
        pageType: targetPageType
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!screenshot?.htmlContent) {
      console.log(`❌ No ${targetPageType} screenshot HTML found for this project`);
      console.log(`   Target URL Pattern: ${targetUrlPattern}`);
      console.log(`   Detected Page Type: ${targetPageType}`);
      console.log('   Available page types:');
      const availableTypes = await prisma.screenshot.findMany({
        where: { projectId: experiment.projectId },
        select: { pageType: true },
        distinct: ['pageType']
      });
      availableTypes.forEach(t => console.log(`   - ${t.pageType}`));
      process.exit(1);
    }

    console.log(`✅ Found screenshot: ${screenshot.url}`);
    console.log(`   Page Type: ${screenshot.pageType}`);
    console.log(`   HTML Length: ${screenshot.htmlContent.length} chars\n`);

    // Use the first variant for testing
    const variant = experiment.variants[0];
    console.log(`🎯 Testing with variant: "${variant.variantId}"`);
    console.log(`   Target Selector: ${variant.selector}`);
    console.log(`   Has HTML: ${!!variant.html}`);
    console.log(`   Has CSS: ${!!variant.css}`);
    console.log(`   Has JS: ${!!variant.js}\n`);

    // Generate signals
    const signalService = createSignalGenerationService();
    const pageType = detectPageType(screenshot.url);
    
    console.log('🔄 Generating signals with LLM...');
    console.log('   (Check LangSmith for full trace)\n');
    
    const startTime = Date.now();
    
    const proposal = await signalService.generateSignals({
      pageType,
      url: screenshot.url,
      intent: `${experiment.hypothesis?.hypothesis}. Primary goal: ${experiment.hypothesis?.primaryKpi}`,
      dom: screenshot.htmlContent,
      variant: {
        changeType: 'modifyElement',
        selector: variant.selector || 'body',
        html: variant.html || '',
        css: variant.css || '',
        javascript_code: variant.js || ''
      }
    });
    
    const duration = Date.now() - startTime;
    
    console.log('✅ Signal Generation Complete!');
    console.log(`   Duration: ${duration}ms\n`);
    
    console.log('📊 Generated Signals:\n');
    
    if (proposal.primary) {
      console.log('🎯 PRIMARY SIGNAL:');
      console.log(`   Name: ${proposal.primary.name}`);
      console.log(`   Type: ${proposal.primary.type}`);
      console.log(`   Selector: ${proposal.primary.selector || 'N/A'}`);
      console.log(`   Event: ${proposal.primary.eventType || 'N/A'}`);
      console.log(`   Exists in Control: ${proposal.primary.existsInControl}`);
      console.log(`   Exists in Variant: ${proposal.primary.existsInVariant}\n`);
    } else {
      console.log('⚠️  No primary signal generated!\n');
    }
    
    if (proposal.mechanisms && proposal.mechanisms.length > 0) {
      console.log('⚙️  MECHANISM SIGNALS:');
      proposal.mechanisms.forEach((mech, i) => {
        console.log(`   ${i + 1}. ${mech.name}`);
        console.log(`      Type: ${mech.type}`);
        console.log(`      Selector: ${mech.selector || 'N/A'}`);
        console.log(`      Exists in Control: ${mech.existsInControl}`);
        console.log(`      Exists in Variant: ${mech.existsInVariant}`);
      });
      console.log('');
    }
    
    if (proposal.guardrails && proposal.guardrails.length > 0) {
      console.log('🛡️  GUARDRAIL SIGNALS:');
      proposal.guardrails.forEach((guard, i) => {
        console.log(`   ${i + 1}. ${guard.name}`);
        console.log(`      Type: ${guard.type}`);
      });
      console.log('');
    }
    
    console.log('💭 Rationale:');
    console.log(`   ${proposal.rationale}\n`);
    
    // Test validation
    console.log('🔍 Testing Validation...');
    const { createSignalValidator } = await import('./src/features/signal_generation/validator');
    const validator = createSignalValidator();
    
    const validationResult = await validator.validateProposal(proposal, {
      pageType,
      controlDOM: screenshot.htmlContent,
      purchaseTrackingActive: true,
    });
    
    console.log(`   Valid: ${validationResult.valid}`);
    console.log(`   Primary Valid: ${validationResult.primary?.valid}`);
    console.log(`   Errors: ${validationResult.overallErrors.length}`);
    console.log(`   Warnings: ${validationResult.primary?.warnings?.length || 0}\n`);
    
    if (validationResult.primary?.errors?.length > 0) {
      console.log('❌ Primary Errors:');
      validationResult.primary.errors.forEach(error => {
        console.log(`   - ${error}`);
      });
      console.log('');
    }
    
    if (validationResult.primary?.warnings?.length > 0) {
      console.log('⚠️  Primary Warnings:');
      validationResult.primary.warnings.forEach(warning => {
        console.log(`   - ${warning}`);
      });
      console.log('');
    }
    
    console.log('='.repeat(70));
    console.log('✅ Test Complete!');
    console.log('📈 View full trace in LangSmith');
    console.log('='.repeat(70) + '\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error);
    process.exit(1);
  }
}

// Run the test
testWithRealData();
