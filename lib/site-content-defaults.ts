export type SiteContent = {
  quote: string;
  quoteSource: string;
  banner: string;
  title: string;
  dateTime: string;
  place: string;
  programTitle: string;
  programItems: string[];
  hosts: string;
  giftNote: string;
  rsvpTitle: string;
  rsvpLeadHome: string;
  rsvpHelp: string;
  rsvpLeadInvite: string;
  invalidLinkTitle: string;
  invalidLinkBody: string;
  footer: string;
  ctaLabel: string;
  reminderIntro: string;
  reminderOutro: string;
  mapsUrl: string;
};

export const DEFAULT_SITE_CONTENT: SiteContent = {
  quote: "לכל זמן ועת לכל חפץ תחת השמים",
  quoteSource: "קהלת (פרק ג׳, פסוק א׳)",
  banner: "הזמנה אישית",
  title: "מסיבת פרידה",
  dateTime: "7 בספטמבר, 2026 | 18:00–21:00",
  place: "תחנת רוח, כיכר בן גוריון 1, טבעון",
  programTitle: "תוכנית הערב",
  programItems: [
    "ברכות ומוזיקה",
    "ארוחת ערב גורמה טבעוני־צמחוני (לונא ביסטרו)",
    "ריקודים עם DJ mayxsam",
  ],
  hosts: "הנחייה: אורטל ברקה וכרמל אילני",
  giftNote:
    "לא להביא מתנות. השתתפותכם היא המתנה. אפשר יהיה להפקיד ברכות והשתתפות בעלויות בתיבה במקום.",
  rsvpTitle: "אישור הגעה סופי",
  rsvpLeadHome:
    "התחברו עם מספר הטלפון שלכם — נשלח קוד אימות ב־WhatsApp, ואז תוכלו לאשר הגעה סופית.",
  rsvpHelp: "לא מצאתם את עצמכם? פנו לאורטל או לכרמל.",
  rsvpLeadInvite:
    "שלום {name} — עדכנו אם תגיעו, כדי שנוכל לסגור ארוחה ומקומות.",
  invalidLinkTitle: "הקישור לא תקין",
  invalidLinkBody:
    "הקישור האישי לא נמצא. אפשר להתחבר מהעמוד הראשי עם מספר הטלפון.",
  footer: "מסיבת פרידה לאיילת · טבעון · ספטמבר 2026",
  ctaLabel: "לאישור הגעה",
  reminderIntro: "תזכורת חמה למסיבת הפרידה של איילת",
  reminderOutro: "מצפה לראותך 🤍\nאיילת",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=תחנת+רוח+כיכר+בן+גוריון+1+טבעון",
};
