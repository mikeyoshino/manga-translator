-- Remove translator.gpt4o and translator.claude keys from subscription_tiers features JSONB.
-- These flags are no longer used — all tiers use the same AI model.

UPDATE subscription_tiers
SET features = features - 'translator.gpt4o' - 'translator.claude'
WHERE features ? 'translator.gpt4o' OR features ? 'translator.claude';
