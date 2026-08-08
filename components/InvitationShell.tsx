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
  const cover = content.coverImage || "/invite.jpg";

  return (
    <main className="page">
      <section
        className={`hero ${compact ? "hero-compact" : ""}`}
        aria-label={content.title}
        style={
          {
            ["--hero-image" as string]: `url("${cover}")`,
          } as React.CSSProperties
        }
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
          <p className="hero-place animate-fade-up delay-2">{content.place}</p>
          {!compact && (
            <a className="cta-link animate-fade-up delay-3" href="#rsvp">
              {content.ctaLabel}
            </a>
          )}
        </div>
      </section>

      {!compact && (
        <section className="cover-section" aria-label={content.coverCaption}>
          <div className="section cover-inner">
            <p className="section-kicker">{content.coverCaption}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="cover-image"
              src={cover}
              alt={content.coverCaption || content.title}
            />
          </div>
        </section>
      )}

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

        <div className="quick-links">
          {content.wazeUrl && (
            <a
              className="quick-link"
              href={content.wazeUrl}
              target="_blank"
              rel="noreferrer"
            >
              ניווט ב־Waze
            </a>
          )}
          {content.mapsUrl && (
            <a
              className="quick-link ghost"
              href={content.mapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              Google Maps
            </a>
          )}
          {content.bitUrl && (
            <a
              className="quick-link bit"
              href={content.bitUrl}
              target="_blank"
              rel="noreferrer"
            >
              {content.bitLabel || "ביט"}
            </a>
          )}
        </div>
        {!content.bitUrl && (
          <p className="gift-note bit-hint">
            קישור לביט יתווסף כאן ברגע שיוגדר בניהול האתר.
          </p>
        )}
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
