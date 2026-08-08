import { InvitationShell } from "@/components/InvitationShell";
import { PhoneAuthRsvp } from "@/components/PhoneAuthRsvp";
import { Reveal } from "@/components/Reveal";
import { getSiteContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const content = await getSiteContent();

  return (
    <InvitationShell content={content}>
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
          <PhoneAuthRsvp content={content} />
        </div>
      </Reveal>
    </InvitationShell>
  );
}
