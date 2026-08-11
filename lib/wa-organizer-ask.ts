import { formatPhoneDisplay } from "./phone";
import { getSummary, listRsvps } from "./store";
import {
  isManualPendingGuest,
  type Rsvp,
  type RsvpStatus,
  type RsvpSummary,
} from "./types";

const STATUS_LABEL: Record<RsvpStatus, string> = {
  imported: "ממתין לאישור",
  confirmed: "אישרו הגעה",
  declined: "לא אושרו הגעה",
  maybe: "עדיין לא יודע/ת",
};

const MAX_ANSWER_CHARS = 3500;
const MAX_CONTEXT_GUESTS = 400;
const MAX_NOTES_CHARS = 80;

export function hasOrganizerAskConfig(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function openaiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSummaryBlock(summary: RsvpSummary): string {
  return [
    "סיכום כללי:",
    `רשומות: ${summary.total_records}`,
    `אישרו הגעה: ${summary.confirmed}`,
    `ממתינים לאישור: ${summary.imported_pending}`,
    `מתוכם נוספו ידנית וממתינים: ${summary.manual_pending}`,
    `עדיין לא יודעים: ${summary.maybe}`,
    `לא אושרו הגעה: ${summary.declined}`,
    `סך אורחים מגיעים (ספירה): ${summary.total_guests_attending}`,
    `תזכורות/הזמנות שנשלחו: ${summary.reminders_sent}`,
    `תזכורות/הזמנות ממתינות: ${summary.reminders_pending}`,
  ].join("\n");
}

function formatGuestLine(guest: Rsvp): string {
  const parts = [
    guest.full_name.trim() || "ללא שם",
    formatPhoneDisplay(guest.phone),
    STATUS_LABEL[guest.status],
    `אורחים:${guest.status === "declined" ? 0 : guest.guest_count}`,
  ];

  if (isManualPendingGuest(guest)) {
    parts.push("נוסף-ידנית");
  }
  if (guest.reminder_sent_at) {
    parts.push(`הזמנה:${formatWhen(guest.reminder_sent_at)}`);
  } else {
    parts.push("הזמנה:לא");
  }
  if (guest.final_confirmed_at) {
    parts.push(`אישור:${formatWhen(guest.final_confirmed_at)}`);
  }
  if (guest.wants_video_blessing?.trim()) {
    parts.push(`וידאו:${guest.wants_video_blessing.trim().slice(0, 40)}`);
  }
  if (guest.wants_to_speak?.trim()) {
    parts.push(`לדבר:${guest.wants_to_speak.trim().slice(0, 40)}`);
  }
  if (guest.excitement != null && Number.isFinite(guest.excitement)) {
    parts.push(`התרגשות:${guest.excitement}`);
  }
  if (guest.notes?.trim()) {
    parts.push(`הערות:${guest.notes.trim().slice(0, MAX_NOTES_CHARS)}`);
  }

  return parts.join(" | ");
}

async function buildKnowledgeContext(): Promise<string> {
  const [summary, all] = await Promise.all([getSummary(), listRsvps()]);
  const guests = all.slice(0, MAX_CONTEXT_GUESTS);
  const truncated =
    all.length > MAX_CONTEXT_GUESTS
      ? `\n(הוצגו ${MAX_CONTEXT_GUESTS} מתוך ${all.length} אורחים)`
      : "";

  return `${formatSummaryBlock(summary)}

רשימת אורחים (שם | טלפון | סטטוס | …):
${guests.map(formatGuestLine).join("\n")}${truncated}`;
}

const SYSTEM_PROMPT = `אתה עוזר למארגני מסיבת פרידה.
אתה עונה בעברית, קצר וברור, להודעות וואטסאפ.

כללים:
- ענה רק על בסיס המידע שסופק בהודעת המשתמש (סיכום + רשימת אורחים).
- אם אין מספיק מידע — אמור במפורש שלא מצאת, ואל תמציא שמות/מספרים/סטטוסים.
- מותר לסכם, לספור, לחפש אורח לפי שם/טלפון חלקי, ולהשוות סטטוסים.
- אל תשלח הזמנות, אל תשנה נתונים, ואל תציע פעולות שמחייבות ממשק ניהול — רק מידע.
- אם שואלים איך להוסיף אורח: הסבר לשלוח שתי שורות — שם בשורה הראשונה ומספר נייד בשנייה.
- בלי תפריטים, בלי כפתורים, בלי רשימות ממוספרות ארוכות אלא אם השאלה מבקשת רשימה.
- תשובה קצרה יחסית (עד כ־25 שורות). אפשר להדגיש עם *כוכביות* של וואטסאפ.`;

export const ORGANIZER_ASK_HELP = `אפשר לשאול אותי בעברית חופשית על המידע במערכת, למשל:
• כמה אישרו הגעה?
• מי עדיין ממתין?
• מה הסטטוס של יוסי?
• כמה תזכורות נשלחו?

להוספת אורח — שלחו שתי שורות:
שם מלא
05xxxxxxxx

לבדיחה שלחו: בדיחה`;

function clampAnswer(text: string): string {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (trimmed.length <= MAX_ANSWER_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_ANSWER_CHARS - 1).trimEnd()}…`;
}

function isHelpRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t === "עזרה" ||
    t === "help" ||
    t === "?" ||
    t === "מה אפשר" ||
    t === "מה אפשר לשאול"
  );
}

async function callOpenAi(question: string, context: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openaiModel(),
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `מידע מהמערכת:\n${context}\n\nשאלת המארגן:\n${question}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      "OpenAI organizer ask failed",
      res.status,
      errText.slice(0, 400)
    );
    return null;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim() || "";
  return content ? clampAnswer(content) : null;
}

export type OrganizerAskResult =
  | { handled: true; message: string; help?: boolean; error?: boolean }
  | null;

/**
 * Free-form organizer Q&A over live RSVP data (OpenAI).
 * Returns null only when the message should be ignored (empty).
 */
export async function handleOrganizerAsk(opts: {
  text: string;
  buttonId?: string | null;
}): Promise<OrganizerAskResult> {
  const text = opts.text.trim();
  if (!text) return null;

  // Old menu button taps → treat label/id as a question when useful.
  if (opts.buttonId) {
    const id = opts.buttonId;
    if (id === "exit" || id === "home" || id === "back" || id === "more") {
      return { handled: true, message: ORGANIZER_ASK_HELP, help: true };
    }
  }

  if (isHelpRequest(text)) {
    return { handled: true, message: ORGANIZER_ASK_HELP, help: true };
  }

  if (!hasOrganizerAskConfig()) {
    return {
      handled: true,
      message:
        "מענה לשאלות חופשיות לא מוגדר כרגע (חסר OPENAI_API_KEY).\nלהוספת אורח שלחו שם ומספר בשתי שורות.",
      error: true,
    };
  }

  try {
    const context = await buildKnowledgeContext();
    const answer = await callOpenAi(text, context);
    if (!answer) {
      return {
        handled: true,
        message: "לא הצלחתי לענות עכשיו. נסו שוב בעוד רגע, או שלחו: עזרה",
        error: true,
      };
    }
    return { handled: true, message: answer };
  } catch (err) {
    console.error("Organizer ask failed", err);
    return {
      handled: true,
      message: "אירעה שגיאה במענה. נסו שוב בעוד רגע.",
      error: true,
    };
  }
}
