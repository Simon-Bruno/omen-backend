import crypto from 'crypto';
import { shopifyConfig } from './external/shopify/config';

/**
 * Encryption utilities for sensitive data like Shopify access tokens
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For GCM, this is always 16
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Encrypt a string using AES-256-GCM
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  
  // Derive key from password and salt
  const key = crypto.pbkdf2Sync(shopifyConfig.encryptionKey, salt, 100000, 32, 'sha512');
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(salt);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  // Combine salt + iv + tag + encrypted data
  const combined = Buffer.concat([salt, iv, tag, Buffer.from(encrypted, 'hex')]);
  
  return combined.toString('base64');
}

/**
 * Decrypt a string using AES-256-GCM
 */
export function decrypt(encryptedData: string): string {
  const combined = Buffer.from(encryptedData, 'base64');
  
  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  
  // Derive key from password and salt
  const key = crypto.pbkdf2Sync(shopifyConfig.encryptionKey, salt, 100000, 32, 'sha512');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(salt);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Generate HMAC for Shopify OAuth verification
 */
export function generateHmac(queryString: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}

/**
 * Verify HMAC for Shopify OAuth
 */
export function verifyHmac(queryString: string, secret: string, hmac: string): boolean {
  const expectedHmac = generateHmac(queryString, secret);
  return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'));
}
