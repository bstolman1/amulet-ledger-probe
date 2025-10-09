-- Add new fields to cips table
ALTER TABLE public.cips ADD COLUMN IF NOT EXISTS github_link TEXT;
ALTER TABLE public.cips ADD COLUMN IF NOT EXISTS requires_onchain_vote BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.cips ADD COLUMN IF NOT EXISTS cip_type TEXT;

-- Create table for CIP types
CREATE TABLE IF NOT EXISTS public.cip_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on cip_types
ALTER TABLE public.cip_types ENABLE ROW LEVEL SECURITY;

-- Create policies for cip_types
CREATE POLICY "Public can view CIP types"
  ON public.cip_types FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert CIP types"
  ON public.cip_types FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update CIP types"
  ON public.cip_types FOR UPDATE
  USING (true);

CREATE POLICY "Admins can delete CIP types"
  ON public.cip_types FOR DELETE
  USING (true);

-- Insert default CIP types
INSERT INTO public.cip_types (type_name) VALUES 
  ('Tokenomics'),
  ('Governance'),
  ('Standards Track'),
  ('Meta/Tokenomics')
ON CONFLICT (type_name) DO NOTHING;