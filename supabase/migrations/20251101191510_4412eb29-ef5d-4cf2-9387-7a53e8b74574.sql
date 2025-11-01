-- Update RLS policies to allow service role access for GitHub Actions workflow

-- ===========================
-- 1. Update acs_snapshots policies
-- ===========================

DROP POLICY IF EXISTS "Service role and admins can insert snapshots" ON public.acs_snapshots;
DROP POLICY IF EXISTS "Service role and admins can update snapshots" ON public.acs_snapshots;

CREATE POLICY "Service role and admins can insert snapshots"
  ON public.acs_snapshots
  FOR INSERT
  WITH CHECK (
    -- Allow service role (for GitHub Actions and edge functions)
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR
    -- Allow authenticated admin users
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Service role and admins can update snapshots"
  ON public.acs_snapshots
  FOR UPDATE
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR
    has_role(auth.uid(), 'admin'::app_role)
  );

-- ===========================
-- 2. Update acs_template_stats policies
-- ===========================

DROP POLICY IF EXISTS "Service role and admins can insert template stats" ON public.acs_template_stats;

CREATE POLICY "Service role and admins can insert template stats"
  ON public.acs_template_stats
  FOR INSERT
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR
    has_role(auth.uid(), 'admin'::app_role)
  );

-- ===========================
-- 3. Create storage policies for acs-data bucket
-- ===========================

DROP POLICY IF EXISTS "Service role and admins can upload ACS data files" ON storage.objects;
DROP POLICY IF EXISTS "Service role and admins can update ACS data files" ON storage.objects;

CREATE POLICY "Service role and admins can upload ACS data files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'acs-data' AND (
      current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
      OR
      has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "Service role and admins can update ACS data files"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'acs-data' AND (
      current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
      OR
      has_role(auth.uid(), 'admin'::app_role)
    )
  );