-- Enable realtime for acs_snapshots table
ALTER PUBLICATION supabase_realtime ADD TABLE public.acs_snapshots;

-- Enable realtime for acs_template_stats table  
ALTER PUBLICATION supabase_realtime ADD TABLE public.acs_template_stats;