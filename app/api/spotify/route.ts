import { NextResponse } from "next/server";

/** Looks up a Spotify link's name and cover art, for browsers that can't ask Spotify directly. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind") ?? "";
  const id = u.searchParams.get("id") ?? "";
  if (!/^(playlist|album|track|artist|episode|show)$/.test(kind) || !/^[A-Za-z0-9]{10,40}$/.test(id)) {
    return NextResponse.json({ error: "Not a Spotify link." }, { status: 400 });
  }
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${kind}/${id}`)}`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return NextResponse.json({ error: "Spotify didn’t recognise that link." }, { status: 404 });
    const d = (await res.json()) as { title?: string; thumbnail_url?: string };
    return NextResponse.json({ title: d.title ?? null, image: d.thumbnail_url ?? null });
  } catch {
    return NextResponse.json({ error: "Couldn’t reach Spotify." }, { status: 502 });
  }
}
