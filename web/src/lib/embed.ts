// The player address for YouTube and Vimeo links, or null for anything else.
// YouTube plays from its no-cookie domain; a start time (?t=90 or t=1m30s) carries over.
export function videoEmbedUrl(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const seconds = (value: string | null) => {
    if (!value) return 0;
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value);
    return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0;
  };

  let youtubeId: string | null = null;
  if (host === 'youtu.be') youtubeId = url.pathname.slice(1).split('/')[0];
  else if (['youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    youtubeId =
      url.pathname === '/watch'
        ? url.searchParams.get('v')
        : (/^\/(?:shorts|live|embed)\/([\w-]+)/.exec(url.pathname)?.[1] ?? null);
  }
  if (youtubeId && /^[\w-]{6,20}$/.test(youtubeId)) {
    const start = seconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
    return `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0${start ? `&start=${start}` : ''}`;
  }

  const vimeoId = host === 'vimeo.com' ? /^\/(\d+)/.exec(url.pathname)?.[1] : null;
  if (vimeoId) return `https://player.vimeo.com/video/${vimeoId}`;
  return null;
}
