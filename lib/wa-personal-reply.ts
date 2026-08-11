import {
  resolveWhatsAppChatId,
  sendWhatsAppText,
  sendWhatsAppTyping,
} from "./green-api";
import { normalizePhone } from "./phone";
import { logWhatsAppOutbound } from "./system-log";
import { resolveAllowlistedPhone } from "./wa-joke";
import {
  clearPersonalPendingIfSeq,
  commitPersonalReply,
  enqueuePersonalInbound,
  getPersonalSession,
  isPersonalSeqCurrent,
} from "./wa-personal-session";
import {
  PERSONAL_RELATIONSHIP_MEMORY,
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

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBubbles(raw: string): string[] | null {
  const trimmed = raw.trim();
  try {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    const json =
      start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
    const parsed = JSON.parse(json) as { bubbles?: unknown };
    if (Array.isArray(parsed.bubbles)) {
      const bubbles = parsed.bubbles
        .filter((b): b is string => typeof b === "string")
        .map(clampBubble)
        .filter(Boolean)
        .slice(0, 4);
      return bubbles.length ? bubbles : null;
    }
  } catch {
    // fall through
  }

  const lines = trimmed
    .split(/\n+/)
    .map(clampBubble)
    .filter((l) => l && !l.startsWith("{") && !l.startsWith("}"))
    .slice(0, 4);
  return lines.length ? lines : null;
}

function filterRepeatedBubbles(
  bubbles: string[],
  recentHim: string[]
): string[] {
  const banned = new Set(
    recentHim.map(normalizeForCompare).filter(Boolean)
  );
  const out: string[] = [];
  const used = new Set<string>();
  for (const bubble of bubbles) {
    const key = normalizeForCompare(bubble);
    if (!key) continue;
    if (banned.has(key)) continue;
    if (used.has(key)) continue;
    used.add(key);
    out.push(bubble);
  }
  return out;
}

function buildUserPrompt(opts: {
  pending: string[];
  history: { role: "her" | "him"; text: string }[];
}): string {
  const examples = PERSONAL_STYLE_EXAMPLES.map(
    (ex) =>
      `(voice sample only) her: ${ex.her} → Carmel: ${ex.him.join(" | ")}`
  ).join("\n");

  // Prefer last ~30 turns (engine §40).
  const recent = opts.history
    .slice(-30)
    .map((t) => `${t.role === "her" ? "her" : "Carmel"}: ${t.text}`)
    .join("\n");

  const recentHim = opts.history
    .filter((t) => t.role === "him")
    .slice(-8)
    .map((t) => t.text);

  const pendingBlock = opts.pending.map((t, i) => `${i + 1}. ${t}`).join("\n");

  return `${PERSONAL_RELATIONSHIP_MEMORY}

Voice samples (DO NOT copy unless this exact situation):
${examples}

Recent conversation (highest priority):
${recent || "(empty)"}

Carmel's recent lines — do NOT repeat:
${recentHim.length ? recentHim.map((t) => `- ${t}`).join("\n") : "(none)"}

Incoming message(s) from her NOW — respond to THESE:
${pendingBlock}

Silently classify + filter (anti-AI / anti-parrot), then return JSON bubbles only.`;
}

async function callOpenAi(opts: {
  pending: string[];
  history: { role: "her" | "him"; text: string }[];
  retryHint?: string;
}): Promise<string[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("personal reply: OPENAI_API_KEY missing");
    return null;
  }

  const userContent =
    buildUserPrompt(opts) +
    (opts.retryHint ? `\n\n${opts.retryHint}` : "");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openaiModel(),
      temperature: 0.9,
      presence_penalty: 0.55,
      frequency_penalty: 0.45,
      max_tokens: 160,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PERSONAL_REPLY_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      "OpenAI personal reply failed",
      res.status,
      errText.slice(0, 400)
    );
    return null;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content || "";
  return parseBubbles(content);
}

async function generateBubbles(opts: {
  pending: string[];
  history: { role: "her" | "him"; text: string }[];
}): Promise<string[] | null> {
  const recentHim = opts.history
    .filter((t) => t.role === "him")
    .slice(-8)
    .map((t) => t.text);

  let bubbles = await callOpenAi(opts);
  if (!bubbles) return null;

  bubbles = filterRepeatedBubbles(bubbles, recentHim);
  if (bubbles.length) return bubbles;

  // One retry if model echoed old lines.
  bubbles = await callOpenAi({
    ...opts,
    retryHint:
      "התשובה הקודמת הייתה חזרה על משהו ישן. כתוב משהו חדש שקשור רק להודעות החדשות שלה.",
  });
  if (!bubbles) return null;
  bubbles = filterRepeatedBubbles(bubbles, recentHim);
  return bubbles.length ? bubbles : null;
}

/** Short human-ish pause before typing (kept modest for webhook reliability). */
function initialReadDelayMs(): number {
  return 1800 + Math.floor(Math.random() * 2200); // 1.8–4s
}

function typingMsForBubble(text: string): number {
  const base = 900 + text.length * 35;
  const jitter = Math.floor(Math.random() * 600);
  return Math.min(4500, Math.max(1200, base + jitter));
}

/**
 * Personal Carmel-style auto-reply for allowlisted phones only.
 * Debounces rapid inbound messages; shows typing; sends 1–3 short bubbles.
 * Never throws — returns false on skip/failure. Does NOT send a generic
 * fallback spam line when the model fails.
 */
export async function handlePersonalAutoReply(opts: {
  phone: string;
  text: string;
  messageId?: string | null;
}): Promise<boolean> {
  if (!hasPersonalAutoReplyConfig()) return false;

  const text = opts.text.trim();
  if (!text) return false;

  // Never hijack party/joke/RSVP keywords if they somehow land here.
  if (/^(בדיחה|עוד|עזרה)[!?.]*$/i.test(text)) return false;
  if (/^rsvp_/i.test(text)) return false;

  const queued = await enqueuePersonalInbound(
    opts.phone,
    text,
    opts.messageId
  );
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

  let bubbles: string[] | null;
  try {
    bubbles = await generateBubbles({
      pending,
      history: session.history,
    });
  } catch (err) {
    console.error("personal reply generate failed", err);
    bubbles = null;
  }

  if (!bubbles?.length) {
    await clearPersonalPendingIfSeq(opts.phone, seq);
    console.error("personal reply skipped: no contextual bubbles", {
      phone: opts.phone,
      pending,
    });
    return false;
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
      await sleep(350 + Math.floor(Math.random() * 500));
    }
  }

  await commitPersonalReply({
    phone: opts.phone,
    seq,
    bubbles,
  });

  return true;
}
