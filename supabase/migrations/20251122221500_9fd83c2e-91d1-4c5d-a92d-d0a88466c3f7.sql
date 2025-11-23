-- Ledger updates table
CREATE TABLE public.ledger_updates (
  update_id TEXT PRIMARY KEY,
  migration_id INTEGER NOT NULL,
  synchronizer_id TEXT,
  record_time TIMESTAMPTZ NOT NULL,
  effective_at TIMESTAMPTZ,
  offset TEXT,
  workflow_id TEXT,
  kind TEXT NOT NULL,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ledger events table
CREATE TABLE public.ledger_events (
  event_id TEXT PRIMARY KEY,
  update_id TEXT NOT NULL REFERENCES public.ledger_updates(update_id) ON DELETE CASCADE,
  contract_id TEXT,
  template_id TEXT,
  package_name TEXT,
  event_type TEXT NOT NULL,
  payload JSONB,
  signatories TEXT[],
  observers TEXT[],
  created_at_ts TIMESTAMPTZ,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cursors for backfilling
CREATE TABLE public.backfill_cursors (
  migration_id INTEGER NOT NULL,
  synchronizer_id TEXT NOT NULL,
  min_time TIMESTAMPTZ NOT NULL,
  max_time TIMESTAMPTZ NOT NULL,
  last_before TIMESTAMPTZ,
  complete BOOLEAN DEFAULT false,
  PRIMARY KEY (migration_id, synchronizer_id)
);

-- Indexes
CREATE INDEX idx_ledger_events_contract_id ON public.ledger_events(contract_id);
CREATE INDEX idx_ledger_events_template_id ON public.ledger_events(template_id);
CREATE INDEX idx_ledger_events_update_id ON public.ledger_events(update_id);

-- Enable RLS
ALTER TABLE public.ledger_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_cursors ENABLE ROW LEVEL SECURITY;

-- Public Read Policies
CREATE POLICY "Public can read ledger_updates"
  ON public.ledger_updates
  FOR SELECT
  USING (true);

CREATE POLICY "Public can read ledger_events"
  ON public.ledger_events
  FOR SELECT
  USING (true);

CREATE POLICY "Public can read backfill_cursors"
  ON public.backfill_cursors
  FOR SELECT
  USING (true);

-- Admin Write Access
CREATE POLICY "Admins can insert ledger_updates"
  ON public.ledger_updates
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert ledger_events"
  ON public.ledger_events
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert backfill_cursors"
  ON public.backfill_cursors
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admin Update access
CREATE POLICY "Admins can update backfill_cursors"
  ON public.backfill_cursors
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));
