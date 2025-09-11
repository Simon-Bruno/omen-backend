/**
 * Auth0 Configuration
 * 
 * Environment variables required:
 * - AUTH0_DOMAIN: Your Auth0 tenant domain (e.g., "your-tenant.auth0.com")
 * - AUTH0_AUDIENCE: Your API identifier from Auth0 dashboard
 * - AUTH0_ISSUER: Usually "https://{AUTH0_DOMAIN}/"
 */

export const auth0Config = {
  domain: process.env.AUTH0_DOMAIN!,
  audience: process.env.AUTH0_AUDIENCE!,
  issuer: process.env.AUTH0_ISSUER!,
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
};

// Validate required environment variables
const requiredEnvVars = ['AUTH0_DOMAIN', 'AUTH0_AUDIENCE', 'AUTH0_ISSUER'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}
