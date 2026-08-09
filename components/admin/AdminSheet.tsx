"use client";

import { useEffect, useId, useRef } from "react";

type AdminSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Larger sheet for forms / guest detail */
  size?: "default" | "tall";
};

export function AdminSheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = "default",
}: AdminSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="admin-sheet-root" role="presentation">
      <button
        type="button"
        className="admin-sheet-backdrop"
        aria-label="סגירה"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`admin-sheet-panel ${size === "tall" ? "tall" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="admin-sheet-handle" aria-hidden="true" />
        <header className="admin-sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="admin-sheet-close"
            onClick={onClose}
            aria-label="סגירה"
          >
            ✕
          </button>
        </header>
        <div className="admin-sheet-body">{children}</div>
        {footer ? <footer className="admin-sheet-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

type ConfirmSheetProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <AdminSheet
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="admin-confirm-actions">
          <button
            type="button"
            className="admin-btn ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`admin-btn ${danger ? "danger" : "primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="admin-confirm-message">{message}</p>
    </AdminSheet>
  );
}
