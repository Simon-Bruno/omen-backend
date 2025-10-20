# Signal Generation Flow Analysis

## Summary: ✅ The flow is correct!

Signals are generated at the right times and properly persisted as `experimentGoals` in the database.

---

## Agent Flow Timeline

### 1️⃣ **Preview Experiment** (`preview-experiment.ts`)
**When:** After variants are generated, before experiment creation  
**What happens:**
- Calls `signalService.generationService.generateSignals()` (LLM call)
- Generates signal **proposals** (not persisted yet)
- Stores proposals in `signalStateManager` for later reuse
- Returns proposals to agent for display

**Code:**
```typescript
// Line 82
const proposal = await signalService.generationService.generateSignals({
  pageType,
  url: screenshot.url,
  intent: signalIntent, // Uses hypothesis.primary_outcome
  dom: screenshot.htmlContent, // Full HTML (no truncation!)
  variant: { ... }
});

// Line 107
signalStateManager.setCurrentProposal(proposal);
```

**Database:** ❌ Not persisted yet  
**Agent sees:** ✅ Signal proposals in preview response

---

### 2️⃣ **Create Experiment** (`create-experiment.ts`)
**When:** User confirms experiment creation  
**What happens:**

#### Path A: Use Cached Proposal (Normal Flow)
1. Retrieves cached proposal from `signalStateManager`
2. Validates proposal against control DOM
3. **Persists valid signals** to `experiment_goals` table via `SignalDAL.createSignals()`
4. Clears cache

**Code:**
```typescript
// Line 340
const cachedProposal = signalStateManager.getCurrentProposal();

// Line 357
const validationResult = await signalService.validator.validateProposal(...);

// Line 377 - ✅ PERSISTENCE HAPPENS HERE
await SignalDAL.createSignals(
  signalsToCreate.map(signal => SignalDAL.fromSignal(signal, experiment.id))
);
```

**Database:** ✅ **Persisted to `experiment_goals` table**

#### Path B: Fallback (No Cache)
1. Generates fresh signals using LLM
2. Calls `signalService.tryAutoGenerateForAllVariants()`
3. This method validates AND persists in one go

**Code:**
```typescript
// Line 419
const result = await signalService.tryAutoGenerateForAllVariants(
  experiment.id,
  screenshot.url,
  signalIntent,
  screenshot.htmlContent,
  variantsForValidation,
  true
);
```

**Database:** ✅ **Persisted to `experiment_goals` table**

---

### 3️⃣ **Publishing** (`experiment-publisher.ts`)
**When:** Immediately after creation (auto-publish)  
**What happens:**
- Validates signals using `validateForPublish()`
- Transforms `experimentGoals` → `PublishedGoal` format
- Publishes to Cloudflare with goals included

**Code:**
```typescript
// Pre-launch validation
const validation = await signalService.validateForPublish(experimentId);

// Transform for publishing
goals: experiment.goals?.map(goal => ({
  name: goal.name,
  type: goal.type as 'conversion' | 'purchase' | 'custom',
  role: (goal as any).role as 'primary' | 'mechanism' | 'guardrail',
  selector: goal.selector,
  // ... other fields
}))
```

**Database:** ✅ Reads from `experiment_goals` table

---

### 4️⃣ **Get Experiment Overview** (`get-experiment-overview.ts`)
**When:** Agent retrieves experiment details  
**What happens:**
- Queries experiment with `include: { goals: true }`
- Returns **persisted** signals from database
- Displays in formatted summary

**Code:**
```typescript
// Line 36
const experiment = await prisma.experiment.findUnique({
  where: { id: experimentId },
  include: {
    hypothesis: true,
    traffic: true,
    variants: true,
    goals: true, // ✅ Includes persisted signals
  },
});

// Line 61 - Display in summary
const goalsSummary = experiment.goals?.map(g => `- ${g.name} (${g.role})`).join('\n');
```

**Database:** ✅ Reads from `experiment_goals` table

---

## Database Persistence Verification

### Table: `experiment_goals`
**Schema:**
```prisma
model ExperimentGoal {
  id              String     @id @default(cuid())
  experimentId    String
  name            String
  type            String     // conversion | purchase | custom
  role            String     @default("primary") // primary | mechanism | guardrail
  selector        String?
  eventType       String?
  customJs        String?
  value           Float?
  valueSelector   String?
  currency        String?
  createdAt       DateTime   @default(now())
  targetUrls      Json?
  dataLayerEvent  String?
  existsInControl Boolean    @default(true)
  existsInVariant Boolean    @default(true)
  experiment      Experiment @relation(fields: [experimentId], references: [id], onDelete: Cascade)

  @@index([experimentId])
  @@index([experimentId, role])
  @@map("experiment_goals")
}
```

### Persistence Method
**File:** `src/infra/dal/signal.ts`

```typescript
// Line 52
static async createSignals(signals: CreateSignalData[]): Promise<PersistedGoal[]> {
  const created = await prisma.$transaction(
    signals.map(data =>
      prisma.experimentGoal.create({
        data: {
          experimentId: data.experimentId,
          name: data.name,
          type: data.type,
          role: data.role,
          selector: data.selector,
          // ... all fields mapped
        },
      })
    )
  );
  return created.map(this.mapToPersistedGoal);
}
```

**Transaction:** ✅ Uses `$transaction` for atomic writes  
**Mapping:** ✅ Properly maps `Signal` → `CreateSignalData` → Prisma model

---

## Verification Checklist

| Step | Status | Notes |
|------|--------|-------|
| Signals generated in preview | ✅ | Using full HTML (no truncation) |
| Proposals cached in state manager | ✅ | Avoids redundant LLM calls |
| Validation before persistence | ✅ | Checks control DOM, catalog rules |
| Persisted to `experiment_goals` | ✅ | Via `SignalDAL.createSignals()` |
| Publishing includes goals | ✅ | Transforms to `PublishedGoal` format |
| Overview retrieves goals | ✅ | Includes in Prisma query |
| Experiment blocks without signals | ✅ | Won't publish if validation fails |

---

## Potential Issues

### ⚠️ Issue 1: Validation Might Still Fail
**Why:** Even with full HTML, the LLM might propose selectors that don't exist in the control DOM (e.g., targeting variant-only elements as primary).

**Fix:** The validator correctly rejects these, but it blocks experiment publishing.

**Recommendation:** Consider a fallback where the system proposes a conservative default signal (e.g., `add_to_cart_click` for PDP) if LLM generation fails.

### ⚠️ Issue 2: No Signal Re-generation After Validation Failure
**Current behavior:** If cached proposal fails validation, experiment is created in DRAFT but signals aren't auto-fixed.

**Fix:** Could implement auto-retry with a more conservative prompt, but probably better to fail fast and let user know.

---

## Conclusion

**✅ The flow is working correctly:**
1. Signals are generated once during preview (efficient)
2. Cached and reused during creation (avoids redundant LLM calls)
3. Validated before persistence (ensures quality)
4. Persisted as `experimentGoals` (database records)
5. Retrieved and displayed in overview (agent can see them)
6. Published to Cloudflare (experiments run with signals)

**Next steps:**
- Test with a real experiment creation flow
- Verify signals appear in database with: `SELECT * FROM experiment_goals;`
- Check LangSmith trace for signal generation prompt/response

