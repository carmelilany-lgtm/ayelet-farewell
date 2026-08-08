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
    "נשלח אליכם קישור אישי ב־WhatsApp. רק דרכו אפשר לאשר או לעדכן הגעה — בלי חיפוש לפי שם או טלפון, ובלי שמישהו אחר יוכל לראות את הסטטוס שלכם.",
  rsvpHelp: "לא מצאתם את הקישור? פנו לאורטל או לכרמל ונשלח שוב.",
  rsvpLeadInvite:
    "שלום {name} — הקישור הזה אישי. עדכנו אם תגיעו, כדי שנוכל לסגור ארוחה ומקומות.",
  invalidLinkTitle: "הקישור לא תקין",
  invalidLinkBody:
    "הקישור האישי לא נמצא. אם קיבלתם תזכורת ב־WhatsApp, פתחו שוב את הקישור מההודעה — או פנו למארגנים.",
  footer: "מסיבת פרידה לאיילת · טבעון · ספטמבר 2026",
  ctaLabel: "פרטי האירוע",
  reminderIntro: "תזכורת חמה למסיבת הפרידה של איילת",
  reminderOutro: "מחכות לראותכם\nאורטל וכרמל",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=תחנת+רוח+כיכר+בן+גוריון+1+טבעון",
};
