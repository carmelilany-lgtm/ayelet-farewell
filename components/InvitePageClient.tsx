"use client";

import { RsvpForm } from "@/components/RsvpForm";
import type { SiteContent } from "@/lib/site-content";
import type { PublicInviteView } from "@/lib/types";

export function InvitePageClient({
  token,
  invite,
  content,
}: {
  token: string;
  invite: PublicInviteView;
  content: SiteContent;
}) {
  return <RsvpForm token={token} invite={invite} content={content} />;
}
