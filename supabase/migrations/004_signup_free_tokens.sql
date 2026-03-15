-- Give new users 5 free tokens on signup
-- Update the handle_new_user trigger to also credit tokens

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, token_balance)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.email), 5);

  INSERT INTO public.token_transactions (user_id, amount, balance_after, type, reference_id, channel)
  VALUES (NEW.id, 5, 5, 'topup', 'signup_bonus', 'system');

  RETURN NEW;
END;
$$;
