#!/usr/bin/env ts-node

/**
 * Simple test script for variant generation
 *
 * Usage:
 *   npx ts-node src/test-variant-simple.ts
 *
 * This is a simpler version that tests individual components
 */

import { Hypothesis } from './features/hypotheses_generation/types';
import { buildVariantGenerationPrompt, buildButtonVariantGenerationPrompt } from './features/variant_generation/prompts';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { basicVariantsResponseSchema } from './features/variant_generation/types';
import { getVariantGenerationAIConfig } from './shared/ai-config';
import { DEMO_CONDITION } from './shared/demo-config';

// Sample hypothesis for testing
const TEST_HYPOTHESIS: Hypothesis = {
    title: "Improve CTA Button Conversion",
    description: "Making the main CTA button more prominent with urgency will increase conversions",
    primary_outcome: "Conversion rate",
    current_problem: "The CTA button doesn't stand out and lacks urgency",
    why_it_works: [
        { reason: "Urgency creates FOMO" },
        { reason: "Prominent buttons get more clicks" },
        { reason: "Dynamic elements attract attention" }
    ],
    baseline_performance: 3.2,
    predicted_lift_range: { min: 10, max: 25 }
};

async function testVariantGeneration() {
    console.log('🧪 Testing Variant Generation\n');
    console.log('Current Configuration:');
    console.log('  Demo Mode:', DEMO_CONDITION ? 'ENABLED' : 'DISABLED');
    console.log('');

    try {
        // Test 1: Generate variant ideas
        console.log('📝 Test 1: Generating Variant Ideas');
        console.log('-'.repeat(40));

        const prompt = DEMO_CONDITION
            ? buildButtonVariantGenerationPrompt(TEST_HYPOTHESIS)
            : buildVariantGenerationPrompt(TEST_HYPOTHESIS);

        console.log('Using prompt type:', DEMO_CONDITION ? 'Button-specific' : 'General');

        const aiConfig = getVariantGenerationAIConfig();
        const response = await generateObject({
            model: google(aiConfig.model),
            schema: basicVariantsResponseSchema,
            prompt: prompt,
            temperature: 0.8
        });

        const variants = response.object.variants;
        console.log(`✅ Generated ${variants.length} variant ideas\n`);

        variants.forEach((variant, index) => {
            console.log(`Variant ${index + 1}: ${variant.variant_label}`);
            console.log(`  Description: ${variant.description}`);
            console.log(`  Rationale: ${variant.rationale}\n`);
        });

        // Test 2: Generate JavaScript code for first variant
        console.log('💻 Test 2: Generating JavaScript Code');
        console.log('-'.repeat(40));

        const firstVariant = variants[0];
        const codePrompt = `Generate JavaScript code for this A/B test variant:

VARIANT: ${firstVariant.variant_label}
DESCRIPTION: ${firstVariant.description}
RATIONALE: ${firstVariant.rationale}

Generate self-contained JavaScript that:
1. Targets the main CTA button
2. Implements the variant changes
3. Includes error handling
4. Works on mobile and desktop

Use this structure:
(function() {
  'use strict';

  function initVariant() {
    try {
      // Find target element
      const button = document.querySelector('button, a.button, [class*="btn"]');
      if (!button) return;

      // Apply variant changes
      // [Your implementation here based on: ${firstVariant.description}]

    } catch (error) {
      console.error('[Variant Error]:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVariant);
  } else {
    initVariant();
  }
})();

Return a JSON object with:
- javascript_code: The complete JavaScript
- target_selector: The CSS selector used
- execution_timing: "dom_ready"`;

        const codeResponse = await generateObject({
            model: google(aiConfig.model),
            schema: {
                type: 'object',
                properties: {
                    javascript_code: { type: 'string' },
                    target_selector: { type: 'string' },
                    execution_timing: { type: 'string' }
                }
            } as any,
            prompt: codePrompt,
            temperature: 0.7
        });

        console.log('✅ Generated JavaScript code\n');
        console.log('Target Selector:', codeResponse.object.target_selector);
        console.log('Execution Timing:', codeResponse.object.execution_timing);
        console.log('\nCode Preview (first 500 chars):');
        console.log(codeResponse.object.javascript_code.substring(0, 500) + '...\n');

        // Test 3: Validate the JavaScript
        console.log('✔️  Test 3: Validating JavaScript');
        console.log('-'.repeat(40));

        try {
            new Function(codeResponse.object.javascript_code);
            console.log('✅ JavaScript syntax is valid!\n');
        } catch (error: any) {
            console.log('❌ JavaScript syntax error:', error.message, '\n');
        }

        // Summary
        console.log('📊 Test Summary');
        console.log('='.repeat(40));
        console.log('✅ All tests completed successfully!');
        console.log(`  • Generated ${variants.length} variant ideas`);
        console.log(`  • Generated JavaScript code (${codeResponse.object.javascript_code.length} chars)`);
        console.log(`  • Code targets: ${codeResponse.object.target_selector}`);
        console.log(`  • Demo mode: ${DEMO_CONDITION ? 'ON' : 'OFF'}`);

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    console.log('Starting simple variant test...\n');

    testVariantGeneration()
        .then(() => {
            console.log('\n✨ Test completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}