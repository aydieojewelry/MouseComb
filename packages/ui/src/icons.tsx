/**
 * The few icons MouseComb uses, drawn in the Windows 11 (Fluent) line style.
 * Kept in-house: a full icon package adds megabytes for a handful of glyphs.
 */
import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;
export type Icon = (props: IconProps) => React.JSX.Element;

function make(paths: React.ReactNode): Icon {
  return function IconSvg(props: IconProps) {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const SlidersIcon = make(
  <>
    <path d="M3.5 6h7M14.5 6h2M3.5 14h2M9.5 14h7" />
    <circle cx="12.5" cy="6" r="2" />
    <circle cx="7.5" cy="14" r="2" />
  </>,
);

export const SnippetIcon = make(
  <>
    <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" />
    <path d="M7 8h6M7 11h6M7 14h3.5" />
  </>,
);

export const CloudSyncIcon = make(
  <>
    <path d="M6 15.5h-.5a3 3 0 0 1-.4-5.97A4.5 4.5 0 0 1 13.8 8a3.5 3.5 0 0 1 .7 6.93" />
    <path d="M8.5 13.5a2 2 0 0 1 3.4-1.1M11.5 16.5a2 2 0 0 1-3.4 1.1" />
    <path d="M12 11v1.6h-1.6M8 19v-1.6h1.6" />
  </>,
);

export const InfoIcon = make(
  <>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 9v4.5M10 6.6v.1" />
  </>,
);

export const AddIcon = make(<path d="M10 4v12M4 10h12" />);

export const DeleteIcon = make(
  <>
    <path d="M4 6h12M8.5 6V4.5h3V6M5.5 6l.8 9.2a1.5 1.5 0 0 0 1.5 1.3h4.4a1.5 1.5 0 0 0 1.5-1.3L14.5 6" />
    <path d="M8.5 9v4.5M11.5 9v4.5" />
  </>,
);

export const SearchIcon = make(
  <>
    <circle cx="8.5" cy="8.5" r="4.5" />
    <path d="M12 12l4 4" />
  </>,
);

export const SyncIcon = make(
  <>
    <path d="M4.5 9a5.5 5.5 0 0 1 9.6-3.2L15.5 7" />
    <path d="M15.5 4v3h-3" />
    <path d="M15.5 11a5.5 5.5 0 0 1-9.6 3.2L4.5 13" />
    <path d="M4.5 16v-3h3" />
  </>,
);

export const SignOutIcon = make(
  <>
    <path d="M8 4.5H5.5a1.5 1.5 0 0 0-1.5 1.5v8a1.5 1.5 0 0 0 1.5 1.5H8" />
    <path d="M12 7l3 3-3 3M15 10H8" />
  </>,
);
