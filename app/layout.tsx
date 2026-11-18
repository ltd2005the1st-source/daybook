import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "vietnamese"],
  variable: "--font-bricolage",
  // Variable font with the optical-size axis, so big titles get the display cut and small text the text cut.
  axes: ["opsz"],
});

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
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#191918" },
  ],
};

// Sets the theme before first paint so there is no flash.
const themeScript = `(function(){try{var t=localStorage.getItem('daybook.theme');if(t!=='light'&&t!=='dark'){t=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={bricolage.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
