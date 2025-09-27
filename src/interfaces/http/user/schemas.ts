import { z } from 'zod';

/**
 * Base user schema derived from Prisma User model
 * This ensures consistency between database and validation
 */
const BaseUserSchema = z.object({
  id: z.string().cuid(),
  auth0Id: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Schema for user registration request body
 * Only includes fields that can be provided during registration
 */
export const UserRegistrationSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .min(1, 'Email is required'),
  shop: z.string()
    .min(1, 'Shop domain is required')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.myshopify\.com$/, 'Invalid Shopify domain format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .optional(),
  firstName: z.string()
    .min(1, 'First name is required')
    .max(50, 'First name must be less than 50 characters')
    .optional()
    .default(''),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be less than 50 characters')
    .optional()
    .default(''),
});

/**
 * Schema for user creation (internal use)
 * Used when creating users in the database
 */
export const UserCreateSchema = z.object({
  auth0Id: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
});

// Export types
export type UserRegistrationRequest = z.infer<typeof UserRegistrationSchema>;
export type UserCreateRequest = z.infer<typeof UserCreateSchema>;
export type User = z.infer<typeof BaseUserSchema>;
