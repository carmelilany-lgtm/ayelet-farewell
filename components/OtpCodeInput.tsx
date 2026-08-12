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
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (disabled) return;
    inputRef.current?.focus();
  }, [disabled]);

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
