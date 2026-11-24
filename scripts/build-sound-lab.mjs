// Builds a single self-contained HTML of the sound lab: node scripts/build-sound-lab.mjs -> preview/dist/sound-lab.html
// Usage: node scripts/build-preview.mjs  ->  preview/dist/sound-lab.html
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("preview/dist", { recursive: true });

execFileSync("npx", ["@tailwindcss/cli", "-i", "app/globals.css", "-o", "preview/dist/lab.css", "--minify"], { stdio: "inherit" });

await build({
  entryPoints: ["preview/sound-lab.tsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  outfile: "preview/dist/lab.js",
  alias: { "next/link": "./preview/shims/next-link.tsx", "next/navigation": "./preview/shims/next-navigation.ts" },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_SUPABASE_URL": "undefined",
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": "undefined",
    "process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY": "undefined",
    "process.env.NEXT_PUBLIC_PREVIEW": '"1"',
  },
  logLevel: "warning",
});

const css = readFileSync("preview/dist/lab.css", "utf8");
const js = readFileSync("preview/dist/lab.js", "utf8").replace(/<\/script/gi, "<\\/script");
const icon = "data:image/svg+xml;base64," + Buffer.from(readFileSync("public/icon.svg")).toString("base64");
const theme = `(function(){try{var t=localStorage.getItem('daybook.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;else if(!document.documentElement.dataset.theme)document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}})()`;

const html = `<meta charset="utf-8">
<title>Sound Lab</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap">
<script>${theme}</script>
<style>
:root{--font-bricolage:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark}}
${css}
</style>
<div id="root"></div>
<script>${js.replace(/\/icon\.svg/g, icon)}</script>
`;
writeFileSync("preview/dist/sound-lab.html", html);
console.log(`preview/dist/sound-lab.html  ${(html.length / 1024).toFixed(0)} KB`);
