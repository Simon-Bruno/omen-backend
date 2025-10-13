import 'dotenv/config';
import { DesignSystemExtractor } from './src/features/variant_generation/design-system-extractor';

async function testImprovedDesignSystemExtraction() {
  console.log('Testing improved design system extraction (no hallucination)...');
  
  const extractor = new DesignSystemExtractor();
  
  try {
    const designSystem = await extractor.extractDesignSystemWithFirecrawl('https://shop.omen.so');
    
    console.log('✅ Design system extracted successfully!');
    console.log('Colors (only visible ones):', JSON.stringify(designSystem.design_tokens.colors, null, 2));
    console.log('Typography (from HTML):', JSON.stringify(designSystem.design_tokens.typography, null, 2));
    console.log('Spacing (from HTML):', JSON.stringify(designSystem.design_tokens.spacing, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testImprovedDesignSystemExtraction();
