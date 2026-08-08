import type { ReplyButton } from "./green-api";
import { formatPhoneDisplay, normalizePhone, phonesMatch } from "./phone";
import { inviteAbsoluteUrl, siteAbsoluteUrl } from "./invite-token";
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

const PAGE_SIZE = 8;
const MAIN_PAGE_COUNT = 4;

const STATUS_LABEL: Record<RsvpStatus, string> = {
  imported: "ממתין לאישור",
  confirmed: "אושר הגעה",
  declined: "לא מגיע/ה",
  maybe: "עדיין לא יודע/ת",
};

export type MenuReply = {
  handled: true;
  message: string;
  buttons?: ReplyButton[];
  footer?: string;
  exited?: boolean;
};

function btn(buttonId: string, buttonText: string): ReplyButton {
  return { buttonId, buttonText };
}

function navFooter(opts?: { onMain?: boolean }): string {
  if (opts?.onMain) {
    return `\n0 יציאה מהתפריט`;
  }
  return `\n0 אחורה\n9 תפריט ראשי`;
}

function mainPageButtons(page: number): ReplyButton[] {
  switch (page) {
    case 0:
      return [btn("sum", "סיכום"), btn("search", "חיפוש אורח"), btn("more", "עוד")];
    case 1:
      return [btn("conf", "אושרו הגעה"), btn("pend", "ממתינים"), btn("more", "עוד")];
    case 2:
      return [
        btn("maybe", "לא יודעים"),
        btn("no", "לא מגיעים"),
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

function navButtons(opts?: {
  hasPrev?: boolean;
  hasNext?: boolean;
}): ReplyButton[] {
  const hasPrev = Boolean(opts?.hasPrev);
  const hasNext = Boolean(opts?.hasNext);
  if (hasPrev && hasNext) {
    return [btn("prev", "הקודם"), btn("next", "הבא"), btn("home", "תפריט")];
  }
  if (hasNext) {
    return [btn("back", "אחורה"), btn("next", "הבא"), btn("home", "תפריט")];
  }
  if (hasPrev) {
    return [btn("back", "אחורה"), btn("prev", "הקודם"), btn("home", "תפריט")];
  }
  return [btn("back", "אחורה"), btn("home", "תפריט")];
}

export function renderMainMenu(page = 0): string {
  const p = Math.max(0, Math.min(MAIN_PAGE_COUNT - 1, page));
  return `*תפריט מארגנים* (${p + 1}/${MAIN_PAGE_COUNT})
מידע בלבד — אין שליחת הודעות לאורחים מכאן.

1 סיכום
2 חיפוש אורח
3 אושרו הגעה
4 ממתינים לאישור
5 עדיין לא יודעים
6 לא מגיעים
7 נוספו ידנית (ממתינים)
8 איך להוסיף אורח
${navFooter({ onMain: true })}`;
}

function renderSummary(summary: RsvpSummary): string {
  return `*סיכום*
רשומות: ${summary.total_records}
אושרו: ${summary.confirmed}
ממתינים: ${summary.imported_pending}
מתוכם ידניים: ${summary.manual_pending}
עדיין לא יודעים: ${summary.maybe}
לא מגיעים: ${summary.declined}
אורחים מגיעים (ספירה): ${summary.total_guests_attending}
תזכורות נשלחו: ${summary.reminders_sent}
תזכורות ממתינות: ${summary.reminders_pending}
${navFooter()}`;
}

function renderAddHelp(): string {
  return `*הוספת אורח ידנית*
שלחו למספר הזה הודעה בשתי שורות (בלי תפריט):

כרמל אילני
0500000000

אדם אחד בכל פעם.
אם המספר כבר קיים — תקבלו שאלה האם לעדכן שם.
${navFooter()}`;
}

function renderSearchPrompt(): string {
  return `*חיפוש אורח*
שלחו שם (חלקי) או מספר טלפון.
${navFooter()}`;
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
  byId: Map<string, Rsvp>
): string {
  const { start, slice, total, hasMore, hasPrev } = pageSlice(
    screen.ids,
    screen.page
  );
  const title = listTitle(screen.filter);
  if (total === 0) {
    return `*${title}*\nלא נמצאו אורחים.\n${navFooter()}`;
  }

  const lines = slice.map((id, i) => {
    const g = byId.get(id);
    const name = g?.full_name || "ללא שם";
    const phone = g ? formatPhoneDisplay(g.phone) : "";
    return `${i + 1} ${name}${phone ? ` · ${phone}` : ""}`;
  });

  const more: string[] = [];
  if (hasPrev) more.push(`10 עמוד קודם`);
  if (hasMore) more.push(`11 עמוד הבא`);

  return `*${title}* (${total})
עמוד ${screen.page + 1} · ${start + 1}–${start + slice.length}

${lines.join("\n")}
${more.length ? `\n${more.join("\n")}\n` : ""}
בחרו מספר לצפייה בפרטים.
${navFooter()}`;
}

export function formatGuestFull(guest: Rsvp): string {
  const siteUrl = siteAbsoluteUrl();
  const link = inviteAbsoluteUrl(guest.invite_token, siteUrl);
  const manual = isManualPendingGuest(guest) ? "כן" : "לא";
  const lines = [
    `*${guest.full_name}*`,
    `טלפון: ${formatPhoneDisplay(guest.phone)}`,
    `סטטוס: ${STATUS_LABEL[guest.status]}`,
    `מספר אורחים: ${guest.status === "declined" ? 0 : guest.guest_count}`,
    `נוסף ידנית (ממתין): ${manual}`,
    `אישור סופי: ${guest.final_confirmed_at || "—"}`,
    `תזכורת: ${guest.reminder_sent_at ? `נשלחה (${guest.reminder_sent_at})` : "לא נשלחה"}`,
    `ברכת וידאו: ${guest.wants_video_blessing || "—"}`,
    `רוצה לדבר: ${guest.wants_to_speak || "—"}`,
    `התרגשות: ${guest.excitement ?? "—"}`,
    `הערות: ${guest.notes?.trim() || "—"}`,
    `קישור אישי:\n${link}`,
    `עודכן: ${guest.updated_at}`,
    `נוצר: ${guest.created_at}`,
  ];
  return `${lines.join("\n")}\n${navFooter()}`;
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
  all: Rsvp[]
): Promise<{ message: string; buttons: ReplyButton[]; footer?: string }> {
  const byId = new Map(all.map((r) => [r.id, r]));
  switch (screen.id) {
    case "main": {
      const page = screen.page ?? 0;
      return {
        message: renderMainMenu(page),
        buttons: mainPageButtons(page),
        footer: "או בחרו מספר מהרשימה",
      };
    }
    case "summary":
      return {
        message: renderSummary(await getSummary()),
        buttons: navButtons(),
      };
    case "search_prompt":
      return {
        message: renderSearchPrompt(),
        buttons: navButtons(),
        footer: "הקלידו שם או טלפון",
      };
    case "add_help":
      return {
        message: renderAddHelp(),
        buttons: navButtons(),
      };
    case "list": {
      const { hasMore, hasPrev } = pageSlice(screen.ids, screen.page);
      return {
        message: renderList(screen, byId),
        buttons: navButtons({ hasPrev, hasNext: hasMore }),
        footer: "בחרו מספר אורח מהרשימה",
      };
    }
    case "guest": {
      const guest =
        byId.get(screen.guestId) || (await getRsvpById(screen.guestId));
      if (!guest) {
        return {
          message: `אורח לא נמצא.\n${navFooter()}`,
          buttons: navButtons(),
        };
      }
      return {
        message: formatGuestFull(guest),
        buttons: navButtons(),
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
  const rendered = await renderScreen(saved!.screen, all);
  return {
    handled: true,
    exited,
    message: rendered.message,
    buttons: rendered.buttons,
    footer: rendered.footer,
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
      message: "יצאתם מהתפריט. לשוב — שלחו: עזרה",
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
    ממתינים: "pend",
    "ממתינים לאישור": "pend",
    "לא יודעים": "maybe",
    "עדיין לא יודעים": "maybe",
    "לא מגיעים": "no",
    "נוספו ידנית": "manual",
    "איך להוסיף": "addhelp",
    יציאה: "exit",
    אחורה: "back",
    חזרה: "back",
    תפריט: "home",
    "תפריט ראשי": "home",
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
      message: "יצאתם מהתפריט. לשוב — שלחו: עזרה",
    };
  }

  if (
    isHelpOrMenuOpen(text) ||
    isMenuHomeCommand(text) ||
    action === "home"
  ) {
    const opened = await goMain(phone, 0);
    const rendered = await renderScreen(opened!.screen, await listRsvps());
    return {
      handled: true,
      message: rendered.message,
      buttons: rendered.buttons,
      footer: rendered.footer,
    };
  }

  if (!session) return null;

  if (action === "back" || isMenuBackCommand(text)) {
    return goBack(phone, session);
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
    // Unknown button on non-main screens → gentle hint with nav buttons
    if (session.screen.id !== "main") {
      const rendered = await renderScreen(session.screen, await listRsvps());
      return {
        handled: true,
        message: `לא הבנתי. השתמשו בכפתורים או במספרים.\n\n${rendered.message}`,
        buttons: rendered.buttons,
        footer: rendered.footer,
      };
    }
    const rendered = await renderScreen(session.screen, await listRsvps());
    return {
      handled: true,
      message: `לא הבנתי. בחרו כפתור או מספר מהתפריט.\n\n${rendered.message}`,
      buttons: rendered.buttons,
      footer: rendered.footer,
    };
  }

  // Global 9 = home
  if (choice === 9) {
    const opened = await goMain(phone, 0);
    const rendered = await renderScreen(opened!.screen, await listRsvps());
    return {
      handled: true,
      message: rendered.message,
      buttons: rendered.buttons,
      footer: rendered.footer,
    };
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
      const rendered = await renderScreen(screen, await listRsvps());
      return {
        handled: true,
        message: `בחרו 1–8.\n\n${rendered.message}`,
        buttons: rendered.buttons,
        footer: rendered.footer,
      };
    }
    return openList(phone, session, filter);
  }

  if (screen.id === "summary" || screen.id === "add_help") {
    const rendered = await renderScreen(screen, await listRsvps());
    return {
      handled: true,
      message: `בחרו אחורה או תפריט.\n\n${rendered.message}`,
      buttons: rendered.buttons,
      footer: rendered.footer,
    };
  }

  if (screen.id === "search_prompt") {
    const rendered = await renderScreen(screen, await listRsvps());
    return {
      handled: true,
      message: rendered.message,
      buttons: rendered.buttons,
      footer: rendered.footer,
    };
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
    const rendered = await renderScreen(screen, await listRsvps());
    return {
      handled: true,
      message: `בחרו מספר מהרשימה, אחורה או תפריט.\n\n${rendered.message}`,
      buttons: rendered.buttons,
      footer: rendered.footer,
    };
  }

  if (screen.id === "guest") {
    const rendered = await renderScreen(screen, await listRsvps());
    return {
      handled: true,
      message: `בחרו אחורה או תפריט.\n\n${rendered.message}`,
      buttons: rendered.buttons,
      footer: rendered.footer,
    };
  }

  const opened = await goMain(phone, 0);
  const rendered = await renderScreen(opened!.screen, await listRsvps());
  return {
    handled: true,
    message: rendered.message,
    buttons: rendered.buttons,
    footer: rendered.footer,
  };
}

export { isHelpOrMenuOpen };
