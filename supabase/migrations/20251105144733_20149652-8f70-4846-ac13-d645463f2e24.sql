-- Ensure idempotent template stats by enforcing uniqueness per (snapshot_id, template_id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_per_snapshot_template'
  ) THEN
    ALTER TABLE public.acs_template_stats
      ADD CONSTRAINT unique_per_snapshot_template UNIQUE (snapshot_id, template_id);
  END IF;
END $$;