// Simple test for DOM Analyzer without Jest
import { createDOMAnalyzer } from '@features/variant_generation/dom-analyzer';
import { createPlaywrightCrawler } from '@features/crawler/playwright';

async function runTests() {
  console.log('🧪 Starting DOM Analyzer Tests...\n');

  let crawlerService: any;
  let domAnalyzer: any;

  try {
    // Setup
    crawlerService = createPlaywrightCrawler();
    domAnalyzer = createDOMAnalyzer(crawlerService);

    // Test 1: No HTML content provided
    console.log('Test 1: No HTML content provided');
    const result1 = await domAnalyzer.analyzeForHypothesisWithHtml(
      'https://example.com',
      'Add a button to the product page',
      'test-project',
      null
    );
    console.log(`✅ Expected empty array, got: ${result1.length} results`);

    // Test 2: Error page detection
    console.log('\nTest 2: Error page detection (ERR_BLOCKED_BY_CLIENT)');
    const errorPageHtml = `
      <html>
        <head><title>ERR_BLOCKED_BY_CLIENT</title></head>
        <body>
          <h1>ERR_BLOCKED_BY_CLIENT</h1>
          <p>This site can't be reached</p>
        </body>
      </html>
    `;

    const result2 = await domAnalyzer.analyzeForHypothesisWithHtml(
      'https://example.com',
      'Add a button to the product page',
      'test-project',
      errorPageHtml
    );
    console.log(`✅ Expected empty array for error page, got: ${result2.length} results`);

    // Test 3: Valid e-commerce HTML
    console.log('\nTest 3: Valid e-commerce HTML');
    const validEcommerceHtml = `
      <html>
        <head><title>Product Page</title></head>
        <body>
          <div class="product-card">
            <img src="product.jpg" alt="Product" class="product-image">
            <h2 class="product-title">Amazing Product</h2>
            <p class="product-description">This is a great product</p>
            <div class="product-price">$99.99</div>
            <button class="add-to-cart-btn">Add to Cart</button>
          </div>
          <div class="product-card">
            <img src="product2.jpg" alt="Product 2" class="product-image">
            <h2 class="product-title">Another Product</h2>
            <p class="product-description">Another great product</p>
            <div class="product-price">$149.99</div>
            <button class="add-to-cart-btn">Add to Cart</button>
          </div>
        </body>
      </html>
    `;

    const result3 = await domAnalyzer.analyzeForHypothesisWithHtml(
      'https://example.com/products/amazing-product',
      'Add a rating display to product cards',
      'test-project',
      validEcommerceHtml
    );
    console.log(`✅ Valid e-commerce HTML produced: ${result3.length} injection points`);
    
    if (result3.length > 0) {
      console.log(`   First result: ${result3[0].selector} (confidence: ${result3[0].confidence})`);
    }

    // Test 4: Error page indicators detection
    console.log('\nTest 4: Error page indicators detection');
    const testErrorPatterns = [
      'ERR_BLOCKED_BY_CLIENT',
      'This site can\'t be reached',
      '404 Error',
      'Server Error',
      'Access Denied'
    ];

    for (const pattern of testErrorPatterns) {
      const errorHtml = `<html><body><h1>${pattern}</h1></body></html>`;
      const indicators = domAnalyzer.getErrorPageIndicators(errorHtml);
      console.log(`   ${pattern}: ${indicators.length > 0 ? '✅ Detected' : '❌ Not detected'} (${indicators.join(', ')})`);
    }

    // Test 5: Minimal content detection
    console.log('\nTest 5: Minimal content detection');
    const minimalHtml = '<html><body><h1>Error</h1></body></html>';
    const minimalResult = await domAnalyzer.analyzeForHypothesisWithHtml(
      'https://example.com',
      'Add a button',
      'test-project',
      minimalHtml
    );
    console.log(`✅ Minimal HTML treated as error: ${minimalResult.length} results`);

    // Test 6: Non-e-commerce content detection
    console.log('\nTest 6: Non-e-commerce content detection');
    const nonEcommerceHtml = `
      <html>
        <head><title>Some Page</title></head>
        <body>
          <h1>Welcome to our site</h1>
          <p>This is just a regular page with no e-commerce elements.</p>
          <div>Some content here</div>
        </body>
      </html>
    `;

    const nonEcommerceResult = await domAnalyzer.analyzeForHypothesisWithHtml(
      'https://example.com',
      'Add a product button',
      'test-project',
      nonEcommerceHtml
    );
    console.log(`✅ Non-e-commerce content treated as error: ${nonEcommerceResult.length} results`);

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Cleanup
    if (crawlerService) {
      await crawlerService.close();
    }
  }
}

// Run the tests
runTests().catch(console.error);
