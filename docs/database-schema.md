# Database Schema

Supabase (Postgres) database schema. All tables use Row-Level Security (RLS) so users can only access their own data.

---

## Entity Relationship Diagram

```mermaid
erDiagram
    auth_users ||--|| profiles : "1:1 on signup"
    profiles ||--o{ token_transactions : "has many"
    profiles ||--o{ payments : "has many"
    profiles ||--o{ projects : "has many"
    projects ||--o{ project_images : "has many"

    profiles {
        uuid id PK "references auth.users(id)"
        text display_name
        int token_balance "CHECK >= 0"
        timestamptz created_at
        timestamptz updated_at
    }

    token_transactions {
        bigint id PK
        uuid user_id FK "references profiles(id)"
        int amount "+credit / -debit"
        int balance_after
        text type "topup | translation | refund"
        text reference_id "charge_id, image name, etc."
        text channel "promptpay | card | api | system"
        timestamptz created_at
    }

    payments {
        bigint id PK
        uuid user_id FK "references profiles(id)"
        text omise_charge_id UK "Omise charge ID"
        int amount_satangs "1 THB = 100 satangs"
        int tokens_to_credit
        text status "pending | successful | failed"
        timestamptz created_at
        timestamptz updated_at
    }

    projects {
        uuid id PK
        uuid user_id FK "references profiles(id)"
        text name
        timestamptz created_at
        timestamptz expires_at "default: 14 days"
        timestamptz updated_at
    }

    project_images {
        uuid id PK
        uuid project_id FK "references projects(id)"
        int sequence "ordering within project"
        text original_filename
        text original_image_path "Storage path"
        text inpainted_image_path "Storage path, nullable"
        text rendered_image_path "Storage path, nullable"
        jsonb translation_metadata "nullable"
        jsonb editable_blocks "nullable"
        text status "uploaded | translating | translated | error"
        timestamptz created_at
        timestamptz updated_at
    }
```

---

## Tables

### `profiles`

1-to-1 with Supabase Auth. Created automatically when a user signs up (via the `handle_new_user()` trigger). This is our "user" table — Supabase Auth handles email/password, and this table holds app-specific data.

| Column | Type | What it's for |
|--------|------|---------------|
| `id` | UUID, PK | The user's unique ID. Comes directly from Supabase Auth (`auth.users.id`). Every other table links back to this. If the auth user is deleted, this row is deleted too (CASCADE). |
| `display_name` | TEXT | The name shown in the UI (profile dropdown, etc.). On signup it's auto-set from the user's email (e.g., `john@example.com` → `john`). The user can change it later on the profile page. |
| `token_balance` | INT, NOT NULL | How many translation tokens the user currently has. Every image translation costs 1 token. This number goes up when the user tops up (buys tokens) and goes down when they translate. Has a `CHECK >= 0` constraint so it can never go negative — if a user tries to translate with 0 tokens, the API rejects the request. **Important:** This field is never updated directly — it's only changed through the `deduct_tokens()` and `credit_tokens()` RPC functions which use row locking to prevent race conditions (e.g., two translations running at the same time). |
| `created_at` | TIMESTAMPTZ | When the user signed up. Auto-set by Postgres. |
| `updated_at` | TIMESTAMPTZ | Last time the profile was modified (e.g., display_name change, token balance change). Auto-updated by the `set_updated_at()` trigger. |

**RLS policies**: Users can only read their own profile. Only the server (service_role) can modify it — this prevents users from giving themselves free tokens via the Supabase client.

---

### `token_transactions`

A complete history of every token movement. This table is append-only — rows are never edited or deleted. Think of it like a bank statement: every top-up, every translation charge, every refund gets its own row.

| Column | Type | What it's for |
|--------|------|---------------|
| `id` | BIGINT, PK | Auto-incrementing row ID. |
| `user_id` | UUID, FK | Which user this transaction belongs to. Links to `profiles.id`. |
| `amount` | INT | How many tokens were added or removed. **Positive** = tokens coming in (top-up: `+50`, signup bonus: `+5`, refund: `+1`). **Negative** = tokens going out (translation: `-1`). |
| `balance_after` | INT | A snapshot of the user's total balance right after this transaction happened. Useful for showing a running balance in the transaction history UI without recalculating. Example: balance was 10, user translated 1 image → `amount = -1`, `balance_after = 9`. |
| `type` | TEXT | Why the transaction happened. One of: `'topup'` (user bought tokens), `'translation'` (user translated an image, tokens deducted), `'refund'` (tokens returned, e.g., failed translation). |
| `reference_id` | TEXT, nullable | Links this transaction to something specific. For top-ups: the Omise charge ID (`chrg_xxx`). For translations: the image filename. For signup bonus: the string `'signup_bonus'`. Helps with debugging ("which payment gave these tokens?" or "which image cost this token?"). |
| `channel` | TEXT, nullable | How the transaction was triggered. `'promptpay'` or `'card'` for payments. `'api'` for translations via the API. `'system'` for automatic things like the signup bonus. Useful for analytics ("how many tokens came from PromptPay vs credit card?"). |
| `created_at` | TIMESTAMPTZ | When this transaction happened. Used to sort the transaction history (newest first). |

**Note**: Rows are never inserted directly — they're created automatically inside the `deduct_tokens()` and `credit_tokens()` RPC functions as part of the same atomic transaction that changes the balance.

---

### `payments`

Tracks real-money payments via Omise (Thai payment gateway). A row is created the moment a user clicks "Pay" and updated when the payment succeeds or fails.

| Column | Type | What it's for |
|--------|------|---------------|
| `id` | BIGINT, PK | Auto-incrementing row ID. |
| `user_id` | UUID, FK | Which user is paying. Links to `profiles.id`. |
| `omise_charge_id` | TEXT, UNIQUE | The charge ID returned by Omise when we create the payment (e.g., `chrg_test_abc123`). Marked UNIQUE so we never accidentally process the same charge twice. Used to look up the charge status from Omise's API and to match incoming webhooks to the right payment row. |
| `amount_satangs` | INT | How much the user is paying in Thai satangs (smallest unit of THB). 1 THB = 100 satangs. Example: 99 THB = 9,900 satangs. We store satangs (not THB) because Omise's API uses satangs and integers avoid floating-point issues. |
| `tokens_to_credit` | INT | How many tokens the user should receive when this payment succeeds. Stored at creation time so we know exactly what was promised — even if we change pricing later, this user gets what they paid for. Example: user bought the 50-token package → `tokens_to_credit = 50`. |
| `status` | TEXT | Current state of the payment. Starts as `'pending'` when created. Changes to `'successful'` when Omise confirms the money arrived (via webhook or polling), which triggers `credit_tokens()` to add tokens. Changes to `'failed'` if the payment was declined or expired. |
| `created_at` | TIMESTAMPTZ | When the user initiated the payment. |
| `updated_at` | TIMESTAMPTZ | When the status last changed (e.g., pending → successful). |

**Token packages** (defined in `server/payment.py`):

| Package | Price | Satangs | Per-token cost |
|---------|-------|---------|----------------|
| 50 tokens | 99 THB | 9,900 | ~2 THB/token |
| 200 tokens | 299 THB | 29,900 | ~1.5 THB/token |
| 500 tokens | 599 THB | 59,900 | ~1.2 THB/token |

**Payment flow**: User picks package → `create_charge()` creates Omise charge + pending DB row → user pays via PromptPay QR or card → Omise webhook hits `payment_webhook()` → status updated to successful → `credit_tokens()` adds tokens to balance.

---

### `projects`

A project groups manga pages together for batch translation. Think of it as a "folder" — a user creates a project named "One Piece Chapter 1", uploads 20 pages, translates them all, then opens the editor to fine-tune.

| Column | Type | What it's for |
|--------|------|---------------|
| `id` | UUID, PK | Unique project ID. Generated by Postgres (`gen_random_uuid()`). Used in URLs: `/projects/8c8e433f-...`. |
| `user_id` | UUID, FK | Which user owns this project. Links to `profiles.id`. If the user's account is deleted, all their projects are deleted too (CASCADE). |
| `name` | TEXT, NOT NULL | The project name shown on the dashboard (e.g., "One Piece Ch.1", "Spy x Family Vol.3"). Set by the user when creating the project. |
| `created_at` | TIMESTAMPTZ | When the project was created. Used for sorting on the dashboard (newest first). |
| `expires_at` | TIMESTAMPTZ | When this project will be auto-deleted. Defaults to 14 days after creation. This keeps storage costs down — translated images + originals take up space in Supabase Storage. When the server starts, `cleanup_expired()` deletes all projects past their expiry date along with their Storage files. |
| `updated_at` | TIMESTAMPTZ | Last modification time. Updated whenever images are added/translated. |

**Limits**: Each user can have at most 5 active (non-expired) projects. Enforced in code, not in the database.

---

### `project_images`

One row per manga page within a project. This is the most complex table because it tracks the full lifecycle of an image: upload → translation → user editing.

| Column | Type | What it's for |
|--------|------|---------------|
| `id` | UUID, PK | Unique image ID. Used in API paths: `/projects/{project_id}/images/{image_id}/translate`. |
| `project_id` | UUID, FK | Which project this image belongs to. If the project is deleted, all its images are deleted too (CASCADE). |
| `sequence` | INT, DEFAULT 0 | Controls the display order in the UI. When a user uploads 5 pages, they appear in upload order (sequence 0, 1, 2, 3, 4). Could be used later for drag-to-reorder. |
| `original_filename` | TEXT, NOT NULL | The filename from the user's computer (e.g., `page_01.png`, `screenshot_2026.jpg`). Shown in the image queue so the user knows which file is which. Not used for storage — we use the UUID-based path instead. |
| `original_image_path` | TEXT, NOT NULL | Where the uploaded original lives in Supabase Storage. Format: `{user_id}/{project_id}/originals/{image_id}.png`. The frontend never sees this path directly — it gets a signed URL instead. |
| `inpainted_image_path` | TEXT, nullable | Where the "cleaned" image lives in Storage — the original with all text removed by the AI inpainter (LaMa model). `NULL` until translation completes. Format: `{user_id}/{project_id}/results/{image_id}_inpainted.png`. The editor uses this as the background layer that translated text is rendered on top of. |
| `rendered_image_path` | TEXT, nullable | Where the final output lives in Storage — the inpainted image with translated text rendered on top. `NULL` until translation completes. This is what gets exported as the finished product. |
| `translation_metadata` | JSONB, nullable | The complete ML pipeline output stored as JSON. Contains every detected text block with its bounding box, source text, translated text, font size, colors, etc. `NULL` before translation. See [JSONB structure below](#translation_metadata-1). This is the "source of truth" for what the AI detected and translated. |
| `editable_blocks` | JSONB, nullable | The user's editor modifications stored as JSON. When a user opens the editor and changes font size, moves a text block, edits the translation, etc., those changes are saved here. `NULL` until the user edits something. See [JSONB structure below](#editable_blocks-1). This is separate from `translation_metadata` so we always keep the original AI output and the user's edits apart. |
| `status` | TEXT | Tracks where this image is in the pipeline. `'uploaded'` = just uploaded, waiting to be translated. `'translating'` = currently being processed by a GPU worker. `'translated'` = done, results available. `'error'` = something went wrong. The project page UI uses this to show progress bars and status badges. |
| `created_at` | TIMESTAMPTZ | When the image was uploaded. |
| `updated_at` | TIMESTAMPTZ | Last modification (translation completed, editor blocks saved, etc.). |

**RLS policies**: Users can only access images in projects they own (checked via a subquery on the `projects` table).

**Used by**: `server/projects.py` — `upload_image()`, `save_translation_result()`, `save_editable_blocks()`, `delete_image()`.

---

## JSONB Structures

### `translation_metadata`

Stored after a successful translation. This is the raw AI output — what the ML pipeline detected and translated. One object per text bubble/block found in the image.

```jsonc
{
  "translations": [
    {
      // --- WHERE is the text? (bounding box in pixels) ---
      "minX": 100,     // left edge of the text region
      "minY": 50,      // top edge
      "maxX": 300,     // right edge
      "maxY": 200,     // bottom edge
      // Together these form a rectangle: the AI detected text inside this box

      // --- WHAT does the text say? ---
      "text": {
        "JPN": "日本語テキスト",  // original text the OCR read
        "THA": "ข้อความไทย"      // translated text from the translator
      },
      "source_lang": "JPN",      // language the AI detected in the image
      "target_lang": "THA",      // language we translated into

      // --- HOW should it look? (AI-suggested styling) ---
      "font_size": 24,           // estimated font size in pixels, based on the original text size
      "direction": "horizontal", // text direction: "horizontal" or "vertical" (manga often has vertical Japanese)
      "alignment": "center",     // suggested text alignment within the box
      "line_spacing": 1.2,       // multiplier for space between lines (1.0 = no extra space)
      "letter_spacing": 0,       // extra pixels between each character
      "bold": false,             // whether the original text appeared bold
      "italic": false,           // whether the original text appeared italic
      "text_color": {
        "fg": [0, 0, 0],        // detected foreground (text) color as [R, G, B]
        "bg": [255, 255, 255]   // detected background color behind the text
      },

      // --- BACKGROUND image for this block ---
      "background_path": "{user_id}/{project_id}/backgrounds/{image_id}_block_0.png",
      // A cropped piece of the inpainted image behind this text block.
      // Used by the editor as the "clean" background that translated text is rendered on top of.
      // Extracted from the base64 in the translation response and uploaded to Storage.

      // --- DETECTION metadata ---
      "angle": 0,               // rotation angle of the text region in degrees
      "prob": 0.95,             // how confident the detector was that this is text (0.0–1.0)
      "is_bulleted_list": false  // whether the detector thinks this is a bulleted list
    }
  ],
  "debug_folder": null  // path to debug output (detection boxes, masks, etc.) — usually null in production
}
```

### `editable_blocks`

Saved when the user opens the editor and modifies text blocks. Each block contains **all the original fields** from `translation_metadata` (so the editor has everything it needs) **plus `edited*` fields** for the user's changes.

The key design: original AI values are preserved, and user changes are stored in separate `edited*` fields. This means you can always compare what the AI suggested vs. what the user changed, and reset any field back to the AI's original value.

```jsonc
[
  {
    // --- Original fields (copied from translation_metadata, read-only reference) ---
    "id": "block-0",           // unique block ID within this image (block-0, block-1, ...)
    "minX": 100, "minY": 50, "maxX": 300, "maxY": 200,  // original bounding box
    "text": { "JPN": "...", "THA": "..." },               // original + translated text
    "source_lang": "JPN", "target_lang": "THA",
    "font_size": 24,           // AI's original font size suggestion

    // --- User-editable fields (what the user changed in the editor) ---

    "editedText": "ข้อความที่แก้ไข",
    // The translation text the user wants to display.
    // Initialized from text[target_lang] but can be freely rewritten.
    // Example: AI translated "Hello" → "สวัสดี" but user prefers "หวัดดี"

    "editedX": 100,
    "editedY": 50,
    // Position of the text block on the canvas (top-left corner in pixels).
    // Initialized from minX/minY. User can drag the block to reposition.

    "editedWidth": 200,
    "editedHeight": 150,
    // Size of the text block in pixels.
    // Initialized from (maxX - minX) and (maxY - minY). User can resize.

    "editedFontSize": 28,
    // Font size in pixels. User might increase this if the AI's suggestion was too small.

    "editedFontFamily": "Sarabun",
    // Which font to render with. Defaults to a Thai-friendly font.
    // User can pick from available fonts (Sarabun, Noto Sans Thai, etc.)

    "editedColor": "#000000",
    // Text color as hex. Initialized from text_color.fg.
    // User can change via color picker.

    "editedAlignment": "center",
    // Text alignment within the block: "left", "center", or "right".

    "editedLetterSpacing": 0,
    // Extra space between characters in pixels. 0 = normal spacing.

    "editedLineSpacing": 1.2,
    // Line height multiplier. 1.0 = lines touching, 1.5 = 50% extra space.

    "editedBold": false,
    "editedItalic": false,
    // Text style toggles.

    "editedStrokeEnabled": false,
    // Whether to draw an outline/border around the text.
    // Useful when text color is similar to the background — the stroke makes it readable.

    "editedStrokeColor": "#ffffff",
    // Color of the text outline (usually white or black).

    "editedStrokeWidth": 2,
    // Thickness of the outline in pixels.

    "hidden": false
    // If true, this block is not rendered in the final export.
    // User can hide blocks they don't want (e.g., sound effects, irrelevant text).
  }
]
```

---

## Supabase Storage

### `project-images` Bucket

All image files are stored in Supabase Storage (S3-compatible), organized by user and project:

```
project-images/
  {user_id}/
    {project_id}/
      originals/
        {image_id}.png            ← the manga page the user uploaded
      results/
        {image_id}_inpainted.png  ← same page with all text removed by AI
        {image_id}_rendered.png   ← final page with translated text on top
      backgrounds/
        {image_id}_block_0.png    ← cropped background behind text block 0
        {image_id}_block_1.png    ← cropped background behind text block 1
        ...                       ← one per detected text region
```

**Why backgrounds?** Each text block needs a "clean" background to render translated text on. During translation, the pipeline: (1) inpaints the full image to remove all text, (2) crops the area behind each text block, (3) saves those crops as separate images. The editor composites: background crop + rendered translated text = final block appearance.

**How the frontend accesses files:**
- The database stores **storage paths** (e.g., `abc123/def456/originals/img789.png`)
- The backend generates **signed URLs** with a 24-hour expiry via `_sign_url()`
- The frontend only ever sees signed URLs (e.g., `https://xxx.supabase.co/storage/v1/object/sign/project-images/...?token=...`)

**Cleanup:** When a project or image is deleted, all associated Storage files are removed too.

---

## RPC Functions (Postgres)

These are server-side Postgres functions called via `supabase.rpc()`. They run inside the database, which means they're atomic (all-or-nothing) and use row locking to prevent race conditions.

### `deduct_tokens(p_user_id, p_amount, p_reference, p_channel)`

Safely removes tokens from a user's balance. Called before every translation starts.

**Why an RPC function instead of a simple UPDATE?** Because two translations could start at the same time. Without locking, both could read balance=1, both think "I have enough", both deduct, and the user ends up at -1. The `FOR UPDATE` lock prevents this.

| Parameter | Example | What it's for |
|-----------|---------|---------------|
| `p_user_id` | `'abc-123-...'` | Which user to charge |
| `p_amount` | `1` | How many tokens to deduct |
| `p_reference` | `'page_01.png'` | What this charge is for (shown in transaction history) |
| `p_channel` | `'api'` | How it was triggered (shown in transaction history) |

**Returns** `BOOLEAN` — `TRUE` if tokens were deducted, `FALSE` if the user doesn't have enough.

**Steps:**
1. Lock the user's profile row (`SELECT ... FOR UPDATE`) — other transactions wait
2. Check if balance >= amount. If not, return `FALSE` immediately
3. Subtract tokens: `UPDATE profiles SET token_balance = token_balance - p_amount`
4. Log it: `INSERT INTO token_transactions` (amount = -p_amount, type = 'translation')
5. Return `TRUE`

### `credit_tokens(p_user_id, p_amount, p_type, p_reference, p_channel)`

Adds tokens to a user's balance. Called when a payment succeeds or tokens need to be refunded.

| Parameter | Example | What it's for |
|-----------|---------|---------------|
| `p_user_id` | `'abc-123-...'` | Which user to credit |
| `p_amount` | `50` | How many tokens to add |
| `p_type` | `'topup'` | Why — `'topup'` (paid), `'refund'` (error compensation) |
| `p_reference` | `'chrg_test_abc'` | The Omise charge ID or reason |
| `p_channel` | `'promptpay'` | Payment method used |

**Returns** `INT` — the user's new balance after crediting.

**Steps:**
1. Add tokens: `UPDATE profiles SET token_balance = token_balance + p_amount`
2. Log it: `INSERT INTO token_transactions` (amount = +p_amount, balance_after = new balance)
3. Return new balance

### `handle_new_user()` (Trigger)

Fires automatically when someone signs up (`AFTER INSERT ON auth.users`). The user never calls this — Supabase Auth triggers it.

**What it does:**
1. Creates a `profiles` row — copies the user ID, extracts display_name from email (e.g., `john@gmail.com` → `john`)
2. Gives 5 free tokens — sets `token_balance = 5` so new users can try the service immediately
3. Logs the bonus — inserts a `token_transactions` row (amount=5, type='topup', reference='signup_bonus', channel='system')
3. `INSERT INTO token_transactions` (amount=5, type='topup', reference='signup_bonus', channel='system')

### `set_updated_at()` (Trigger)

Fires `BEFORE UPDATE` on profiles, payments, projects, project_images. Sets `updated_at = now()`.

---

## Token Cost

| Action | Cost | Notes |
|--------|------|-------|
| Image translation | 1 token (configurable via `TOKEN_COST_PER_IMAGE` env var) | Deducted before processing starts |
| Inpainting (magic remover) | 1 token | Same cost as translation |
| Admin users | 0 | Admin flag bypasses token deduction |
| Signup bonus | +5 tokens | Automatic on account creation |

---

## Migrations

| File | What it does |
|------|-------------|
| `001_*` | Creates `profiles`, `token_transactions`, `payments` tables, RPC functions, RLS policies, triggers |
| `002_*` | Creates `projects` and `project_images` tables, RLS policies, triggers |
| `003_*` | Adds `editable_blocks` JSONB column to `project_images` |
| `004_signup_free_tokens.sql` | Updates `handle_new_user()` trigger to award 5 free tokens on signup |
