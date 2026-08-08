import type { SiteContent } from "@/lib/site-content";

type Props = {
  content: SiteContent;
  compact?: boolean;
  showHomeRsvpNote?: boolean;
  children?: React.ReactNode;
};

export function InvitationShell({
  content,
  compact = false,
  showHomeRsvpNote = false,
  children,
}: Props) {
  return (
    <main className="page">
      <section
        className={`hero ${compact ? "hero-compact" : ""}`}
        aria-label={content.title}
      >
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-content">
          <p className="quote animate-fade-up">{content.quote}</p>
          <p className="quote-source animate-fade-up delay-1">
            {content.quoteSource}
          </p>
          <div className="personal-banner">{content.banner}</div>
          <h1 className="brand-title animate-fade-up delay-1">{content.title}</h1>
          <p className="hero-meta animate-fade-up delay-2">{content.dateTime}</p>
          <p className="hero-place animate-fade-up delay-2">
            {content.mapsUrl ? (
              <a href={content.mapsUrl} target="_blank" rel="noreferrer">
                {content.place}
              </a>
            ) : (
              content.place
            )}
          </p>
          {!compact && (
            <a className="cta-link animate-fade-up delay-3" href="#rsvp">
              {content.ctaLabel}
            </a>
          )}
        </div>
      </section>

      <section
        id="details"
        className="section"
        aria-labelledby="program-title"
      >
        <h2 id="program-title" className="section-title">
          {content.programTitle}
        </h2>
        <ul className="program">
          {content.programItems.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
        <p className="hosts">{content.hosts}</p>
        <p className="gift-note">{content.giftNote}</p>
      </section>

      {showHomeRsvpNote && (
        <section className="rsvp-section" aria-labelledby="rsvp-info-title">
          <div className="section">
            <h2 id="rsvp-info-title" className="section-title">
              {content.rsvpTitle}
            </h2>
            <p className="rsvp-lead">{content.rsvpLeadHome}</p>
            <p className="gift-note">{content.rsvpHelp}</p>
          </div>
        </section>
      )}

      {children}

      <footer className="site-footer">{content.footer}</footer>
    </main>
  );
}
