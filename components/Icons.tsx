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
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  );
}

export function IconMap({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </Svg>
  );
}

export function IconBit({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 14h4" />
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
