-- Enable realtime for ledger updates and events tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_updates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_events;