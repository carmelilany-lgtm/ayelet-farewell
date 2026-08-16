import type { ListSection, ReplyButton } from "./green-api";
import { formatPhoneDisplay, normalizePhone, phonesMatch } from "./phone";
import { getSummary, listRsvps, getRsvpById } from "./store";
import {
  isManualPendingGuest,
  normalizeGuestName,
  type Rsvp,
  type RsvpStatus,
  type RsvpSummary,
} from "./types";
import {
  clearOrganizerMenuSession,
  getOrganizerMenuSession,
  isHelpOrMenuOpen,
  isMenuBackCommand,
  isMenuExitCommand,
  isMenuHomeCommand,
  saveOrganizerMenuSession,
  type ListFilter,
  type MenuScreen,
  type OrganizerMenuSession,
} from "./wa-organizer-session";

/**
 * Meta WhatsApp interactive guidance:
 * - Reply buttons: up to 3 quick choices (we use ≤2 guests + nav)
 * - Longer lists: full numbered text (no paging) + nav buttons
 * (Green API list messages are unreliable — do not use.)
 */
const MAIN_PAGE_COUNT = 5;

/** Max guests as reply buttons (leave ≥1 slot for nav; Meta max = 3). */
const GUEST_BUTTON_MAX = 2;

/** Stay under WhatsApp ~4096 limit with room for footer/nav. */
const WA_SAFE_LEN = 3500;

const MENU_CLOSED_MESSAGE =
  "התפריט נסגר.\nלפתיחה מחדש שלחו עזרה\nלבדיחה שלחו: בדיחה";
/** WhatsApp interactive footer (≤60 chars) — how to leave the menu. */
const MENU_EXIT_FOOTER = "לסגירה שלחו: יציאה";

const STATUS_LABEL: Record<RsvpStatus, string> = {
  imported: "עוד לא אושר",
  confirmed: "אושר",
  declined: "לא אושרו הגעה",
  maybe: "עדיין לא יודע/ת",
};

export type MenuReply = {
  handled: true;
  message: string;
  /** Used when interactive buttons fail to send. */
  textFallback?: string;
  buttons?: ReplyButton[];
  footer?: string;
  /** Meta list message (3–10). Falls back to numbered `message` + buttons. */
  list?: {
    body: string;
    buttonText: string;
    title?: string;
    sections: ListSection[];
    navButtons?: ReplyButton[];
  };
  /** Extra plain-text parts when a full guest list exceeds one message. */
  followUpMessages?: string[];
  exited?: boolean;
};

function btn(buttonId: string, buttonText: string): ReplyButton {
  return { buttonId, buttonText };
}

function navFooter(opts?: { onMain?: boolean; backIsHome?: boolean }): string {
  if (opts?.onMain) {
    return `\n0 יציאה מהתפריט`;
  }
  if (opts?.backIsHome) {
    return `\nתפריט — חזרה לתפריט הראשי`;
  }
  return `\n0 אחורה\nתפריט — חזרה לתפריט הראשי`;
}

function mainPageButtons(page: number): ReplyButton[] {
  switch (page) {
    case 0:
      return [btn("sum", "סיכום"), btn("with", "עם אורחים"), btn("more", "עוד")];
    case 1:
      return [btn("conf", "אושר"), btn("maybe", "אולי"), btn("more", "עוד")];
    case 2:
      return [
        btn("pend", "עוד לא אושר"),
        btn("no", "לא מגיעים"),
        btn("more", "עוד"),
      ];
    case 3:
      return [
        btn("remind", "תזכורות"),
        btn("manual", "ידניים"),
        btn("more", "עוד"),
      ];
    default:
      return [
        btn("search", "חיפוש"),
        btn("addhelp", "איך להוסיף"),
        btn("exit", "יציאה"),
      ];
  }
}

/**
 * When אחורה and לתפריט הראשי land on the same screen (usually main),
 * drop the duplicate and use the slot for יציאה.
 */
function navButtons(opts?: {
  hasPrev?: boolean;
  hasNext?: boolean;
  backIsHome?: boolean;
}): ReplyButton[] {
  const backIsHome = Boolean(opts?.backIsHome);
  // List paging removed — ignore hasPrev/hasNext for guest lists.
  if (backIsHome) {
    return [btn("home", "לתפריט הראשי"), btn("exit", "יציאה")];
  }
  return [btn("back", "אחורה"), btn("home", "לתפריט הראשי")];
}

/** True when popping the stack lands on main (same as «לתפריט הראשי»). */
function backLandsOnHome(stack: MenuScreen[]): boolean {
  if (stack.length === 0) return true;
  return stack[stack.length - 1]?.id === "main";
}

function shortName(name: string): string {
  const t = name.trim() || "אורח";
  return t.length <= 25 ? t : `${t.slice(0, 22)}…`;
}

function guestPeopleCount(g: Rsvp): number {
  if (g.status === "declined") return 0;
  return Math.max(g.guest_count || 1, 1);
}

function sortByName(a: Rsvp, b: Rsvp): number {
  return a.full_name.localeCompare(b.full_name, "he");
}

export function renderMainMenu(page = 0, forButtons = true): string {
  const p = Math.max(0, Math.min(MAIN_PAGE_COUNT - 1, page));
  if (forButtons) {
    return `*תפריט מארגנים* (${p + 1}/${MAIN_PAGE_COUNT})
סיכום · עם אורחים · אושר · אולי · ממתינים · תזכורות · חיפוש
בחרו מהכפתורים (או «עוד»).`;
  }
  return `*תפריט מארגנים*
1 סיכום
2 עם אורחים (אושר + מלווים)
3 אושר
4 אולי
5 עוד לא אושר
6 לא מגיעים
7 תזכורות ממתינות
8 נוספו ידנית
9 חיפוש אורח
10 איך להוסיף אורח
${navFooter({ onMain: true })}`;
}

function formatNameCountLine(g: Rsvp): string {
  const n = guestPeopleCount(g);
  if (g.status === "confirmed" && n > 1) return `${g.full_name} · ${n}`;
  if (g.status === "imported") return `${g.full_name} · ${n}`;
  if (g.status === "maybe") return `${g.full_name} · אולי · ${n}`;
  return g.full_name;
}

function renderNameBlock(title: string, guests: Rsvp[], empty: string): string {
  if (guests.length === 0) return `*${title}*\n${empty}`;
  const people = guests.reduce((sum, g) => sum + guestPeopleCount(g), 0);
  const countBit =
    people !== guests.length ? `${guests.length} · ${people} אנשים` : String(guests.length);
  const lines = guests.map((g) => `• ${formatNameCountLine(g)}`);
  return `*${title}* (${countBit})\n${lines.join("\n")}`;
}

function renderSummary(
  summary: RsvpSummary,
  all: Rsvp[],
  forButtons = true,
  backIsHome = false
): string {
  const bringing = all
    .filter((r) => r.status === "confirmed" && guestPeopleCount(r) > 1)
    .sort((a, b) => guestPeopleCount(b) - guestPeopleCount(a) || sortByName(a, b));
  const maybe = all
    .filter((r) => r.status === "maybe")
    .sort(sortByName);
  const pending = all
    .filter((r) => r.status === "imported" && !isManualPendingGuest(r))
    .sort(
      (a, b) => guestPeopleCount(b) - guestPeopleCount(a) || sortByName(a, b)
    );
  const pendingPeople = pending.reduce((sum, g) => sum + guestPeopleCount(g), 0);

  const body = `*סיכום*
רשומות: ${summary.total_records}
אושר: ${summary.confirmed} · סה״כ אנשים: ${summary.total_guests_attending}
עוד לא אושר: ${summary.imported_pending} · סה״כ אנשים: ${pendingPeople}
מתוכם ידניים: ${summary.manual_pending}
עדיין לא יודעים: ${summary.maybe}
לא אושרו: ${summary.declined}
תזכורות נשלחו: ${summary.reminders_sent}
תזכורות ממתינות: ${summary.reminders_pending}

${renderNameBlock("עוד לא אושר (כולל כמה יגיעו)", pending, "אין כרגע")}

${renderNameBlock("מגיעים עם אורחים", bringing, "אין כרגע")}

${renderNameBlock("עדיין לא יודעים", maybe, "אין כרגע")}`;

  return forButtons ? body : `${body}${navFooter({ backIsHome })}`;
}

function renderAddHelp(forButtons = true, backIsHome = false): string {
  const body = `*הוספת אורח ידנית*
שלחו למספר הזה הודעה בשתי שורות (בלי תפריט):

כרמל אילני
0500000000

אדם אחד בכל פעם.
אחרי הוספה תשאלו האם לשלוח הזמנה עכשיו.
אם המספר כבר קיים — תקבלו שאלה האם לעדכן שם.`;
  return forButtons ? body : `${body}${navFooter({ backIsHome })}`;
}

function renderSearchPrompt(forButtons = true, backIsHome = false): string {
  const body = `*חיפוש אורח*
שלחו שם (חלקי) או מספר טלפון.`;
  return forButtons ? body : `${body}${navFooter({ backIsHome })}`;
}

function listTitle(filter: ListFilter): string {
  switch (filter.kind) {
    case "status":
      return STATUS_LABEL[filter.status];
    case "manual_pending":
      return "נוספו ידנית (ממתינים)";
    case "bringing_guests":
      return "מגיעים עם אורחים";
    case "reminders_pending":
      return "תזכורות ממתינות";
    case "search":
      return `חיפוש: ${filter.query}`;
  }
}

function listCountLabel(
  filter: ListFilter,
  ids: string[],
  byId: Map<string, Rsvp>
): string {
  const total = ids.length;
  if (
    (filter.kind === "status" &&
      (filter.status === "confirmed" || filter.status === "imported")) ||
    filter.kind === "bringing_guests"
  ) {
    const people = ids.reduce((sum, id) => {
      const g = byId.get(id);
      if (!g) return sum;
      return sum + guestPeopleCount(g);
    }, 0);
    return `${total} נרשמו · ${people} אנשים`;
  }
  return String(total);
}

function formatGuestListLine(g: Rsvp, index: number): string {
  const name = g.full_name || "ללא שם";
  const n = guestPeopleCount(g);
  if (g.status === "confirmed") {
    return n > 1 ? `${index} ${name} · ${n} אורחים` : `${index} ${name}`;
  }
  if (g.status === "maybe") return `${index} ${name} · אולי · ${n}`;
  if (g.status === "declined") return `${index} ${name} · לא מגיע/ה`;
  if (isManualPendingGuest(g)) return `${index} ${name} · ידני · ${n}`;
  return `${index} ${name} · עוד לא אושר · ${n}`;
}

/** Split a long body into WhatsApp-safe chunks. */
function chunkMessage(header: string, lines: string[], tail: string): string[] {
  if (lines.length === 0) {
    const one = [header, tail].filter(Boolean).join("\n\n");
    return hardSplit(one);
  }

  const parts: string[] = [];
  let current = header;
  for (const line of lines) {
    const candidate = `${current}\n${line}`;
    if (candidate.length > WA_SAFE_LEN && current !== header) {
      parts.push(current);
      current = `*(המשך הרשימה)*\n${line}`;
    } else {
      current = candidate;
    }
  }
  if (tail) {
    const withTail = `${current}\n\n${tail}`;
    if (withTail.length > WA_SAFE_LEN && current.length > header.length) {
      parts.push(current);
      parts.push(`*(המשך)*\n${tail}`);
    } else {
      parts.push(withTail);
    }
  } else {
    parts.push(current);
  }
  return parts.flatMap((p) => hardSplit(p));
}

function hardSplit(text: string): string[] {
  if (!text) return [""];
  if (text.length <= WA_SAFE_LEN) return [text];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += WA_SAFE_LEN) {
    parts.push(text.slice(i, i + WA_SAFE_LEN));
  }
  return parts;
}

/** Fallback when a single block (e.g. summary) is already too long. */
function splitLongText(text: string): string[] {
  if (text.length <= WA_SAFE_LEN) return [text];
  const lines = text.split("\n");
  if (lines.length <= 1) return hardSplit(text);
  return chunkMessage(lines[0] || "", lines.slice(1), "");
}

function renderList(
  screen: Extract<MenuScreen, { id: "list" }>,
  byId: Map<string, Rsvp>,
  forButtons = true,
  backIsHome = false
): { message: string; followUpMessages?: string[] } {
  const ids = screen.ids;
  const total = ids.length;
  const title = listTitle(screen.filter);
  const countLabel = listCountLabel(screen.filter, ids, byId);

  if (total === 0) {
    const empty = forButtons
      ? `*${title}*\nלא נמצאו אורחים.`
      : `*${title}*\nלא נמצאו אורחים.\n${navFooter({ backIsHome })}`;
    return { message: empty };
  }

  const useGuestButtons = forButtons && total <= GUEST_BUTTON_MAX;
  const lines = ids.map((id, i) => {
    const g = byId.get(id);
    if (!g) return `${i + 1} ללא שם`;
    return formatGuestListLine(g, i + 1);
  });

  const header = `*${title}* (${countLabel})`;
  const pickHint = useGuestButtons
    ? "בחרו אורח מהכפתורים."
    : "שלחו מספר אורח מהרשימה לפרטים.";
  const tail = forButtons ? pickHint : `${pickHint}${navFooter({ backIsHome })}`;

  const parts = chunkMessage(header, lines, tail);
  return {
    message: parts[0]!,
    followUpMessages: parts.length > 1 ? parts.slice(1) : undefined,
  };
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
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

function hasSheetAnswer(value: string | number | null | undefined): boolean {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  const t = value.trim();
  return Boolean(t) && t !== "—" && t !== "-";
}

/** Organizer-only guest card (WhatsApp menu). Includes Google Sheet answers when present. */
export function formatGuestFull(
  guest: Rsvp,
  forButtons = true,
  backIsHome = false
): string {
  const lines = [
    `*${guest.full_name}*`,
    `טלפון: ${formatPhoneDisplay(guest.phone)}`,
    `סטטוס: ${STATUS_LABEL[guest.status]}`,
    `מספר אורחים: ${guest.status === "declined" ? 0 : guest.guest_count}`,
  ];

  if (isManualPendingGuest(guest)) {
    lines.push("נוסף ידנית (ממתין): כן");
  }

  if (guest.final_confirmed_at) {
    lines.push(
      `תאריך ושעת אישור הגעה: ${formatWhen(guest.final_confirmed_at)}`
    );
  }

  lines.push(
    `תזכורת: ${
      guest.reminder_sent_at
        ? `נשלחה (${formatWhen(guest.reminder_sent_at)})`
        : "לא נשלחה"
    }`
  );

  const sheetLines: string[] = [];
  if (hasSheetAnswer(guest.wants_video_blessing)) {
    sheetLines.push(`ברכת וידאו: ${guest.wants_video_blessing!.trim()}`);
  }
  if (hasSheetAnswer(guest.wants_to_speak)) {
    sheetLines.push(`רוצה לדבר: ${guest.wants_to_speak!.trim()}`);
  }
  if (hasSheetAnswer(guest.excitement)) {
    sheetLines.push(`התרגשות: ${guest.excitement}`);
  }
  if (hasSheetAnswer(guest.notes)) {
    sheetLines.push(`הערות: ${guest.notes!.trim()}`);
  }

  if (sheetLines.length > 0) {
    lines.push("", "*מהשיטס / הטופס:*", ...sheetLines);
  }

  const body = lines.join("\n");
  return forButtons ? body : `${body}${navFooter({ backIsHome })}`;
}

function filterGuests(all: Rsvp[], filter: ListFilter): Rsvp[] {
  switch (filter.kind) {
    case "status": {
      const rows = all.filter((r) => r.status === filter.status);
      if (filter.status === "confirmed") {
        return rows.sort(
          (a, b) => guestPeopleCount(b) - guestPeopleCount(a) || sortByName(a, b)
        );
      }
      return rows.sort(sortByName);
    }
    case "manual_pending":
      return all.filter((r) => isManualPendingGuest(r)).sort(sortByName);
    case "bringing_guests":
      return all
        .filter((r) => r.status === "confirmed" && guestPeopleCount(r) > 1)
        .sort(
          (a, b) => guestPeopleCount(b) - guestPeopleCount(a) || sortByName(a, b)
        );
    case "reminders_pending":
      return all
        .filter(
          (r) =>
            (r.status === "imported" ||
              r.status === "confirmed" ||
              r.status === "maybe") &&
            !r.reminder_sent_at
        )
        .sort(sortByName);
    case "search": {
      const q = filter.query.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, "");
      const phoneQ = normalizePhone(filter.query);
      return all
        .filter((r) => {
          const name = normalizeGuestName(r.full_name);
          if (name.includes(normalizeGuestName(filter.query))) return true;
          if (r.full_name.toLowerCase().includes(q)) return true;
          if (phoneQ && phonesMatch(r.phone, phoneQ)) return true;
          if (
            qDigits.length >= 3 &&
            r.phone.replace(/\D/g, "").includes(qDigits)
          ) {
            return true;
          }
          return false;
        })
        .sort(sortByName);
    }
  }
}

async function renderScreen(
  screen: MenuScreen,
  all: Rsvp[],
  stack: MenuScreen[] = []
): Promise<{
  message: string;
  textFallback: string;
  buttons: ReplyButton[];
  footer?: string;
  list?: MenuReply["list"];
  followUpMessages?: string[];
}> {
  const byId = new Map(all.map((r) => [r.id, r]));
  const backIsHome = backLandsOnHome(stack);
  const nav = { backIsHome };

  /** Footer only when there is no יציאה button already on screen. */
  const exitFooter = (buttons: ReplyButton[]) =>
    buttons.some((b) => b.buttonId === "exit") ? undefined : MENU_EXIT_FOOTER;

  switch (screen.id) {
    case "main": {
      const page = screen.page ?? 0;
      const buttons = mainPageButtons(page);
      return {
        message: renderMainMenu(page, true),
        textFallback: renderMainMenu(page, false),
        buttons,
        footer: exitFooter(buttons),
      };
    }
    case "summary": {
      const summary = await getSummary();
      const buttons = [
        btn("with", "עם אורחים"),
        btn("maybe", "אולי"),
        backIsHome
          ? btn("home", "לתפריט הראשי")
          : btn("back", "אחורה"),
      ];
      const summaryBody = renderSummary(summary, all, true, backIsHome);
      const summaryParts = splitLongText(summaryBody);
      const fallbackParts = splitLongText(
        renderSummary(summary, all, false, backIsHome)
      );
      return {
        message: summaryParts[0]!,
        textFallback: fallbackParts[0]!,
        buttons,
        footer: exitFooter(buttons),
        followUpMessages:
          summaryParts.length > 1 ? summaryParts.slice(1) : undefined,
      };
    }
    case "search_prompt": {
      const buttons = navButtons(nav);
      return {
        message: renderSearchPrompt(true, backIsHome),
        textFallback: renderSearchPrompt(false, backIsHome),
        buttons,
        footer: exitFooter(buttons),
      };
    }
    case "add_help": {
      const buttons = navButtons(nav);
      return {
        message: renderAddHelp(true, backIsHome),
        textFallback: renderAddHelp(false, backIsHome),
        buttons,
        footer: exitFooter(buttons),
      };
    }
    case "list": {
      const ids = screen.ids;
      const useGuestButtons =
        ids.length > 0 && ids.length <= GUEST_BUTTON_MAX;
      let buttons: ReplyButton[];
      if (ids.length === 0) {
        buttons = navButtons(nav);
      } else if (useGuestButtons) {
        buttons = ids.map((id, i) => {
          const g = byId.get(id);
          return btn(`g${i}`, shortName(g?.full_name || `אורח ${i + 1}`));
        });
        if (backIsHome) {
          buttons.push(btn("home", "לתפריט הראשי"));
          if (ids.length === 1) buttons.push(btn("exit", "יציאה"));
        } else {
          buttons.push(btn("back", "אחורה"));
          if (ids.length === 1) buttons.push(btn("home", "לתפריט הראשי"));
        }
      } else {
        buttons = navButtons(nav);
      }

      const interactive = renderList(screen, byId, true, backIsHome);
      const fallback = renderList(screen, byId, false, backIsHome);

      return {
        message: interactive.message,
        textFallback: fallback.message,
        buttons,
        footer: exitFooter(buttons),
        followUpMessages: interactive.followUpMessages,
      };
    }
    case "guest": {
      const guest =
        byId.get(screen.guestId) || (await getRsvpById(screen.guestId));
      const buttons = navButtons(nav);
      if (!guest) {
        return {
          message: "אורח לא נמצא.",
          textFallback: `אורח לא נמצא.\n${navFooter(nav)}`,
          buttons,
          footer: exitFooter(buttons),
        };
      }
      return {
        message: formatGuestFull(guest, true, backIsHome),
        textFallback: formatGuestFull(guest, false, backIsHome),
        buttons,
        footer: exitFooter(buttons),
      };
    }
  }
}

function goMain(sessionPhone: string, page = 0) {
  return saveOrganizerMenuSession(
    sessionPhone,
    { id: "main", page },
    []
  );
}

async function replyForScreen(
  sessionPhone: string,
  screen: MenuScreen,
  stack: MenuScreen[],
  exited?: boolean
): Promise<MenuReply> {
  const saved = await saveOrganizerMenuSession(
    sessionPhone,
    screen,
    screen.id === "main" ? [] : stack
  );
  const all = await listRsvps();
  const rendered = await renderScreen(
    saved!.screen,
    all,
    screen.id === "main" ? [] : stack
  );
  return menuFromRendered(rendered, { exited });
}

function menuFromRendered(
  rendered: {
    message: string;
    textFallback: string;
    buttons: ReplyButton[];
    footer?: string;
    list?: MenuReply["list"];
    followUpMessages?: string[];
  },
  extra?: { exited?: boolean }
): MenuReply {
  return {
    handled: true,
    exited: extra?.exited,
    message: rendered.message,
    textFallback: rendered.textFallback,
    buttons: rendered.buttons,
    footer: rendered.footer,
    list: rendered.list,
    followUpMessages: rendered.followUpMessages,
  };
}

async function goBack(
  sessionPhone: string,
  session: OrganizerMenuSession
): Promise<MenuReply> {
  if (session.screen.id === "main" || session.stack.length === 0) {
    await clearOrganizerMenuSession(sessionPhone);
    return {
      handled: true,
      exited: true,
      message: MENU_CLOSED_MESSAGE,
    };
  }
  const stack = [...session.stack];
  const prev = stack.pop()!;
  return replyForScreen(sessionPhone, prev, stack);
}

async function pushScreen(
  sessionPhone: string,
  session: OrganizerMenuSession | null,
  next: MenuScreen
): Promise<MenuReply> {
  const stack = session ? [...session.stack, session.screen] : [];
  return replyForScreen(sessionPhone, next, next.id === "main" ? [] : stack);
}

function parseChoice(text: string): number | null {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  return Number(t);
}

/** Map button id / label to a stable action token. */
function resolveAction(text: string, buttonId?: string | null): string {
  const id = (buttonId || "").trim().toLowerCase();
  if (id) return id;

  const t = text.replace(/\r\n/g, "\n").trim().toLowerCase();
  const byLabel: Record<string, string> = {
    סיכום: "sum",
    "חיפוש אורח": "search",
    חיפוש: "search",
    עוד: "more",
    "עם אורחים": "with",
    "מגיעים עם אורחים": "with",
    מלווים: "with",
    "אושרו הגעה": "conf",
    אושרו: "conf",
    אושר: "conf",
    "אישרו הגעה": "conf",
    אישרו: "conf",
    ממתינים: "pend",
    "ממתינים לאישור": "pend",
    "עוד לא אושר": "pend",
    "לא יודעים": "maybe",
    "עדיין לא יודעים": "maybe",
    אולי: "maybe",
    "לא מגיעים": "no",
    "לא אושרו הגעה": "no",
    "לא אושרו": "no",
    "נוספו ידנית": "manual",
    ידניים: "manual",
    תזכורות: "remind",
    "תזכורות ממתינות": "remind",
    "איך להוסיף": "addhelp",
    יציאה: "exit",
    אחורה: "back",
    חזרה: "back",
    תפריט: "home",
    "תפריט ראשי": "home",
    "לתפריט הראשי": "home",
    "חזרה לתפריט הראשי": "home",
  };
  return byLabel[t] || t;
}

async function openList(
  phone: string,
  session: OrganizerMenuSession,
  filter: ListFilter
): Promise<MenuReply> {
  const all = await listRsvps();
  const matches = filterGuests(all, filter);
  const next: MenuScreen = {
    id: "list",
    filter,
    ids: matches.map((r) => r.id),
    page: 0,
  };
  return pushScreen(phone, session, next);
}

async function handleMenuAction(
  phone: string,
  session: OrganizerMenuSession,
  action: string
): Promise<MenuReply | null> {
  const page = session.screen.id === "main" ? session.screen.page || 0 : 0;

  if (action === "more" && session.screen.id === "main") {
    const nextPage = (page + 1) % MAIN_PAGE_COUNT;
    return replyForScreen(phone, { id: "main", page: nextPage }, []);
  }
  if (action === "sum") {
    return pushScreen(phone, session, { id: "summary" });
  }
  if (action === "search") {
    return pushScreen(phone, session, { id: "search_prompt" });
  }
  if (action === "addhelp") {
    return pushScreen(phone, session, { id: "add_help" });
  }
  if (action === "conf") {
    return openList(phone, session, { kind: "status", status: "confirmed" });
  }
  if (action === "pend") {
    return openList(phone, session, { kind: "status", status: "imported" });
  }
  if (action === "maybe") {
    return openList(phone, session, { kind: "status", status: "maybe" });
  }
  if (action === "no") {
    return openList(phone, session, { kind: "status", status: "declined" });
  }
  if (action === "manual") {
    return openList(phone, session, { kind: "manual_pending" });
  }
  if (action === "with") {
    return openList(phone, session, { kind: "bringing_guests" });
  }
  if (action === "remind") {
    return openList(phone, session, { kind: "reminders_pending" });
  }
  return null;
}

/**
 * Handle organizer menu. Returns null if the message should fall through
 * (e.g. no active session and not opening help).
 */
export async function handleOrganizerMenu(opts: {
  organizerPhone: string;
  text: string;
  buttonId?: string | null;
}): Promise<MenuReply | null> {
  const phone = opts.organizerPhone;
  const text = opts.text.trim();
  const action = resolveAction(text, opts.buttonId);
  let session = await getOrganizerMenuSession(phone);

  if (action === "exit" || isMenuExitCommand(text)) {
    await clearOrganizerMenuSession(phone);
    return {
      handled: true,
      exited: true,
      message: MENU_CLOSED_MESSAGE,
    };
  }

  // Bare "9" used to mean home — now conflicts with guest #9 / main option 9 (search).
  if (isHelpOrMenuOpen(text) || action === "home" || isMenuHomeCommand(text)) {
    const opened = await goMain(phone, 0);
    const rendered = await renderScreen(opened!.screen, await listRsvps(), []);
    return menuFromRendered(rendered);
  }

  if (!session) return null;

  if (action === "back" || isMenuBackCommand(text)) {
    return goBack(phone, session);
  }

  // Guest pick via buttons (g0 / g1) when list is short enough.
  const guestPick = action.match(/^g(\d+)$/);
  if (guestPick && session.screen.id === "list") {
    const idx = Number(guestPick[1]);
    const ids = session.screen.ids;
    if (idx >= 0 && idx < ids.length && ids.length <= GUEST_BUTTON_MAX) {
      const next: MenuScreen = {
        id: "guest",
        guestId: ids[idx]!,
        from: session.screen,
      };
      return pushScreen(phone, session, next);
    }
  }

  // Search prompt: free text (not a lone digit / known button action)
  if (session.screen.id === "search_prompt") {
    const choice = parseChoice(text);
    const isNavAction = [
      "sum",
      "search",
      "more",
      "conf",
      "pend",
      "maybe",
      "no",
      "manual",
      "with",
      "remind",
      "addhelp",
      "back",
      "home",
      "exit",
    ].includes(action);

    if (choice === null && !isNavAction && !opts.buttonId) {
      return openList(phone, session, {
        kind: "search",
        query: text.trim(),
      });
    }
  }

  // List / summary / main: open views from buttons
  if (
    session.screen.id === "main" ||
    session.screen.id === "summary" ||
    session.screen.id === "list"
  ) {
    const fromButton = await handleMenuAction(phone, session, action);
    if (fromButton) return fromButton;
  }

  const choice = parseChoice(text);
  if (choice === null) {
    if (session.screen.id !== "main") {
      const rendered = await renderScreen(
        session.screen,
        await listRsvps(),
        session.stack
      );
      return {
        handled: true,
        message: `לא הבנתי. השתמשו בכפתורים.\n\n${rendered.message}`,
        textFallback: rendered.textFallback
          ? `לא הבנתי. השתמשו בכפתורים.\n\n${rendered.textFallback}`
          : "לא הבנתי",
        buttons: rendered.buttons,
        footer: rendered.footer,
        list: rendered.list,
        followUpMessages: rendered.followUpMessages,
      };
    }
    const rendered = await renderScreen(
      session.screen,
      await listRsvps(),
      session.stack
    );
    return {
      handled: true,
      message: `לא הבנתי. בחרו כפתור מהתפריט.\n\n${rendered.message}`,
      textFallback: rendered.textFallback
        ? `לא הבנתי. בחרו כפתור מהתפריט.\n\n${rendered.textFallback}`
        : "לא הבנתי",
      buttons: rendered.buttons,
      footer: rendered.footer,
      list: rendered.list,
      followUpMessages: rendered.followUpMessages,
    };
  }

  if (choice === 0) {
    return goBack(phone, session);
  }

  session = (await getOrganizerMenuSession(phone)) || session;
  const screen = session.screen;

  // List: number selects guest from the full list (no paging).
  if (screen.id === "list") {
    if (choice >= 1 && choice <= screen.ids.length) {
      const guestId = screen.ids[choice - 1]!;
      const next: MenuScreen = {
        id: "guest",
        guestId,
        from: screen,
      };
      return pushScreen(phone, session, next);
    }
    const rendered = await renderScreen(screen, await listRsvps(), session.stack);
    return {
      handled: true,
      message: `בחרו מספר אורח מהרשימה (1–${screen.ids.length}), או כפתור ניווט.\n\n${rendered.message}`,
      textFallback: rendered.textFallback,
      buttons: rendered.buttons,
      footer: rendered.footer,
      list: rendered.list,
      followUpMessages: rendered.followUpMessages,
    };
  }

  if (screen.id === "main") {
    const mainMap: Record<number, () => Promise<MenuReply>> = {
      1: () => pushScreen(phone, session, { id: "summary" }),
      2: () => openList(phone, session, { kind: "bringing_guests" }),
      3: () =>
        openList(phone, session, { kind: "status", status: "confirmed" }),
      4: () => openList(phone, session, { kind: "status", status: "maybe" }),
      5: () =>
        openList(phone, session, { kind: "status", status: "imported" }),
      6: () =>
        openList(phone, session, { kind: "status", status: "declined" }),
      7: () => openList(phone, session, { kind: "reminders_pending" }),
      8: () => openList(phone, session, { kind: "manual_pending" }),
      9: () => pushScreen(phone, session, { id: "search_prompt" }),
      10: () => pushScreen(phone, session, { id: "add_help" }),
    };
    const run = mainMap[choice];
    if (run) return run();

    const rendered = await renderScreen(screen, await listRsvps(), session.stack);
    return {
      handled: true,
      message: `בחרו אפשרות מהכפתורים.\n\n${rendered.message}`,
      textFallback: rendered.textFallback,
      buttons: rendered.buttons,
      footer: rendered.footer,
      list: rendered.list,
    };
  }

  if (screen.id === "summary" || screen.id === "add_help") {
    const rendered = await renderScreen(screen, await listRsvps(), session.stack);
    const hint = backLandsOnHome(session.stack)
      ? "בחרו לתפריט הראשי או יציאה — או «עם אורחים» / «אולי»."
      : "בחרו אחורה או לתפריט הראשי.";
    return {
      handled: true,
      message: `${hint}\n\n${rendered.message}`,
      textFallback: rendered.textFallback,
      buttons: rendered.buttons,
      footer: rendered.footer,
      list: rendered.list,
      followUpMessages: rendered.followUpMessages,
    };
  }

  if (screen.id === "search_prompt") {
    const rendered = await renderScreen(screen, await listRsvps(), session.stack);
    return menuFromRendered(rendered);
  }

  if (screen.id === "guest") {
    const rendered = await renderScreen(screen, await listRsvps(), session.stack);
    const hint = backLandsOnHome(session.stack)
      ? "בחרו לתפריט הראשי או יציאה."
      : "בחרו אחורה או לתפריט הראשי.";
    return {
      handled: true,
      message: `${hint}\n\n${rendered.message}`,
      textFallback: rendered.textFallback,
      buttons: rendered.buttons,
      footer: rendered.footer,
      list: rendered.list,
    };
  }

  const opened = await goMain(phone, 0);
  const rendered = await renderScreen(opened!.screen, await listRsvps(), []);
  return menuFromRendered(rendered);
}

export { isHelpOrMenuOpen };
