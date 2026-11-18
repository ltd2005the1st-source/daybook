"use client";
import type { SVGProps } from "react";

/*
 * Shortcuts to the other apps Đạt lives in. These sites refuse to load inside another page, so
 * they're plain links that open in a new tab. In the Android app any address outside Daybook
 * opens in its own app (or the phone's browser), so nothing extra is needed there.
 *
 * The icons are drawn here in the same 24px, 1.8 stroke line style as the lucide menu icons, so
 * they sit with the rest of the sidebar instead of as coloured logos.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };
type Icon = (p: IconProps) => React.ReactElement;

function glyph(children: React.ReactNode): Icon {
  return function AppGlyph({ size = 16, strokeWidth = 1.8, className, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={className ? `lucide ${className}` : "lucide"}
        {...rest}
      >
        {children}
      </svg>
    );
  };
}

const Messenger = glyph(
  <>
    <path d="M12 3C6.9 3 3 6.7 3 11.4c0 2.5 1.1 4.6 2.9 6.1V21l3.2-1.8c.9.3 1.9.4 2.9.4 5.1 0 9-3.7 9-8.3S17.1 3 12 3Z" />
    <path d="m7.5 13.6 3-3.2 2.3 1.9 3.7-2.4-3 3.2-2.3-1.9Z" />
  </>,
);
const Instagram = glyph(
  <>
    <rect x="3" y="3" width="18" height="18" rx="5.2" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" />
  </>,
);
const YouTube = glyph(
  <>
    <path d="M2.8 8.1c.2-1.6 1.4-2.8 3-2.9C7.7 5 9.8 5 12 5s4.3 0 6.2.2c1.6.1 2.8 1.3 3 2.9.2 1.3.3 2.6.3 3.9s-.1 2.6-.3 3.9c-.2 1.6-1.4 2.8-3 2.9-1.9.2-4 .2-6.2.2s-4.3 0-6.2-.2c-1.6-.1-2.8-1.3-3-2.9-.2-1.3-.3-2.6-.3-3.9s.1-2.6.3-3.9Z" />
    <path d="m10 9 5 3-5 3Z" />
  </>,
);
const Spotify = glyph(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M7.2 9.4c3.3-1 6.9-.7 9.8.9" />
    <path d="M7.8 12.4c2.7-.7 5.6-.4 7.9.9" />
    <path d="M8.4 15.2c2-.5 4.1-.3 5.9.7" />
  </>,
);
const Netlify = glyph(
  <>
    <path d="M12 3.2 20.8 12 12 20.8 3.2 12Z" />
    <path d="M8.4 12h7.2" />
    <path d="M12 3.2V8" />
    <path d="M12 16v4.8" />
  </>,
);
const Claude = glyph(
  <>
    <path d="M12 3v5.5" />
    <path d="M12 15.5V21" />
    <path d="M3 12h5.5" />
    <path d="M15.5 12H21" />
    <path d="m5.6 5.6 3.9 3.9" />
    <path d="m14.5 14.5 3.9 3.9" />
    <path d="m18.4 5.6-3.9 3.9" />
    <path d="m9.5 14.5-3.9 3.9" />
  </>,
);
const Zalo = glyph(
  <>
    <path d="M12 3.5c-5 0-9 3.5-9 7.9 0 2.3 1.1 4.4 2.9 5.8L5 20.5l3.6-1.6c1 .3 2.2.5 3.4.5 5 0 9-3.5 9-8S17 3.5 12 3.5Z" />
    <path d="M8.8 9h6.4l-6.4 5.6h6.4" />
  </>,
);
const Gmail = glyph(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.2" />
    <path d="m3.6 6.4 8.4 6.4 8.4-6.4" />
  </>,
);
const Meet = glyph(
  <>
    <rect x="3" y="6.5" width="12" height="11" rx="2.2" />
    <path d="m15 11 6-4v10l-6-4" />
  </>,
);
const Drive = glyph(
  <>
    <path d="M8.6 3.8h6.8l6.1 10.6-3.4 5.8H6l-3.4-5.8Z" />
    <path d="m8.6 3.8 6 10.6h6.9" />
    <path d="M15.4 3.8 9.3 14.4 6 20.2" />
  </>,
);

export const APPS: { id: string; label: string; href: string; icon: Icon }[] = [
  { id: "messenger", label: "Messenger", href: "https://www.facebook.com/messages", icon: Messenger },
  { id: "zalo", label: "Zalo", href: "https://chat.zalo.me/", icon: Zalo },
  { id: "instagram", label: "Instagram", href: "https://www.instagram.com/direct", icon: Instagram },
  { id: "gmail", label: "Gmail", href: "https://mail.google.com/mail/u/6/#inbox", icon: Gmail },
  { id: "meet", label: "Meet", href: "https://meet.google.com/udz-skmv-oku?pli=1&authuser=2", icon: Meet },
  { id: "drive", label: "Drive", href: "https://drive.google.com/drive/u/0/my-drive", icon: Drive },
  { id: "youtube", label: "YouTube", href: "https://www.youtube.com/", icon: YouTube },
  { id: "spotify", label: "Spotify", href: "https://open.spotify.com/", icon: Spotify },
  { id: "claude", label: "Claude", href: "https://claude.ai/new", icon: Claude },
  { id: "netlify", label: "Netlify", href: "https://app.netlify.com/teams/ltd2005the1st/projects", icon: Netlify },
];

/** Sidebar list: same rows as the section menu, each opening its app in a new tab. */
export function AppLinks() {
  return (
    <div className="mt-4">
      <div className="px-2.5 pb-1 text-[11.5px] font-medium text-muted">Apps</div>
      <div className="flex flex-col gap-px">
        {APPS.map((a) => (
          <a
            key={a.id}
            href={a.href}
            target="_blank"
            rel="noopener noreferrer"
            className="press nav-item flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13.5px] text-ink-2 hover:bg-hover hover:text-ink"
          >
            <a.icon size={16} />
            <span>{a.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

/** Phone sheet: a grid of app tiles. Tapping one opens it and closes the sheet. */
export function AppGrid({ onPick }: { onPick?: () => void }) {
  return (
    <div className="grid grid-cols-4 gap-x-2 gap-y-4 pt-2 pb-1">
      {APPS.map((a) => (
        <a
          key={a.id}
          href={a.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onPick}
          className="press flex min-w-0 flex-col items-center gap-1.5 text-[12px] text-ink-2"
        >
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-[16px] border border-line bg-sunken text-ink">
            <a.icon size={24} strokeWidth={1.7} />
          </span>
          <span className="max-w-full truncate">{a.label}</span>
        </a>
      ))}
    </div>
  );
}
