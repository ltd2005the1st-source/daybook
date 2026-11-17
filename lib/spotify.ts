/** Spotify links you paste in, played through Spotify's own embedded player (no sign-in to an API needed). */
export const SPOTIFY_KINDS = ["playlist", "album", "track", "artist", "episode", "show"] as const;
export type SpotifyKind = (typeof SPOTIFY_KINDS)[number];

export const KIND_LABEL: Record<SpotifyKind, string> = {
  playlist: "Playlist",
  album: "Album",
  track: "Song",
  artist: "Artist",
  episode: "Episode",
  show: "Podcast",
};

/** Reads open.spotify.com links (with or without /intl-xx/ and ?si=…) and spotify:kind:id URIs. */
export function parseSpotify(input: string): { kind: SpotifyKind; id: string } | null {
  const s = input.trim();
  const uri = s.match(/^spotify:(playlist|album|track|artist|episode|show):([A-Za-z0-9]{10,})$/);
  if (uri) return { kind: uri[1] as SpotifyKind, id: uri[2] };
  const url = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]{10,})/i);
  if (url) return { kind: url[1].toLowerCase() as SpotifyKind, id: url[2] };
  return null;
}

export const isShortLink = (s: string) => /spotify\.link\/|spoti\.fi\//i.test(s);

export const openUrl = (kind: string, id: string) => `https://open.spotify.com/${kind}/${id}`;
export const embedUrl = (kind: string, id: string) => `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator`;

/** Name and cover art from Spotify's public oEmbed endpoint, through the app's server if the browser can't ask directly. */
export async function lookup(kind: string, id: string): Promise<{ title: string; image: string | null } | null> {
  const tries = [
    `https://open.spotify.com/oembed?url=${encodeURIComponent(openUrl(kind, id))}`,
    `/api/spotify?kind=${kind}&id=${id}`,
  ];
  for (const url of tries) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const d = (await res.json()) as { title?: string; thumbnail_url?: string; image?: string };
      if (d.title) return { title: d.title, image: d.thumbnail_url ?? d.image ?? null };
    } catch {
      /* try the next way */
    }
  }
  return null;
}
