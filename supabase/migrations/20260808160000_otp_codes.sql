-- OTP codes for WhatsApp phone login
create table public.otp_codes (
  phone text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.otp_codes enable row level security;
revoke all on table public.otp_codes from anon, authenticated;
grant all on table public.otp_codes to service_role;

create index otp_codes_expires_idx on public.otp_codes (expires_at);
