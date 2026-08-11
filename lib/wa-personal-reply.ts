import {
  resolveWhatsAppChatId,
  sendWhatsAppText,
  sendWhatsAppTyping,
} from "./green-api";
import { normalizePhone } from "./phone";
import { logWhatsAppOutbound } from "./system-log";
import { resolveAllowlistedPhone } from "./wa-joke";
import {
  commitPersonalReply,
  enqueuePersonalInbound,
  getPersonalSession,
  isPersonalSeqCurrent,
} from "./wa-personal-session";
import {
  PERSONAL_REPLY_SYSTEM_PROMPT,
  PERSONAL_STYLE_EXAMPLES,
} from "./wa-personal-style";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Env allowlist — only these phones get personal Carmel-style auto-replies. */
export function personalReplyAuthorizedPhones(): string[] {
  const raw = process.env.PERSONAL_AUTO_REPLY_PHONES?.trim() || "";
  const phones = raw
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => normalizePhone(p) || p)
    .filter(Boolean) as string[];
  return [...new Set(phones)];
}

export function hasPersonalAutoReplyConfig(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() &&
      personalReplyAuthorizedPhones().length > 0
  );
}

export async function resolvePersonalReplyPhone(
  senderChatId: string
): Promise<string | null> {
  if (!hasPersonalAutoReplyConfig()) return null;
  return resolveAllowlistedPhone(
    senderChatId,
    personalReplyAuthorizedPhones()
  );
}

function openaiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

function clampBubble(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

function parseBubbles(raw: string): string[] {
  const trimmed = raw.trim();
  try {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    const json = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
    const parsed = JSON.parse(json) as { bubbles?: unknown };
    if (Array.isArray(parsed.bubbles)) {
      const bubbles = parsed.bubbles
        .filter((b): b is string => typeof b === "string")
        .map(clampBubble)
        .filter(Boolean)
        .slice(0, 3);
      if (bubbles.length) return bubbles;
    }
  } catch {
    // fall through
  }

  // Fallback: split lines / treat as one bubble
  const lines = trimmed
    .split(/\n+/)
    .map(clampBubble)
    .filter((l) => l && !l.startsWith("{") && !l.startsWith("}"))
    .slice(0, 3);
  return lines.length ? lines : ["מה קורה?"];
}

function buildUserPrompt(opts: {
  pending: string[];
  history: { role: "her" | "him"; text: string }[];
}): string {
  const examples = PERSONAL_STYLE_EXAMPLES.map(
    (ex) =>
      `היא: ${ex.her}\nכרמל: ${ex.him.map((b) => `• ${b}`).join("\n")}`
  ).join("\n\n");

  const recent = opts.history
    .slice(-24)
    .map((t) => `${t.role === "her" ? "היא" : "כרמל"}: ${t.text}`)
    .join("\n");

  const pendingBlock = opts.pending.map((t) => `- ${t}`).join("\n");

  return `דוגמאות סגנון אמיתיות:
${examples}

היסטוריה אחרונה בצ׳אט (אם יש):
${recent || "(ריק)"}

ההודעות החדשות שלה (אולי כמה ברצף — ענה פעם אחת על כולן):
${pendingBlock}

החזר JSON עם bubbles בלבד.`;
}

async function generateBubbles(opts: {
  pending: string[];
  history: { role: "her" | "him"; text: string }[];
}): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return ["מה קורה?"];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openaiModel(),
      temperature: 0.85,
      max_tokens: 180,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PERSONAL_REPLY_SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(opts) },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("OpenAI personal reply failed", res.status, errText.slice(0, 300));
    return ["מה קורה?"];
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content || "";
  return parseBubbles(content);
}

/** Random human-ish pause before starting to "type". */
function initialReadDelayMs(): number {
  return 2500 + Math.floor(Math.random() * 4500); // 2.5–7s
}

function typingMsForBubble(text: string): number {
  const base = 1200 + text.length * 45;
  const jitter = Math.floor(Math.random() * 900);
  return Math.min(8000, Math.max(1500, base + jitter));
}

/**
 * Personal Carmel-style auto-reply for allowlisted phones only.
 * Debounces rapid inbound messages; shows typing; sends 1–3 short bubbles.
 * Never throws — returns false on skip/failure.
 */
export async function handlePersonalAutoReply(opts: {
  phone: string;
  text: string;
}): Promise<boolean> {
  if (!hasPersonalAutoReplyConfig()) return false;

  const text = opts.text.trim();
  if (!text) return false;

  // Never hijack party/joke/RSVP keywords if they somehow land here.
  if (/^(בדיחה|עוד|עזרה)[!?.]*$/i.test(text)) return false;
  if (/^rsvp_/i.test(text)) return false;

  const queued = await enqueuePersonalInbound(opts.phone, text);
  if (!queued) return false;
  const { seq } = queued;

  await sleep(initialReadDelayMs());

  if (!(await isPersonalSeqCurrent(opts.phone, seq))) {
    return false; // newer message will answer
  }

  const session = await getPersonalSession(opts.phone);
  if (!session || session.seq !== seq) return false;

  const pending = session.pending.map((p) => p.text);
  if (!pending.length) return false;

  let bubbles: string[];
  try {
    bubbles = await generateBubbles({
      pending,
      history: session.history,
    });
  } catch (err) {
    console.error("personal reply generate failed", err);
    bubbles = ["מה קורה?"];
  }

  if (!(await isPersonalSeqCurrent(opts.phone, seq))) {
    return false;
  }

  const chatId = await resolveWhatsAppChatId(opts.phone);

  for (let i = 0; i < bubbles.length; i++) {
    if (!(await isPersonalSeqCurrent(opts.phone, seq))) {
      return false;
    }
    const bubble = bubbles[i]!;
    const typingMs = typingMsForBubble(bubble);
    await sendWhatsAppTyping(opts.phone, typingMs, chatId);
    await sleep(typingMs);

    if (!(await isPersonalSeqCurrent(opts.phone, seq))) {
      return false;
    }

    const sent = await sendWhatsAppText(opts.phone, bubble, chatId);
    void logWhatsAppOutbound({
      phone: opts.phone,
      purpose: "personal_auto_reply",
      ok: sent.ok,
      error: sent.ok ? undefined : sent.error,
      message: bubble,
      actor: "whatsapp",
      messageId: sent.ok ? sent.idMessage : null,
    });

    if (i < bubbles.length - 1) {
      await sleep(400 + Math.floor(Math.random() * 700));
    }
  }

  await commitPersonalReply({
    phone: opts.phone,
    seq,
    bubbles,
  });

  return true;
}
