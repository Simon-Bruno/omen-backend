#!/usr/bin/env node

/**
 * Force recreate web pixel by trying more deletion strategies
 */

require('dotenv').config();
const crypto = require('crypto');

// Use dynamic import for fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function forceRecreateWebPixel() {
  try {
    console.log('🚀 Force recreating web pixel...');
    
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
    
    // Try to delete with a wider range of possible IDs
    console.log('📝 Attempting to delete existing web pixel with wider ID range...');
    
    const possibleIds = [];
    // Try IDs from 1 to 100
    for (let i = 1; i <= 100; i++) {
      possibleIds.push(`gid://shopify/WebPixel/${i}`);
    }
    
    let deleted = false;
    let deletedId = null;
    
    // Try to delete in batches to avoid rate limiting
    for (let i = 0; i < possibleIds.length; i += 10) {
      const batch = possibleIds.slice(i, i + 10);
      
      for (const webPixelId of batch) {
        const deleteMutation = `
          mutation webPixelDelete($id: ID!) {
            webPixelDelete(id: $id) {
              userErrors {
                field
                message
                code
              }
              deletedWebPixelId
            }
          }
        `;
        
        const deleteResponse = await fetch(`https://${shopDomain}/admin/api/2024-07/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken
          },
          body: JSON.stringify({
            query: deleteMutation,
            variables: { id: webPixelId }
          })
        });
        
        const deleteResult = await deleteResponse.json();
        
        if (deleteResult.errors) {
          continue;
        }
        
        const deleteData = deleteResult.data.webPixelDelete;
        
        if (deleteData.userErrors && deleteData.userErrors.length > 0) {
          continue;
        }
        
        if (deleteData.deletedWebPixelId) {
          console.log(`✅ Successfully deleted web pixel: ${deleteData.deletedWebPixelId}`);
          deleted = true;
          deletedId = deleteData.deletedWebPixelId;
          break;
        }
      }
      
      if (deleted) break;
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!deleted) {
      console.log('📝 No existing web pixel found to delete after checking 100 possible IDs');
      console.log('📝 The web pixel might be managed by a different app or have a different ID format');
      console.log('📝 Proceeding to try creating anyway...');
    }
    
    // Now create a new web pixel with the correct project ID
    console.log('📝 Creating new web pixel with correct project ID...');
    
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
    
    const variables = {
      webPixel: {
        settings: {
          projectId: projectId
        }
      }
    };
    
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
        console.log('❌ Web pixel still exists and cannot be deleted via API');
        console.log('📝 Manual deletion required:');
        console.log('1. Go to Shopify Admin > Settings > Customer events');
        console.log('2. Find and delete the Omen web pixel');
        console.log('3. Run this script again');
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

forceRecreateWebPixel();


