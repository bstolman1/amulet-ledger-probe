-- Allow service role to manage ACS snapshots
DROP POLICY IF EXISTS "Only admins can insert snapshots" ON acs_snapshots;
DROP POLICY IF EXISTS "Only admins can update snapshots" ON acs_snapshots;

CREATE POLICY "Service role and admins can insert snapshots"
ON acs_snapshots
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.jwt()->>'role' = 'service_role'
);

CREATE POLICY "Service role and admins can update snapshots"
ON acs_snapshots
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.jwt()->>'role' = 'service_role'
);

-- Allow service role to insert template stats
DROP POLICY IF EXISTS "Only admins can insert template stats" ON acs_template_stats;

CREATE POLICY "Service role and admins can insert template stats"
ON acs_template_stats
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.jwt()->>'role' = 'service_role'
);
