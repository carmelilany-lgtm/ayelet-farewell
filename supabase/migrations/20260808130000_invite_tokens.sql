-- Add personal invite tokens if upgrading an older schema
alter table public.rsvps
  add column if not exists invite_token text;

update public.rsvps
set invite_token = encode(gen_random_bytes(18), 'base64')
where invite_token is null or invite_token = '';

-- Normalize base64 to URL-safe-ish (Postgres encode uses +/); optional cleanup
alter table public.rsvps
  alter column invite_token set not null;

create unique index if not exists rsvps_invite_token_uidx on public.rsvps (invite_token);
