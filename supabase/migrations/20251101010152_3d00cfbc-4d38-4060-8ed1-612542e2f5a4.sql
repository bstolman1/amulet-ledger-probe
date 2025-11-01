-- Add delta tracking fields to acs_snapshots table
ALTER TABLE acs_snapshots 
ADD COLUMN is_delta BOOLEAN DEFAULT false,
ADD COLUMN previous_snapshot_id UUID REFERENCES acs_snapshots(id),
ADD COLUMN updates_processed INTEGER DEFAULT 0,
ADD COLUMN last_update_id TEXT,
ADD COLUMN processing_mode TEXT DEFAULT 'full' CHECK (processing_mode IN ('full', 'delta'));

-- Create indexes for efficient lookups
CREATE INDEX idx_acs_snapshots_record_time ON acs_snapshots(migration_id, record_time DESC);
CREATE INDEX idx_acs_snapshots_completed ON acs_snapshots(status, timestamp DESC) WHERE status = 'completed';

-- Create contract state tracking table for maintaining current state
CREATE TABLE acs_contract_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id TEXT NOT NULL UNIQUE,
  template_id TEXT NOT NULL,
  package_name TEXT,
  create_arguments JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  last_seen_in_snapshot_id UUID REFERENCES acs_snapshots(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on new table
ALTER TABLE acs_contract_state ENABLE ROW LEVEL SECURITY;

-- Public can view contract state
CREATE POLICY "Public can view contract state" 
ON acs_contract_state 
FOR SELECT 
USING (true);

-- Only admins can modify contract state
CREATE POLICY "Only admins can insert contract state" 
ON acs_contract_state 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update contract state" 
ON acs_contract_state 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for contract state
CREATE INDEX idx_contract_state_active ON acs_contract_state(is_active, template_id);
CREATE INDEX idx_contract_state_template ON acs_contract_state(template_id);
CREATE INDEX idx_contract_state_contract_id ON acs_contract_state(contract_id);