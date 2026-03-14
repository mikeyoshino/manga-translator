-- Add channel column to token_transactions
ALTER TABLE public.token_transactions
  ADD COLUMN channel TEXT;  -- e.g. 'promptpay', 'card', 'api', 'system'

-- Update deduct_tokens to accept channel
CREATE OR REPLACE FUNCTION public.deduct_tokens(
  p_user_id  UUID,
  p_amount   INT,
  p_reference TEXT DEFAULT NULL,
  p_channel  TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance INT;
BEGIN
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

  INSERT INTO public.token_transactions (user_id, amount, balance_after, type, reference_id, channel)
  VALUES (p_user_id, -p_amount, v_balance - p_amount, 'translation', p_reference, p_channel);

  RETURN TRUE;
END;
$$;

-- Update credit_tokens to accept channel
CREATE OR REPLACE FUNCTION public.credit_tokens(
  p_user_id  UUID,
  p_amount   INT,
  p_type     TEXT DEFAULT 'topup',
  p_reference TEXT DEFAULT NULL,
  p_channel  TEXT DEFAULT NULL
)
RETURNS INT
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

  INSERT INTO public.token_transactions (user_id, amount, balance_after, type, reference_id, channel)
  VALUES (p_user_id, p_amount, v_new_balance, p_type, p_reference, p_channel);

  RETURN v_new_balance;
END;
$$;
