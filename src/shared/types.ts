/**
 * Shared Type Definitions
 * 
 * This file contains all shared types used across the application.
 * Following Clean Architecture, these are framework-agnostic types.
 */

// Request parameter types
export interface ProjectParams {
  projectId: string;
}

// Request body types
export interface ProjectBody {
  projectId?: string;
}

// User context types
export interface UserContext {
  userId: string;
  projectId?: string;
}

// Auth0 user types
export interface Auth0User {
  id: string;
  email: string;
  project?: {
    id: string;
    shopDomain: string;
  };
}

// API response types
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
