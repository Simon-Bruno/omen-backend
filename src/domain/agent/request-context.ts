/**
 * Request Context using AsyncLocalStorage
 * 
 * Provides request-scoped storage for conversation history
 * that tools can access without explicit parameter passing.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { ConversationMessage } from './conversation-state';

interface RequestContext {
  conversationHistory?: ConversationMessage[];
  projectId?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Set the conversation history for the current request
 */
export function setRequestContext(context: RequestContext): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    Object.assign(store, context);
  }
}

/**
 * Get the conversation history for the current request
 */
export function getConversationHistory(): ConversationMessage[] | undefined {
  const store = asyncLocalStorage.getStore();
  return store?.conversationHistory;
}

/**
 * Get the project ID for the current request
 */
export function getRequestProjectId(): string | undefined {
  const store = asyncLocalStorage.getStore();
  return store?.projectId;
}

/**
 * Run a function with request context
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the full request context
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

