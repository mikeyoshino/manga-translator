-- 008_fix_signup_tokens.sql
-- Fix: migration 006 accidentally reduced signup bonus from 50 to 5 tokens.
-- This restores the correct 50-token signup bonus and patches affected users.

-- ============================================================
-- 1. Fix handle_new_user() to grant 50 tokens (not 5)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_display_name text;
BEGIN
    v_display_name := split_part(NEW.email, '@', 1);

    INSERT INTO public.profiles (id, display_name, token_balance, tier_id)
    VALUES (NEW.id, v_display_name, 50, 'free');

    INSERT INTO public.token_transactions (user_id, amount, balance_after, type, reference_id, channel)
    VALUES (NEW.id, 50, 50, 'topup', 'signup_bonus', 'system');

    INSERT INTO public.subscriptions (user_id, tier_id, status, billing_cycle)
    VALUES (NEW.id, 'free', 'active', 'monthly');

    RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Patch existing users who received only 5 tokens at signup
--    Only affects users whose signup_bonus transaction was for 5 tokens.
-- ============================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tt.user_id
        FROM token_transactions tt
        WHERE tt.reference_id = 'signup_bonus'
          AND tt.amount = 5
    LOOP
        PERFORM credit_tokens(r.user_id, 45, 'topup', 'signup_bonus_fix', 'system');
    END LOOP;
END;
$$;
