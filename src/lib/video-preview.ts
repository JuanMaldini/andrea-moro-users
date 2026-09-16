// Ask Safari to decode the opening frame: one millisecond, not one second.
export function videoPreviewSrc(src: string): string {
  return `${src.split("#")[0]}#t=0.001`;
}

export function seekVideoPreview(video: HTMLVideoElement): void {
  if (!video.paused || video.currentTime > 0 || !Number.isFinite(video.duration) || video.duration <= 0) return;
  video.currentTime = Math.min(0.001, video.duration / 2);
}
