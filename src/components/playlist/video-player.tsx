import { useEffect, useRef, useState } from "react";
import { loadYouTubeApi } from "../../lib/youtube-player";

interface VideoPlayerProps {
  videoId: string;
  title: string;
  onReady?: (player: any) => void;
}

export function VideoPlayer({ videoId, title, onReady }: VideoPlayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = "";
        const box = document.createElement("div");
        box.className = "h-full w-full";
        hostRef.current.appendChild(box);
        playerRef.current = new YT.Player(box, {
          videoId,
          playerVars: { enablejsapi: 1, rel: 0 },
          events: {
            onReady: (e: any) => {
              if (cancelled) return;
              const iframe = e.target.getIframe?.();
              if (iframe) iframe.title = title;
              (window as any).__videoPlayer = e.target;
              onReadyRef.current?.(e.target);
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      playerRef.current = null;
      if ((window as any).__videoPlayer) delete (window as any).__videoPlayer;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (p?.loadVideoById) p.loadVideoById(videoId);
  }, [videoId]);

  if (failed) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl border bg-black">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return <div ref={hostRef} className="aspect-video w-full overflow-hidden rounded-xl border bg-black" />;
}
