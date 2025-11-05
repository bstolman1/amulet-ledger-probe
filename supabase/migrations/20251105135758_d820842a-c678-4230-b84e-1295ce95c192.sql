-- Fix numeric field overflow by increasing precision for ACS snapshot totals
-- These fields store very large numbers (in the trillions) so we need more precision
ALTER TABLE public.acs_snapshots 
  ALTER COLUMN amulet_total TYPE numeric(30, 10),
  ALTER COLUMN locked_total TYPE numeric(30, 10),
  ALTER COLUMN circulating_supply TYPE numeric(30, 10);