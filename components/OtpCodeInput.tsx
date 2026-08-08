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

export function OtpCodeInput({
  id = "code",
  value,
  onChange,
  label,
  disabled = false,
  length = 6,
}: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (disabled) return;
    refs.current[0]?.focus();
  }, [disabled]);

  function setDigitAt(index: number, char: string) {
    const next = digits.slice();
    next[index] = char;
    onChange(next.join("").replace(/\s/g, "").slice(0, length));
  }

  function applyCode(raw: string, startIndex = 0) {
    const incoming = digitsOnly(raw, length);
    if (!incoming) return;
    const next = digits.slice();
    for (let i = 0; i < incoming.length && startIndex + i < length; i++) {
      next[startIndex + i] = incoming[i]!;
    }
    const joined = next.join("").slice(0, length);
    onChange(joined);
    const focusAt = Math.min(startIndex + incoming.length, length - 1);
    refs.current[focusAt]?.focus();
  }

  return (
    <div className="otp-code-field" dir="ltr">
      <label htmlFor={`${id}-0`} className="sr-only">
        {label}
      </label>
      <div className="otp-slots" dir="ltr" role="group" aria-label={label}>
        {digits.map((digit, index) => {
          const active = value.length === index || (value.length === length && index === length - 1);
          return (
            <input
              key={index}
              id={index === 0 ? id : `${id}-${index}`}
              ref={(el) => {
                refs.current[index] = el;
              }}
              className={`otp-slot-input${digit ? " filled" : ""}${active ? " active" : ""}`}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              name={index === 0 ? "one-time-code" : undefined}
              pattern="[0-9]*"
              maxLength={index === 0 ? length : 1}
              dir="ltr"
              disabled={disabled}
              aria-label={`${label} ספרה ${index + 1}`}
              value={digit}
              onChange={(e) => {
                const raw = e.target.value;
                // SMS autofill / paste into first box may deliver the full code.
                if (raw.length > 1) {
                  applyCode(raw, index === 0 ? 0 : index);
                  return;
                }
                const d = digitsOnly(raw, 1);
                setDigitAt(index, d);
                if (d && index < length - 1) {
                  refs.current[index + 1]?.focus();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Backspace") {
                  e.preventDefault();
                  if (digits[index]) {
                    setDigitAt(index, "");
                    return;
                  }
                  if (index > 0) {
                    setDigitAt(index - 1, "");
                    refs.current[index - 1]?.focus();
                  }
                  return;
                }
                if (e.key === "ArrowLeft" && index > 0) {
                  e.preventDefault();
                  refs.current[index - 1]?.focus();
                }
                if (e.key === "ArrowRight" && index < length - 1) {
                  e.preventDefault();
                  refs.current[index + 1]?.focus();
                }
              }}
              onPaste={(e) => {
                e.preventDefault();
                applyCode(e.clipboardData.getData("text"), 0);
              }}
              onFocus={(e) => e.target.select()}
            />
          );
        })}
      </div>
    </div>
  );
}
