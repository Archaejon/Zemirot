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
};

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.4-3.4" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

export function MusicIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  );
}

export function VideoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m4 12 5 5L20 6" />
    </svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12M10 11v5M14 11v5" />
    </svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16.5H6.5A2.5 2.5 0 0 0 4 22V5.5Z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
    </svg>
  );
}

export function CompareIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="7" height="16" rx="1.5" />
      <rect x="14" y="4" width="7" height="16" rx="1.5" />
      <path d="M5.5 8h2M5.5 12h2M5.5 16h2M16.5 8h2M16.5 12h2M16.5 16h2" />
    </svg>
  );
}

export function PrintIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 8V4h10v4" />
      <rect x="4" y="8" width="16" height="8" rx="2" />
      <path d="M7 13h10v7H7z" />
      <path d="M17 11h.01" />
    </svg>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
  );
}

export function StarIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base} {...props} fill={filled ? "currentColor" : "none"}>
      <path d="m12 3.7 2.5 5.1 5.6.8-4.1 4 .9 5.6-4.9-2.7-4.9 2.7.9-5.6-4.1-4 5.6-.8Z" />
    </svg>
  );
}

export function ListAddIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h10M4 12h10M4 18h7" />
      <path d="M16 15v6M13 18h6" />
    </svg>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <g fill="currentColor" stroke="none">
        <circle cx="9" cy="6" r="1.1" />
        <circle cx="15" cy="6" r="1.1" />
        <circle cx="9" cy="12" r="1.1" />
        <circle cx="15" cy="12" r="1.1" />
        <circle cx="9" cy="18" r="1.1" />
        <circle cx="15" cy="18" r="1.1" />
      </g>
    </svg>
  );
}
