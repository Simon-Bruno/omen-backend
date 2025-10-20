/**
 * Test Signal Generation LLM Call
 * 
 * Run with: npm run test:signals:llm
 * 
 * This will show up in LangSmith at:
 * https://eu.smith.langchain.com/o/.../projects/p/...
 */

// Load environment variables
import 'dotenv/config';

import { createSignalGenerationService } from './src/features/signal_generation/generator';
import { PageType } from './src/shared/page-types';

console.log('\n🧪 Testing Signal Generation with LLM');
console.log('='.repeat(60) + '\n');

// Mock PDP HTML
const mockPDP_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>The Multi-Managed Snowboard - Shop Omen</title>
</head>
<body>
    <header class="site-header">
        <nav class="main-nav">
            <a href="/">Home</a>
            <a href="/collections/all">Shop</a>
        </nav>
    </header>
    
    <main class="product-page">
        <div class="product-container">
            <div class="product-images">
                <img src="/images/snowboard-main.jpg" alt="Snowboard" class="main-image">
            </div>
            
            <div class="product-info" data-testid="product-information-details">
                <h1 class="product-title">The Multi-Managed Snowboard</h1>
                <div class="product-price">
                    <span class="price">$599.99</span>
                </div>
                
                <div class="product-description">
                    <p>Premium snowboard for all mountain riding. Perfect blend of performance and style.</p>
                </div>
                
                <div class="product-features">
                    <ul>
                        <li>Length: 156cm</li>
                        <li>Width: 25cm</li>
                        <li>Flex: Medium</li>
                    </ul>
                </div>
                
                <form class="add-to-cart-form">
                    <div class="quantity-selector">
                        <label>Quantity:</label>
                        <input type="number" name="quantity" value="1" min="1">
                    </div>
                    
                    <button type="submit" class="product-form__cart-submit">
                        Add to Cart
                    </button>
                </form>
                
                <div class="product-meta">
                    <span class="sku">SKU: SNB-001</span>
                    <span class="category">Category: Snowboards</span>
                </div>
            </div>
        </div>
        
        <div class="related-products">
            <h2>You Might Also Like</h2>
            <div class="product-grid">
                <a href="/products/boots" class="product-card">Snowboard Boots</a>
                <a href="/products/bindings" class="product-card">Bindings</a>
            </div>
        </div>
    </main>
    
    <footer class="site-footer">
        <p>&copy; 2024 Shop Omen</p>
    </footer>
</body>
</html>
`;

// Mock hypothesis
const hypothesis = {
  title: 'Emphasize Handcrafted Quality in Product Description',
  description: 'Adding "Handmade in Small Batches" messaging to highlight artisanal value',
  primary_outcome: 'Add to Cart conversion rate'
};

// Mock variant
const variant = {
  label: 'Artisanal Value Prop Highlight',
  selector: '.product-description',
  html: `
    <div class="product-description">
      <p>Premium snowboard for all mountain riding. Perfect blend of performance and style.</p>
      <div class="artisan-badge">
        <strong>✨ Handmade in Small Batches</strong>
        <p>Each board is carefully crafted by expert artisans using premium materials.</p>
      </div>
    </div>
  `,
  css: `
    .artisan-badge {
      margin-top: 1rem;
      padding: 1rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 8px;
      text-align: center;
    }
    .artisan-badge strong {
      font-size: 1.1rem;
      display: block;
      margin-bottom: 0.5rem;
    }
  `,
  position: 'INNER'
};

async function testSignalGeneration() {
  try {
    const signalService = createSignalGenerationService();
    
    console.log('📝 Test Context:');
    console.log(`   Page Type: ${PageType.PDP}`);
    console.log(`   URL: https://shop.omen.so/products/the-multi-managed-snowboard`);
    console.log(`   Hypothesis: ${hypothesis.title}`);
    console.log(`   Primary Outcome: ${hypothesis.primary_outcome}`);
    console.log(`   Variant: ${variant.label}`);
    console.log(`   HTML Length: ${mockPDP_HTML.length} chars`);
    console.log(`   Variant HTML Length: ${variant.html.length} chars\n`);
    
    console.log('🔄 Calling LLM to generate signals...');
    console.log('   (Check LangSmith for full trace)\n');
    
    const startTime = Date.now();
    
    const proposal = await signalService.generateSignals({
      pageType: PageType.PDP,
      url: 'https://shop.omen.so/products/the-multi-managed-snowboard',
      intent: `${hypothesis.description}. Primary goal: ${hypothesis.primary_outcome}`,
      dom: mockPDP_HTML,
      variant: {
        changeType: 'modifyElement',
        selector: variant.selector,
        html: variant.html,
        css: variant.css,
        javascript_code: undefined
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
    
    console.log('='.repeat(60));
    console.log('✅ Test Complete!');
    console.log('📈 View full trace in LangSmith');
    console.log('='.repeat(60) + '\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error);
    process.exit(1);
  }
}

// Run the test
testSignalGeneration();

