-- Ledger updates table
create table if not exists ledger_updates (
  update_id text primary key,
  migration_id integer not null,
  synchronizer_id text,
  record_time timestamptz not null,
  effective_at timestamptz,
  offset text,
  workflow_id text,
  kind text not null,
  raw jsonb not null,
  created_at timestamptz default now()
);

-- Ledger events table
create table if not exists ledger_events (
  event_id text primary key,
  update_id text not null references ledger_updates(update_id),
  contract_id text,
  template_id text,
  package_name text,
  event_type text not null,
  payload jsonb,
  signatories text[],
  observers text[],
  created_at_ts timestamptz,
  raw jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_ledger_events_contract_id on ledger_events(contract_id);
create index if not exists idx_ledger_events_template_id on ledger_events(template_id);
create index if not exists idx_ledger_events_update_id on ledger_events(update_id);

-- Backfill cursors
create table if not exists backfill_cursors (
  migration_id integer not null,
  synchronizer_id text not null,
  min_time timestamptz not null,
  max_time timestamptz not null,
  last_before timestamptz,
  complete boolean default false,
  primary key (migration_id, synchronizer_id)
);
