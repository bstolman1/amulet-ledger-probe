-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public can view featured app committee votes" ON public.featured_app_committee_votes;
DROP POLICY IF EXISTS "Admins can insert featured app committee votes" ON public.featured_app_committee_votes;
DROP POLICY IF EXISTS "Admins can update featured app committee votes" ON public.featured_app_committee_votes;
DROP POLICY IF EXISTS "Admins can delete featured app committee votes" ON public.featured_app_committee_votes;

-- Recreate policies
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