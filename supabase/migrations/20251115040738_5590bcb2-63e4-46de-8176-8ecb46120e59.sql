-- Fix RLS policies on acs_contract_state to allow service role to write
DROP POLICY IF EXISTS "Only admins can insert contract state" ON acs_contract_state;
DROP POLICY IF EXISTS "Only admins can update contract state" ON acs_contract_state;

-- Allow service role and admins to insert/update contract state
CREATE POLICY "Service role and admins can insert contract state"
ON acs_contract_state
FOR INSERT
WITH CHECK (
  ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Service role and admins can update contract state"
ON acs_contract_state
FOR UPDATE
USING (
  ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  OR has_role(auth.uid(), 'admin'::app_role)
);