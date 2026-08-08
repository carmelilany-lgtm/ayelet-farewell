import { inviteAbsoluteUrl } from "./invite-token";
import { getSiteContent } from "./site-content";

export async function buildReminderMessage(opts: {
  fullName: string;
  inviteToken: string;
  origin?: string;
}): Promise<string> {
  const content = await getSiteContent();
  const link = inviteAbsoluteUrl(opts.inviteToken, opts.origin);
  const program = content.programItems.map((item) => `• ${item}`).join("\n");

  return `שלום ${opts.fullName},

${content.reminderIntro}

${content.dateTime}
${content.place}

${content.programTitle}:
${program}

${content.hosts}

${content.giftNote}

כדי שנוכל לסגור את הפרטים, נשמח לאישור הגעה סופי בקישור האישי שלכם:
${link}

${content.reminderOutro}`;
}
