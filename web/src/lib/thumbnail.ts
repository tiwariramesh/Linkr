// Small card previews made in the browser, so the server needs no image or video libraries.
const MAX_SIDE = 640;

function draw(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  // Browsers that can't encode WebP fall back to PNG, which the server also accepts.
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8));
}

// A frame about a second in (or a quarter of the way through a short clip).
function videoFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (blob: Blob | null) => {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    const timer = setTimeout(() => done(null), 10_000);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 4);
    };
    video.onseeked = () => {
      draw(video, video.videoWidth, video.videoHeight).then(done, () => done(null));
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

export async function makeThumbnail(file: File): Promise<Blob | null> {
  try {
    if (file.type.startsWith('image/')) {
      const bitmap = await createImageBitmap(file);
      try {
        return await draw(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    }
    if (file.type.startsWith('video/')) return await videoFrame(file);
  } catch {
    // A format this browser can't decode (e.g. HEIC): the card shows an icon instead.
  }
  return null;
}
