// Maps app paths to plain "#name" hashes, the only kind an artifact link keeps.
export function pathToHash(path: string): string {
  if (path === "/" || path === "") return "today";
  const section = path.match(/^\/?#([\w-]+)$/);
  if (section) return section[1];
  if (path === "/settings") return "setup";
  if (path === "/teaching/receipts") return "receipts";
  const m = path.match(/^\/teaching\/receipts\/([\w-]+)$/);
  if (m) return `receipt-${m[1]}`;
  return path.replace(/^\//, "").replace(/\//g, "-");
}

export function hashToPath(hash: string): string {
  const h = hash.replace(/^#/, "");
  if (!h || h === "today") return "/";
  if (h === "setup") return "/settings";
  if (h === "receipts") return "/teaching/receipts";
  if (h.startsWith("receipt-")) return `/teaching/receipts/${h.slice(8)}`;
  return `/${h}`;
}
