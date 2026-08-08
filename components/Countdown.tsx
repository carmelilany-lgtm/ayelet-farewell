"use client";

import { useEffect, useState } from "react";

/** 7 בספטמבר 2026, 18:00 שעון ישראל */
const TARGET = new Date("2026-09-07T18:00:00+03:00").getTime();

type Parts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function getParts(now: number): Parts | null {
  const diff = TARGET - now;
  if (diff <= 0) return null;
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function Countdown() {
  const [parts, setParts] = useState<Parts | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const tick = () => {
      setParts(getParts(Date.now()));
      setReady(true);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!ready) {
    return (
      <div className="countdown" aria-hidden="true">
        <div className="countdown-unit">
          <span className="countdown-value">––</span>
          <span className="countdown-label">ימים</span>
        </div>
        <div className="countdown-unit">
          <span className="countdown-value">––</span>
          <span className="countdown-label">שעות</span>
        </div>
        <div className="countdown-unit">
          <span className="countdown-value">––</span>
          <span className="countdown-label">דקות</span>
        </div>
        <div className="countdown-unit">
          <span className="countdown-value">––</span>
          <span className="countdown-label">שניות</span>
        </div>
      </div>
    );
  }

  if (!parts) {
    return (
      <p className="countdown-done" role="status">
        הערב התחיל — נתראה!
      </p>
    );
  }

  return (
    <div
      className="countdown"
      role="timer"
      aria-live="polite"
      aria-label={`נותרו ${parts.days} ימים, ${parts.hours} שעות, ${parts.minutes} דקות ו־${parts.seconds} שניות`}
    >
      <div className="countdown-unit">
        <span className="countdown-value">{parts.days}</span>
        <span className="countdown-label">ימים</span>
      </div>
      <div className="countdown-unit">
        <span className="countdown-value">{pad(parts.hours)}</span>
        <span className="countdown-label">שעות</span>
      </div>
      <div className="countdown-unit">
        <span className="countdown-value">{pad(parts.minutes)}</span>
        <span className="countdown-label">דקות</span>
      </div>
      <div className="countdown-unit">
        <span className="countdown-value">{pad(parts.seconds)}</span>
        <span className="countdown-label">שניות</span>
      </div>
    </div>
  );
}
