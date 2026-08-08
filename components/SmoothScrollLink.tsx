"use client";

import type { ReactNode } from "react";

type Props = {
  href: string;
  className?: string;
  children: ReactNode;
};

export function SmoothScrollLink({ href, className, children }: Props) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (!href.startsWith("#") || href.length < 2) return;
        const target = document.getElementById(href.slice(1));
        if (!target) return;

        e.preventDefault();
        const reduce = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;
        target.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "start",
        });
        window.history.pushState(null, "", href);
      }}
    >
      {children}
    </a>
  );
}
