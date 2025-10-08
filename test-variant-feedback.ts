/**
 * Test script for variant feedback improvement system
 */

import { createVariantImprovementService } from './src/features/variant_generation/variant-improvement';

async function testVariantImprovement() {
    console.log('Testing Variant Feedback Improvement System\n');
    console.log('=' .repeat(50));

    const improvementService = createVariantImprovementService();

    // Test case: Button not centered
    const testCase1 = {
        originalCode: `
(function() {
    'use strict';

    const selector = 'div.shopbrand .item h3';
    const elements = document.querySelectorAll(selector);

    elements.forEach(h3 => {
        h3.style.backgroundColor = '#000000';
        h3.style.color = '#f4a70e';
        h3.style.fontFamily = 'Poppins, sans-serif';
        h3.style.fontSize = '14px';
        h3.style.fontWeight = '700';
        h3.style.textTransform = 'uppercase';
        h3.style.letterSpacing = '0.05em';
        h3.style.padding = '15px 24px';
        h3.style.margin = '16px 0';
    });
})();`,
        targetSelector: 'div.shopbrand .item h3',
        variantDescription: 'Transform category buttons to solid black with gold text',
        userFeedback: 'The buttons are not centered horizontally within their container'
    };

    console.log('\nTest Case 1: Button Centering Issue');
    console.log('User Feedback:', testCase1.userFeedback);
    console.log('\nImproving variant...\n');

    try {
        const result1 = await improvementService.improveVariant(testCase1);

        console.log('✅ Improvement Successful!');
        console.log('Confidence:', (result1.confidence * 100).toFixed(0) + '%');
        console.log('\nImprovements Made:');
        result1.improvements_made.forEach((improvement, i) => {
            console.log(`${i + 1}. ${improvement}`);
        });
        console.log('\nImproved Code:');
        console.log(result1.javascript_code);
    } catch (error) {
        console.error('❌ Test Case 1 Failed:', error);
    }

    console.log('\n' + '=' .repeat(50));

    // Test case: Button too small
    const testCase2 = {
        originalCode: `
(function() {
    'use strict';

    const buttons = document.querySelectorAll('.product-card .buy-btn');

    buttons.forEach(btn => {
        btn.style.backgroundColor = '#ff6b6b';
        btn.style.color = 'white';
        btn.style.padding = '8px 16px';
        btn.style.fontSize = '14px';
    });
})();`,
        targetSelector: '.product-card .buy-btn',
        variantDescription: 'Make buy buttons more prominent with red background',
        userFeedback: 'The button is too small and hard to click on mobile devices'
    };

    console.log('\nTest Case 2: Button Size Issue');
    console.log('User Feedback:', testCase2.userFeedback);
    console.log('\nImproving variant...\n');

    try {
        const result2 = await improvementService.improveVariant(testCase2);

        console.log('✅ Improvement Successful!');
        console.log('Confidence:', (result2.confidence * 100).toFixed(0) + '%');
        console.log('\nImprovements Made:');
        result2.improvements_made.forEach((improvement, i) => {
            console.log(`${i + 1}. ${improvement}`);
        });
        console.log('\nImproved Code:');
        console.log(result2.javascript_code);
    } catch (error) {
        console.error('❌ Test Case 2 Failed:', error);
    }

    console.log('\n' + '=' .repeat(50));
    console.log('\n✨ Testing Complete!');
}

// Run the test
testVariantImprovement().catch(console.error);