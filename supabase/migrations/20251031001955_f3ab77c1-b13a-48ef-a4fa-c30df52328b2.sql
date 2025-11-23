-- =====================================================================
-- ACS Snapshots Core Schema
-- =====================================================================

-- Create table for ACS snapshot summaries
CREATE TABLE IF NOT EXISTS public.acs_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  migration_id INTEGER NOT NULL,
  record_time TEXT NOT NULL,
  sv_url TEXT NOT NULL,
  canonical_package TEXT,
  amulet_total NUMERIC(20, 10) NOT NULL,
  locked_total NUMERIC(20, 10) NOT NULL,
  circulating_supply NUMERIC(20, 10) NOT NULL,
  entry_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create table for per-template statistics
CREATE TABLE IF NOT EXISTS public.acs_template_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.acs_snapshots(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  contract_count INTEGER NOT NULL,
  field_sums JSONB,
  status_tallies JSONB,
  storage_path TEXT, -- Path to the full JSON file in storage (in 'acs-data' bucket)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for ACS tables
CREATE INDEX IF NOT EXISTS idx_acs_snapshots_timestamp ON public.acs_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_acs_snapshots_status ON public.acs_snapshots(status);
CREATE INDEX IF NOT EXISTS idx_acs_snapshots_migration ON public.acs_snapshots(migration_id);
CREATE INDEX IF NOT EXISTS idx_acs_template_stats_snapshot ON public.acs_template_stats(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_acs_template_stats_template ON public.acs_template_stats(template_id);

-- Enable RLS
ALTER TABLE public.acs_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acs_template_stats ENABLE ROW LEVEL SECURITY;

-- Public read access for snapshots
CREATE POLICY IF NOT EXISTS "Public can view ACS snapshots"
  ON public.acs_snapshots
  FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public can view template stats"
  ON public.acs_template_stats
  FOR SELECT
  USING (true);

-- Admin-only write access (adjust has_role() to your auth model if needed)
CREATE POLICY IF NOT EXISTS "Only admins can insert snapshots"
  ON public.acs_snapshots
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY IF NOT EXISTS "Only admins can update snapshots"
  ON public.acs_snapshots
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY IF NOT EXISTS "Only admins can insert template stats"
  ON public.acs_template_stats
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY IF NOT EXISTS "Only admins can update template stats"
  ON public.acs_template_stats
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at (assumes public.update_updated_at_column already exists)
CREATE TRIGGER IF NOT EXISTS update_acs_snapshots_updated_at
  BEFORE UPDATE ON public.acs_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_acs_template_stats_updated_at
  BEFORE UPDATE ON public.acs_template_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- Storage bucket for ACS JSON data
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('acs-data', 'acs-data', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for ACS data
CREATE POLICY IF NOT EXISTS "Public can view ACS data files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'acs-data');

CREATE POLICY IF NOT EXISTS "Admins can upload ACS data files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'acs-data' AND
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY IF NOT EXISTS "Admins can update ACS data files"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'acs-data' AND
    has_role(auth.uid(), 'admin'::app_role)
  );

-- =====================================================================
-- Ledger History Tables (for Backfill + /v2/updates)
-- =====================================================================

-- Stores each transaction / reassignment update from Scan:
-- - /v0/backfilling/updates-before
-- - /v2/updates
CREATE TABLE IF NOT EXISTS public.ledger_updates (
  update_id TEXT PRIMARY KEY,
  migration_id INTEGER NOT NULL,
  synchronizer_id TEXT,
  workflow_id TEXT,
  kind TEXT NOT NULL,  -- 'transaction' | 'reassignment'
  record_time TIMESTAMPTZ NOT NULL,
  effective_at TIMESTAMPTZ,
  offset TEXT,         -- for /v2/updates, may be NULL for pure backfill
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_updates_record_time ON public.ledger_updates(record_time DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_updates_migration ON public.ledger_updates(migration_id);
CREATE INDEX IF NOT EXISTS idx_ledger_updates_offset ON public.ledger_updates(offset);

-- Stores individual events (create / archive / exercise / reassign_create)
CREATE TABLE IF NOT EXISTS public.ledger_events (
  event_id TEXT PRIMARY KEY,
  update_id TEXT NOT NULL REFERENCES public.ledger_updates(update_id) ON DELETE CASCADE,
  contract_id TEXT,
  template_id TEXT,
  package_name TEXT,
  event_type TEXT NOT NULL,  -- 'created' | 'archived' | 'exercise' | 'reassign_create' | etc.
  payload JSONB,
  signatories JSONB,
  observers JSONB,
  created_at_ts TIMESTAMPTZ,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_events_contract_id ON public.ledger_events(contract_id);
CREATE INDEX IF NOT EXISTS idx_ledger_events_template_id ON public.ledger_events(template_id);
CREATE INDEX IF NOT EXISTS idx_ledger_events_event_type ON public.ledger_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ledger_events_created_at_ts ON public.ledger_events(created_at_ts DESC);

-- Optional: RLS for ledger tables (public read, admin write)
ALTER TABLE public.ledger_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Public can view ledger updates"
  ON public.ledger_updates
  FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public can view ledger events"
  ON public.ledger_events
  FOR SELECT
  USING (true);

-- Admin-only insert/update (Edge Functions use service role, bypassing RLS)
CREATE POLICY IF NOT EXISTS "Only admins can insert ledger updates"
  ON public.ledger_updates
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY IF NOT EXISTS "Only admins can insert ledger events"
  ON public.ledger_events
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
