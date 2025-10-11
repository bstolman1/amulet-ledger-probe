-- Add explorer_url to cips for on-chain vote reference
ALTER TABLE public.cips
ADD COLUMN IF NOT EXISTS explorer_url text;

-- Optional: length check via trigger (avoid CHECK with non-immutable)
-- Keep client-side validation for URL format; DB just stores text.

-- Ensure RLS remains intact; existing policies already restrict INSERT/UPDATE to admins.
