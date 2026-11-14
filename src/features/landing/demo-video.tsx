import { useState } from "react";
import { Play } from "lucide-react";
import { DEMO_VIDEO_ID } from "@shared/constants";

/**
 * The founder's walkthrough video. Nothing from YouTube is loaded until the visitor presses play:
 * the page shows a still and a button, and only then swaps in the (cookie-less) player. Renders
 * nothing until a video id is set in shared/constants.ts.
 */
export function DemoVideo() {
  const [playing, setPlaying] = useState(false);
  if (!DEMO_VIDEO_ID) return null;

  return (
    <div className="relative mx-auto aspect-video w-full max-w-4xl overflow-hidden rounded-2xl border bg-black shadow-lift">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${DEMO_VIDEO_ID}?autoplay=1&rel=0`}
          title="Why we built GrowUpliftOS, and a walkthrough"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 size-full"
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 size-full" aria-label="Play the video">
          <img src={`https://i.ytimg.com/vi/${DEMO_VIDEO_ID}/hqdefault.jpg`} alt="" loading="lazy" className="size-full object-cover opacity-90 transition-opacity duration-200 group-hover:opacity-100" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lift transition-transform duration-200 group-hover:scale-105 sm:size-20">
              <Play className="size-7 translate-x-0.5 fill-current sm:size-8" />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
