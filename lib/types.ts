export type RsvpStatus = "imported" | "confirmed" | "declined" | "maybe";

export type Rsvp = {
  id: string;
  invite_token: string;
  full_name: string;
  phone: string;
  guest_count: number;
  status: RsvpStatus;
  final_confirmed_at: string | null;
  wants_video_blessing: string | null;
  wants_to_speak: string | null;
  excitement: number | null;
  notes: string | null;
  imported_at: string | null;
  sheet_order: number | null;
  reminder_sent_at: string | null;
  reminder_message_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Admin-added guest who has not yet confirmed/declined RSVP. */
export function isManualPendingGuest(
  r: Pick<Rsvp, "status" | "imported_at" | "final_confirmed_at">
): boolean {
  return (
    r.status === "imported" && !r.imported_at && !r.final_confirmed_at
  );
}

export function normalizeGuestName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Safe fields returned to the guest who holds the invite link. */
export type PublicInviteView = {
  full_name: string;
  guest_count: number;
  status: RsvpStatus;
  notes: string | null;
  wants_video_blessing: string | null;
  wants_to_speak: string | null;
  excitement: number | null;
  already_final: boolean;
};

export type TokenUpdateInput = {
  guest_count: number;
  status: Exclude<RsvpStatus, "imported">;
  notes?: string | null;
  wants_video_blessing?: string | null;
  wants_to_speak?: string | null;
  excitement?: number | null;
};

export type RsvpImportRow = {
  full_name: string;
  phone: string;
  guest_count: number;
  wants_video_blessing: string | null;
  wants_to_speak: string | null;
  excitement: number | null;
  notes: string | null;
  imported_at: string;
  /** 0-based order in the source Google Sheet (unique phones). */
  sheet_order: number;
};

export type RsvpSummary = {
  total_records: number;
  confirmed: number;
  declined: number;
  maybe: number;
  imported_pending: number;
  /** Admin-added guests still waiting for first RSVP */
  manual_pending: number;
  /** Sum of guest_count for confirmed only (includes each registrant). */
  total_guests_attending: number;
  reminders_sent: number;
  reminders_pending: number;
};
