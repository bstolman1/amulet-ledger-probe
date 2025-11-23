-- Enable RLS on system tables (if not already enabled)
ALTER TABLE public.backfill_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_events ENABLE ROW LEVEL SECURITY;

-- Backfill cursors: Allow public insert and update for automation scripts
CREATE POLICY "Allow public insert on backfill_cursors"
ON public.backfill_cursors
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public update on backfill_cursors"
ON public.backfill_cursors
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public select on backfill_cursors"
ON public.backfill_cursors
FOR SELECT
TO public
USING (true);

-- Ledger updates: Allow public insert for automation scripts
CREATE POLICY "Allow public insert on ledger_updates"
ON public.ledger_updates
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public select on ledger_updates"
ON public.ledger_updates
FOR SELECT
TO public
USING (true);

-- Ledger events: Allow public insert for automation scripts
CREATE POLICY "Allow public insert on ledger_events"
ON public.ledger_events
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public select on ledger_events"
ON public.ledger_events
FOR SELECT
TO public
USING (true);