-- Create table for current state (always up-to-date)
CREATE TABLE public.acs_current_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amulet_total NUMERIC NOT NULL DEFAULT 0,
  locked_total NUMERIC NOT NULL DEFAULT 0,
  circulating_supply NUMERIC NOT NULL DEFAULT 0,
  active_contracts INTEGER NOT NULL DEFAULT 0,
  last_update_id TEXT,
  last_record_time TEXT,
  migration_id INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  streamer_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.acs_current_state ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Public can view current state" 
ON public.acs_current_state 
FOR SELECT 
USING (true);

-- Create policy for service role to update
CREATE POLICY "Service role can update current state" 
ON public.acs_current_state 
FOR ALL 
USING (true);

-- Add index for performance on contract state
CREATE INDEX idx_acs_contract_state_active ON public.acs_contract_state(is_active) WHERE is_active = true;

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.acs_current_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.acs_contract_state;

-- Insert initial row for current state
INSERT INTO public.acs_current_state (
  migration_id,
  amulet_total,
  locked_total,
  circulating_supply,
  active_contracts
) VALUES (
  0,
  0,
  0,
  0,
  0
);