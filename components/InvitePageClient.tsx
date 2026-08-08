"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RsvpForm } from "@/components/RsvpForm";
import { SmoothScrollLink } from "@/components/SmoothScrollLink";
import type { SiteContent } from "@/lib/site-content";
import {
  thankYouMessage,
  type ThankYouKind,
} from "@/lib/thank-you";
import type { PublicInviteView } from "@/lib/types";

const THANKS_KINDS = new Set<ThankYouKind>([
  "confirmed",
  "updated",
  "declined",
  "maybe",
]);

export function InvitePageClient({
  token,
  invite,
  content,
}: {
  token: string;
  invite: PublicInviteView;
  content: SiteContent;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialThanks = useMemo(() => {
    const raw = searchParams.get("thanks");
    if (raw && THANKS_KINDS.has(raw as ThankYouKind)) {
      return raw as ThankYouKind;
    }
    return null;
  }, [searchParams]);

  const [thanksKind, setThanksKind] = useState<ThankYouKind | null>(
    initialThanks
  );
  const [canLogout, setCanLogout] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        setCanLogout(Boolean(data.guest));
      })
      .catch(() => setCanLogout(false));
  }, []);

  async function logout() {
    await fetch("/api/auth/me", { method: "DELETE" });
    setCanLogout(false);
    router.replace("/#rsvp");
  }

  if (thanksKind) {
    return (
      <div className="success-panel animate-fade-up" role="status">
        <p className="success-body">
          {thankYouMessage(thanksKind, content)}
        </p>
        <div className="rsvp-summary-actions">
          <button
            type="button"
            className="submit-btn"
            onClick={() => setThanksKind(null)}
          >
            {content.updateStatusLabel}
          </button>
          <SmoothScrollLink className="submit-btn ghost" href="#details">
            {content.viewProgramLabel}
          </SmoothScrollLink>
        </div>
        {canLogout && (
          <button type="button" className="text-link-btn" onClick={logout}>
            {content.logoutLabel}
          </button>
        )}
      </div>
    );
  }

  return <RsvpForm token={token} invite={invite} content={content} />;
}
