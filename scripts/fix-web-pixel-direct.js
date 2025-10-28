#!/usr/bin/env node

/**
 * Fix web pixel project ID - tries create first, then update if needed
 */

require('dotenv').config();
const crypto = require('crypto');

// Use dynamic import for fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function fixWebPixelDirect() {
  try {
    console.log('🚀 Fixing web pixel with correct project ID...');
    
    const shopDomain = 'omen-mvp.myshopify.com';
    const projectId = 'cmgcio3xn0000vz0wa1cy3a3d';
    
    // Get access token from database
    const { execSync } = require('child_process');
    const dbQuery = `docker exec omen-backend-postgres-1 psql -U postgres -d omen_db -c "SELECT \\"accessTokenEnc\\" FROM projects WHERE \\"shopDomain\\" = '${shopDomain}' LIMIT 1;" -t`;
    
    console.log('📝 Getting access token from database...');
    const dbResult = execSync(dbQuery, { encoding: 'utf8' });
    const accessTokenEnc = dbResult.trim();
    
    if (!accessTokenEnc) {
      throw new Error(`No access token found for shop: ${shopDomain}`);
    }
    
    // Decrypt the token using the same method as the backend
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY not found in environment');
    }
    
    const ALGORITHM = 'aes-256-gcm';
    const IV_LENGTH = 16;
    const SALT_LENGTH = 64;
    const TAG_LENGTH = 16;
    
    const combined = Buffer.from(accessTokenEnc, 'base64');
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    const key = crypto.pbkdf2Sync(encryptionKey, salt, 100000, 32, 'sha512');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(salt);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    const accessToken = decrypted;
    
    console.log(`📝 Shop Domain: ${shopDomain}`);
    console.log(`📝 Project ID: ${projectId}`);
    console.log(`📝 Access Token: ${accessToken.substring(0, 20)}...`);
    
    const variables = {
      webPixel: {
        settings: {
          projectId: projectId
        }
      }
    };
    
    // Try to create first
    console.log('📝 Attempting to create web pixel...');
    const createMutation = `
      mutation webPixelCreate($webPixel: WebPixelInput!) {
        webPixelCreate(webPixel: $webPixel) {
          userErrors {
            field
            message
            code
          }
          webPixel {
            id
            settings
          }
        }
      }
    `;
    
    const createResponse = await fetch(`https://${shopDomain}/admin/api/2024-07/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({
        query: createMutation,
        variables: variables
      })
    });
    
    const createResult = await createResponse.json();
    
    if (createResult.errors) {
      console.error('❌ GraphQL Errors:', createResult.errors);
      return;
    }
    
    const webPixelResult = createResult.data.webPixelCreate;
    
    if (webPixelResult.userErrors && webPixelResult.userErrors.length > 0) {
      const error = webPixelResult.userErrors[0];
      if (error.code === 'TAKEN') {
        console.log('📝 Web pixel already exists, trying to update...');
        
        // Since we can't list web pixels, we need to use a different approach
        // Let's try to delete and recreate
        console.log('📝 Web pixel exists but we cannot update without ID');
        console.log('📝 You may need to manually update the web pixel in Shopify admin');
        console.log('📝 Or delete the existing web pixel and run this script again');
        
        console.log('\n📝 Manual steps:');
        console.log('1. Go to Shopify Admin > Settings > Customer events');
        console.log('2. Find the Omen web pixel');
        console.log('3. Update the Project ID to:', projectId);
        console.log('4. Save the changes');
        
        return;
      } else {
        console.error('❌ Web Pixel Creation Errors:', webPixelResult.userErrors);
        return;
      }
    }
    
    if (webPixelResult.webPixel) {
      console.log('✅ Web pixel created successfully!');
      console.log(`📝 Web Pixel ID: ${webPixelResult.webPixel.id}`);
      console.log(`📝 Settings: ${JSON.stringify(webPixelResult.webPixel.settings, null, 2)}`);
      console.log('✅ The web pixel will now use the correct project ID for all events');
    } else {
      console.log('❌ No web pixel was created');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixWebPixelDirect();


