-- Reminder delivery tracking for Green API WhatsApp sends
alter table public.rsvps
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists reminder_message_id text;
