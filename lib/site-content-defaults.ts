export type ProgramItem = {
  /** Start time, e.g. "18:00" */
  time: string;
  /** Optional end time; usually synced from the next item's start */
  endTime: string;
  title: string;
};

export type SiteContent = {
  quote: string;
  quoteSource: string;
  banner: string;
  title: string;
  dateTime: string;
  place: string;
  programTitle: string;
  programItems: ProgramItem[];
  hosts: string;
  giftNote: string;
  rsvpTitle: string;
  rsvpLeadHome: string;
  rsvpHelp: string;
  rsvpLeadInvite: string;
  confirmPrompt: string;
  thankYouConfirmed: string;
  thankYouUpdated: string;
  thankYouDeclined: string;
  thankYouMaybe: string;
  thankYouTitle: string;
  invalidLinkTitle: string;
  invalidLinkBody: string;
  invalidLinkHomeHint: string;
  footer: string;
  ctaLabel: string;
  detailsLinkLabel: string;
  viewInviteLabel: string;
  countdownDone: string;
  countdownDays: string;
  countdownHours: string;
  countdownMinutes: string;
  countdownSeconds: string;
  statusLegend: string;
  statusYesLabel: string;
  statusNoLabel: string;
  guestCountLabel: string;
  submitRsvpLabel: string;
  alreadyConfirmedNote: string;
  updateStatusLabel: string;
  cancelUpdateLabel: string;
  phoneLabel: string;
  sendOtpLabel: string;
  otpSentLead: string;
  codeLabel: string;
  verifyOtpLabel: string;
  changePhoneLabel: string;
  newGuestWelcome: string;
  fullNameLabel: string;
  fullNamePlaceholder: string;
  logoutLabel: string;
  loadingLabel: string;
  guestGreeting: string;
  otpMessageTemplate: string;
  /** Full reminder WhatsApp; use {name} {dateTime} {place} {siteUrl} {personalLink} */
  reminderTemplate: string;
  /** @deprecated Kept for migrating old CMS data into reminderTemplate */
  reminderIntro: string;
  /** @deprecated */
  reminderSiteLabel: string;
  /** @deprecated */
  reminderLinkLabel: string;
  /** @deprecated */
  reminderOutro: string;
  /** Guest thank-you WhatsApp after RSVP; use {name} */
  waThankYouConfirmed: string;
  waThankYouUpdated: string;
  waThankYouDeclined: string;
  /** Organizer alert on RSVP; use {name} {phone} {status} {guestCount} {notes} */
  organizerNotifyTemplate: string;
  mapsUrl: string;
  mapsLabel: string;
  wazeUrl: string;
  wazeLabel: string;
  bitUrl: string;
  bitLabel: string;
  coverImage: string;
  linksTitle: string;
};

/** Parse "18:00 | ברכות", "18:00-18:45 | ברכות", or plain title */
export function parseProgramLine(raw: string): ProgramItem | null {
  const line = raw.trim();
  if (!line) return null;
  const ranged = line.match(
    /^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*[|\-]\s*(.+)$/
  );
  if (ranged) {
    return {
      time: ranged[1],
      endTime: ranged[2],
      title: ranged[3].trim(),
    };
  }
  const match = line.match(/^(\d{1,2}:\d{2})\s*[|\-]\s*(.+)$/);
  if (match) {
    return { time: match[1], endTime: "", title: match[2].trim() };
  }
  if (typeof raw === "object" && raw && "title" in (raw as object)) {
    const item = raw as ProgramItem;
    return {
      time: String(item.time || "").trim(),
      endTime: String(item.endTime || "").trim(),
      title: String(item.title || "").trim(),
    };
  }
  return { time: "", endTime: "", title: line };
}

export function normalizeProgramItems(input: unknown): ProgramItem[] {
  if (!Array.isArray(input) || !input.length) {
    return DEFAULT_SITE_CONTENT.programItems;
  }
  const items = input
    .map((entry) => {
      if (typeof entry === "string") return parseProgramLine(entry);
      if (entry && typeof entry === "object") {
        const item = entry as Partial<ProgramItem>;
        const title = String(item.title ?? "").trim();
        if (!title) return null;
        return {
          time: String(item.time ?? "").trim(),
          endTime: String(item.endTime ?? "").trim(),
          title,
        };
      }
      return null;
    })
    .filter((x): x is ProgramItem => Boolean(x?.title));

  return items;
}

export function formatProgramLines(items: ProgramItem[]): string {
  return items
    .map((item) => {
      if (item.time && item.endTime) {
        return `${item.time}-${item.endTime} | ${item.title}`;
      }
      return item.time ? `${item.time} | ${item.title}` : item.title;
    })
    .join("\n");
}

export function formatProgramTimeLabel(item: ProgramItem): string {
  const start = item.time.trim();
  const end = item.endTime.trim();
  if (!start) return "-";
  // RTL label: start sits on the right; end is optional.
  if (end) return `${start} – ${end}`;
  return start;
}

/** Sync each item's endTime from the next item's start (keeps manual last-item end). */
export function syncProgramEndTimes(
  items: ProgramItem[],
  opts?: { preserveLastEnd?: boolean }
): ProgramItem[] {
  return items.map((item, index) => {
    const nextStart = items[index + 1]?.time?.trim();
    if (nextStart) return { ...item, endTime: nextStart };
    if (opts?.preserveLastEnd === false) return { ...item, endTime: "" };
    return item;
  });
}

export function applyTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return Object.entries(vars)
    .reduce(
      (text, [key, value]) => text.replaceAll(`{${key}}`, value),
      template
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Rebuild full reminder text from old split CMS fields. */
export function legacyReminderTemplate(content: {
  guestGreeting: string;
  reminderIntro: string;
  reminderSiteLabel: string;
  reminderLinkLabel: string;
  reminderOutro: string;
}): string {
  return `${content.guestGreeting}

${content.reminderIntro}

📅 {dateTime}
📍 {place}

${content.reminderSiteLabel}:
{siteUrl}

${content.reminderLinkLabel}:
{personalLink}

${content.reminderOutro}`;
}

export function legacyWaThankYou(
  kind: "confirmed" | "updated" | "declined",
  content: {
    guestGreeting: string;
    thankYouConfirmed: string;
    thankYouUpdated: string;
    thankYouDeclined: string;
    reminderOutro: string;
  }
): string {
  const body =
    kind === "declined"
      ? content.thankYouDeclined
      : kind === "updated"
        ? content.thankYouUpdated
        : content.thankYouConfirmed;

  // Declined guests should not get "looking forward to seeing you".
  if (kind === "declined") {
    return `${content.guestGreeting}

${body}`;
  }

  return `${content.guestGreeting}

${body}

${content.reminderOutro}`;
}

/** Remove warm "see you there" outros from declined WhatsApp templates. */
export function sanitizeDeclinedWaTemplate(template: string): string {
  const cleaned = template
    .split("\n")
    .filter((line) => !/מחכ(?:ים|ות)\s+לראות/.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || DEFAULT_SITE_CONTENT.waThankYouDeclined;
}

export const DEFAULT_SITE_CONTENT: SiteContent = {
  quote: "לכל זמן ועת לכל חפץ תחת השמים",
  quoteSource: "קהלת (פרק ג׳, פסוק א׳)",
  banner: "",
  title: "מסיבת פרידה",
  dateTime: "7 בספטמבר, 2026 | 18:00-21:00",
  place: "תחנת רוח, כיכר בן גוריון 1, טבעון",
  programTitle: "תוכנית לערב",
  programItems: [
    {
      time: "18:00",
      endTime: "18:45",
      title: "ברכות ומוזיקה",
    },
    {
      time: "18:45",
      endTime: "20:00",
      title: "ארוחת ערב גורמה טבעוני־צמחוני (לונא ביסטרו)",
    },
    {
      time: "20:00",
      endTime: "21:00",
      title: "ריקודים עם DJ mayxsam",
    },
  ],
  hosts: "הנחייה: אורטל ברקה וכרמל אילני",
  giftNote:
    "לא להביא מתנות. השתתפותכם היא המתנה. אפשר להפקיד ברכות והשתתפות בעלויות בתיבה במקום - או דרך ביט.",
  rsvpTitle: "אישור הגעה",
  rsvpLeadHome: "",
  rsvpHelp: "",
  rsvpLeadInvite: "שלום {name} - עדכנו את הפרטים שלכם ואשרו הגעה.",
  confirmPrompt:
    "מצפה בשמחה לבואך למסיבה שלי. כדי להיות ערוכה על הצד הטוב ביותר (קייטרינג, יין די. ג׳יי ועוד) בבקשה אשר/י את הגעתך 🙏🏽♥️💐",
  thankYouConfirmed: "תודה שאישרת את הגעתך. נתראה ב־7 בספטמבר בתחנת רוח, טבעון.",
  thankYouUpdated: "תודה שעדכנת אותנו - נדע להיערך יותר טוב.",
  thankYouDeclined: "תודה על העדכון. נתראה באירוע אחר בקרוב.",
  thankYouMaybe: "קיבלנו את העדכון. אפשר לחזור ולעדכן בכל רגע.",
  thankYouTitle: "תודה, {name}!",
  invalidLinkTitle: "הקישור לא תקין",
  invalidLinkBody:
    "הקישור האישי לא נמצא. אפשר להתחבר מהעמוד הראשי עם מספר הטלפון.",
  invalidLinkHomeHint: "אפשר גם להיכנס דרך התחברות עם מספר טלפון.",
  footer: "מסיבת פרידה לאיילת · טבעון · ספטמבר 2026",
  ctaLabel: "אישור הגעה",
  detailsLinkLabel: "פרטי האירוע",
  viewInviteLabel: "צפייה בהזמנה",
  countdownDone: "הערב התחיל - נתראה!",
  countdownDays: "ימים",
  countdownHours: "שעות",
  countdownMinutes: "דקות",
  countdownSeconds: "שניות",
  statusLegend: "האם תגיעו?",
  statusYesLabel: "כן, מגיע/ה",
  statusNoLabel: "לא אוכל/ה להגיע",
  guestCountLabel: "כמה תגיעו?",
  submitRsvpLabel: "שליחת אישור הגעה",
  alreadyConfirmedNote: "כבר שלחתם אישור. אפשר לעדכן אם משהו השתנה.",
  updateStatusLabel: "עדכון סטטוס",
  cancelUpdateLabel: "ביטול",
  phoneLabel: "מספר טלפון נייד",
  sendOtpLabel: "שלחו לי קוד ב־WhatsApp",
  otpSentLead: "נשלח קוד אימות ל־WhatsApp",
  codeLabel: "קוד אימות",
  verifyOtpLabel: "אימות והמשך",
  changePhoneLabel: "שינוי מספר",
  newGuestWelcome: "ברוכים הבאים! מלאו את הפרטים לאישור הגעה.",
  fullNameLabel: "שם מלא",
  fullNamePlaceholder: "שם פרטי ומשפחה",
  logoutLabel: "התנתקות",
  loadingLabel: "טוען…",
  guestGreeting: "שלום {name},",
  otpMessageTemplate:
    "קוד האימות למסיבת הפרידה של איילת: {code}\n\nהקוד תקף ל־10 דקות.\nאל תשתפו את הקוד עם אחרים.",
  reminderTemplate: `שלום {name},

ראינו שעדיין לא נרשמת למסיבת הפרידה של איילת 🙏
נשמח אם תעדכנו את סטטוס ההגעה שלכם בהקדם.

📅 {dateTime}
📍 {place}

לפרטים נוספים:
{siteUrl}

לעדכון סטטוס ההגעה:
{personalLink}

מחכות לראותכם
אורטל וכרמל`,
  reminderIntro:
    "ראינו שעדיין לא נרשמת למסיבת הפרידה של איילת 🙏\nנשמח אם תעדכנו את סטטוס ההגעה שלכם בהקדם.",
  reminderSiteLabel: "לפרטים נוספים",
  reminderLinkLabel: "לעדכון סטטוס ההגעה",
  reminderOutro: "מחכות לראותכם\nאורטל וכרמל",
  waThankYouConfirmed: `שלום {name},

תודה שאישרת את הגעתך. נתראה ב־7 בספטמבר בתחנת רוח, טבעון.

מחכות לראותכם
אורטל וכרמל`,
  waThankYouUpdated: `שלום {name},

תודה שעדכנת אותנו - נדע להיערך יותר טוב.

מחכות לראותכם
אורטל וכרמל`,
  waThankYouDeclined: `שלום {name},

תודה על העדכון. נתראה באירוע אחר בקרוב.`,
  organizerNotifyTemplate: `עדכון אישור הגעה - מסיבת פרידה

שם: {name}
טלפון: {phone}
סטטוס: {status}
מספר אורחים: {guestCount}
{notes}`,
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=תחנת+רוח+כיכר+בן+גוריון+1+טבעון",
  mapsLabel: "Google Maps",
  wazeUrl:
    "https://waze.com/ul?q=%D7%AA%D7%97%D7%A0%D7%AA%20%D7%A8%D7%95%D7%97%20%D7%9B%D7%99%D7%9B%D7%A8%20%D7%91%D7%9F%20%D7%92%D7%95%D7%A8%D7%99%D7%95%D7%9F%201%20%D7%98%D7%91%D7%A2%D7%95%D7%9F&navigate=yes",
  wazeLabel: "ניווט ב־Waze",
  bitUrl: "https://www.bitpay.co.il/app/me/07CB4F8A-0D52-AA83-D1C4-4D2EAB5CA6C68506",
  bitLabel: "השתתפות בביט",
  coverImage: "/invite.jpg",
  linksTitle: "איך מגיעים ומשתתפים",
};
