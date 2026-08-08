-- System audit log for admin journal (RSVP changes + WhatsApp activity)
create table public.system_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  action text not null,
  summary text not null,
  actor text,
  guest_name text,
  phone text,
  rsvp_id uuid,
  ok boolean not null default true,
  detail jsonb not null default '{}'::jsonb
);

create index system_events_created_at_idx on public.system_events (created_at desc);
create index system_events_source_idx on public.system_events (source);
create index system_events_action_idx on public.system_events (action);

alter table public.system_events enable row level security;
revoke all on table public.system_events from anon, authenticated;
grant all on table public.system_events to service_role;
