"use client";

import { useEffect, useRef } from "react";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  length?: number;
};

function digitsOnly(raw: string, max: number) {
  return raw.replace(/\D/g, "").slice(0, max);
}

/** Prefer an exact N-digit code; also accept "123456 is your…" style strings. */
function extractOtp(raw: string, length: number): string {
  const exact = raw.trim().match(new RegExp(`(?<!\\d)(\\d{${length}})(?!\\d)`));
  if (exact?.[1]) return exact[1];
  return digitsOnly(raw, length);
}

export function OtpCodeInput({
  id = "code",
  value,
  onChange,
  label,
  disabled = false,
  length = 6,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (disabled) return;
    inputRef.current?.focus();
  }, [disabled]);

  // After "Copy code" in WhatsApp: try clipboard when returning to the page.
  useEffect(() => {
    if (disabled || typeof window === "undefined") return;
    if (!navigator.clipboard?.readText) return;

    async function tryClipboard() {
      if (valueRef.current.length >= length) return;
      try {
        const text = await navigator.clipboard.readText();
        const code = extractOtp(text, length);
        if (code.length === length) onChangeRef.current(code);
      } catch {
        /* clipboard permission / iOS without gesture */
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") void tryClipboard();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tryClipboard);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tryClipboard);
    };
  }, [disabled, length]);

  // Android Chrome WebOTP (SMS only — kept as progressive enhancement).
  useEffect(() => {
    if (disabled || typeof window === "undefined") return;
    const credentials = (
      navigator as Navigator & {
        credentials?: {
          get: (opts: unknown) => Promise<{ code?: string } | null>;
        };
      }
    ).credentials;
    if (!credentials || !("OTPCredential" in window)) return;

    const ac = new AbortController();
    void credentials
      .get({
        otp: { transport: ["sms"] },
        signal: ac.signal,
      })
      .then((cred) => {
        const code = extractOtp(String(cred?.code ?? ""), length);
        if (code.length === length) onChangeRef.current(code);
      })
      .catch(() => {
        /* cancelled / unsupported */
      });

    return () => ac.abort();
  }, [disabled, length]);

  return (
    <div className="otp-code-field" dir="ltr">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>

      <input
        ref={inputRef}
        id={id}
        className="otp-autofill-input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        name="one-time-code"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        pattern="[0-9]*"
        maxLength={length}
        dir="ltr"
        disabled={disabled}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(digitsOnly(e.target.value, length))}
        onFocus={() => {
          // Tap field after copying in WhatsApp — best chance for clipboard read.
          if (!navigator.clipboard?.readText) return;
          if (valueRef.current.length >= length) return;
          void navigator.clipboard
            .readText()
            .then((text) => {
              const code = extractOtp(text, length);
              if (code.length === length) onChangeRef.current(code);
            })
            .catch(() => {});
        }}
        onPaste={(e) => {
          e.preventDefault();
          onChange(extractOtp(e.clipboardData.getData("text"), length));
        }}
      />

      <div className="otp-slots" dir="ltr" aria-hidden="true">
        {digits.map((digit, index) => {
          const active =
            value.length === index ||
            (value.length === length && index === length - 1);
          return (
            <div
              key={index}
              className={`otp-slot-display${digit ? " filled" : ""}${active ? " active" : ""}`}
            >
              {digit}
            </div>
          );
        })}
      </div>
    </div>
  );
}
