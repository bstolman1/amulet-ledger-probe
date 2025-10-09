-- Drop the foreign key constraint from featured_app_votes
ALTER TABLE public.featured_app_votes DROP CONSTRAINT IF EXISTS featured_app_votes_cip_id_fkey;

-- Remove cip_id from featured_app_votes since they're not connected to CIPs
ALTER TABLE public.featured_app_votes DROP COLUMN IF EXISTS cip_id;

-- Add status field to featured_app_votes
ALTER TABLE public.featured_app_votes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Create table for featured app committee votes
CREATE TABLE IF NOT EXISTS public.featured_app_committee_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  featured_app_id UUID NOT NULL REFERENCES public.featured_app_votes(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  email TEXT NOT NULL,
  contact TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  vote TEXT CHECK (vote IN ('yes', 'no', 'abstain', '')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on featured_app_committee_votes
ALTER TABLE public.featured_app_committee_votes ENABLE ROW LEVEL SECURITY;

-- Create policies for featured_app_committee_votes
CREATE POLICY "Public can view featured app committee votes"
  ON public.featured_app_committee_votes FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert featured app committee votes"
  ON public.featured_app_committee_votes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update featured app committee votes"
  ON public.featured_app_committee_votes FOR UPDATE
  USING (true);

CREATE POLICY "Admins can delete featured app committee votes"
  ON public.featured_app_committee_votes FOR DELETE
  USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_featured_app_committee_votes_updated_at
  BEFORE UPDATE ON public.featured_app_committee_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();