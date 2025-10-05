# Experiment Management API

Complete API reference for managing experiments.

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/experiments` | List all experiments for a project |
| GET | `/api/experiments/:id` | Get a single experiment with details |
| POST | `/api/experiments` | Create a new experiment |
| PATCH | `/api/experiments/:id/status` | Update experiment status (start/pause/resume/complete) |
| DELETE | `/api/experiments/:id` | Delete an experiment |

---

## GET /api/experiments

Get all experiments for the authenticated user's project.

### Request

**Headers:**
```
Authorization: Bearer <token>
```

### Response (200 OK)

```json
[
  {
    "id": "cm1x7y8z9...",
    "name": "Button Color Test",
    "status": "RUNNING",
    "oec": "Increase conversion rate",
    "minDays": 7,
    "minSessionsPerVariant": 1000,
    "targetUrls": ["/products/*"],
    "createdAt": "2025-10-05T10:00:00.000Z",
    "publishedAt": "2025-10-05T11:00:00.000Z",
    "finishedAt": null
  }
]
```

---

## GET /api/experiments/:id

Get a single experiment with all related data (hypothesis, variants, traffic distribution).

### Request

**Headers:**
```
Authorization: Bearer <token>
```

**Parameters:**
- `id` (path) - Experiment ID

### Response (200 OK)

```json
{
  "id": "cm1x7y8z9...",
  "projectId": "cm1x7y8z9...",
  "name": "Button Color Test",
  "status": "RUNNING",
  "oec": "Increase conversion rate",
  "minDays": 7,
  "minSessionsPerVariant": 1000,
  "targetUrls": ["/products/*"],
  "createdAt": "2025-10-05T10:00:00.000Z",
  "publishedAt": "2025-10-05T11:00:00.000Z",
  "finishedAt": null,
  "hypothesis": {
    "id": "cm1x7y8z9...",
    "experimentId": "cm1x7y8z9...",
    "hypothesis": "Green button will increase conversions",
    "rationale": "Green color is associated with 'go' action",
    "primaryKpi": "conversion_rate",
    "createdAt": "2025-10-05T10:00:00.000Z"
  },
  "traffic": [
    {
      "id": "cm1x7y8z9...",
      "experimentId": "cm1x7y8z9...",
      "variantId": "control",
      "percentage": "0.3333"
    },
    {
      "id": "cm1x7y8z9...",
      "experimentId": "cm1x7y8z9...",
      "variantId": "A",
      "percentage": "0.3333"
    },
    {
      "id": "cm1x7y8z9...",
      "experimentId": "cm1x7y8z9...",
      "variantId": "B",
      "percentage": "0.3334"
    }
  ],
  "variants": [
    {
      "id": "cm1x7y8z9...",
      "experimentId": "cm1x7y8z9...",
      "variantId": "A",
      "selector": ".cta-button",
      "html": "<button class=\"green-btn\">Buy Now</button>",
      "css": ".green-btn { background: green; }",
      "position": "OUTER"
    },
    {
      "id": "cm1x7y8z9...",
      "experimentId": "cm1x7y8z9...",
      "variantId": "B",
      "selector": ".cta-button",
      "html": "<button class=\"blue-btn\">Buy Now</button>",
      "css": ".blue-btn { background: blue; }",
      "position": "OUTER"
    }
  ]
}
```

### Error Responses

**404 Not Found:**
```json
{
  "error": "NOT_FOUND",
  "message": "Experiment not found"
}
```

**403 Forbidden:**
```json
{
  "error": "FORBIDDEN",
  "message": "You do not have access to this experiment"
}
```

---

## POST /api/experiments

Create a new experiment. See [manual-experiment-creation.md](./manual-experiment-creation.md) for detailed documentation.

---

## PATCH /api/experiments/:id/status

Update experiment status with state transitions.

### Request

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Parameters:**
- `id` (path) - Experiment ID

**Body:**
```json
{
  "action": "start" | "pause" | "resume" | "complete"
}
```

### Actions

#### `start`
- **From:** `DRAFT`
- **To:** `RUNNING`
- **Effect:** Publishes experiment to Cloudflare, starts serving variants
- **Sets:** `publishedAt` timestamp

#### `pause`
- **From:** `RUNNING`
- **To:** `PAUSED`
- **Effect:** Unpublishes from Cloudflare, **STOPS serving variants to users**

#### `resume`
- **From:** `PAUSED`
- **To:** `RUNNING`
- **Effect:** Re-publishes to Cloudflare, **STARTS serving variants again**

#### `complete`
- **From:** `RUNNING` or `PAUSED`
- **To:** `COMPLETED`
- **Effect:** Unpublishes from Cloudflare, stops serving variants
- **Sets:** `finishedAt` timestamp

### State Transition Diagram

```
DRAFT ──(start)──> RUNNING ──(pause)──> PAUSED
                      │                    │
                      │                    │
                      └─────(complete)─────┘
                              │
                              ▼
                          COMPLETED
```

### Response (200 OK)

```json
{
  "success": true,
  "experiment": {
    "id": "cm1x7y8z9...",
    "status": "RUNNING",
    "publishedAt": "2025-10-05T12:00:00.000Z",
    ...
  }
}
```

### Error Responses

**400 Invalid State Transition:**
```json
{
  "error": "INVALID_STATE_TRANSITION",
  "message": "Cannot start experiment in RUNNING status. Only DRAFT experiments can be started."
}
```

**500 Publish Failed:**
```json
{
  "error": "PUBLISH_FAILED",
  "message": "Failed to publish experiment: Cloudflare API error"
}
```

### Examples

**Start an experiment:**
```bash
curl -X PATCH http://localhost:3000/api/experiments/cm1x7y8z9.../status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'
```

**Pause an experiment:**
```bash
curl -X PATCH http://localhost:3000/api/experiments/cm1x7y8z9.../status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"action": "pause"}'
```

**Resume an experiment:**
```bash
curl -X PATCH http://localhost:3000/api/experiments/cm1x7y8z9.../status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"action": "resume"}'
```

**Complete an experiment:**
```bash
curl -X PATCH http://localhost:3000/api/experiments/cm1x7y8z9.../status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"action": "complete"}'
```

---

## DELETE /api/experiments/:id

Delete an experiment and all related data (hypothesis, variants, traffic distribution).

### Request

**Headers:**
```
Authorization: Bearer <token>
```

**Parameters:**
- `id` (path) - Experiment ID

### Rules

- ✅ Can delete: `DRAFT`, `PAUSED`, `COMPLETED` experiments
- ❌ Cannot delete: `RUNNING` experiments (must pause/complete first)
- Automatically unpublishes from Cloudflare if needed
- Cascading delete removes all related data

### Response (200 OK)

```json
{
  "success": true,
  "message": "Experiment deleted successfully"
}
```

### Error Responses

**400 Invalid State:**
```json
{
  "error": "INVALID_STATE",
  "message": "Cannot delete a RUNNING experiment. Please pause or complete it first."
}
```

**404 Not Found:**
```json
{
  "error": "NOT_FOUND",
  "message": "Experiment not found"
}
```

**403 Forbidden:**
```json
{
  "error": "FORBIDDEN",
  "message": "You do not have access to this experiment"
}
```

### Example

```bash
curl -X DELETE http://localhost:3000/api/experiments/cm1x7y8z9... \
  -H "Authorization: Bearer <token>"
```

---

## Common Workflows

### Creating and Running an Experiment

1. **Create experiment** (DRAFT status by default)
   ```
   POST /api/experiments
   ```

2. **Review experiment details**
   ```
   GET /api/experiments/:id
   ```

3. **Start experiment** (publishes to Cloudflare)
   ```
   PATCH /api/experiments/:id/status
   Body: {"action": "start"}
   ```

### Stopping an Experiment

1. **Pause temporarily** (keeps published)
   ```
   PATCH /api/experiments/:id/status
   Body: {"action": "pause"}
   ```

2. **Or complete permanently** (unpublishes)
   ```
   PATCH /api/experiments/:id/status
   Body: {"action": "complete"}
   ```

### Deleting an Experiment

1. **If running, complete it first**
   ```
   PATCH /api/experiments/:id/status
   Body: {"action": "complete"}
   ```

2. **Then delete**
   ```
   DELETE /api/experiments/:id
   ```

---

## Status Meanings

| Status | Description | Serving State |
|--------|-------------|---------------|
| `DRAFT` | Created but not published. | ❌ Not serving |
| `RUNNING` | Published to Cloudflare. | ✅ Actively serving variants |
| `PAUSED` | Temporarily stopped. Unpublished from Cloudflare. | ❌ Not serving (can resume) |
| `COMPLETED` | Permanently finished. Unpublished from Cloudflare. | ❌ Not serving (cannot resume) |
| `FAILED` | (Future) Experiment failed to publish or encountered errors. | ❌ Not serving |

---

## Notes

- All endpoints require authentication via Better Auth
- All endpoints verify project ownership
- State transitions are strictly enforced
- Cloudflare publish/unpublish is automatic with state changes
- All deletes are cascading (removes hypothesis, variants, traffic)
