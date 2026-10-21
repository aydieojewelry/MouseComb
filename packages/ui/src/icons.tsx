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

export const MinusIcon = make(<path d="M4 10h12" />);

export const ChevronLeftIcon = make(<path d="M12 4 6 10l6 6" />);

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

export const TimerIcon = make(
  <>
    <circle cx="10" cy="11" r="6" />
    <path d="M10 8v3l2 1.5M8 2.5h4M15 5.5l1-1" />
  </>,
);

export const PlayIcon = make(<path d="M7 5.2v9.6a.6.6 0 0 0 .9.5l7.4-4.8a.6.6 0 0 0 0-1L7.9 4.7a.6.6 0 0 0-.9.5Z" />);

export const PauseIcon = make(<path d="M7.5 5v10M12.5 5v10" />);

export const SkipIcon = make(
  <>
    <path d="M5 5.2v9.6a.6.6 0 0 0 .9.5l6.4-4.8a.6.6 0 0 0 0-1L5.9 4.7a.6.6 0 0 0-.9.5Z" />
    <path d="M15 5v10" />
  </>,
);

export const AppsIcon = make(
  <>
    <rect x="3.5" y="3.5" width="5" height="5" rx="1.2" />
    <rect x="11.5" y="3.5" width="5" height="5" rx="1.2" />
    <rect x="3.5" y="11.5" width="5" height="5" rx="1.2" />
    <rect x="11.5" y="11.5" width="5" height="5" rx="1.2" />
  </>,
);

export const BoltIcon = make(<path d="M11 2.5 4.5 11H10l-1 6.5L15.5 9H10l1-6.5Z" />);

export const CalculatorIcon = make(
  <>
    <rect x="4.5" y="2.5" width="11" height="15" rx="2" />
    <path d="M7 5.5h6M7.2 9.5h.1M10 9.5h.1M12.8 9.5h.1M7.2 12.5h.1M10 12.5h.1M12.8 12.5v2.5M7.2 15h.1M10 15h.1" />
  </>,
);

export const GlobeIcon = make(
  <>
    <circle cx="10" cy="10" r="7" />
    <path d="M3 10h14M10 3c2 2 2.8 4.3 2.8 7s-.8 5-2.8 7c-2-2-2.8-4.3-2.8-7S8 5 10 3Z" />
  </>,
);

export const PowerIcon = make(
  <>
    <path d="M10 3v6.5" />
    <path d="M6.2 5.6a6 6 0 1 0 7.6 0" />
  </>,
);

export const GearIcon = make(
  <>
    <circle cx="10" cy="10" r="2.5" />
    <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
  </>,
);

export const DownloadIcon = make(
  <>
    <path d="M10 3.5v9M6.5 9 10 12.5 13.5 9" />
    <path d="M4 15.5h12" />
  </>,
);

export const KeyboardIcon = make(
  <>
    <rect x="2.5" y="5" width="15" height="10" rx="2" />
    <path d="M5.5 8h.1M8.5 8h.1M11.5 8h.1M14.5 8h.1M5.5 11h.1M14.5 11h.1M8 12h4" />
  </>,
);

export const EditIcon = make(
  <>
    <path d="M12.5 4.5l3 3L7 16H4v-3l8.5-8.5Z" />
  </>,
);

export const SparkleIcon = make(
  <>
    <path d="M9 3.5 10.6 8 15 9.5 10.6 11 9 15.5 7.4 11 3 9.5 7.4 8 9 3.5Z" />
    <path d="M15.5 3v3M14 4.5h3" />
  </>,
);
