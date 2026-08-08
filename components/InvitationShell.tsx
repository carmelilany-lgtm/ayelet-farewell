import type { SiteContent } from "@/lib/site-content";

type Props = {
  content: SiteContent;
  compact?: boolean;
  children?: React.ReactNode;
};

export function InvitationShell({
  content,
  compact = false,
  children,
}: Props) {
  const hasLinks = Boolean(content.wazeUrl || content.mapsUrl || content.bitUrl);

  return (
    <main className="page">
      <section
        className={`hero ${compact ? "hero-compact" : ""}`}
        aria-label={content.title}
      >
        <div className="hero-content">
          <div className="hero-ornament" aria-hidden="true" />
          <p className="personal-banner">{content.banner}</p>
          <h1 className="brand-title">{content.title}</h1>
          <div className="hero-details">
            <p>{content.dateTime}</p>
            <p>{content.place}</p>
          </div>
          {!compact && (
            <a className="hero-cta" href="#rsvp">
              {content.ctaLabel}
            </a>
          )}
        </div>
      </section>

      <section className="venue-section" aria-label="המקום">
        <div className="venue-image-wrap">
          <img
            src="/venue.jpg"
            alt="תחנת רוח, טבעון"
            className="venue-image"
          />
        </div>
      </section>

      <section id="details" aria-labelledby="program-title">
        <div className="section">
          <h2 id="program-title" className="section-title">
            {content.programTitle}
          </h2>
          <ol className="program-list">
            {content.programItems.map((item, index) => (
              <li key={`${item}-${index}`}>
                <span className="program-num">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>

          <div className="meta-block">
            <p className="hosts">{content.hosts}</p>
            <p className="gift-note">{content.giftNote}</p>
          </div>

          {hasLinks && (
            <div className="links-block">
              <p className="links-title">{content.linksTitle}</p>
              <div className="quick-links">
                {content.wazeUrl && (
                  <a
                    className="text-link"
                    href={content.wazeUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {content.wazeLabel || "Waze"}
                  </a>
                )}
                {content.mapsUrl && (
                  <a
                    className="text-link"
                    href={content.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {content.mapsLabel || "Maps"}
                  </a>
                )}
                {content.bitUrl && (
                  <a
                    className="text-link emphasis"
                    href={content.bitUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {content.bitLabel || "ביט"}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {children}

      <footer className="site-footer">{content.footer}</footer>
    </main>
  );
}
