import { InvitationShell } from "@/components/InvitationShell";
import { getSiteContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const content = await getSiteContent();
  return <InvitationShell content={content} showHomeRsvpNote />;
}
