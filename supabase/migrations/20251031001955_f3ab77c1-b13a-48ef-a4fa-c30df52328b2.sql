-- Create table for ACS snapshot summaries
CREATE TABLE public.acs_snapshots (
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
CREATE TABLE public.acs_template_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.acs_snapshots(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  contract_count INTEGER NOT NULL,
  field_sums JSONB,
  status_tallies JSONB,
  storage_path TEXT, -- Path to the full JSON file in storage
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_acs_snapshots_timestamp ON public.acs_snapshots(timestamp DESC);
CREATE INDEX idx_acs_snapshots_status ON public.acs_snapshots(status);
CREATE INDEX idx_acs_template_stats_snapshot ON public.acs_template_stats(snapshot_id);
CREATE INDEX idx_acs_template_stats_template ON public.acs_template_stats(template_id);

-- Enable RLS
ALTER TABLE public.acs_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acs_template_stats ENABLE ROW LEVEL SECURITY;

-- Public read access for snapshots
CREATE POLICY "Public can view ACS snapshots"
  ON public.acs_snapshots
  FOR SELECT
  USING (true);

CREATE POLICY "Public can view template stats"
  ON public.acs_template_stats
  FOR SELECT
  USING (true);

-- Admin-only write access
CREATE POLICY "Only admins can insert snapshots"
  ON public.acs_snapshots
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update snapshots"
  ON public.acs_snapshots
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can insert template stats"
  ON public.acs_template_stats
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_acs_snapshots_updated_at
  BEFORE UPDATE ON public.acs_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for ACS data
INSERT INTO storage.buckets (id, name, public)
VALUES ('acs-data', 'acs-data', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for ACS data
CREATE POLICY "Public can view ACS data files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'acs-data');

CREATE POLICY "Admins can upload ACS data files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'acs-data' AND
    has_role(auth.uid(), 'admin'::app_role)
  );