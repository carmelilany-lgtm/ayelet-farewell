-- RSVPs for Ayelet farewell party reminder / final confirmation
create type public.rsvp_status as enum ('imported', 'confirmed', 'declined', 'maybe');

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  invite_token text not null unique,
  full_name text not null,
  phone text not null,
  guest_count integer not null default 1 check (guest_count >= 0 and guest_count <= 20),
  status public.rsvp_status not null default 'imported',
  final_confirmed_at timestamptz,
  wants_video_blessing text,
  wants_to_speak text,
  excitement integer check (excitement is null or (excitement >= 1 and excitement <= 5)),
  notes text,
  imported_at timestamptz,
  reminder_sent_at timestamptz,
  reminder_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rsvps_phone_unique unique (phone)
);

create index rsvps_status_idx on public.rsvps (status);
create index rsvps_updated_at_idx on public.rsvps (updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rsvps_set_updated_at
before update on public.rsvps
for each row
execute function public.set_updated_at();

alter table public.rsvps enable row level security;

-- No public policies: all access goes through Next.js with the service role key.
revoke all on table public.rsvps from anon, authenticated;
grant all on table public.rsvps to service_role;
