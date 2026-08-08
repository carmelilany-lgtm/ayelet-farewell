"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  imageSrc?: string;
  label?: string;
};

export function InviteViewer({
  imageSrc = "/invite.jpg",
  label = "צפייה בהזמנה",
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const modal =
    open && mounted
      ? createPortal(
          <div
            className="invite-lightbox"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={() => setOpen(false)}
          >
            <button
              type="button"
              className="invite-lightbox-close"
              aria-label="סגירה"
              onClick={() => setOpen(false)}
            >
              <svg
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>

            <h2 id={titleId} className="sr-only">
              ההזמנה המקורית
            </h2>

            <figure
              className="invite-lightbox-figure"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={imageSrc}
                alt="ההזמנה המקורית למסיבת הפרידה"
                className="invite-lightbox-image"
              />
            </figure>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        className="hero-text-link"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {modal}
    </>
  );
}
