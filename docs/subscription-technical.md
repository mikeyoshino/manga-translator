# Subscription System — Technical Solution

Complete technical documentation for the WunPlae.com subscription system implementation.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                        Frontend                           │
│  AuthContext → subscription + permissions                  │
│  usePermission("editor.magic_remover") → true/false       │
│  402 interceptor → out-of-tokens modal                    │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTP
┌───────────────────────▼──────────────────────────────────┐
│                      API Server                           │
│                                                           │
│  GET  /auth/me         → profile + subscription + perms   │
│  GET  /subscription/me → subscription details             │
│  GET  /subscription/tiers → all tier definitions          │
│  POST /subscription/subscribe → create/upgrade sub        │
│  POST /subscription/cancel → cancel at period end         │
│  POST /subscription/reactivate → undo cancel              │
│  GET  /subscription/permissions → resolved permissions    │
│  GET  /subscription/check/{feature} → single check        │
│                                                           │
│  token_guard.py → 402 with {balance, required, tier}      │
│  subscription.py → tier cache, permission resolver        │
└───────────────────────┬──────────────────────────────────┘
                        │ service_role
┌───────────────────────▼──────────────────────────────────┐
│                      Redis (shared)                       │
│                                                           │
│  cache:subscription_tiers → JSON, 1h TTL                  │
│  (shared across all API instances)                        │
└───────────────────────┬──────────────────────────────────┘
                        │ fallback on miss
┌───────────────────────▼──────────────────────────────────┐
│                    Supabase (Postgres)                     │
│                                                           │
│  subscription_tiers   → 4 rows, JSONB features            │
│  subscriptions        → 1 per user, billing state         │
│  subscription_payments → tracks recurring charges         │
│  profiles.tier_id     → quick tier lookup (denormalized)  │
│                                                           │
│  RPC: refresh_subscription_tokens() → rollover + credit   │
│  Trigger: handle_new_user() → creates free subscription   │
└──────────────────────────────────────────────────────────┘
```

---

## Database Changes

### Migration: `006_subscription_tiers.sql`

**File**: `supabase/migrations/006_subscription_tiers.sql`

#### New Tables

##### `subscription_tiers` (Reference)

Static reference table with 4 rows. Rarely changes — cached in API memory.

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | `'free'`, `'starter'`, `'pro'`, `'premium'` |
| `name` | TEXT | Display name |
| `price_satangs` | INT | Monthly price (e.g., 9900 = ฿99) |
| `annual_price_satangs` | INT | Annual price (e.g., 99000 = ฿990) |
| `monthly_tokens` | INT | Tokens credited each billing cycle |
| `token_cost_per_image` | INT | Tokens per image (default 10) |
| `max_projects` | INT | Project limit |
| `project_expiry_days` | INT | Auto-delete after N days |
| `max_rollover` | INT | Max rollover tokens |
| `batch_limit` | INT | Max images per batch |
| `features` | JSONB | Feature permission flags |

**Seed data:**

| id | price | annual | tokens | projects | expiry | batch | key features |
|---|---|---|---|---|---|---|---|
| free | ฿0 | ฿0 | 50 | 1 | 7d | 1 | basic only |
| starter | ฿99 | ฿990 | 500 | 3 | 14d | 5 | basic only |
| pro | ฿249 | ฿2,490 | 2,000 | 10 | 30d | 20 | pro tools + gpt-4o |
| premium | ฿490 | ฿4,900 | 5,000 | 50 | 60d | 50 | all features + claude |

##### `subscriptions` (Per User)

One row per user. Created automatically on signup (free tier).

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | Auto-increment |
| `user_id` | UUID UNIQUE FK | → profiles(id), one subscription per user |
| `tier_id` | TEXT FK | → subscription_tiers(id) |
| `billing_cycle` | TEXT | `'monthly'` or `'annual'` |
| `status` | TEXT | `'active'`, `'cancelled'`, `'past_due'`, `'expired'` |
| `current_period_start` | TIMESTAMPTZ | Billing period start |
| `current_period_end` | TIMESTAMPTZ | Billing period end |
| `tokens_refreshed_at` | TIMESTAMPTZ | Last token credit time |
| `rollover_tokens` | INT | Tokens rolled over this cycle |
| `omise_schedule_id` | TEXT | Omise recurring schedule ID |
| `omise_customer_id` | TEXT | Omise customer ID (saved cards) |
| `cancel_at_period_end` | BOOLEAN | Don't renew flag |

##### `subscription_payments`

Tracks recurring subscription charges separately from one-time top-ups.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL PK | Auto-increment |
| `user_id` | UUID FK | → profiles(id) |
| `subscription_id` | BIGINT FK | → subscriptions(id) |
| `omise_charge_id` | TEXT UNIQUE | Omise charge ID |
| `tier_id` | TEXT FK | Which tier was charged |
| `billing_cycle` | TEXT | monthly/annual |
| `amount_satangs` | INT | Amount charged |
| `tokens_credited` | INT | Tokens given |
| `status` | TEXT | pending/successful/failed/refunded |
| `period_start/end` | TIMESTAMPTZ | Which billing period |

#### Column Addition

- `profiles.tier_id` — TEXT DEFAULT `'free'`, FK → subscription_tiers(id)
  - Denormalized for quick lookups (avoids JOIN on every request)
  - Kept in sync by subscription service

#### New RPC Function

**`refresh_subscription_tokens(p_user_id, p_monthly_tokens, p_max_rollover)`**

Called on renewal. Atomically:
1. Locks profile row (`SELECT ... FOR UPDATE`)
2. Calculates rollover: `min(current_balance, max_rollover)`
3. Sets new balance: `rollover + monthly_tokens`
4. Logs rollover cap adjustment (if tokens were capped)
5. Logs subscription credit transaction
6. Updates `subscriptions.rollover_tokens` and `tokens_refreshed_at`

Formula: `new_balance = min(current_balance, max_rollover) + monthly_tokens`

#### Updated Trigger

**`handle_new_user()`** — Now also creates a free subscription row alongside the profile and signup bonus.

#### RLS Policies

- `subscription_tiers`: readable by everyone (public reference data)
- `subscriptions`: users read own, service_role manages all
- `subscription_payments`: users read own, service_role manages all

#### Migration Safety

- All operations use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`
- Backfills free subscriptions for existing users
- Safe to run multiple times (idempotent)

---

## API Changes

### New Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/subscription/tiers` | No | List all tier definitions (public) |
| GET | `/subscription/me` | Yes | Current user's subscription + permissions |
| POST | `/subscription/subscribe` | Yes | Subscribe/upgrade to a tier |
| POST | `/subscription/cancel` | Yes | Cancel at period end |
| POST | `/subscription/reactivate` | Yes | Undo pending cancellation |
| GET | `/subscription/permissions` | Yes | Resolved feature permissions |
| GET | `/subscription/check/{feature}` | Yes | Check single feature permission |

### Modified Endpoints

#### `GET /auth/me`

**Before:**
```json
{
  "id": "...",
  "email": "...",
  "is_admin": false,
  "token_balance": 45,
  "display_name": "john"
}
```

**After (new fields):**
```json
{
  "id": "...",
  "email": "...",
  "is_admin": false,
  "token_balance": 45,
  "display_name": "john",
  "tier_id": "pro",
  "subscription": {
    "tier_id": "pro",
    "tier_name": "Pro",
    "billing_cycle": "monthly",
    "status": "active",
    "current_period_start": "2026-03-01T00:00:00Z",
    "current_period_end": "2026-03-31T00:00:00Z",
    "cancel_at_period_end": false,
    "rollover_tokens": 150,
    "permissions": {
      "editor.magic_remover": true,
      "editor.clone_stamp": true,
      "editor.manual_translate": true,
      "editor.text_border": true,
      "editor.bulk_export_zip": true,
      "editor.upscaling": false,
      "translator.gpt4o": true,
      "translator.claude": false,
      "batch_limit": 20,
      "max_projects": 10,
      "project_expiry_days": 30,
      "max_rollover": 2000,
      "monthly_tokens": 2000
    }
  }
}
```

#### `GET /user/profile`

Same additions as `/auth/me` — includes `subscription` object.

#### Token Guard: HTTP 402 Response

**Before:**
```json
{ "detail": "Insufficient tokens" }
```

**After:**
```json
{
  "detail": {
    "error": "insufficient_tokens",
    "balance": 0,
    "required": 10,
    "tier": "free"
  }
}
```

This enables the frontend to:
- Show the user's current balance
- Calculate how many tokens they need
- Offer "Upgrade Plan" (if not on Premium) or "Buy Tokens"

---

## Backend Service: `subscription.py`

**File**: `services/api/api/services/subscription.py`

### Key Design Decisions

1. **Redis tier cache**: `subscription_tiers` is cached in Redis (`cache:subscription_tiers` key, 1-hour TTL) so all API instances share the same cache. Falls back to Supabase if Redis is unavailable. Uses a **sync** `redis.Redis` client (separate from the async `redis.asyncio` pool in `redis_protocol.py`) because the subscription service runs in synchronous context.

2. **Permission resolution**: `get_tier_permissions(tier_id)` merges JSONB features with numeric limits into a single flat dict. This is what the frontend receives.

3. **Denormalized `tier_id`**: Stored on `profiles` for O(1) lookups. Kept in sync by `subscribe()` and `_downgrade_to_free()`.

4. **Rollover via RPC**: Token rollover uses `refresh_subscription_tokens()` RPC for atomic row-locking — same pattern as existing `deduct_tokens()` / `credit_tokens()`.

### Function Reference

| Function | Purpose |
|---|---|
| `get_all_tiers()` | Fetch + cache all tiers |
| `get_tier(tier_id)` | Get single tier |
| `get_tier_permissions(tier_id)` | Resolve JSONB features + numeric limits |
| `get_user_subscription(user_id)` | Full subscription + joined tier data |
| `get_user_subscription_summary(user_id)` | Summary for API responses |
| `subscribe(user_id, tier_id, ...)` | Create/upgrade subscription |
| `cancel_subscription(user_id)` | Set cancel_at_period_end |
| `reactivate_subscription(user_id)` | Undo cancel |
| `process_renewal(user_id)` | Rollover + credit + extend period |
| `check_feature_permission(user_id, feature)` | Single permission check |
| `get_project_limits(user_id)` | Max projects + expiry for tier |

---

## Subscription Lifecycle

### 1. New User Signup

```
Supabase Auth: INSERT INTO auth.users
  → Trigger: handle_new_user()
    → INSERT INTO profiles (tier_id='free', token_balance=5)
    → INSERT INTO token_transactions (signup_bonus)
    → INSERT INTO subscriptions (tier_id='free', status='active')
```

### 2. Subscribe (Upgrade)

```
Frontend: POST /payment/create-charge (subscription charge)
  → Omise charge created
  → User pays
  → Webhook: POST /payment/webhook
    → Tokens credited (via existing flow)

Frontend: POST /subscription/subscribe { tier_id: "pro", billing_cycle: "monthly" }
  → Upsert subscriptions row
  → Update profiles.tier_id
  → Credit monthly_tokens via credit_tokens()
  → Set period_start/end
```

### 3. Renewal (Recurring Payment)

```
Omise Schedule fires → Webhook: charge.complete
  → Verify payment
  → Call process_renewal(user_id):
    → RPC refresh_subscription_tokens()
      → Lock profile row
      → rollover = min(current_balance, max_rollover)
      → new_balance = rollover + monthly_tokens
      → Log transactions
    → Extend period_end by 30 or 365 days
```

### 4. Cancel

```
User: POST /subscription/cancel
  → Set cancel_at_period_end = true
  → Subscription remains active until period_end

On next renewal attempt:
  → process_renewal() detects cancel_at_period_end
  → Calls _downgrade_to_free()
  → tier_id → 'free', no more charges
```

### 5. Upgrade (Mid-Cycle)

```
User on Starter → wants Pro:
  Frontend calculates pro-rated amount
  POST /payment/create-charge (pro-rated amount)
  POST /subscription/subscribe { tier_id: "pro" }
    → New tier takes effect immediately
    → Monthly tokens credited
    → Period resets
```

---

## Permission System

### JSONB Feature Map

Each tier defines a JSONB `features` column:

```json
// Pro tier
{
  "editor.magic_remover": true,
  "editor.clone_stamp": true,
  "editor.manual_translate": true,
  "editor.text_border": true,
  "editor.bulk_export_zip": true,
  "editor.upscaling": false,
  "translator.gpt4o": true,
  "translator.claude": false
}
```

### Resolved Permissions

The API merges JSONB features with numeric tier limits into one flat object:

```json
{
  "editor.magic_remover": true,
  "editor.clone_stamp": true,
  "editor.manual_translate": true,
  "editor.text_border": true,
  "editor.bulk_export_zip": true,
  "editor.upscaling": false,
  "translator.gpt4o": true,
  "translator.claude": false,
  "batch_limit": 20,
  "max_projects": 10,
  "project_expiry_days": 30,
  "max_rollover": 2000,
  "monthly_tokens": 2000
}
```

### Frontend Usage (Planned)

```tsx
// AuthContext provides permissions from /auth/me
const { subscription } = useAuth();
const perms = subscription.permissions;

// Check feature access
if (!perms["editor.magic_remover"]) {
  // Show lock icon + upgrade prompt
}

// Check numeric limits
if (imageCount > perms.batch_limit) {
  // Show batch limit warning
}
```

### Adding a New Feature (Future)

1. Add key to JSONB in relevant tiers: `UPDATE subscription_tiers SET features = features || '{"editor.new_tool": true}' WHERE id IN ('pro', 'premium')`
2. Call `invalidate_tiers_cache()` or restart API
3. Frontend checks `permissions["editor.new_tool"]`
4. **No migration, no backend code change needed**

---

## Token Rollover

### Formula

On each billing renewal:
```
rollover = min(current_balance, max_rollover)
new_balance = rollover + monthly_tokens
```

### Examples

**Pro user (max_rollover=2000, monthly_tokens=2000):**
- Had 1,500 tokens → rollover 1,500 + 2,000 = **3,500 new balance**
- Had 2,500 tokens → rollover 2,000 (capped) + 2,000 = **4,000 new balance**
- Had 0 tokens → rollover 0 + 2,000 = **2,000 new balance**

### Token Types

| Source | Expires? | Rollover? |
|---|---|---|
| Subscription (monthly credit) | Capped at max_rollover on renewal | Yes (up to 1 month's worth) |
| Top-up (one-time purchase) | Never expires | Not subject to rollover cap |
| Signup bonus (5 tokens) | Never expires | Not subject to rollover cap |

**Note:** Currently all tokens are stored in a single `token_balance` field. The rollover cap applies to the total balance. Future optimization could separate subscription tokens from purchased tokens if needed.

---

## Out-of-Tokens Flow

### Backend Response (HTTP 402)

```json
{
  "detail": {
    "error": "insufficient_tokens",
    "balance": 0,
    "required": 10,
    "tier": "free"
  }
}
```

### Frontend Handling (Planned)

1. Global 402 interceptor in API client
2. Parse `detail.tier` to determine upgrade options
3. Show modal with:
   - "You have {balance} tokens, need {required}"
   - "Upgrade Plan" button (if tier != "premium")
   - "Buy Tokens" button (always)
4. If tier is "free" or "starter", show savings comparison

---

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/006_subscription_tiers.sql` | **New** — tables, seed data, RPC, triggers |
| `services/api/api/services/subscription.py` | **New** — subscription CRUD, permissions, renewals |
| `services/api/api/routes/subscription.py` | **New** — REST endpoints |
| `services/api/api/main.py` | **Modified** — register subscription router |
| `services/api/api/services/auth.py` | **Modified** — `/auth/me` returns subscription + permissions |
| `services/api/api/services/token_guard.py` | **Modified** — 402 includes balance, required, tier |
| `docs/subscription-technical.md` | **New** — this document |
| `docs/subscription-packages.md` | **Modified** — updated implementation phases |

---

## Remaining Implementation (Future Phases)

### Phase 3: Recurring Payment Integration
- Omise Schedules API for automatic recurring charges
- Omise Customer API for saved card management
- Webhook handler for `schedule.complete` events
- PromptPay renewal reminders (manual, no auto-charge)

### Phase 5: Frontend — Editor Gating
- `usePermission(feature)` hook in AuthContext
- Lock icon overlay component for gated tools
- Upgrade prompt modal when locked tool is clicked
- Global 402 interceptor for out-of-tokens modal

### Phase 6: Frontend — Profile Management
- Current plan display card
- Upgrade/downgrade flow with payment
- Cancel/reactivate buttons
- Billing history from subscription_payments

### Not Yet Implemented
- Pro-rated upgrade charges (mid-cycle tier change)
- Separate subscription vs. purchased token tracking
- Grace period for existing users
- Admin UI for tier management
- Usage analytics dashboard
