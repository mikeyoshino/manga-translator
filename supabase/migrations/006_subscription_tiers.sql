-- 006_subscription_tiers.sql
-- Subscription system: tiers reference table, user subscriptions, and profile tier column.

-- ============================================================
-- 1. subscription_tiers — reference table (4 rows, rarely changes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscription_tiers (
    id              TEXT PRIMARY KEY,                -- 'free', 'starter', 'pro', 'premium'
    name            TEXT NOT NULL,                   -- Display name
    price_satangs   INT NOT NULL DEFAULT 0,          -- Monthly price in satangs (1 THB = 100)
    annual_price_satangs INT NOT NULL DEFAULT 0,     -- Annual price in satangs
    monthly_tokens  INT NOT NULL DEFAULT 0,          -- Tokens credited each billing cycle
    token_cost_per_image INT NOT NULL DEFAULT 10,    -- Tokens per image translation
    max_projects    INT NOT NULL DEFAULT 1,          -- Project limit for this tier
    project_expiry_days INT NOT NULL DEFAULT 7,      -- Auto-delete projects after N days
    max_rollover    INT NOT NULL DEFAULT 0,          -- Max tokens that carry over on renewal
    batch_limit     INT NOT NULL DEFAULT 1,          -- Max images per batch translation
    features        JSONB NOT NULL DEFAULT '{}'::jsonb, -- Feature permission flags
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the 4 tiers
INSERT INTO public.subscription_tiers (id, name, price_satangs, annual_price_satangs, monthly_tokens, token_cost_per_image, max_projects, project_expiry_days, max_rollover, batch_limit, features)
VALUES
    ('free', 'Free', 0, 0, 50, 10, 1, 7, 50, 1, '{
        "editor.magic_remover": false,
        "editor.clone_stamp": false,
        "editor.manual_translate": false,
        "editor.text_border": false,
        "editor.bulk_export_zip": false,
        "editor.upscaling": false,
        "translator.gpt4o": false,
        "translator.claude": false
    }'::jsonb),
    ('starter', 'Starter', 9900, 99000, 500, 10, 3, 14, 500, 5, '{
        "editor.magic_remover": false,
        "editor.clone_stamp": false,
        "editor.manual_translate": false,
        "editor.text_border": false,
        "editor.bulk_export_zip": false,
        "editor.upscaling": false,
        "translator.gpt4o": false,
        "translator.claude": false
    }'::jsonb),
    ('pro', 'Pro', 24900, 249000, 2000, 10, 10, 30, 2000, 20, '{
        "editor.magic_remover": true,
        "editor.clone_stamp": true,
        "editor.manual_translate": true,
        "editor.text_border": true,
        "editor.bulk_export_zip": true,
        "editor.upscaling": false,
        "translator.gpt4o": true,
        "translator.claude": false
    }'::jsonb),
    ('premium', 'Premium', 49000, 490000, 5000, 10, 50, 60, 5000, 50, '{
        "editor.magic_remover": true,
        "editor.clone_stamp": true,
        "editor.manual_translate": true,
        "editor.text_border": true,
        "editor.bulk_export_zip": true,
        "editor.upscaling": true,
        "translator.gpt4o": true,
        "translator.claude": true
    }'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. subscriptions — one per user (tracks billing state)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                      BIGSERIAL PRIMARY KEY,
    user_id                 UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    tier_id                 TEXT NOT NULL DEFAULT 'free' REFERENCES public.subscription_tiers(id),
    billing_cycle           TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'expired')),
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    tokens_refreshed_at     TIMESTAMPTZ,
    rollover_tokens         INT NOT NULL DEFAULT 0,
    omise_schedule_id       TEXT,                   -- Omise recurring charge schedule ID
    omise_customer_id       TEXT,                   -- Omise customer ID (for saved cards)
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON public.subscriptions(current_period_end);

-- ============================================================
-- 3. Add tier_id to profiles for quick lookups
-- ============================================================
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS tier_id TEXT NOT NULL DEFAULT 'free'
    REFERENCES public.subscription_tiers(id);

-- ============================================================
-- 4. subscription_payments — tracks subscription charges separately from top-ups
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subscription_id     BIGINT NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    omise_charge_id     TEXT UNIQUE,
    tier_id             TEXT NOT NULL REFERENCES public.subscription_tiers(id),
    billing_cycle       TEXT NOT NULL,
    amount_satangs      INT NOT NULL,
    tokens_credited     INT NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed', 'refunded')),
    period_start        TIMESTAMPTZ,
    period_end          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON public.subscription_payments(user_id);

-- ============================================================
-- 5. RLS policies
-- ============================================================
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- subscription_tiers: everyone can read (it's a public reference table)
CREATE POLICY "Anyone can read subscription tiers"
    ON public.subscription_tiers FOR SELECT
    USING (true);

-- subscriptions: users read own, service_role modifies
CREATE POLICY "Users can read own subscription"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role manages subscriptions"
    ON public.subscriptions FOR ALL
    USING (auth.role() = 'service_role');

-- subscription_payments: users read own
CREATE POLICY "Users can read own subscription payments"
    ON public.subscription_payments FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role manages subscription payments"
    ON public.subscription_payments FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- 6. updated_at triggers
-- ============================================================
CREATE TRIGGER set_subscription_tiers_updated_at
    BEFORE UPDATE ON public.subscription_tiers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_subscription_payments_updated_at
    BEFORE UPDATE ON public.subscription_payments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 7. RPC: refresh_subscription_tokens
--    Called on subscription renewal to apply rollover + credit new tokens.
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_subscription_tokens(
    p_user_id UUID,
    p_monthly_tokens INT,
    p_max_rollover INT
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_current_balance INT;
    v_rollover INT;
    v_new_balance INT;
BEGIN
    -- Lock the profile row
    SELECT token_balance INTO v_current_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', p_user_id;
    END IF;

    -- Rollover = min(current_balance, max_rollover)
    v_rollover := LEAST(v_current_balance, p_max_rollover);
    v_new_balance := v_rollover + p_monthly_tokens;

    -- Update balance
    UPDATE public.profiles
    SET token_balance = v_new_balance
    WHERE id = p_user_id;

    -- Log the rollover adjustment (if balance decreased)
    IF v_current_balance > v_rollover THEN
        INSERT INTO public.token_transactions (user_id, amount, balance_after, type, reference_id, channel)
        VALUES (p_user_id, -(v_current_balance - v_rollover), v_rollover, 'subscription', 'rollover_cap', 'system');
    END IF;

    -- Log the subscription token credit
    INSERT INTO public.token_transactions (user_id, amount, balance_after, type, reference_id, channel)
    VALUES (p_user_id, p_monthly_tokens, v_new_balance, 'subscription', 'subscription_renewal', 'system');

    -- Update rollover on subscription
    UPDATE public.subscriptions
    SET rollover_tokens = v_rollover, tokens_refreshed_at = now()
    WHERE user_id = p_user_id;

    RETURN v_new_balance;
END;
$$;

-- ============================================================
-- 8. Create free subscriptions for all existing users
-- ============================================================
INSERT INTO public.subscriptions (user_id, tier_id, status, billing_cycle)
SELECT id, 'free', 'active', 'monthly'
FROM public.profiles
WHERE id NOT IN (SELECT user_id FROM public.subscriptions)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 9. Update handle_new_user() to also create a free subscription
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_display_name text;
    v_new_balance int;
BEGIN
    v_display_name := split_part(NEW.email, '@', 1);

    INSERT INTO public.profiles (id, display_name, token_balance, tier_id)
    VALUES (NEW.id, v_display_name, 5, 'free');

    v_new_balance := 5;

    INSERT INTO public.token_transactions (user_id, amount, balance_after, type, reference_id, channel)
    VALUES (NEW.id, 5, v_new_balance, 'topup', 'signup_bonus', 'system');

    INSERT INTO public.subscriptions (user_id, tier_id, status, billing_cycle)
    VALUES (NEW.id, 'free', 'active', 'monthly');

    RETURN NEW;
END;
$$;
