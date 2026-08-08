"use client";

import { RsvpForm } from "@/components/RsvpForm";
import type { PublicInviteView } from "@/lib/types";

export function InvitePageClient({
  token,
  invite,
  lead,
  confirmPrompt,
}: {
  token: string;
  invite: PublicInviteView;
  lead?: string;
  confirmPrompt?: string;
}) {
  return (
    <RsvpForm
      token={token}
      invite={invite}
      lead={lead}
      confirmPrompt={confirmPrompt}
    />
  );
}
