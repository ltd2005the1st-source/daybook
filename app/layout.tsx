import type { Metadata, Viewport } from "next";
import { Paytone_One, Work_Sans } from "next/font/google";
import "./globals.css";

// Retro print pairing: a fat rounded display face for titles and big numbers, a plain humanist sans for
// everything you read. Both cover Vietnamese, so student names and task titles never fall back mid-word.
const paytone = Paytone_One({ subsets: ["latin", "vietnamese"], weight: "400", variable: "--font-paytone" });
const work = Work_Sans({ subsets: ["latin", "vietnamese"], variable: "--font-work" });

export const metadata: Metadata = {
  title: "Daybook",
  description: "Money, teaching, calendar, tasks and habits in one place.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Daybook", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4ead5" },
    { media: "(prefers-color-scheme: dark)", color: "#22150d" },
  ],
};

// Sets the theme before first paint so there is no flash.
const themeScript = `(function(){try{var t=localStorage.getItem('daybook.theme');if(t!=='light'&&t!=='dark'){t=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${paytone.variable} ${work.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
