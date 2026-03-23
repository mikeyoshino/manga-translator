# WunPlae.com — Subscription Packages

## Overview

Transition from token top-up only to a subscription model with 4 tiers: **Free**, **Starter**, **Pro**, and **Premium**. Token top-up remains available as an add-on for all tiers. Main upgrade driver is **feature access**, with tokens as secondary incentive.

---

## Pricing

| | **Free** | **Starter** | **Pro** | **Premium** |
|---|---|---|---|---|
| **Monthly** | ฿0 | ฿99/mo | ฿249/mo | ฿490/mo |
| **Annual** | ฿0 | ฿990/yr (฿82.5/mo) | ฿2,490/yr (฿207.5/mo) | ฿4,900/yr (฿408/mo) |
| **Annual Savings** | — | Save ฿198 (2 months free) | Save ฿498 (2 months free) | Save ฿980 (2 months free) |

---

## Token System

**1 image translation = 10 tokens**

| | **Free** | **Starter** | **Pro** | **Premium** |
|---|---|---|---|---|
| **Monthly Tokens** | 50 | 500 | 2,000 | 5,000 |
| **= Images/month** | 5 | 50 | 200 | 500 |
| **Token Rollover** | Up to 50 | Up to 500 | Up to 2,000 | Up to 5,000 |

### Token Rollover Policy (All Tiers)
All tiers get rollover equal to their monthly allocation. Tokens reset each billing cycle — unused tokens carry over up to 1 month's worth. This effectively means if you don't use any tokens one month, you'll have double the next month (but no more).

**Formula on renewal:** `new_balance = min(current_balance, monthly_tokens) + monthly_tokens`

### Token Top-Up (Add-on, All Tiers)
Users can always buy extra tokens on top of their subscription:

| Package | Price | Tokens | Images |
|---|---|---|---|
| Small | ฿99 | 500 | 50 images |
| Medium | ฿249 | 1,500 | 150 images |
| Large | ฿490 | 3,500 | 350 images |

Top-up tokens never expire (separate from subscription tokens).

### Out-of-Tokens Flow

#### Trigger Points
- **Editor**: User clicks "Translate" but has 0 tokens → modal popup
- **Project**: User clicks "Translate All" but insufficient tokens → modal popup
- **Batch**: User queues N images but only has tokens for M → partial warning with option to proceed with available tokens

#### Modal Content
- Current balance display (e.g., "You have 0 tokens remaining")
- Two CTAs side by side:
  - **"Upgrade Plan"** → navigates to pricing page (if on Free/Starter/Pro)
  - **"Buy Tokens"** → navigates to top-up page
- If already on Premium: only show "Buy Tokens"
- Show savings comparison: "Upgrade to Pro for ฿249/mo and get 2,000 tokens"

#### Backend Response
`token_guard.py` returns HTTP 402 with body:
```json
{
  "error": "insufficient_tokens",
  "balance": 0,
  "required": 10,
  "tier": "free"
}
```
Frontend intercepts 402 responses globally and shows the modal.

#### Top-up Inline Flow (Future)
- Quick-buy inside the modal without leaving the editor
- Select package → PromptPay QR or saved card → tokens credited → auto-retry translation

---

## Features by Tier

### Projects & Storage

| | **Free** | **Starter** | **Pro** | **Premium** |
|---|---|---|---|---|
| **Projects** | 1 | 3 | 10 | Unlimited (50) |
| **Project Expiry** | 7 days | 14 days | 30 days | 60 days |

### Translator Models

| | **Free** | **Starter** | **Pro** | **Premium** |
|---|---|---|---|---|
| **gpt-4o-mini** | Yes | Yes | Yes | Yes |
| **gpt-4o** | — | — | Yes | Yes |
| **Claude** | — | — | — | Yes |

### Editor Tools

| Tool | **Free** | **Starter** | **Pro** | **Premium** |
|---|---|---|---|---|
| Text Editing (font, size, color, alignment, bold, italic) | Yes | Yes | Yes | Yes |
| Pen Tool (freehand drawing) | Yes | Yes | Yes | Yes |
| Eraser Tool | Yes | Yes | Yes | Yes |
| Undo / Redo | Yes | Yes | Yes | Yes |
| Export Single Image | Yes | Yes | Yes | Yes |
| **Magic Remover** (AI text/artifact removal) | — | — | Yes | Yes |
| **Clone Stamp** (pixel-level background repair) | — | — | Yes | Yes |
| **Manual Translate** (region-specific re-translation) | — | — | Yes | Yes |
| **Text Border/Stroke** (outline styling) | — | — | Yes | Yes |
| **Bulk Export as ZIP** | — | — | Yes | Yes |
| **Image Upscaling** (higher output resolution) | — | — | — | Yes |
| **[Future] Advanced AI Features** | — | — | — | Yes |

### Feature Summary

| | **Free** | **Starter** | **Pro** | **Premium** |
|---|---|---|---|---|
| **Image Resolution** | Standard | Standard | Standard | HD (upscaled) |
| **Batch Translate** | 1 image | Up to 5 | Up to 20 | Up to 50 |
| **Translator Models** | gpt-4o-mini | gpt-4o-mini | + gpt-4o | + Claude |
| **Editor Tools** | Basic | Basic | + Pro tools | + Premium exclusives |

---

## Why Users Upgrade (Value Proposition)

### Free → Starter
- More tokens (50 → 500/mo)
- More projects (1 → 3)
- Longer project expiry (7 → 14 days)
- Batch translate up to 5 images

### Starter → Pro
- **Pro editor tools**: Magic Remover, Clone Stamp, Manual Translate, Text Border, Bulk ZIP Export
- **gpt-4o model**: Higher quality translations for complex text
- 4x more tokens (500 → 2,000/mo)
- 10 projects with 30-day expiry
- Batch translate up to 20 images

### Pro → Premium
- **Exclusive**: Image upscaling for HD output
- **Exclusive**: Claude translator model
- **Exclusive**: Future advanced AI features (reserved for Premium)
- 2.5x more tokens (2,000 → 5,000/mo)
- Unlimited projects (50) with 60-day expiry
- Batch translate up to 50 images

---

## Cost & Profit Analysis

### Per-Image Cost

| Component | Cost (USD) | Cost (THB) |
|---|---|---|
| RunPod GPU (RTX 3090, ~10s) | $0.0005 | ฿0.018 |
| OpenAI gpt-4o-mini (2-stage) | $0.0020 | ฿0.072 |
| **Total per image** | **$0.0025** | **~฿0.09** |

> Exchange rate: 1 USD ≈ 36 THB

### Revenue & Profit Per User (Monthly)

Assumes 70% average token usage.

| Tier | Revenue/mo | Images (70%) | Variable Cost | **Gross Profit** | Margin |
|---|---|---|---|---|---|
| Free | ฿0 | 3.5 | ฿0.32 | -฿0.32 | — |
| Starter | ฿99 | 35 | ฿3.15 | **฿95.85** | 96.8% |
| Pro | ฿249 | 140 | ฿12.60 | **฿236.40** | 94.9% |
| Premium | ฿490 | 350 | ฿31.50 | **฿458.50** | 93.6% |

### Per-Image Revenue

| Tier | Revenue per Image | Cost per Image | **Profit per Image** |
|---|---|---|---|
| Starter | ฿1.98 | ฿0.09 | **฿1.89** |
| Pro | ฿1.245 | ฿0.09 | **฿1.155** |
| Premium | ฿0.98 | ฿0.09 | **฿0.89** |

### Advanced Model Cost Impact

If Pro/Premium users choose **gpt-4o**:
- Cost per image rises to **~฿0.76** (vs ฿0.09 for gpt-4o-mini)
- Pro (140 images with gpt-4o): cost ฿106 → profit ฿143 (still profitable)
- Premium (350 images with gpt-4o): cost ฿266 → profit ฿224 (still profitable)

### Break-Even

**Fixed infrastructure:** ~฿1,500/month (Supabase + VPS)

| Scenario | Paying Users Needed |
|---|---|
| All Starter | 16 users |
| All Pro | 7 users |
| All Premium | 4 users |
| **Realistic mix** (60% Starter, 30% Pro, 10% Premium) | **9 users** |

Free users cost ~฿0.32/month each — 1,000 free users = only ฿320/month extra.

---

## Permission System (Future-Proof)

### Architecture

Permissions are stored as a **JSONB feature map** on the `subscription_tiers` table. This makes it easy to add new features without schema changes.

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
  "max_rollover": 2000
}
```

### How It Works

1. **Backend**: `GET /auth/me` returns user's tier + resolved permissions
2. **Frontend**: `AuthContext` exposes `permissions` object
3. **Editor**: Each tool checks `permissions.editor.<tool_name>` before rendering/enabling
4. **Locked tools**: Show a lock icon + "Upgrade to Pro" tooltip instead of hiding completely (visibility drives upgrades)
5. **New features**: Just add a new key to the tier's JSONB — no migration needed

### Adding a Future Feature

1. Add permission key to `subscription_tiers.features` JSONB for relevant tiers
2. Check `permissions.editor.<new_feature>` in frontend component
3. Show upgrade prompt if not permitted
4. No database migration, no backend code change needed

---

## Payment & Billing

### Recurring Billing via Omise
- **Credit/Debit Card**: Automatic monthly/annual charge via Omise Schedules API
- **PromptPay**: Manual renewal each cycle (PromptPay doesn't support recurring). Show reminder notification.

### Subscription Lifecycle
1. **Subscribe**: Select tier → save card → first charge → tokens credited
2. **Renew**: Auto-charge → rollover calculated → new tokens credited
3. **Cancel**: Active until end of current period
4. **Downgrade**: Takes effect at next renewal
5. **Upgrade**: Immediate. Pro-rated charge for remaining days. New limits apply immediately.

---

## Database Schema

### `subscription_tiers` (Reference Table)

| Column | Type | Description |
|---|---|---|
| id | TEXT PK | 'free', 'starter', 'pro', 'premium' |
| name | TEXT | Display name |
| price_satangs | INT | Monthly price (0 for free) |
| annual_price_satangs | INT | Annual price (0 for free) |
| monthly_tokens | INT | Tokens per billing cycle |
| token_cost_per_image | INT | Tokens deducted per image (default 10) |
| max_projects | INT | Project limit |
| project_expiry_days | INT | Auto-delete after N days |
| max_rollover | INT | Max tokens that carry over |
| batch_limit | INT | Max concurrent batch size |
| features | JSONB | Permission flags (see Permission System above) |

### `subscriptions` (Per User)

| Column | Type | Description |
|---|---|---|
| id | BIGINT PK | Auto-increment |
| user_id | UUID UNIQUE | One subscription per user |
| tier_id | TEXT FK | References subscription_tiers |
| billing_cycle | TEXT | 'monthly' or 'annual' |
| status | TEXT | active, cancelled, past_due, expired |
| current_period_start | TIMESTAMPTZ | Billing period start |
| current_period_end | TIMESTAMPTZ | Billing period end |
| tokens_refreshed_at | TIMESTAMPTZ | Last token credit |
| rollover_tokens | INT | Tokens rolled over this cycle |
| omise_schedule_id | TEXT | Omise recurring charge ID |
| cancel_at_period_end | BOOLEAN | Don't renew flag |

### `profiles` (Add Column)
- `tier_id TEXT DEFAULT 'free'` — quick tier lookup

---

## Existing Users Migration

- All existing users become **Free** tier
- Their existing purchased tokens remain (never expire)
- Token top-up still available as before
- No features removed — tools that were previously free remain accessible during a grace period (optional)

---

## Implementation Phases

1. **Database**: Migration for subscription_tiers, subscriptions tables. Seed tier data with JSONB permissions. ✅ Done (`006_subscription_tiers.sql`)
2. **Backend**: Permission middleware, subscription CRUD, token refresh with rollover, out-of-tokens response. ✅ Done (`subscription.py` service + routes, updated `token_guard.py`, updated `/auth/me`)
3. **Payment**: Omise Schedules for recurring monthly/annual billing.
4. **Frontend — Pricing**: Pricing page with monthly/annual toggle, tier comparison. ✅ Done (landing page section)
5. **Frontend — Editor**: Lock icon on gated tools, upgrade popup on click, out-of-tokens modal.
6. **Frontend — Profile**: Current plan display, upgrade/downgrade/cancel management.

**Technical documentation**: See `docs/subscription-technical.md` for complete technical solution.

---

## Landing Page Pricing Section

### Files Modified
- `front/app/routes/landing.tsx` — redesigned pricing section
- `front/app/i18n/th.json` — updated `landing.pricing` keys
- `front/app/i18n/en.json` — updated `landing.pricing` keys

### Previous State
3 one-time top-up packages: Starter ฿99/50 images, Popular ฿299/200 images, Best Value ฿599/500 images.

### New State
4 subscription tiers with monthly/annual toggle:

| | Free | Starter | Pro | Premium |
|---|---|---|---|---|
| Monthly | ฿0 | ฿99 | ฿249 | ฿490 |
| Annual (per mo) | ฿0 | ฿82.5 | ฿207.5 | ฿408 |
| Tokens/mo | 50 | 500 | 2,000 | 5,000 |
| Images/mo | 5 | 50 | 200 | 500 |

### Layout
- Monthly/Annual toggle pill at the top
- 4 tier cards in a grid (2×2 on tablet, 4 across on desktop)
- Pro tier highlighted with "Most Popular" badge and elevated card
- Each card: price, tokens, image count, CTA button, feature bullet list with checkmarks
- Annual pricing shows per-month equivalent with yearly total below
