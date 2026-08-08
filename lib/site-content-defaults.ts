export type ProgramItem = {
  time: string;
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
  invalidLinkTitle: string;
  invalidLinkBody: string;
  footer: string;
  ctaLabel: string;
  reminderIntro: string;
  reminderSiteLabel: string;
  reminderLinkLabel: string;
  reminderOutro: string;
  mapsUrl: string;
  mapsLabel: string;
  wazeUrl: string;
  wazeLabel: string;
  bitUrl: string;
  bitLabel: string;
  coverImage: string;
  linksTitle: string;
};

/** Parse "18:00 | ברכות" or plain title into a ProgramItem */
export function parseProgramLine(raw: string): ProgramItem | null {
  const line = raw.trim();
  if (!line) return null;
  const match = line.match(/^(\d{1,2}:\d{2})\s*[|–—\-]\s*(.+)$/);
  if (match) {
    return { time: match[1], title: match[2].trim() };
  }
  if (typeof raw === "object" && raw && "title" in (raw as object)) {
    const item = raw as ProgramItem;
    return {
      time: String(item.time || "").trim(),
      title: String(item.title || "").trim(),
    };
  }
  return { time: "", title: line };
}

export function normalizeProgramItems(input: unknown): ProgramItem[] {
  if (!Array.isArray(input) || !input.length) {
    return DEFAULT_SITE_CONTENT.programItems;
  }
  return input
    .map((entry) => {
      if (typeof entry === "string") return parseProgramLine(entry);
      if (entry && typeof entry === "object") {
        const item = entry as Partial<ProgramItem>;
        const title = String(item.title ?? "").trim();
        if (!title) return null;
        return { time: String(item.time ?? "").trim(), title };
      }
      return null;
    })
    .filter((x): x is ProgramItem => Boolean(x?.title));
}

export function formatProgramLines(items: ProgramItem[]): string {
  return items
    .map((item) => (item.time ? `${item.time} | ${item.title}` : item.title))
    .join("\n");
}

export const DEFAULT_SITE_CONTENT: SiteContent = {
  quote: "לכל זמן ועת לכל חפץ תחת השמים",
  quoteSource: "קהלת (פרק ג׳, פסוק א׳)",
  banner: "הזמנה אישית",
  title: "מסיבת פרידה",
  dateTime: "7 בספטמבר, 2026 | 18:00–21:00",
  place: "תחנת רוח, כיכר בן גוריון 1, טבעון",
  programTitle: "תוכנית לערב",
  programItems: [
    { time: "18:00", title: "ברכות ומוזיקה" },
    { time: "18:45", title: "ארוחת ערב גורמה טבעוני־צמחוני (לונא ביסטרו)" },
    { time: "20:00", title: "ריקודים עם DJ mayxsam" },
  ],
  hosts: "הנחייה: אורטל ברקה וכרמל אילני",
  giftNote:
    "לא להביא מתנות. השתתפותכם היא המתנה. אפשר להפקיד ברכות והשתתפות בעלויות בתיבה במקום — או דרך ביט.",
  rsvpTitle: "אישור הגעה סופי",
  rsvpLeadHome: "",
  rsvpHelp: "יש בעיה עם המספר? פנו לאורטל או לכרמל.",
  rsvpLeadInvite: "שלום {name} — עדכנו את הפרטים שלכם ואשרו הגעה סופית.",
  confirmPrompt:
    "מצפה בשמחה לבואך למסיבה שלי. כדי להיות ערוכה על הצד הטוב ביותר (קייטרינג, יין די. ג׳יי ועוד) בבקשה אשר/י סופית את הגעתך 🙏🏽♥️💐",
  thankYouConfirmed: "תודה שאישרת את הגעתך. נתראה ב־7 בספטמבר בתחנת רוח, טבעון.",
  thankYouUpdated: "תודה שעדכנת אותנו — נדע להיערך יותר טוב.",
  thankYouDeclined: "תודה על העדכון. נתראה באירוע אחר בקרוב.",
  thankYouMaybe: "קיבלנו את העדכון. אפשר לחזור ולעדכן בכל רגע.",
  invalidLinkTitle: "הקישור לא תקין",
  invalidLinkBody:
    "הקישור האישי לא נמצא. אפשר להתחבר מהעמוד הראשי עם מספר הטלפון.",
  footer: "מסיבת פרידה לאיילת · טבעון · ספטמבר 2026",
  ctaLabel: "אישור הגעה",
  reminderIntro: "תזכורת חמה למסיבת הפרידה של איילת",
  reminderSiteLabel: "לפרטים נוספים",
  reminderLinkLabel: "לעדכון סטטוס ההגעה שלכם",
  reminderOutro: "מחכות לראותכם\nאורטל וכרמל",
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
