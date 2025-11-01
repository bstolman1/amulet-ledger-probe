-- Create table for snapshot logs
CREATE TABLE public.snapshot_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid REFERENCES public.acs_snapshots(id) ON DELETE CASCADE NOT NULL,
  log_level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.snapshot_logs ENABLE ROW LEVEL SECURITY;

-- Public can view logs
CREATE POLICY "Public can view snapshot logs"
ON public.snapshot_logs
FOR SELECT
USING (true);

-- Only service role can insert logs
CREATE POLICY "Service role can insert logs"
ON public.snapshot_logs
FOR INSERT
WITH CHECK (true);

-- Add index for faster queries
CREATE INDEX idx_snapshot_logs_snapshot_id ON public.snapshot_logs(snapshot_id);
CREATE INDEX idx_snapshot_logs_created_at ON public.snapshot_logs(created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.snapshot_logs;