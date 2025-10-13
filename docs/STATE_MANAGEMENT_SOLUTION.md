# State Management Solution: Conversation History as Source of Truth

## Problem

The agent system was losing state between tool calls because it relied on in-memory singleton state managers:
- `hypothesisStateManager` - current hypothesis
- `variantStateManager` - current variants and job IDs  
- `experimentStateManager` - current experiment

This caused issues like:
- **Lost hypothesis**: When `create_experiment` was called, it couldn't find the hypothesis that was generated earlier
- **Production failures**: Multiple server instances don't share memory
- **Request isolation**: State was lost between requests

## Root Cause

The backend was trying to be **stateful** when it should be **stateless**. The frontend already sends the full conversation history with every request, including all tool call results. The backend wasn't using this data.

## Solution: Conversation History as State

Instead of storing state in memory, we now **extract state from the conversation history** that the frontend sends with each request.

### Architecture Changes

#### 1. Conversation State Extractor (`conversation-state.ts`)

A new module that extracts state from conversation history:
- `extractHypothesisFromHistory()` - Finds the most recent hypothesis from tool results
- `extractVariantJobIdsFromHistory()` - Finds variant job IDs  
- `extractVariantsFromHistory()` - Finds generated variants
- `extractExperimentIdFromHistory()` - Finds experiment ID

#### 2. Request Context (`request-context.ts`)

Uses Node.js `AsyncLocalStorage` to provide request-scoped access to conversation history:
- Tools can access conversation history without explicit parameter passing
- Maintains clean separation of concerns
- Thread-safe and request-isolated

#### 3. Updated State Managers

State managers now use a **two-tier approach**:
1. **In-memory cache** (fast path) - for same-request tool calls
2. **Conversation history fallback** - for cross-request state

Example from `hypothesis-state-manager.ts`:
```typescript
getCurrentHypothesis(conversationHistory?: ConversationMessage[]): Hypothesis | null {
  // Try in-memory cache first (fast)
  if (this.currentHypothesis) {
    return this.currentHypothesis;
  }

  // Fallback to conversation history (cross-request)
  if (conversationHistory) {
    const hypothesis = extractHypothesisFromHistory(conversationHistory);
    if (hypothesis) {
      // Cache it for performance
      this.currentHypothesis = hypothesis;
      return hypothesis;
    }
  }

  return null;
}
```

#### 4. Updated Agent Service

The agent now wraps AI streaming calls with request context:
```typescript
const result = runWithContext(
  {
    conversationHistory,
    projectId
  },
  () => ai.streamText(streamConfig)
);
```

This makes conversation history available to all tools via `getConversationHistory()`.

#### 5. Updated Tools

Tools now get conversation history from the request context:
```typescript
const conversationHistory = getConversationHistory();
const hypothesis = hypothesisStateManager.getCurrentHypothesis(conversationHistory);
```

## Benefits

### ✅ **Stateless Backend**
- No database migrations needed
- No additional persistence layer
- Easier to scale horizontally

### ✅ **Production-Ready**
- Works with multiple server instances
- State survives server restarts
- Request-isolated by design

### ✅ **Minimal Changes**
- Backward compatible with existing code
- Tools work the same way
- State managers remain the abstraction layer

### ✅ **Performance**
- In-memory cache for same-request calls
- Only falls back to history when needed
- No database queries for state

## How It Works: Example Flow

1. **User generates hypothesis**:
   - Tool: `generate_hypotheses`
   - Result stored in conversation history by frontend
   - State manager caches in memory

2. **User generates variants** (same request):
   - Tool: `generate_variants`
   - Gets hypothesis from in-memory cache ✅

3. **User creates experiment** (new request):
   - Tool: `create_experiment`  
   - In-memory cache is empty (new request)
   - Falls back to conversation history ✅
   - Finds hypothesis in previous tool result
   - Experiment created successfully ✅

## Files Modified

### New Files
- `src/domain/agent/conversation-state.ts` - State extraction utilities
- `src/domain/agent/request-context.ts` - Request-scoped context using AsyncLocalStorage

### Modified Files
- `src/domain/agent/hypothesis-state-manager.ts` - Added conversation history fallback
- `src/domain/agent/variant-state-manager.ts` - Added conversation history fallback
- `src/domain/agent/agent.ts` - Wraps streaming with request context
- `src/domain/agent/tools/create-experiment.ts` - Uses conversation history
- `src/domain/agent/tools/generate-variants.ts` - Uses conversation history

## Testing

The fix can be tested by:
1. Generating a hypothesis
2. Generating variants  
3. Creating an experiment

The experiment should now find the hypothesis from conversation history instead of throwing "No hypothesis available" error.

## Future Improvements

This pattern can be extended to:
- **Experiment state**: Track current experiment across requests
- **User preferences**: Extract user preferences from conversation
- **Context awareness**: Make tools aware of full conversation context
- **Multi-turn workflows**: Support complex workflows that span many requests

