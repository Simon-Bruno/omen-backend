import 'dotenv/config';
import { getActiveThemesDefault, getMainThemeDefault } from './src/infra/external/shopify';

// Override DATABASE_URL for local development
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/omen_db';

async function testThemeFetching() {
  try {
    console.log('Testing theme fetching with default project...\n');
    
    // Test fetching all active themes with default project
    console.log('1. Fetching all active themes:');
    const themes = await getActiveThemesDefault(5);
    console.log(`Found ${themes.length} themes:`);
    themes.forEach((theme, index) => {
      console.log(`  ${index + 1}. ${theme.name} (${theme.role}) - ID: ${theme.id}`);
    });
    
    console.log('\n2. Fetching main theme:');
    const mainTheme = await getMainThemeDefault();
    if (mainTheme) {
      console.log(`Main theme: ${mainTheme.name} - ID: ${mainTheme.id}`);
    } else {
      console.log('No main theme found');
    }
    
  } catch (error) {
    console.error('Error testing theme fetching:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

testThemeFetching();
