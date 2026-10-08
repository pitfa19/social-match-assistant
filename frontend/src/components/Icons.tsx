import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8.5" r="3.7" />
      <path d="M4.8 20c.9-3.6 3.7-5.5 7.2-5.5s6.3 1.9 7.2 5.5" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12l16-7-6 15-2.5-6.2z" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7" />
    </svg>
  );
}

/**
 * Decorative hero motif: two open rings that overlap and are held together by
 * a single thread. Purely a drawing, carries no information.
 */
export function MatchMotif(props: IconProps) {
  return (
    <svg
      viewBox="0 0 520 420"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <g className="motif-orbit" stroke="currentColor" strokeWidth="1">
        <circle cx="260" cy="210" r="196" strokeDasharray="2 7" opacity=".35" />
        <circle cx="260" cy="210" r="150" opacity=".18" />
      </g>
      <g strokeWidth="2.2" strokeLinecap="round">
        <path
          className="motif-ring-a"
          d="M242 70a118 118 0 1 0 82 205"
          stroke="var(--green-700)"
        />
        <path
          className="motif-ring-b"
          d="M278 350a118 118 0 1 0-82-205"
          stroke="var(--saffron)"
        />
      </g>
      <path
        className="motif-thread"
        d="M96 300C170 250 205 330 260 210S350 120 430 150"
        stroke="var(--green-900)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="1 6"
      />
      <circle cx="260" cy="210" r="9" fill="var(--saffron)" />
      <circle cx="260" cy="210" r="22" stroke="var(--saffron)" strokeWidth="1" opacity=".55" />
      <circle cx="96" cy="300" r="5" fill="var(--green-900)" />
      <circle cx="430" cy="150" r="5" fill="var(--green-900)" />
    </svg>
  );
}
