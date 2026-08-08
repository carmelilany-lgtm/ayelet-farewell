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

const STATUS_LABEL: Record<RsvpStatus, string> = {
  imported: "ממתין לאישור",
  confirmed: "אושר הגעה",
  declined: "לא מגיע/ה",
  maybe: "עדיין לא יודע/ת",
};

function navFooter(opts?: { onMain?: boolean }): string {
  if (opts?.onMain) {
    return `\n0 יציאה מהתפריט`;
  }
  return `\n0 אחורה\n9 תפריט ראשי`;
}

export function renderMainMenu(): string {
  return `*תפריט מארגנים*
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

function renderList(screen: Extract<MenuScreen, { id: "list" }>, byId: Map<string, Rsvp>): string {
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
): Promise<string> {
  const byId = new Map(all.map((r) => [r.id, r]));
  switch (screen.id) {
    case "main":
      return renderMainMenu();
    case "summary":
      return renderSummary(await getSummary());
    case "search_prompt":
      return renderSearchPrompt();
    case "add_help":
      return renderAddHelp();
    case "list":
      return renderList(screen, byId);
    case "guest": {
      const guest = byId.get(screen.guestId) || (await getRsvpById(screen.guestId));
      if (!guest) return `אורח לא נמצא.\n${navFooter()}`;
      return formatGuestFull(guest);
    }
  }
}

function goMain(sessionPhone: string) {
  return saveOrganizerMenuSession(sessionPhone, { id: "main" }, []);
}

async function goBack(
  sessionPhone: string,
  session: OrganizerMenuSession
): Promise<{ session: OrganizerMenuSession; message: string } | { exit: true; message: string }> {
  if (session.screen.id === "main" || session.stack.length === 0) {
    await clearOrganizerMenuSession(sessionPhone);
    return { exit: true, message: "יצאתם מהתפריט. לשוב — שלחו: עזרה" };
  }
  const stack = [...session.stack];
  const prev = stack.pop()!;
  const saved = await saveOrganizerMenuSession(sessionPhone, prev, stack);
  const all = await listRsvps();
  return {
    session: saved!,
    message: await renderScreen(prev, all),
  };
}

async function pushScreen(
  sessionPhone: string,
  session: OrganizerMenuSession | null,
  next: MenuScreen
): Promise<{ session: OrganizerMenuSession; message: string }> {
  const stack = session ? [...session.stack, session.screen] : [];
  const saved = await saveOrganizerMenuSession(
    sessionPhone,
    next,
    next.id === "main" ? [] : stack
  );
  const all = await listRsvps();
  return {
    session: saved!,
    message: await renderScreen(next, all),
  };
}

function parseChoice(text: string): number | null {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  return Number(t);
}

/**
 * Handle organizer menu. Returns null if the message should fall through
 * (e.g. no active session and not opening help).
 */
export async function handleOrganizerMenu(opts: {
  organizerPhone: string;
  text: string;
}): Promise<{ handled: true; message: string; exited?: boolean } | null> {
  const phone = opts.organizerPhone;
  const text = opts.text.trim();
  let session = await getOrganizerMenuSession(phone);

  if (isMenuExitCommand(text)) {
    await clearOrganizerMenuSession(phone);
    return {
      handled: true,
      exited: true,
      message: "יצאתם מהתפריט. לשוב — שלחו: עזרה",
    };
  }

  if (isHelpOrMenuOpen(text) || isMenuHomeCommand(text)) {
    const opened = await goMain(phone);
    return {
      handled: true,
      message: await renderScreen(opened!.screen, await listRsvps()),
    };
  }

  if (!session) return null;

  if (isMenuBackCommand(text)) {
    const result = await goBack(phone, session);
    if ("exit" in result) {
      return { handled: true, exited: true, message: result.message };
    }
    return { handled: true, message: result.message };
  }

  // Search prompt: free text (not a lone digit nav we already handled)
  if (session.screen.id === "search_prompt") {
    const choice = parseChoice(text);
    if (choice === null) {
      const all = await listRsvps();
      const matches = filterGuests(all, { kind: "search", query: text });
      const next: MenuScreen = {
        id: "list",
        filter: { kind: "search", query: text.trim() },
        ids: matches.map((r) => r.id),
        page: 0,
      };
      const pushed = await pushScreen(phone, session, next);
      return { handled: true, message: pushed.message };
    }
  }

  const choice = parseChoice(text);
  if (choice === null) {
    return {
      handled: true,
      message: `לא הבנתי. בחרו מספר מהתפריט, או שלחו 9 לתפריט ראשי.\n${navFooter({ onMain: session.screen.id === "main" })}`,
    };
  }

  // Global 9 = home (also covered by isMenuHomeCommand for "9")
  if (choice === 9) {
    const opened = await goMain(phone);
    return {
      handled: true,
      message: await renderScreen(opened!.screen, await listRsvps()),
    };
  }

  if (choice === 0) {
    const result = await goBack(phone, session);
    if ("exit" in result) {
      return { handled: true, exited: true, message: result.message };
    }
    return { handled: true, message: result.message };
  }

  session = (await getOrganizerMenuSession(phone)) || session;
  const screen = session.screen;

  if (screen.id === "main") {
    const map: Record<number, MenuScreen | null> = {
      1: { id: "summary" },
      2: { id: "search_prompt" },
      3: null, // filled below with list
      4: null,
      5: null,
      6: null,
      7: null,
      8: { id: "add_help" },
    };

    if (choice === 1 || choice === 2 || choice === 8) {
      const pushed = await pushScreen(phone, session, map[choice]!);
      return { handled: true, message: pushed.message };
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
      return {
        handled: true,
        message: `בחרו 1–8.\n${renderMainMenu()}`,
      };
    }
    const all = await listRsvps();
    const matches = filterGuests(all, filter);
    const next: MenuScreen = {
      id: "list",
      filter,
      ids: matches.map((r) => r.id),
      page: 0,
    };
    const pushed = await pushScreen(phone, session, next);
    return { handled: true, message: pushed.message };
  }

  if (screen.id === "summary" || screen.id === "add_help") {
    return {
      handled: true,
      message: `בחרו 0 אחורה או 9 תפריט ראשי.\n${navFooter()}`,
    };
  }

  if (screen.id === "search_prompt") {
    return {
      handled: true,
      message: renderSearchPrompt(),
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
      const pushed = await pushScreen(phone, session, next);
      return { handled: true, message: pushed.message };
    }
    if (choice === 10 && hasPrev) {
      const next: MenuScreen = { ...screen, page: screen.page - 1 };
      const saved = await saveOrganizerMenuSession(
        phone,
        next,
        session.stack
      );
      return {
        handled: true,
        message: await renderScreen(saved!.screen, await listRsvps()),
      };
    }
    if (choice === 11 && hasMore) {
      const next: MenuScreen = { ...screen, page: screen.page + 1 };
      const saved = await saveOrganizerMenuSession(
        phone,
        next,
        session.stack
      );
      return {
        handled: true,
        message: await renderScreen(saved!.screen, await listRsvps()),
      };
    }
    return {
      handled: true,
      message: `בחרו מספר מהרשימה, 0 אחורה או 9 תפריט.\n${navFooter()}`,
    };
  }

  if (screen.id === "guest") {
    return {
      handled: true,
      message: `בחרו 0 אחורה או 9 תפריט ראשי.\n${navFooter()}`,
    };
  }

  return {
    handled: true,
    message: renderMainMenu(),
  };
}

export { isHelpOrMenuOpen };
