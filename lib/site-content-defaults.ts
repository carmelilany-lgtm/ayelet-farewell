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
  confirmPrompt: string;
  invalidLinkTitle: string;
  invalidLinkBody: string;
  footer: string;
  ctaLabel: string;
  reminderIntro: string;
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

export const DEFAULT_SITE_CONTENT: SiteContent = {
  quote: "לכל זמן ועת לכל חפץ תחת השמים",
  quoteSource: "קהלת (פרק ג׳, פסוק א׳)",
  banner: "הזמנה אישית",
  title: "מסיבת פרידה",
  dateTime: "7 בספטמבר, 2026 | 18:00–21:00",
  place: "תחנת רוח, כיכר בן גוריון 1, טבעון",
  programTitle: "תוכנית לערב",
  programItems: [
    "ברכות ומוזיקה",
    "ארוחת ערב גורמה טבעוני־צמחוני (לונא ביסטרו)",
    "ריקודים עם DJ mayxsam",
  ],
  hosts: "הנחייה: אורטל ברקה וכרמל אילני",
  giftNote:
    "לא להביא מתנות. השתתפותכם היא המתנה. אפשר להפקיד ברכות והשתתפות בעלויות בתיבה במקום — או דרך ביט.",
  rsvpTitle: "אישור הגעה סופי",
  rsvpLeadHome:
    "התחברו עם מספר הטלפון שלכם — נשלח קוד אימות ב־WhatsApp, ואז תוכלו לאשר הגעה סופית.",
  rsvpHelp: "לא מצאתם את עצמכם? פנו לאורטל או לכרמל.",
  rsvpLeadInvite: "שלום {name} — עדכנו את הפרטים שלכם ואשרו הגעה סופית.",
  confirmPrompt:
    "מצפה בשמחה לבואך למסיבה שלי. כדי להיות ערוכה על הצד הטוב ביותר (קייטרינג, יין די. ג׳יי ועוד) בבקשה אשר/י סופית את הגעתך 🙏🏽♥️💐",
  invalidLinkTitle: "הקישור לא תקין",
  invalidLinkBody:
    "הקישור האישי לא נמצא. אפשר להתחבר מהעמוד הראשי עם מספר הטלפון.",
  footer: "מסיבת פרידה לאיילת · טבעון · ספטמבר 2026",
  ctaLabel: "לאישור הגעה",
  reminderIntro: "תזכורת חמה למסיבת הפרידה של איילת",
  reminderOutro: "מצפה לראותך\nאיילת",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=תחנת+רוח+כיכר+בן+גוריון+1+טבעון",
  mapsLabel: "Google Maps",
  wazeUrl:
    "https://waze.com/ul?q=%D7%AA%D7%97%D7%A0%D7%AA%20%D7%A8%D7%95%D7%97%20%D7%9B%D7%99%D7%9B%D7%A8%20%D7%91%D7%9F%20%D7%92%D7%95%D7%A8%D7%99%D7%95%D7%9F%201%20%D7%98%D7%91%D7%A2%D7%95%D7%9F&navigate=yes",
  wazeLabel: "ניווט ב־Waze",
  bitUrl: "",
  bitLabel: "השתתפות בביט",
  coverImage: "/invite.jpg",
  linksTitle: "איך מגיעים ומשתתפים",
};
