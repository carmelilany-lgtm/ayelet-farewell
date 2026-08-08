import { Countdown } from "@/components/Countdown";
import {
  IconBit,
  IconGift,
  IconMap,
  IconMic,
  IconNav,
} from "@/components/Icons";
import { InviteViewer } from "@/components/InviteViewer";
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
        <div className="hero-content">
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
              <a className="hero-cta" href="#rsvp">
                {content.ctaLabel}
              </a>
              <div className="hero-secondary">
                <a className="hero-text-link" href="#details">
                  {content.detailsLinkLabel}
                </a>
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

      <section id="details" className="program-section" aria-labelledby="program-title">
        <div className="program-layout">
          <div className="program-panel">
            <h2 id="program-title" className="section-title">
              {content.programTitle}
            </h2>

            <ol className="program-schedule">
              {content.programItems.map((item, index) => (
                <li key={`${item.time}-${item.title}-${index}`} className="schedule-row">
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
              <p className="evening-note">
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
                      <IconNav className="link-icon" />
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
                      <IconMap className="link-icon" />
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
                      <IconBit className="link-icon" />
                      {content.bitLabel || "ביט"}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
          <div
            className="program-banner"
            role="img"
            aria-label={content.place}
          />
        </div>
      </section>

      {children}

      <footer className="site-footer">{content.footer}</footer>
    </main>
  );
}
