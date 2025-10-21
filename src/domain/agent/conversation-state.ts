/**
 * Conversation State Extractor
 * 
 * Extracts state from conversation history (tool call results) instead of relying on in-memory state.
 * This makes the backend stateless and allows it to scale horizontally.
 */

import { Hypothesis } from '@features/hypotheses_generation/types';
import { Variant } from '@features/variant_generation/types';

export interface ConversationMessage {
  role: string;
  content: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_results?: Array<{
    tool_call_id: string;
    content: string;
  }>;
}

/**
 * Extract the most recent hypothesis from conversation history
 */
export async function extractHypothesisFromHistory(conversationHistory?: ConversationMessage[]): Promise<Hypothesis | null> {
  if (!conversationHistory) {
    console.log('[CONVERSATION_STATE] No conversation history provided');
    return null;
  }

  // Search backwards through conversation history for generate_hypotheses tool results
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const message = conversationHistory[i];
    
    if (message.tool_results && message.tool_results.length > 0) {
      for (const toolResult of message.tool_results) {
        try {
          const content = JSON.parse(toolResult.content);
          
          // Check if this is a hypothesis generation result
          if (content.hypotheses && Array.isArray(content.hypotheses) && content.hypotheses.length > 0) {
            console.log('[CONVERSATION_STATE] Found hypothesis in conversation history');
            const hypothesis = content.hypotheses[0];
            // Store the URL in state manager if available
            if (content.hypothesisUrl) {
              console.log(`[CONVERSATION_STATE] Found hypothesis URL in conversation history: ${content.hypothesisUrl}`);
              const { hypothesisStateManager } = await import('./hypothesis-state-manager');
              hypothesisStateManager.setCurrentHypothesis(hypothesis, content.hypothesisUrl);
            }
            return hypothesis;
          }
          
          // Also check for hypothesesSchema format
          if (content.hypothesesSchema) {
            try {
              const parsed = JSON.parse(content.hypothesesSchema);
              if (parsed.hypotheses && parsed.hypotheses.length > 0) {
                console.log('[CONVERSATION_STATE] Found hypothesis in hypothesesSchema');
                return parsed.hypotheses[0];
              }
            } catch (e) {
              // Not valid JSON, continue searching
            }
          }
        } catch (e) {
          // Not JSON or invalid format, continue searching
          continue;
        }
      }
    }
  }

  console.log('[CONVERSATION_STATE] No hypothesis found in conversation history');
  return null;
}

/**
 * Extract the most recent variant job IDs from conversation history
 */
export function extractVariantJobIdsFromHistory(conversationHistory?: ConversationMessage[]): string[] | null {
  if (!conversationHistory) {
    console.log('[CONVERSATION_STATE] No conversation history provided');
    return null;
  }

  // Search backwards through conversation history for generate_variants tool results
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const message = conversationHistory[i];
    
    if (message.tool_results && message.tool_results.length > 0) {
      for (const toolResult of message.tool_results) {
        try {
          const content = JSON.parse(toolResult.content);
          
          // Check if this is a variant generation result with job IDs
          if (content.jobIds && Array.isArray(content.jobIds) && content.jobIds.length > 0) {
            console.log('[CONVERSATION_STATE] Found variant job IDs in conversation history:', content.jobIds);
            return content.jobIds;
          }
        } catch (e) {
          // Not JSON or invalid format, continue searching
          continue;
        }
      }
    }
  }

  console.log('[CONVERSATION_STATE] No variant job IDs found in conversation history');
  return null;
}

/**
 * Extract the most recent variants from conversation history
 */
export function extractVariantsFromHistory(conversationHistory?: ConversationMessage[]): Variant[] | null {
  if (!conversationHistory) {
    console.log('[CONVERSATION_STATE] No conversation history provided');
    return null;
  }

  // Search backwards through conversation history for variant results
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const message = conversationHistory[i];
    
    if (message.tool_results && message.tool_results.length > 0) {
      for (const toolResult of message.tool_results) {
        try {
          const content = JSON.parse(toolResult.content);
          
          // Check if this has variants in variantsSchema
          if (content.variantsSchema && content.variantsSchema.variants) {
            console.log('[CONVERSATION_STATE] Found variants in conversation history');
            return content.variantsSchema.variants;
          }
          
          // Also check for direct variants array
          if (content.variants && Array.isArray(content.variants) && content.variants.length > 0) {
            console.log('[CONVERSATION_STATE] Found direct variants array in conversation history');
            return content.variants;
          }
        } catch (e) {
          // Not JSON or invalid format, continue searching
          continue;
        }
      }
    }
  }

  console.log('[CONVERSATION_STATE] No variants found in conversation history');
  return null;
}

/**
 * Extract the most recent experiment ID from conversation history
 */
export function extractExperimentIdFromHistory(conversationHistory?: ConversationMessage[]): string | null {
  if (!conversationHistory) {
    console.log('[CONVERSATION_STATE] No conversation history provided');
    return null;
  }

  // Search backwards through conversation history for create_experiment tool results
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const message = conversationHistory[i];
    
    if (message.tool_results && message.tool_results.length > 0) {
      for (const toolResult of message.tool_results) {
        try {
          const content = JSON.parse(toolResult.content);
          
          // Check if this is an experiment creation result
          if (content.experimentId) {
            console.log('[CONVERSATION_STATE] Found experiment ID in conversation history:', content.experimentId);
            return content.experimentId;
          }
        } catch (e) {
          // Not JSON or invalid format, continue searching
          continue;
        }
      }
    }
  }

  console.log('[CONVERSATION_STATE] No experiment ID found in conversation history');
  return null;
}

