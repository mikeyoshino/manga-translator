-- Add manga context columns to projects table for caching
-- extracted character/relationship data used to improve Thai translation quality.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS manga_context JSONB,
  ADD COLUMN IF NOT EXISTS context_analyzed_at TIMESTAMPTZ;
