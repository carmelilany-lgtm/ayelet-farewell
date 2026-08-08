type IconProps = {
  className?: string;
};

function Svg({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconMusic({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </Svg>
  );
}

export function IconPlate({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
    </Svg>
  );
}

export function IconDance({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v5l-3 4M12 12l3 4M9 11h6" />
      <path d="M8 21l2-5M16 21l-2-5" />
    </Svg>
  );
}

export function IconSparkle({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5" />
      <circle cx="12" cy="12" r="2" />
    </Svg>
  );
}

export function IconMic({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
    </Svg>
  );
}

export function IconGift({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="10" width="18" height="11" rx="1" />
      <path d="M12 10v11M3 14h18" />
      <path d="M12 10c-2-3-5-3-5-1.5S9 11 12 10c3-1 5-3 5-1.5S14 7 12 10Z" />
    </Svg>
  );
}

export function IconNav({ className }: IconProps) {
  return (
    <Svg className={className}>
      {/* Waze ghost mark */}
      <path d="M12 2.8c-4.6 0-8.2 3.5-8.2 7.8 0 2.5 1.2 4.7 3 6.1L6 21.2l3.4-1.9c.8.3 1.7.4 2.6.4 4.6 0 8.2-3.5 8.2-7.9S16.6 2.8 12 2.8Z" />
      <circle cx="9.2" cy="10.1" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="10.1" r="1.15" fill="currentColor" stroke="none" />
      <path d="M9.1 13.3c.9 1 1.9 1.45 2.9 1.45s2-.45 2.9-1.45" />
    </Svg>
  );
}

export function IconMap({ className }: IconProps) {
  return (
    <Svg className={className}>
      {/* Folded map */}
      <path d="M9.2 4.2 3.5 6.1v13.2l5.7-1.9 5.6 1.9 5.7-1.9V4.2l-5.7 1.9-5.6-1.9Z" />
      <path d="M9.2 4.2v13.2M14.8 6.1v13.2" />
      <circle cx="12" cy="11.2" r="1.7" />
    </Svg>
  );
}

export function IconBit({ className }: IconProps) {
  return (
    <Svg className={className}>
      {/* Payment card / Bit transfer */}
      <rect x="2.8" y="5.5" width="18.4" height="13" rx="2.2" />
      <path d="M2.8 9.6h18.4" />
      <path d="M7 14.2h4.2" />
      <circle cx="16.4" cy="14.2" r="1.15" />
    </Svg>
  );
}

export function iconForProgramItem(item: string, index: number) {
  const t = item.toLowerCase();
  if (
    t.includes("ריקוד") ||
    t.includes("dj") ||
    t.includes("די.ג׳יי") ||
    t.includes("די ג׳יי")
  ) {
    return IconDance;
  }
  if (
    t.includes("ארוח") ||
    t.includes("אוכל") ||
    t.includes("קייטרינג") ||
    t.includes("גורמה") ||
    t.includes("ביסטרו")
  ) {
    return IconPlate;
  }
  if (
    t.includes("ברכ") ||
    t.includes("מוזיק") ||
    t.includes("שיר") ||
    t.includes("נגינ")
  ) {
    return IconMusic;
  }
  const fallbacks = [IconMusic, IconPlate, IconDance, IconSparkle];
  return fallbacks[index % fallbacks.length];
}
