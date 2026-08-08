"use client";

import { RsvpForm } from "@/components/RsvpForm";
import type { PublicInviteView } from "@/lib/types";

export function InvitePageClient({
  token,
  invite,
}: {
  token: string;
  invite: PublicInviteView;
}) {
  return <RsvpForm token={token} invite={invite} />;
}
