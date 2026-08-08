import { InvitationShell } from "@/components/InvitationShell";
import { PhoneAuthRsvp } from "@/components/PhoneAuthRsvp";
import { getSiteContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const content = await getSiteContent();

  return (
    <InvitationShell content={content}>
      <section id="rsvp" className="rsvp-section" aria-labelledby="rsvp-title">
        <div className="section">
          <h2 id="rsvp-title" className="section-title">
            {content.rsvpTitle}
          </h2>
          <PhoneAuthRsvp
            lead={content.rsvpLeadHome}
            help={content.rsvpHelp}
            confirmPrompt={content.confirmPrompt}
          />
        </div>
      </section>
    </InvitationShell>
  );
}
