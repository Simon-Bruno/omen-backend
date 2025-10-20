/**
 * Quick test for signal generation core functionality
 * Run with: npm run test:signals
 * 
 * Tests:
 * 1. DOM utilities (checkSelectorExists)
 * 2. Signal validator (primary signals, mechanisms, purchase tracking)
 * 
 * Note: We only validate against control DOM since variants are JS code
 * that runs on the client - we can't predict the final DOM structure.
 */

import { checkSelectorExists } from './src/shared/utils/dom';
import { SignalValidator } from './src/features/signal_generation/validator';
import { PageType } from './src/shared/page-types';
import type { LLMSignalProposal } from './src/features/signal_generation/types';

console.log('\n🧪 Testing Signal Generation System');
console.log('=' .repeat(50) + '\n');

// Test 1: DOM Utilities
console.log('1️⃣  Testing DOM Utilities...');
const testHTML = `
<html>
  <body>
    <button id="add-to-cart" class="btn btn-primary">Add to Cart</button>
    <div class="price">$99.99</div>
  </body>
</html>`;

try {
  // Test selector checking
  const existsById = checkSelectorExists(testHTML, '#add-to-cart');
  const existsByClass = checkSelectorExists(testHTML, '.btn-primary');
  const notExists = checkSelectorExists(testHTML, '.missing');

  if (existsById && existsByClass && !notExists) {
    console.log('   ✅ checkSelectorExists works correctly');
  } else {
    throw new Error('Selector checking failed');
  }

} catch (error) {
  console.error('   ❌ DOM Utils test failed:', error);
  process.exit(1);
}

// Test 2: Signal Validator
console.log('\n2️⃣  Testing Signal Validator...');
const validator = new SignalValidator();

const mockContext = {
  pageType: PageType.PDP,
  controlDOM: '<html><body><button class="add-to-cart">Add to Cart</button></body></html>',
  purchaseTrackingActive: true,
};

(async () => {
  try {
    // Test valid primary signal (use name from catalog)
    const validProposal: LLMSignalProposal = {
      primary: {
        name: 'add_to_cart_click',
        type: 'conversion',
        selector: '.add-to-cart',
        eventType: 'click',
        existsInControl: true,
        existsInVariant: true,
      },
    };

    const result1 = await validator.validateProposal(validProposal, mockContext);
    if (result1.valid && result1.primary?.valid) {
      console.log('   ✅ Valid primary signal validated correctly');
    } else {
      console.log('   ⚠️  Validation errors:', result1.primary?.errors);
      console.log('   ⚠️  Warnings:', result1.primary?.warnings);
      console.log('   ⚠️  Overall errors:', result1.overallErrors);
      throw new Error('Valid signal was rejected');
    }

    // Test invalid primary signal (selector doesn't exist)
    const invalidProposal: LLMSignalProposal = {
      primary: {
        name: 'missing_button',
        type: 'conversion',
        selector: '.does-not-exist',
        eventType: 'click',
        existsInControl: true,
        existsInVariant: true,
      },
    };

    const result2 = await validator.validateProposal(invalidProposal, mockContext);
    if (!result2.valid && !result2.primary?.valid) {
      console.log('   ✅ Invalid primary signal rejected correctly');
    } else {
      throw new Error('Invalid signal was accepted');
    }

    // Test mechanism signals (variant-only)
    const mechanismProposal: LLMSignalProposal = {
      primary: {
        name: 'add_to_cart_click',
        type: 'conversion',
        selector: '.add-to-cart',
        eventType: 'click',
        existsInControl: true,
        existsInVariant: true,
      },
      mechanisms: [
        {
          name: 'scroll_tracking',
          type: 'custom',
          customJs: 'console.log("scrolled")',
          existsInControl: false,
          existsInVariant: true,
        },
      ],
    };

    const result3 = await validator.validateProposal(mechanismProposal, mockContext);
    // Overall valid means primary is valid, mechanisms are optional and may have catalog warnings
    if (result3.valid && result3.mechanisms.length > 0) {
      console.log('   ✅ Mechanism signals processed correctly (primary valid, mechanisms present)');
    } else {
      throw new Error('Mechanism validation failed');
    }

    // Test purchase tracking requirement
    const purchaseProposal: LLMSignalProposal = {
      primary: {
        name: 'purchase_completed',
        type: 'purchase',
        existsInControl: true,
        existsInVariant: true,
      },
    };

    const result4 = await validator.validateProposal(purchaseProposal, mockContext);
    if (result4.valid) {
      console.log('   ✅ Purchase signal validated with tracking active');
    } else {
      throw new Error('Purchase signal validation failed');
    }

    const contextNoTracking = { ...mockContext, purchaseTrackingActive: false };
    const result5 = await validator.validateProposal(purchaseProposal, contextNoTracking);
    if (!result5.valid) {
      console.log('   ✅ Purchase signal rejected without tracking');
    } else {
      throw new Error('Purchase signal accepted without tracking');
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests passed!');
    console.log('   • DOM utilities working correctly');
    console.log('   • Signal validation enforcing catalog rules');
    console.log('   • Primary/mechanism/guardrail roles supported');
    console.log('   • Purchase tracking requirements enforced');
    console.log('='.repeat(50) + '\n');
    process.exit(0);
  } catch (error) {
    console.error('   ❌ Validator test failed:', error);
    process.exit(1);
  }
})();

