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
  statusMaybeLabel: string;
  guestCountLabel: string;
  submitRsvpLabel: string;
  alreadyConfirmedNote: string;
  updateStatusLabel: string;
  viewProgramLabel: string;
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
  /**
   * WhatsApp invite for admin-added guests still waiting.
   * Same placeholders as reminderTemplate.
   */
  reminderTemplateManual: string;
  /** @deprecated Kept for migrating old CMS data into reminderTemplate */
  reminderIntro: string;
  /** @deprecated */
  reminderSiteLabel: string;
  /** @deprecated */
  reminderLinkLabel: string;
  /** @deprecated */
  reminderOutro: string;
  /** Guest thank-you WhatsApp after RSVP; use {name} {personalLink} (declined: no link) */
  waThankYouConfirmed: string;
  waThankYouUpdated: string;
  waThankYouDeclined: string;
  waThankYouMaybe: string;
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

${content.reminderLinkLabel}:
{siteUrl}

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
  rsvpLeadInvite: "",
  confirmPrompt:
    "מצפה בשמחה לבואך למסיבה שלי. כדי להיות ערוכה על הצד הטוב ביותר (קייטרינג, יין די. ג׳יי ועוד) בבקשה אשר/י את הגעתך 🙏🏽♥️💐",
  thankYouConfirmed: "תודה שאישרת את הגעתך. נתראה ב־7 בספטמבר בתחנת רוח, טבעון.",
  thankYouUpdated: "תודה שעדכנת אותנו - נדע להיערך יותר טוב.",
  thankYouDeclined: "תודה על העדכון. נתראה באירוע אחר בקרוב.",
  thankYouMaybe:
    "קיבלנו את העדכון. כשתדעו — אפשר לחזור בכל רגע ולעדכן את סטטוס ההגעה.",
  thankYouTitle: "תודה, {name}!",
  invalidLinkTitle: "הקישור לא תקין",
  invalidLinkBody:
    "הקישור האישי לא נמצא. אפשר להתחבר מהעמוד הראשי עם מספר הטלפון.",
  invalidLinkHomeHint: "אפשר גם להיכנס דרך התחברות עם מספר טלפון.",
  footer: "",
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
  statusMaybeLabel: "עדיין לא יודע/ת",
  guestCountLabel: "כמה תגיעו?",
  submitRsvpLabel: "שליחה",
  alreadyConfirmedNote: "אלה הפרטים שכבר יש לנו. אפשר לעדכן אם משהו השתנה.",
  updateStatusLabel: "עדכון סטטוס",
  viewProgramLabel: "צפייה בתוכנית",
  cancelUpdateLabel: "ביטול",
  phoneLabel: "מספר טלפון נייד",
  sendOtpLabel: "שלחו לי קוד ב־WhatsApp",
  otpSentLead: "נשלח קוד אימות ל־WhatsApp",
  codeLabel: "קוד אימות",
  verifyOtpLabel: "אימות",
  changePhoneLabel: "שינוי מספר",
  newGuestWelcome: "ברוכים הבאים! מלאו את הפרטים לאישור הגעה.",
  fullNameLabel: "שם מלא",
  fullNamePlaceholder: "שם פרטי ומשפחה",
  logoutLabel: "התנתקות",
  loadingLabel: "טוען…",
  guestGreeting: "שלום {name},",
  otpMessageTemplate:
    "קוד האימות למסיבת הפרידה של איילת:\n\n{code}\n\nהקוד תקף ל־10 דקות.",
  reminderTemplate: `שלום {name},

זוהי תזכורת קטנה לעדכן אותנו בהגעתך לקראת מסיבת הפרידה של איילת אילני 🎉

📅 {dateTime}
📍 {place}

לכל הפרטים ועדכון סטטוס:
{siteUrl}

מחכים לראותך!`,
  reminderTemplateManual: `שלום {name},

מזמינים אותך לחגוג איתנו במסיבת הפרידה של איילת אילני ✨

📅 {dateTime}
📍 {place}

לפרטים נוספים ואישור הגעה:
{siteUrl}

מחכים לראותך!`,
  reminderIntro:
    "זוהי תזכורת קטנה לעדכן אותנו בהגעתך לקראת מסיבת הפרידה של איילת אילני 🎉",
  reminderSiteLabel: "לכל הפרטים ועדכון סטטוס",
  reminderLinkLabel: "לכל הפרטים ועדכון סטטוס",
  reminderOutro: "מחכים לראותך!",
  waThankYouConfirmed: `איזה כיף שאת/ה בא/ה לשמוח איתנו, {name}! תודה שאישרת.
נתראה ב־7 בספטמבר בתחנת רוח 🥂

לתוכנית האירוע המלאה ולכל הפרטים:
{personalLink}`,
  waThankYouUpdated: `תודה שעדכנת אותנו, {name} - זה עוזר לנו מאוד להיערך.

לתוכנית האירוע ולכל הפרטים:
{personalLink}`,
  waThankYouDeclined: `תודה על העדכון, {name}. חבל שלא תגיע/י, אבל נמסור לאיילת את אהבתך! 🌸`,
  waThankYouMaybe: `שלום {name},

קיבלנו את העדכון שלך: עדיין לא יודעים.
כשתדע/י, אפשר לעדכן את סטטוס ההגעה בכל רגע בקליק אחד כאן:
{personalLink}`,
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

const LEGACY_REMINDER_LINK_LABELS = new Set([
  "לעדכון סטטוס ההגעה",
  "לעדכון סטטוס ההגעה שלכם",
  "זה קישור אישי אליכם — לעדכון סטטוס ההגעה",
  "זה קישור אישי שלך לעדכון סטטוס ההגעה",
  "זה קישור אישי אליכם — לכניסה למערכת",
  "זה קישור אישי שלך לכניסה למערכת",
]);

/**
 * Bring older CMS copies in line with current product copy.
 * Runs on read so WhatsApp/site pick up migrations without a manual re-save.
 */
export function migrateStoredSiteContent(content: SiteContent): SiteContent {
  const next = { ...content };

  if (
    /הקישור הזה אישי/.test(next.rsvpLeadInvite) ||
    /עדכנו את הפרטים שלכם ואשרו הגעה/.test(next.rsvpLeadInvite)
  ) {
    next.rsvpLeadInvite = "";
  }

  if (LEGACY_REMINDER_LINK_LABELS.has(next.reminderLinkLabel.trim())) {
    next.reminderLinkLabel = DEFAULT_SITE_CONTENT.reminderLinkLabel;
  }

  // Normalize personal-link line in reminder WhatsApp template → general site link.
  next.reminderTemplate = next.reminderTemplate.replace(
    /זה קישור אישי שלך לעדכון סטטוס ההגעה:/g,
    "לפרטים נוספים:"
  );
  next.reminderTemplate = next.reminderTemplate.replace(
    /זה קישור אישי שלך לכניסה למערכת:/g,
    "לפרטים נוספים:"
  );
  next.reminderTemplate = next.reminderTemplate.replace(
    /זה הקישור האישי שלך לכניסה למערכת:/g,
    "לפרטים נוספים:"
  );
  next.reminderTemplate = next.reminderTemplate.replace(
    /זה קישור אישי אליכם — (?:לעדכון סטטוס ההגעה|לכניסה למערכת):/g,
    "לפרטים נוספים:"
  );
  next.reminderTemplate = next.reminderTemplate.replace(
    /\{personalLink\}/g,
    "{siteUrl}"
  );

  if (next.reminderTemplateManual?.trim()) {
    next.reminderTemplateManual = next.reminderTemplateManual
      .replace(/זה הקישור האישי שלך לכניסה למערכת:/g, "לפרטים נוספים:")
      .replace(/זה קישור אישי שלך לכניסה למערכת:/g, "לפרטים נוספים:")
      .replace(/\{personalLink\}/g, "{siteUrl}");
  }

  if (!next.reminderTemplateManual?.trim()) {
    next.reminderTemplateManual = DEFAULT_SITE_CONTENT.reminderTemplateManual;
  }

  const legacyReminders = [
    `שלום {name},

זוהי תזכורת לעדכון סטטוס הגעה לקראת מסיבת הפרידה של איילת

📅 {dateTime}
📍 {place}

לפרטים נוספים:
{siteUrl}

מחכות לראותכם
אורטל וכרמל`,
  ];
  if (legacyReminders.some((t) => t.trim() === next.reminderTemplate.trim())) {
    next.reminderTemplate = DEFAULT_SITE_CONTENT.reminderTemplate;
  }

  const legacyManualInvites = [
    `שלום {name},

מזמינים אותך למסיבת הפרידה של איילת

📅 {dateTime}
📍 {place}

לפרטים נוספים:
{siteUrl}

מחכות לראותכם
אורטל וכרמל`,
  ];
  if (
    legacyManualInvites.some(
      (t) => t.trim() === (next.reminderTemplateManual || "").trim()
    )
  ) {
    next.reminderTemplateManual = DEFAULT_SITE_CONTENT.reminderTemplateManual;
  }

  // Upgrade WA thank-you copy: personal link after RSVP, no signature.
  const legacyWaThankYous = {
    confirmed: [
      `שלום {name},

תודה שאישרת את הגעתך. נתראה ב־7 בספטמבר בתחנת רוח, טבעון.

מחכות לראותכם
אורטל וכרמל`,
      `איזה כיף שאת/ה בא/ה לשמוח איתנו, {name}! תודה שאישרת.
נתראה ב־7 בספטמבר בתחנת רוח.

לתוכנית האירוע המלאה ולכל הפרטים:
{personalLink}

מחכים לראותך,
כרמל`,
    ],
    updated: [
      `שלום {name},

תודה שעדכנת אותנו - נדע להיערך יותר טוב.

מחכות לראותכם
אורטל וכרמל`,
      `תודה שעדכנת אותנו, {name} - זה עוזר לנו מאוד להיערך.

לתוכנית האירוע ולכל הפרטים:
{personalLink}

כרמל`,
    ],
    declined: [
      `שלום {name},

תודה על העדכון. נתראה באירוע אחר בקרוב.`,
      `תודה על העדכון, {name}. חבל שלא תגיע/י, אבל אדאג למסור לאמא את אהבתך! 🌸

כרמל`,
      `תודה על העדכון, {name}. חבל שלא תגיע/י, אבל אדאג למסור לאמא את אהבתך! 🌸`,
    ],
    maybe: [
      `שלום {name},

קיבלנו את העדכון שלך: עדיין לא יודעים.
כשתדע/י, אפשר לעדכן את סטטוס ההגעה בכל רגע ועד יום 5 בספטמבר.

לפרטים נוספים:
{siteUrl}`,
      `שלום {name},

קיבלנו את העדכון שלך: עדיין לא יודעים.
כשתדע/י, אפשר לעדכן את סטטוס ההגעה בכל רגע ועד יום 5 בספטמבר.

לפרטים נוספים:
{personalLink}`,
      `שלום {name},

קיבלנו את העדכון שלך: עדיין לא יודעים.
כשתדע/י, אפשר לעדכן את סטטוס ההגעה בכל רגע ועד יום 5 בספטמבר.

דרך הקישור האישי שלכם:
{personalLink}`,
      `שלום {name},

קיבלנו את העדכון שלך: עדיין לא יודעים.
כשתדע/י, אפשר לעדכן את סטטוס ההגעה בכל רגע בקליק אחד כאן:
{personalLink}

כרמל`,
    ],
  } as const;

  if (legacyWaThankYous.confirmed.some((t) => t.trim() === next.waThankYouConfirmed.trim())) {
    next.waThankYouConfirmed = DEFAULT_SITE_CONTENT.waThankYouConfirmed;
  }
  if (legacyWaThankYous.updated.some((t) => t.trim() === next.waThankYouUpdated.trim())) {
    next.waThankYouUpdated = DEFAULT_SITE_CONTENT.waThankYouUpdated;
  }
  if (legacyWaThankYous.declined.some((t) => t.trim() === next.waThankYouDeclined.trim())) {
    next.waThankYouDeclined = DEFAULT_SITE_CONTENT.waThankYouDeclined;
  }
  if (legacyWaThankYous.maybe.some((t) => t.trim() === next.waThankYouMaybe.trim())) {
    next.waThankYouMaybe = DEFAULT_SITE_CONTENT.waThankYouMaybe;
  }

  if (next.submitRsvpLabel.trim() === "שליחת אישור הגעה") {
    next.submitRsvpLabel = DEFAULT_SITE_CONTENT.submitRsvpLabel;
  }

  if (next.verifyOtpLabel.trim() === "אימות והמשך") {
    next.verifyOtpLabel = DEFAULT_SITE_CONTENT.verifyOtpLabel;
  }

  if (next.footer.trim() === "מסיבת פרידה לאיילת · טבעון · ספטמבר 2026") {
    next.footer = "";
  }

  if (
    next.alreadyConfirmedNote.trim() ===
    "כבר שלחתם אישור. אפשר לעדכן אם משהו השתנה."
  ) {
    next.alreadyConfirmedNote = DEFAULT_SITE_CONTENT.alreadyConfirmedNote;
  }

  if (
    next.otpMessageTemplate.trim() ===
      "קוד האימות למסיבת הפרידה של איילת: {code}\n\nהקוד תקף ל־10 דקות.\nאל תשתפו את הקוד עם אחרים." ||
    next.otpMessageTemplate.trim() ===
      "קוד האימות למסיבת הפרידה של איילת:\n\n{code}\n\nהקוד תקף ל־10 דקות.\nאל תשתפו את הקוד עם אחרים." ||
    next.otpMessageTemplate.trim() ===
      "{code} is your verification code\n\nקוד האימות למסיבת הפרידה של איילת.\nהקוד תקף ל־10 דקות.\nאל תשתפו את הקוד עם אחרים."
  ) {
    next.otpMessageTemplate = DEFAULT_SITE_CONTENT.otpMessageTemplate;
  }

  if (next.otpSentLead.trim() === "נשלח קוד ל־WhatsApp — לחצו «העתק קוד» וחזרו לכאן") {
    next.otpSentLead = DEFAULT_SITE_CONTENT.otpSentLead;
  }

  return next;
}
