"use client";

import type { VideoHTMLAttributes } from "react";
import { seekVideoPreview, videoPreviewSrc } from "@/lib/video-preview";

type Props = Pick<VideoHTMLAttributes<HTMLVideoElement>,
  "src" | "className" | "onLoadedMetadata" | "onLoadedData" | "onSeeked" | "onError">;

/** Paused opening frame. Metadata alone does not mean a frame is decoded. */
export default function VideoThumbnail({ src = "", onLoadedMetadata, ...props }: Props) {
  return <video
    {...props}
    src={videoPreviewSrc(src)}
    muted
    playsInline
    preload="metadata"
    aria-hidden="true"
    onLoadedMetadata={(event) => {
      seekVideoPreview(event.currentTarget);
      onLoadedMetadata?.(event);
    }}
  />;
}
