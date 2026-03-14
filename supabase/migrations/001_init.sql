-- ============================================================
-- 001_init.sql — Profiles, token transactions, payments
-- ============================================================

-- Profiles (1-to-1 with auth.users)
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  token_balance INT NOT NULL DEFAULT 0 CHECK (token_balance >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- token_balance mutations are service_role only (no INSERT/UPDATE/DELETE policy for anon/authenticated)

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Token transactions (audit log)
-- ============================================================
CREATE TABLE public.token_transactions (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount       INT NOT NULL,             -- positive = credit, negative = debit
  balance_after INT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('topup', 'translation', 'refund')),
  reference_id TEXT,                     -- e.g. charge id, image name
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own transactions"
  ON public.token_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- Payments
-- ============================================================
CREATE TABLE public.payments (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  omise_charge_id  TEXT UNIQUE,
  amount_satangs   INT NOT NULL,
  tokens_to_credit INT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own payments"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Atomic token deduction (SELECT … FOR UPDATE)
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_tokens(
  p_user_id  UUID,
  p_amount   INT,
  p_reference TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance INT;
BEGIN
  -- Lock the row
  SELECT token_balance INTO v_balance
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_balance < p_amount THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profiles
     SET token_balance = token_balance - p_amount
   WHERE id = p_user_id;

  INSERT INTO public.token_transactions (user_id, amount, balance_after, type, reference_id)
  VALUES (p_user_id, -p_amount, v_balance - p_amount, 'translation', p_reference);

  RETURN TRUE;
END;
$$;

-- ============================================================
-- Atomic token credit
-- ============================================================
CREATE OR REPLACE FUNCTION public.credit_tokens(
  p_user_id  UUID,
  p_amount   INT,
  p_type     TEXT DEFAULT 'topup',
  p_reference TEXT DEFAULT NULL
)
RETURNS INT  -- returns new balance
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new_balance INT;
BEGIN
  UPDATE public.profiles
     SET token_balance = token_balance + p_amount
   WHERE id = p_user_id
   RETURNING token_balance INTO v_new_balance;

  INSERT INTO public.token_transactions (user_id, amount, balance_after, type, reference_id)
  VALUES (p_user_id, p_amount, v_new_balance, p_type, p_reference);

  RETURN v_new_balance;
END;
$$;
