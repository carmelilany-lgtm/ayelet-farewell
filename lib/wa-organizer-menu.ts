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
 * - More choices: numbered text + nav buttons
 * (Green API list messages are unreliable — do not use.)
 */
const PAGE_SIZE = 8;
const MAIN_PAGE_COUNT = 4;

/** Max guests as reply buttons (leave ≥1 slot for nav; Meta max = 3). */
const GUEST_BUTTON_MAX = 2;

const MENU_CLOSED_MESSAGE = "התפריט נסגר.\nלפתיחה מחדש שלחו עזרה";

const STATUS_LABEL: Record<RsvpStatus, string> = {
  imported: "ממתין לאישור",
  confirmed: "אישרו הגעה",
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
    return `\n9 תפריט ראשי`;
  }
  return `\n0 אחורה\n9 תפריט ראשי`;
}

function mainPageButtons(page: number): ReplyButton[] {
  switch (page) {
    case 0:
      return [btn("sum", "סיכום"), btn("search", "חיפוש אורח"), btn("more", "עוד")];
    case 1:
      return [btn("conf", "אישרו הגעה"), btn("pend", "ממתינים"), btn("more", "עוד")];
    case 2:
      return [
        btn("maybe", "לא יודעים"),
        btn("no", "לא אושרו הגעה"),
        btn("more", "עוד"),
      ];
    default:
      return [
        btn("manual", "נוספו ידנית"),
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
  const hasPrev = Boolean(opts?.hasPrev);
  const hasNext = Boolean(opts?.hasNext);
  const backIsHome = Boolean(opts?.backIsHome);

  if (hasPrev && hasNext) {
    return [btn("prev", "הקודם"), btn("next", "הבא"), btn("home", "לתפריט הראשי")];
  }
  if (hasNext) {
    if (backIsHome) {
      return [
        btn("next", "הבא"),
        btn("home", "לתפריט הראשי"),
        btn("exit", "יציאה"),
      ];
    }
    return [btn("back", "אחורה"), btn("next", "הבא"), btn("home", "לתפריט הראשי")];
  }
  if (hasPrev) {
    if (backIsHome) {
      return [
        btn("prev", "הקודם"),
        btn("home", "לתפריט הראשי"),
        btn("exit", "יציאה"),
      ];
    }
    return [btn("back", "אחורה"), btn("prev", "הקודם"), btn("home", "לתפריט הראשי")];
  }
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

export function renderMainMenu(page = 0, forButtons = true): string {
  const p = Math.max(0, Math.min(MAIN_PAGE_COUNT - 1, page));
  if (forButtons) {
    return `*תפריט מארגנים* (${p + 1}/${MAIN_PAGE_COUNT})
בחרו אפשרות מהכפתורים.`;
  }
  return `*תפריט מארגנים*
1 סיכום
2 חיפוש אורח
3 אישרו הגעה
4 ממתינים לאישור
5 עדיין לא יודעים
6 לא אושרו הגעה
7 נוספו ידנית (ממתינים)
8 איך להוסיף אורח
${navFooter({ onMain: true })}`;
}

function renderSummary(
  summary: RsvpSummary,
  forButtons = true,
  backIsHome = false
): string {
  const body = `*סיכום*
רשומות: ${summary.total_records}
אישרו: ${summary.confirmed}
ממתינים: ${summary.imported_pending}
מתוכם ידניים: ${summary.manual_pending}
עדיין לא יודעים: ${summary.maybe}
לא אושרו: ${summary.declined}
אורחים מגיעים (ספירה): ${summary.total_guests_attending}
תזכורות נשלחו: ${summary.reminders_sent}
תזכורות ממתינות: ${summary.reminders_pending}`;
  return forButtons ? body : `${body}${navFooter({ backIsHome })}`;
}

function renderAddHelp(forButtons = true, backIsHome = false): string {
  const body = `*הוספת אורח ידנית*
שלחו למספר הזה הודעה בשתי שורות (בלי תפריט):

כרמל אילני
0500000000

אדם אחד בכל פעם.
אם המספר כבר קיים — תקבלו שאלה האם לעדכן שם.`;
  return forButtons ? body : `${body}${navFooter({ backIsHome })}`;
}

function renderSearchPrompt(forButtons = true, backIsHome = false): string {
  const body = `*חיפוש אורח*
שלחו שם (חלקי) או מספר טלפון.`;
  return forButtons ? body : `${body}${navFooter({ backIsHome })}`;
}

function pageSlice(ids: string[], page: number) {
  const start = page * PAGE_SIZE;
  return {
    start,
    slice: ids.slice(start, start + PAGE_SIZE),
    total: ids.length,
    hasMore: start + PAGE_SIZE < ids.length,
    hasPrev: page > 0,
  };
}

function listTitle(filter: ListFilter): string {
  switch (filter.kind) {
    case "status":
      return STATUS_LABEL[filter.status];
    case "manual_pending":
      return "נוספו ידנית (ממתינים)";
    case "search":
      return `חיפוש: ${filter.query}`;
  }
}

function renderList(
  screen: Extract<MenuScreen, { id: "list" }>,
  byId: Map<string, Rsvp>,
  forButtons = true,
  backIsHome = false
): string {
  const { start, slice, total, hasMore, hasPrev } = pageSlice(
    screen.ids,
    screen.page
  );
  const title = listTitle(screen.filter);
  if (total === 0) {
    return forButtons
      ? `*${title}*\nלא נמצאו אורחים.`
      : `*${title}*\nלא נמצאו אורחים.\n${navFooter({ backIsHome })}`;
  }

  // Few choices → bullets + reply buttons only (no numbers).
  const useGuestButtons = forButtons && slice.length <= GUEST_BUTTON_MAX;

  if (useGuestButtons) {
    const lines = slice.map((id) => {
      const g = byId.get(id);
      const name = g?.full_name || "ללא שם";
      const phone = g ? formatPhoneDisplay(g.phone) : "";
      return `• ${name}${phone ? ` · ${phone}` : ""}`;
    });
    return `*${title}* (${total})
${lines.join("\n")}

בחרו אורח מהכפתורים.`;
  }

  // Many choices → numbered text (Meta list fallback / Green API recommendation).
  const lines = slice.map((id, i) => {
    const g = byId.get(id);
    const name = g?.full_name || "ללא שם";
    const phone = g ? formatPhoneDisplay(g.phone) : "";
    return `${i + 1} ${name}${phone ? ` · ${phone}` : ""}`;
  });

  if (forButtons) {
    return `*${title}* (${total})
עמוד ${screen.page + 1} · ${start + 1}–${start + slice.length}

${lines.join("\n")}

בחרו מספר אורח מהרשימה.`;
  }

  const more: string[] = [];
  if (hasPrev) more.push(`10 עמוד קודם`);
  if (hasMore) more.push(`11 עמוד הבא`);

  return `*${title}* (${total})
עמוד ${screen.page + 1} · ${start + 1}–${start + slice.length}

${lines.join("\n")}
${more.length ? `\n${more.join("\n")}\n` : ""}
בחרו מספר לצפייה בפרטים.
${navFooter({ backIsHome })}`;
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
    case "status":
      return all.filter((r) => r.status === filter.status);
    case "manual_pending":
      return all.filter((r) => isManualPendingGuest(r));
    case "search": {
      const q = filter.query.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, "");
      const phoneQ = normalizePhone(filter.query);
      return all.filter((r) => {
        const name = normalizeGuestName(r.full_name);
        if (name.includes(normalizeGuestName(filter.query))) return true;
        if (r.full_name.toLowerCase().includes(q)) return true;
        if (phoneQ && phonesMatch(r.phone, phoneQ)) return true;
        if (qDigits.length >= 3 && r.phone.replace(/\D/g, "").includes(qDigits)) {
          return true;
        }
        return false;
      });
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
}> {
  const byId = new Map(all.map((r) => [r.id, r]));
  const backIsHome = backLandsOnHome(stack);
  const nav = { backIsHome };

  switch (screen.id) {
    case "main": {
      const page = screen.page ?? 0;
      return {
        message: renderMainMenu(page, true),
        textFallback: renderMainMenu(page, false),
        buttons: mainPageButtons(page),
      };
    }
    case "summary": {
      const summary = await getSummary();
      return {
        message: renderSummary(summary, true, backIsHome),
        textFallback: renderSummary(summary, false, backIsHome),
        buttons: navButtons(nav),
      };
    }
    case "search_prompt":
      return {
        message: renderSearchPrompt(true, backIsHome),
        textFallback: renderSearchPrompt(false, backIsHome),
        buttons: navButtons(nav),
      };
    case "add_help":
      return {
        message: renderAddHelp(true, backIsHome),
        textFallback: renderAddHelp(false, backIsHome),
        buttons: navButtons(nav),
      };
    case "list": {
      const { slice, hasMore, hasPrev } = pageSlice(screen.ids, screen.page);
      const useGuestButtons = slice.length > 0 && slice.length <= GUEST_BUTTON_MAX;
      const pageNav = { hasPrev, hasNext: hasMore, backIsHome };
      let buttons: ReplyButton[];
      if (slice.length === 0) {
        buttons = navButtons(nav);
      } else if (useGuestButtons) {
        buttons = [
          ...slice.map((id, i) => {
            const g = byId.get(id);
            return btn(`g${i}`, shortName(g?.full_name || `אורח ${i + 1}`));
          }),
        ];
        if (backIsHome) {
          buttons.push(btn("home", "לתפריט הראשי"));
          if (slice.length === 1) {
            buttons.push(btn("exit", "יציאה"));
          }
        } else {
          buttons.push(btn("back", "אחורה"));
          if (slice.length === 1) {
            buttons.push(btn("home", "לתפריט הראשי"));
          }
        }
      } else {
        // 3+ guests: numbered text (Green API list is unreliable) + nav buttons.
        buttons = navButtons(pageNav);
      }

      return {
        message: renderList(screen, byId, true, backIsHome),
        textFallback: renderList(screen, byId, false, backIsHome),
        buttons,
      };
    }
    case "guest": {
      const guest =
        byId.get(screen.guestId) || (await getRsvpById(screen.guestId));
      if (!guest) {
        return {
          message: "אורח לא נמצא.",
          textFallback: `אורח לא נמצא.\n${navFooter(nav)}`,
          buttons: navButtons(nav),
        };
      }
      return {
        message: formatGuestFull(guest, true, backIsHome),
        textFallback: formatGuestFull(guest, false, backIsHome),
        buttons: navButtons(nav),
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
  if (!/^\d{1,2}$/.test(t)) return null;
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
    "אושרו הגעה": "conf",
    אושרו: "conf",
    "אישרו הגעה": "conf",
    אישרו: "conf",
    ממתינים: "pend",
    "ממתינים לאישור": "pend",
    "לא יודעים": "maybe",
    "עדיין לא יודעים": "maybe",
    "לא מגיעים": "no",
    "לא אושרו הגעה": "no",
    "לא אושרו": "no",
    "נוספו ידנית": "manual",
    "איך להוסיף": "addhelp",
    יציאה: "exit",
    אחורה: "back",
    חזרה: "back",
    תפריט: "home",
    "תפריט ראשי": "home",
    "לתפריט הראשי": "home",
    "חזרה לתפריט הראשי": "home",
    הקודם: "prev",
    הבא: "next",
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

async function handleMainAction(
  phone: string,
  session: OrganizerMenuSession,
  action: string
): Promise<MenuReply | null> {
  const page = session.screen.id === "main" ? session.screen.page || 0 : 0;

  if (action === "more") {
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

  if (
    isHelpOrMenuOpen(text) ||
    isMenuHomeCommand(text) ||
    action === "home"
  ) {
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
    const { slice } = pageSlice(session.screen.ids, session.screen.page);
    if (idx >= 0 && idx < slice.length) {
      const next: MenuScreen = {
        id: "guest",
        guestId: slice[idx]!,
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
      "addhelp",
      "prev",
      "next",
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

  // Button actions that apply on any screen
  if (action === "prev" || action === "next") {
    if (session.screen.id === "list") {
      const { hasMore, hasPrev } = pageSlice(
        session.screen.ids,
        session.screen.page
      );
      if (action === "prev" && hasPrev) {
        return replyForScreen(
          phone,
          { ...session.screen, page: session.screen.page - 1 },
          session.stack
        );
      }
      if (action === "next" && hasMore) {
        return replyForScreen(
          phone,
          { ...session.screen, page: session.screen.page + 1 },
          session.stack
        );
      }
    }
  }

  if (session.screen.id === "main") {
    const fromButton = await handleMainAction(phone, session, action);
    if (fromButton) return fromButton;
  }

  const choice = parseChoice(text);
  if (choice === null) {
    // Unknown input while menu session is open
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
    };
  }

  // Global 9 = home
  if (choice === 9) {
    const opened = await goMain(phone, 0);
    const rendered = await renderScreen(opened!.screen, await listRsvps(), []);
    return menuFromRendered(rendered);
  }

  if (choice === 0) {
    return goBack(phone, session);
  }

  session = (await getOrganizerMenuSession(phone)) || session;
  const screen = session.screen;

  if (screen.id === "main") {
    if (choice === 1) {
      return pushScreen(phone, session, { id: "summary" });
    }
    if (choice === 2) {
      return pushScreen(phone, session, { id: "search_prompt" });
    }
    if (choice === 8) {
      return pushScreen(phone, session, { id: "add_help" });
    }

    const statusMap: Record<number, ListFilter> = {
      3: { kind: "status", status: "confirmed" },
      4: { kind: "status", status: "imported" },
      5: { kind: "status", status: "maybe" },
      6: { kind: "status", status: "declined" },
      7: { kind: "manual_pending" },
    };
    const filter = statusMap[choice];
    if (!filter) {
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
    return openList(phone, session, filter);
  }

  if (screen.id === "summary" || screen.id === "add_help") {
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

  if (screen.id === "search_prompt") {
    const rendered = await renderScreen(screen, await listRsvps(), session.stack);
    return menuFromRendered(rendered);
  }

  if (screen.id === "list") {
    const { slice, hasMore, hasPrev } = pageSlice(screen.ids, screen.page);
    if (choice >= 1 && choice <= slice.length) {
      const guestId = slice[choice - 1]!;
      const next: MenuScreen = {
        id: "guest",
        guestId,
        from: screen,
      };
      return pushScreen(phone, session, next);
    }
    if (choice === 10 && hasPrev) {
      return replyForScreen(
        phone,
        { ...screen, page: screen.page - 1 },
        session.stack
      );
    }
    if (choice === 11 && hasMore) {
      return replyForScreen(
        phone,
        { ...screen, page: screen.page + 1 },
        session.stack
      );
    }
    const rendered = await renderScreen(screen, await listRsvps(), session.stack);
    return {
      handled: true,
      message: `בחרו מספר אורח מהרשימה, או כפתור ניווט.\n\n${rendered.message}`,
      textFallback: rendered.textFallback,
      buttons: rendered.buttons,
      footer: rendered.footer,
      list: rendered.list,
    };
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
