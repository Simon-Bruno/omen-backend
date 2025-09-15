import type { FastifyInstance } from 'fastify/types/instance.js';
import '@shared/fastify.d';
import { auth0 } from '@infra/auth0';
import { shopifyOAuth, shopify } from '@infra/external/shopify';
import { userService } from '@infra/services/user';
import { prisma } from '@infra/prisma';

export async function userRegistrationRoutes(fastify: FastifyInstance) {
    /**
     * Complete user registration flow
     * Step 1: Create user in Auth0 + Database + initiate Shopify OAuth
     */
    fastify.post('/register', async (request, reply) => {
        try {
            const { email, shop, password } = request.body as { 
                email: string; 
                shop: string; 
                password?: string; 
            };

            if (!email || !shop) {
                return reply.status(400).send({
                    error: 'BAD_REQUEST',
                    message: 'Email and shop domain are required',
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return reply.status(400).send({
                    error: 'BAD_REQUEST',
                    message: 'Invalid email format',
                });
            }

            // Normalize shop domain
            const normalizedShop = shopify.normalizeShopDomain(shop);
            
            // Check if user already exists in our database
            const existingUser = await prisma.user.findUnique({
                where: { email },
            });

            if (existingUser) {
                return reply.status(409).send({
                    error: 'CONFLICT',
                    message: 'User with this email already exists',
                });
            }

            // Step 1: Create user in Auth0 (or get existing)
            let auth0User;
            try {
                auth0User = await auth0.createUser(email, password);
            } catch (error) {
                if (error.message.includes('User already exists')) {
                    // User exists in Auth0, try to get them by email
                    const existingAuth0User = await auth0.getAuth0UserByEmail(email);
                    if (existingAuth0User) {
                        auth0User = existingAuth0User;
                    } else {
                        throw new Error('User exists in Auth0 but cannot be retrieved');
                    }
                } else {
                    throw error;
                }
            }

            // Step 2: Create user in our database
            const user = await userService.getOrCreateUser(auth0User.id, email);

            // Step 3: Generate OAuth URL for Shopify connection
            const { oauthUrl, state } = shopifyOAuth.generateRegistrationOAuthUrl(normalizedShop, email);

            return {
                message: 'User created successfully, proceed to Shopify OAuth',
                user: {
                    id: user.id,
                    email: user.email,
                    auth0Id: auth0User.id,
                },
                oauthUrl,
                state,
                shop: normalizedShop,
            };

        } catch (error: unknown) {
            fastify.log.error({ err: error }, 'User registration error:');

            if (error instanceof Error) {
                if (error.message.includes('User already exists')) {
                    return reply.status(409).send({
                        error: 'CONFLICT',
                        message: 'User with this email already exists',
                    });
                }
                if (error.message.includes('Invalid shop domain')) {
                    return reply.status(400).send({
                        error: 'BAD_REQUEST',
                        message: error.message,
                    });
                }
            }

            return reply.status(500).send({
                error: 'INTERNAL_ERROR',
                message: 'Failed to complete user registration',
            });
        }
    });

    /**
     * Complete user registration flow
     * Step 2: Handle Shopify OAuth callback and complete registration
     */
    fastify.get('/register/callback', async (request, reply) => {
        try {
            // Validate OAuth callback parameters
            const validation = shopify.validateCallbackParams(request.query as Record<string, string>);
            
            if (!validation.isValid) {
                return reply.status(400).send({
                    error: 'BAD_REQUEST',
                    message: validation.error,
                });
            }

            const { code, shop, hmac, state } = validation.params!;

            // Handle OAuth callback
            const { shopProfile, encryptedToken, email } = await shopifyOAuth.handleRegistrationCallback(
                code, shop, hmac, state
            );
            
            // Find the user by email and complete the registration
            const user = await prisma.user.findUnique({
                where: { email },
            });

            if (!user) {
                return reply.status(404).send({
                    error: 'NOT_FOUND',
                    message: 'User not found. Please try registration again.',
                });
            }

            // Create project and bind to user
            const result = await userService.bindProjectToUser(
                user.id,
                shopProfile.myshopify_domain,
                encryptedToken
            );

            // Redirect to frontend login page with success
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const successUrl = `${frontendUrl}/login?success=true&shop=${encodeURIComponent(shopProfile.myshopify_domain)}`;
            
            return reply.redirect(successUrl);

        } catch (error: unknown) {
            fastify.log.error({ err: error }, 'User registration OAuth callback error:');

            // Redirect to frontend login page with error
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const errorUrl = `${frontendUrl}/login?error=registration_failed`;
            
            return reply.redirect(errorUrl);
        }
    });
}
