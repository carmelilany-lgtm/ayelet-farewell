import { Suspense } from "react";
import { InvitationShell } from "@/components/InvitationShell";
import { InvitePageClient } from "@/components/InvitePageClient";
import { Reveal } from "@/components/Reveal";
import { getSiteContent } from "@/lib/site-content";
import { getInviteByToken } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const [invite, content] = await Promise.all([
    getInviteByToken(token),
    getSiteContent(),
  ]);

  return (
    <InvitationShell content={content} compact>
      <Reveal
        as="section"
        className="rsvp-section"
        id="rsvp"
        aria-labelledby="rsvp-title"
      >
        <div className="section">
          <h2 id="rsvp-title" className="section-title">
            {content.rsvpTitle}
          </h2>
          {!invite ? (
            <div className="success-panel">
              <p className="success-title">{content.invalidLinkTitle}</p>
              <p className="success-body">{content.invalidLinkBody}</p>
              <p className="gift-note">
                {content.invalidLinkHomeHint}{" "}
                <a href="/#rsvp">{content.phoneLabel}</a>.
              </p>
            </div>
          ) : (
            <Suspense fallback={<p className="rsvp-lead">{content.loadingLabel}</p>}>
              <InvitePageClient
                token={token}
                invite={invite}
                content={content}
              />
            </Suspense>
          )}
        </div>
      </Reveal>
    </InvitationShell>
  );
}
