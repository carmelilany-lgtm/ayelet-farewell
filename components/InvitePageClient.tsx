"use client";

import { RsvpForm } from "@/components/RsvpForm";
import type { ThankYouMessages } from "@/lib/thank-you";
import type { PublicInviteView } from "@/lib/types";

export function InvitePageClient({
  token,
  invite,
  lead,
  confirmPrompt,
  thankYou,
}: {
  token: string;
  invite: PublicInviteView;
  lead?: string;
  confirmPrompt?: string;
  thankYou?: ThankYouMessages;
}) {
  return (
    <RsvpForm
      token={token}
      invite={invite}
      lead={lead}
      confirmPrompt={confirmPrompt}
      thankYou={thankYou}
    />
  );
}
