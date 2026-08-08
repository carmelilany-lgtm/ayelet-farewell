import { Countdown } from "@/components/Countdown";
import { IconGift, IconMic } from "@/components/Icons";
import { InviteViewer } from "@/components/InviteViewer";
import { Reveal } from "@/components/Reveal";
import { SmoothScrollLink } from "@/components/SmoothScrollLink";
import type { SiteContent } from "@/lib/site-content";
import { formatProgramTimeLabel } from "@/lib/site-content-defaults";

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
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-content hero-reveal">
          <div className="hero-ornament" aria-hidden="true" />
          {content.banner.trim() ? (
            <p className="personal-banner">{content.banner}</p>
          ) : null}
          <h1 className="brand-title">{content.title}</h1>
          <div className="hero-details">
            <p>{content.dateTime}</p>
            <p>{content.place}</p>
          </div>
          <Countdown
            doneLabel={content.countdownDone}
            daysLabel={content.countdownDays}
            hoursLabel={content.countdownHours}
            minutesLabel={content.countdownMinutes}
            secondsLabel={content.countdownSeconds}
          />
          {!compact && (
            <div className="hero-actions">
              <SmoothScrollLink className="hero-cta" href="#rsvp">
                {content.ctaLabel}
              </SmoothScrollLink>
              <div className="hero-secondary">
                <SmoothScrollLink className="hero-text-link" href="#details">
                  {content.detailsLinkLabel}
                </SmoothScrollLink>
                <span className="hero-sep" aria-hidden="true">
                  ·
                </span>
                <InviteViewer
                  imageSrc={content.coverImage || "/invite.jpg"}
                  label={content.viewInviteLabel}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <Reveal
        as="section"
        className="program-section"
        id="details"
        aria-labelledby="program-title"
      >
        <div className="program-layout">
          <div className="program-panel">
            <h2 id="program-title" className="section-title">
              {content.programTitle}
            </h2>

            <ol className="program-schedule">
              {content.programItems.map((item, index) => (
                <li
                  key={`${item.time}-${item.title}-${index}`}
                  className="schedule-row"
                >
                  <time
                    className="schedule-time"
                    dateTime={item.time || undefined}
                  >
                    {formatProgramTimeLabel(item)}
                  </time>
                  <p className="schedule-title">{item.title}</p>
                </li>
              ))}
            </ol>

            <div className="evening-notes">
              <p className="evening-note soft">
                <IconMic className="evening-note-icon" />
                <span>{content.hosts}</span>
              </p>
              <p className="evening-note soft">
                <IconGift className="evening-note-icon" />
                <span>{content.giftNote}</span>
              </p>
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
                      <img
                        className="link-logo"
                        src="/logos/waze.png"
                        alt=""
                        width={18}
                        height={18}
                        decoding="async"
                      />
                      <span>{content.wazeLabel || "Waze"}</span>
                    </a>
                  )}
                  {content.mapsUrl && (
                    <a
                      className="text-link"
                      href={content.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        className="link-logo link-logo-maps"
                        src="/logos/google-maps.png?v=3"
                        alt=""
                        width={18}
                        height={18}
                        decoding="async"
                      />
                      <span>{content.mapsLabel || "Maps"}</span>
                    </a>
                  )}
                  {content.bitUrl && (
                    <a
                      className="text-link emphasis"
                      href={content.bitUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        className="link-logo"
                        src="/logos/bit.png"
                        alt=""
                        width={18}
                        height={18}
                        decoding="async"
                      />
                      <span>{content.bitLabel || "ביט"}</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="program-banner-wrap">
            <div
              className="program-banner"
              role="img"
              aria-label={content.place}
            />
          </div>
        </div>
      </Reveal>

      {children}

      <Reveal as="footer" className="site-footer">
        {content.footer ? <p className="site-footer-copy">{content.footer}</p> : null}
        <p className="site-footer-credit">
          עיצוב ופיתוח:{" "}
          <a
            href="https://cimedia.co.il"
            target="_blank"
            rel="noopener noreferrer"
          >
            Cimedia
          </a>
        </p>
      </Reveal>
    </main>
  );
}
