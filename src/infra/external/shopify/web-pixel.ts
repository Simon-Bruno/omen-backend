import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import { decrypt } from '../../encryption';

const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET!,
    scopes: ['write_pixels', 'read_customer_events'],
    hostName: process.env.HOST_NAME || 'localhost',
    apiVersion: ApiVersion.July25,
    isEmbeddedApp: false,
});

export interface WebPixelCreateResult {
    success: boolean;
    webPixelId?: string;
    error?: string;
}

/**
 * Create a web pixel for a Shopify store
 */
export async function createWebPixel(
    shopDomain: string,
    accessToken: string,
    accountId: string = "cmgcio3xn0000vz0wa1cy3a3d"
): Promise<WebPixelCreateResult> {
    try {
        const session = new Session({
            id: `offline_${shopDomain}`,
            shop: shopDomain,
            state: "state",
            isOnline: false,
            accessToken: accessToken,
        });

        const client = new shopify.clients.Graphql({ session });

        const mutation = `
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
                    projectId: accountId
                }
            }
        };

        const response = await client.query({
            data: {
                query: mutation,
                variables: variables
            }
        }) as any;

        const data = response.body.data.webPixelCreate;

        if (data.userErrors && data.userErrors.length > 0) {
            return {
                success: false,
                error: `Web pixel creation failed: ${data.userErrors.map((e: any) => e.message).join(', ')}`
            };
        }

        return {
            success: true,
            webPixelId: data.webPixel?.id
        };

    } catch (error: any) {
        console.error('Error creating web pixel:', error);
        return {
            success: false,
            error: `Failed to create web pixel: ${error.message}`
        };
    }
}

/**
 * Create web pixel with encrypted access token
 */
export async function createWebPixelWithEncryptedToken(
    shopDomain: string,
    encryptedAccessToken: string,
    accountId: string = "cmgcio3xn0000vz0wa1cy3a3d"
): Promise<WebPixelCreateResult> {
    try {
        const accessToken = decrypt(encryptedAccessToken);
        return await createWebPixel(shopDomain, accessToken, accountId);
    } catch (error: any) {
        console.error('Error decrypting access token:', error);
        return {
            success: false,
            error: `Failed to decrypt access token: ${error.message}`
        };
    }
}
