-- Idempotent migration: add shared_link column to conversions
ALTER TABLE public.conversions
ADD COLUMN IF NOT EXISTS shared_link TEXT;

-- Allow public read access via RLS for shared conversions (by share token)
-- First create a policy for public read by share token
CREATE POLICY IF NOT EXISTS "Anyone can view shared conversions by token"
  ON public.conversions
  FOR SELECT
  USING (shared_link IS NOT NULL AND status = 'completed');
