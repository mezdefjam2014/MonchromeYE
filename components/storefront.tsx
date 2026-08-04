"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createBrowserClient } from "@/lib/supabase/browser";
import { useCart } from "@/components/cart-provider";
import type { Beat, SiteSettings } from "@/lib/types";

const PAGE_SIZE = 15;

const defaultSettings: SiteSettings = {
  id: 1,
  eyebrow: "YE2K / DIGITAL PRODUCTION",
  headline_primary: "SOUND FOR",
  headline_accent: "THE NEXT RECORD.",
  description:
    "Original production. Immediate preview. Secure delivery.",
  settings: {
    media: {
      globalCoverPath: ""
    },
    branding: {
      headerLogoText: "YE2K",
      footerLogoText: "YE2K"
    },
    about: {
      visible: true,
      eyebrow: "THE YE2K STANDARD",
      headline: "Built for artists who care how the record feels.",
      description:
        "Every beat comes with clear pricing and immediate access to every included file after payment."
    },
    announcement: {
      enabled: false,
      text: "NEW DROP — AVAILABLE NOW",
      link: "",
      openInNewTab: false
    },
    creative: {
      workspaceEnabled: false,
      lyricsEnabled: true,
      autoSaveEnabled: true,
      txtDownloadEnabled: true
    }
  },
  updated_at: ""
};

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function WaveformCanvas({
  src,
  currentTime,
  duration,
  playing,
  compact = false,
  onSeek,
  onDuration
}: {
  src: string;
  currentTime: number;
  duration: number;
  playing: boolean;
  compact?: boolean;
  onSeek: (seconds: number) => void;
  onDuration?: (seconds: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [decodedDuration, setDecodedDuration] = useState(0);
  const draggingRef = useRef(false);
  const onDurationRef = useRef(onDuration);

  useEffect(() => {
    onDurationRef.current = onDuration;
  }, [onDuration]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function buildWaveform() {
      setPeaks([]);
      setDecodedDuration(0);

      try {
        const response = await fetch(src, {
          signal: controller.signal,
          cache: "force-cache"
        });

        if (!response.ok) throw new Error("Could not load waveform.");

        const arrayBuffer = await response.arrayBuffer();
        const AudioContextClass =
          window.AudioContext ||
          (window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }).webkitAudioContext;

        if (!AudioContextClass) throw new Error("Web Audio unavailable.");

        const audioContext = new AudioContextClass();
        const audioBuffer = await audioContext.decodeAudioData(
          arrayBuffer.slice(0)
        );
        const channel = audioBuffer.getChannelData(0);
        const barCount = compact ? 150 : 210;
        const blockSize = Math.max(
          1,
          Math.floor(channel.length / barCount)
        );
        const nextPeaks: number[] = [];

        for (let bar = 0; bar < barCount; bar += 1) {
          const start = bar * blockSize;
          const end = Math.min(start + blockSize, channel.length);
          let max = 0;

          for (let sample = start; sample < end; sample += 8) {
            max = Math.max(max, Math.abs(channel[sample]));
          }

          nextPeaks.push(max);
        }

        const highest = Math.max(...nextPeaks, 0.01);
        const normalized = nextPeaks.map((peak) =>
          Math.max(0.08, peak / highest)
        );

        await audioContext.close();

        if (!cancelled) {
          setPeaks(normalized);
          setDecodedDuration(audioBuffer.duration);
          onDurationRef.current?.(audioBuffer.duration);
        }
      } catch (error) {
        if (
          !cancelled &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setPeaks([]);
        }
      }
    }

    buildWaveform();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [compact, src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));

      const context = canvas.getContext("2d");
      if (!context) return;

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);

      const values = peaks.length
        ? peaks
        : Array.from(
            { length: compact ? 120 : 170 },
            (_, index) => 0.15 + ((index * 19) % 17) / 32
          );

      const gap = compact ? 1.25 : 1.75;
      const barWidth = Math.max(
        1,
        (rect.width - gap * (values.length - 1)) / values.length
      );
      const effectiveDuration = duration || decodedDuration;
      const progress =
        effectiveDuration > 0
          ? Math.min(1, currentTime / effectiveDuration)
          : 0;
      const progressX = rect.width * progress;

      values.forEach((peak, index) => {
        const x = index * (barWidth + gap);
        const height = Math.max(
          compact ? 3 : 4,
          peak * (rect.height - (compact ? 4 : 8))
        );
        const y = (rect.height - height) / 2;
        const played = x <= progressX;

        context.fillStyle = played ? "#000000" : "#c8c8c8";
        context.globalAlpha = played ? 1 : 0.72;
        context.beginPath();
        context.roundRect(
          x,
          y,
          barWidth,
          height,
          Math.min(2, barWidth / 2)
        );
        context.fill();
      });

      context.globalAlpha = 1;

      if (progressX > 0) {
        context.fillStyle = "#000000";
        context.fillRect(
          Math.max(0, progressX - 1),
          0,
          2,
          rect.height
        );
      }
    };

    draw();
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);

    return () => resizeObserver.disconnect();
  }, [compact, currentTime, decodedDuration, duration, peaks, playing]);

  function seekFromPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const effectiveDuration = duration || decodedDuration;
    if (!effectiveDuration) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width)
    );

    onSeek(ratio * effectiveDuration);
  }

  return (
    <div
      className={`real-waveform ${compact ? "is-compact" : ""} ${
        playing ? "is-playing" : ""
      }`}
    >
      <canvas
        ref={canvasRef}
        role="slider"
        tabIndex={0}
        aria-label="Audio waveform. Click or drag to seek."
        aria-valuemin={0}
        aria-valuemax={Math.round(duration || decodedDuration || 0)}
        aria-valuenow={Math.round(currentTime)}
        onPointerDown={(event) => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) seekFromPointer(event);
        }}
        onPointerUp={(event) => {
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onKeyDown={(event) => {
          const effectiveDuration = duration || decodedDuration;

          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onSeek(Math.max(0, currentTime - 5));
          }

          if (event.key === "ArrowRight") {
            event.preventDefault();
            onSeek(Math.min(effectiveDuration, currentTime + 5));
          }
        }}
      />
    </div>
  );
}

type LegalModal = "terms" | "privacy" | null;


type GlobePoint = {
  city: string;
  country: string;
  lat: number;
  lon: number;
};

const globeCities: GlobePoint[] = [
  { city: "NEW YORK", country: "USA", lat: 40.7128, lon: -74.006 },
  { city: "LOS ANGELES", country: "USA", lat: 34.0522, lon: -118.2437 },
  { city: "LONDON", country: "UK", lat: 51.5072, lon: -0.1276 },
  { city: "PARIS", country: "FRANCE", lat: 48.8566, lon: 2.3522 },
  { city: "LAGOS", country: "NIGERIA", lat: 6.5244, lon: 3.3792 },
  { city: "JOHANNESBURG", country: "SOUTH AFRICA", lat: -26.2041, lon: 28.0473 },
  { city: "TOKYO", country: "JAPAN", lat: 35.6762, lon: 139.6503 },
  { city: "SEOUL", country: "SOUTH KOREA", lat: 37.5665, lon: 126.978 },
  { city: "SYDNEY", country: "AUSTRALIA", lat: -33.8688, lon: 151.2093 },
  { city: "SÃO PAULO", country: "BRAZIL", lat: -23.5505, lon: -46.6333 }
];

const continentLines: Array<Array<[number, number]>> = [
  [
    [-168, 66], [-150, 70], [-132, 58], [-126, 49], [-117, 32], [-102, 20],
    [-86, 18], [-82, 25], [-75, 35], [-66, 45], [-60, 53], [-78, 62],
    [-105, 72], [-138, 72], [-168, 66]
  ],
  [
    [-81, 12], [-72, 5], [-67, -6], [-60, -16], [-54, -27], [-58, -39],
    [-68, -54], [-76, -44], [-79, -25], [-81, 12]
  ],
  [
    [-10, 36], [0, 44], [14, 47], [29, 42], [39, 31], [33, 18], [43, 11],
    [50, 2], [43, -12], [34, -28], [18, -35], [6, -31], [-5, -12],
    [-17, 13], [-10, 36]
  ],
  [
    [-11, 36], [-8, 51], [5, 58], [20, 69], [40, 70], [59, 62], [72, 54],
    [92, 52], [114, 48], [135, 53], [154, 61], [169, 54], [160, 41],
    [143, 34], [124, 21], [109, 8], [92, 7], [79, 20], [67, 24], [55, 34],
    [39, 42], [22, 40], [10, 36], [-11, 36]
  ],
  [
    [112, -11], [126, -14], [139, -20], [153, -28], [148, -39], [132, -44],
    [116, -35], [112, -11]
  ],
  [
    [-52, 82], [-28, 76], [-20, 66], [-38, 60], [-56, 68], [-52, 82]
  ]
];

function InteractiveWorld() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotationRef = useRef(-18);
  const draggingRef = useRef(false);
  const lastPointerXRef = useRef(0);
  const resumeAtRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationFrame = 0;
    let previousTime = performance.now();
    let lastWidth = 0;
    let lastHeight = 0;
    let pixelRatio = 1;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      if (width !== lastWidth || height !== lastHeight) {
        lastWidth = width;
        lastHeight = height;
        canvas.width = Math.max(1, Math.floor(width * pixelRatio));
        canvas.height = Math.max(1, Math.floor(height * pixelRatio));
      }

      return { width, height };
    };

    const project = (
      lon: number,
      lat: number,
      radius: number,
      centerX: number,
      centerY: number
    ) => {
      const lambda = ((lon + rotationRef.current) * Math.PI) / 180;
      const phi = (lat * Math.PI) / 180;
      const visibility = Math.cos(phi) * Math.cos(lambda);

      return {
        x: centerX + radius * Math.cos(phi) * Math.sin(lambda),
        y: centerY - radius * Math.sin(phi),
        depth: visibility,
        visible: visibility > 0.08
      };
    };

    const boxesOverlap = (
      a: { left: number; top: number; right: number; bottom: number },
      b: { left: number; top: number; right: number; bottom: number }
    ) =>
      !(
        a.right + 6 < b.left ||
        a.left > b.right + 6 ||
        a.bottom + 4 < b.top ||
        a.top > b.bottom + 4
      );

    const draw = (now: number) => {
      const { width, height } = resizeCanvas();
      const context = canvas.getContext("2d");
      if (!context) return;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const compact = width < 520;
      const radius = Math.max(
        84,
        Math.min(width * (compact ? 0.34 : 0.36), height * 0.4)
      );
      const centerX = width / 2;
      const centerY = height * 0.47;

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      if (
        !reducedMotion &&
        !draggingRef.current &&
        now > resumeAtRef.current
      ) {
        const elapsed = Math.min(40, now - previousTime);
        rotationRef.current =
          (rotationRef.current + elapsed * 0.0018) % 360;
      }

      previousTime = now;

      context.save();
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.clip();

      context.strokeStyle = "#d4d4d4";
      context.lineWidth = 0.75;

      for (let lat = -60; lat <= 60; lat += 20) {
        context.beginPath();
        let drawing = false;

        for (let lon = -180; lon <= 180; lon += 3) {
          const point = project(lon, lat, radius, centerX, centerY);

          if (!point.visible) {
            drawing = false;
            continue;
          }

          if (!drawing) {
            context.moveTo(point.x, point.y);
            drawing = true;
          } else {
            context.lineTo(point.x, point.y);
          }
        }

        context.stroke();
      }

      for (let lon = -180; lon < 180; lon += 20) {
        context.beginPath();
        let drawing = false;

        for (let lat = -90; lat <= 90; lat += 2) {
          const point = project(lon, lat, radius, centerX, centerY);

          if (!point.visible) {
            drawing = false;
            continue;
          }

          if (!drawing) {
            context.moveTo(point.x, point.y);
            drawing = true;
          } else {
            context.lineTo(point.x, point.y);
          }
        }

        context.stroke();
      }

      context.strokeStyle = "#111111";
      context.lineWidth = compact ? 0.9 : 1.05;

      continentLines.forEach((line) => {
        context.beginPath();
        let drawing = false;

        line.forEach(([lon, lat]) => {
          const point = project(lon, lat, radius, centerX, centerY);

          if (!point.visible) {
            drawing = false;
            return;
          }

          if (!drawing) {
            context.moveTo(point.x, point.y);
            drawing = true;
          } else {
            context.lineTo(point.x, point.y);
          }
        });

        context.stroke();
      });

      context.restore();

      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.strokeStyle = "#111111";
      context.lineWidth = 1.15;
      context.stroke();

      const candidates = globeCities
        .map((city) => ({
          city,
          point: project(
            city.lon,
            city.lat,
            radius,
            centerX,
            centerY
          )
        }))
        .filter(({ point }) => point.visible)
        .sort((a, b) => b.point.depth - a.point.depth);

      const maxLabels = compact ? 4 : width < 700 ? 5 : 7;
      const occupied: Array<{
        left: number;
        top: number;
        right: number;
        bottom: number;
      }> = [];

      candidates.slice(0, 10).forEach(({ city, point }) => {
        if (occupied.length >= maxLabels) return;

        const alignRight = point.x >= centerX;
        const cityFont = compact ? 9 : 11;
        const countryFont = compact ? 7 : 9;
        const offset = compact ? 7 : 10;
        const labelX = point.x + (alignRight ? offset : -offset);
        const labelY = point.y - 3;

        context.font = `800 ${cityFont}px Arial, sans-serif`;
        const cityWidth = context.measureText(city.city).width;
        context.font = `600 ${countryFont}px Arial, sans-serif`;
        const countryWidth = context.measureText(city.country).width;
        const labelWidth = Math.max(cityWidth, countryWidth);
        const box = {
          left: alignRight ? labelX : labelX - labelWidth,
          top: labelY - cityFont,
          right: alignRight ? labelX + labelWidth : labelX,
          bottom: labelY + countryFont + 8
        };

        if (
          box.left < 4 ||
          box.right > width - 4 ||
          box.top < 4 ||
          box.bottom > height - 4 ||
          occupied.some((current) => boxesOverlap(current, box))
        ) {
          return;
        }

        occupied.push(box);

        context.beginPath();
        context.arc(
          point.x,
          point.y,
          compact ? 2.8 : 3.8,
          0,
          Math.PI * 2
        );
        context.fillStyle = "#000000";
        context.fill();

        context.textAlign = alignRight ? "left" : "right";
        context.fillStyle = "#000000";
        context.font = `800 ${cityFont}px Arial, sans-serif`;
        context.fillText(city.city, labelX, labelY);
        context.fillStyle = "#555555";
        context.font = `600 ${countryFont}px Arial, sans-serif`;
        context.fillText(city.country, labelX, labelY + countryFont + 4);
      });

      context.fillStyle = "rgba(0,0,0,.075)";
      context.beginPath();
      context.ellipse(
        centerX,
        centerY + radius + Math.max(10, radius * 0.035),
        radius * 0.56,
        Math.max(4, radius * 0.018),
        0,
        0,
        Math.PI * 2
      );
      context.fill();

      animationFrame = window.requestAnimationFrame(draw);
    };

    const resizeObserver = new ResizeObserver(() => {
      lastWidth = 0;
      lastHeight = 0;
    });
    resizeObserver.observe(canvas);

    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div className="interactive-world">
      <div className="interactive-world-frame">
        <canvas
          ref={canvasRef}
          aria-label="Interactive world map. Drag to rotate."
          onPointerDown={(event) => {
            draggingRef.current = true;
            lastPointerXRef.current = event.clientX;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!draggingRef.current) return;

            const delta = event.clientX - lastPointerXRef.current;
            rotationRef.current += delta * 0.34;
            lastPointerXRef.current = event.clientX;
          }}
          onPointerUp={(event) => {
            draggingRef.current = false;
            resumeAtRef.current = performance.now() + 2500;

            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={(event) => {
            draggingRef.current = false;
            resumeAtRef.current = performance.now() + 2500;

            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
        />
      </div>

      <p className="world-instruction">
        <span aria-hidden="true">↔</span>
        Drag to rotate
      </p>
    </div>
  );
}


export default function Storefront() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const { items, add, remove, has, total } = useCart();

  const [beats, setBeats] = useState<Beat[]>([]);
  const [settings, setSettings] =
    useState<SiteSettings>(defaultSettings);
  const [query, setQuery] = useState("");
  const [activeBeat, setActiveBeat] = useState<Beat | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [legalModal, setLegalModal] = useState<LegalModal>(null);
  const [workspaceBeat, setWorkspaceBeat] = useState<Beat | null>(null);
  const [workspaceNotes, setWorkspaceNotes] = useState("");
  const [workspaceSaved, setWorkspaceSaved] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const workspaceTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    Promise.all([
      supabase
        .from("beats")
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: false }),
      supabase
        .from("site_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle()
    ]).then(([beatsResult, settingsResult]) => {
      setBeats((beatsResult.data || []) as Beat[]);
      if (settingsResult.data) {
        setSettings(settingsResult.data as SiteSettings);
      }
      setLoading(false);
    });

    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [supabase]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

  useEffect(() => {
    const overlayOpen = cartOpen || legalModal !== null;
    document.body.classList.toggle("cart-drawer-open", overlayOpen);

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCartOpen(false);
        setLegalModal(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.classList.remove("cart-drawer-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [cartOpen, legalModal]);

  const filteredBeats = useMemo(
    () =>
      beats.filter((beat) =>
        `${beat.title} ${beat.producer}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ),
    [beats, query]
  );

  const visibleBeats = filteredBeats.slice(0, visibleCount);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || visibleCount >= filteredBeats.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) =>
            Math.min(count + PAGE_SIZE, filteredBeats.length)
          );
        }
      },
      { rootMargin: "300px 0px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [filteredBeats.length, visibleCount]);

  const publicUrl = (bucket: string, path: string) =>
    path
      ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
      : "";

  const globalCoverPath =
    settings.settings?.media?.globalCoverPath || "";

  const coverUrlFor = (beat: Beat) =>
    publicUrl("beat-covers", globalCoverPath || beat.cover_path);

  const headerLogoText =
    settings.settings?.branding?.headerLogoText?.trim() || "YE2K";
  const footerLogoText =
    settings.settings?.branding?.footerLogoText?.trim() || "YE2K";
  const aboutVisible = settings.settings?.about?.visible !== false;
  const announcement = settings.settings?.announcement;
  const creativeSettings = settings.settings?.creative;
  const workspaceEnabled = creativeSettings?.workspaceEnabled === true;
  const lyricsEnabled = creativeSettings?.lyricsEnabled !== false;
  const autoSaveEnabled = creativeSettings?.autoSaveEnabled !== false;
  const txtDownloadEnabled = creativeSettings?.txtDownloadEnabled !== false;

  function connectAudio(
    audio: HTMLAudioElement,
    beat: Beat,
    startAt = 0
  ) {
    audio.onloadedmetadata = () => {
      const nextDuration = audio.duration || 0;
      setDuration(nextDuration);
      setDurations((current) => ({
        ...current,
        [beat.id]: nextDuration
      }));

      if (startAt > 0) {
        audio.currentTime = Math.min(startAt, nextDuration);
      }
    };

    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
    audio.onended = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    audio.onerror = () => {
      setPlaying(false);
      setActiveBeat(null);
    };

    setActiveBeat(beat);
  }

  async function playBeat(beat: Beat, startAt = 0) {
    const url = publicUrl("beat-previews", beat.preview_path);
    if (!url) return;

    if (activeBeat?.id === beat.id && audioRef.current) {
      if (startAt > 0) {
        audioRef.current.currentTime = Math.min(
          startAt,
          audioRef.current.duration || startAt
        );
      }

      if (audioRef.current.paused) {
        await audioRef.current.play();
      } else if (startAt === 0) {
        audioRef.current.pause();
      }

      return;
    }

    audioRef.current?.pause();
    setCurrentTime(0);
    setDuration(durations[beat.id] || 0);

    const audio = new Audio(url);
    audio.preload = "metadata";
    audioRef.current = audio;
    connectAudio(audio, beat, startAt);

    try {
      await audio.play();
    } catch {
      setPlaying(false);
      setActiveBeat(null);
    }
  }

  function seek(value: number) {
    if (!audioRef.current || !Number.isFinite(value)) return;

    const next = Math.min(
      Math.max(value, 0),
      audioRef.current.duration || duration || value
    );

    audioRef.current.currentTime = next;
    setCurrentTime(next);
  }

  function seekBeat(beat: Beat, seconds: number) {
    if (activeBeat?.id === beat.id) {
      seek(seconds);
      return;
    }

    playBeat(beat, seconds);
  }


  useEffect(() => {
    if (!workspaceBeat) return;

    const notesKey = `ye2k-notes:${workspaceBeat.id}`;
    const viewKey = `ye2k-notes-view:${workspaceBeat.id}`;
    setWorkspaceNotes(window.localStorage.getItem(notesKey) || "");
    setWorkspaceSaved(false);

    window.requestAnimationFrame(() => {
      const textarea = workspaceTextareaRef.current;
      if (!textarea) return;

      try {
        const savedView = JSON.parse(
          window.localStorage.getItem(viewKey) || "{}"
        ) as {
          scrollTop?: number;
          selectionStart?: number;
          selectionEnd?: number;
        };

        textarea.scrollTop = savedView.scrollTop || 0;

        if (
          typeof savedView.selectionStart === "number" &&
          typeof savedView.selectionEnd === "number"
        ) {
          textarea.setSelectionRange(
            savedView.selectionStart,
            savedView.selectionEnd
          );
        }
      } catch {
        // Ignore malformed local browser data.
      }
    });
  }, [workspaceBeat]);

  useEffect(() => {
    if (!workspaceBeat || !autoSaveEnabled) return;

    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(
        `ye2k-notes:${workspaceBeat.id}`,
        workspaceNotes
      );
      setWorkspaceSaved(true);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [autoSaveEnabled, workspaceBeat, workspaceNotes]);

  useEffect(() => {
    if (!workspaceBeat) return;

    const closeWorkspace = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkspaceBeat(null);
    };

    document.body.classList.add("workspace-open");
    window.addEventListener("keydown", closeWorkspace);

    return () => {
      document.body.classList.remove("workspace-open");
      window.removeEventListener("keydown", closeWorkspace);
    };
  }, [workspaceBeat]);

  function saveWorkspaceNotes() {
    if (!workspaceBeat) return;

    window.localStorage.setItem(
      `ye2k-notes:${workspaceBeat.id}`,
      workspaceNotes
    );
    setWorkspaceSaved(true);
  }

  function downloadWorkspaceNotes() {
    if (!workspaceBeat) return;

    const title = workspaceBeat.catalog_code
      ? `${workspaceBeat.catalog_code}-${workspaceBeat.title}`
      : workspaceBeat.title;
    const safeName =
      title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "YE2K-notes";
    const content = [
      workspaceBeat.catalog_code || "YE2K",
      workspaceBeat.title,
      workspaceBeat.producer,
      "",
      workspaceNotes
    ].join("\n");

    const blob = new Blob([content], {
      type: "text/plain;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function buyNow(beat: Beat) {
    if (!has(beat.id)) add(beat);
    setCartOpen(true);
  }

  function toggleCartItem(beat: Beat) {
    if (has(beat.id)) {
      remove(beat.id);
    } else {
      add(beat);
      setCartOpen(true);
    }
  }

  const rememberDuration = useCallback(
    (beatId: string, seconds: number) => {
      setDurations((current) =>
        current[beatId] === seconds
          ? current
          : { ...current, [beatId]: seconds }
      );
    },
    []
  );

  return (
    <main className="site-shell">
      {!loading && announcement?.enabled && announcement.text && (
        <div className="announcement-bar">
          {announcement.link ? (
            <a
              href={announcement.link}
              target={announcement.openInNewTab ? "_blank" : undefined}
              rel={announcement.openInNewTab ? "noreferrer" : undefined}
            >
              <span>{announcement.text}</span>
              <b>→</b>
            </a>
          ) : (
            <span>{announcement.text}</span>
          )}
        </div>
      )}

      <header className="site-header">
        <div className="brand-world">
          <Link href="/" className="brand" aria-label={`${headerLogoText} home`}>
            <span>{headerLogoText}</span>
          </Link>
          <div className="world-mark" aria-label="Worldwide digital delivery">
            <span className="world-globe" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <small>Worldwide</small>
          </div>
        </div>

        <nav>
          <a href="#beats" className="active">
            Beats
          </a>
          {!loading && aboutVisible && <a href="#about">About</a>}
        </nav>

        <div className="header-actions">
          <Link href="/admin" aria-label="Admin">
            ◎
          </Link>
          <button
            className="cart-pill cart-trigger"
            onClick={() => setCartOpen(true)}
          >
            Cart <b>{items.length}</b>
          </button>
        </div>
      </header>

      {loading ? (
        <section
          className="hero hero-clean hero-loading"
          aria-label="Loading website content"
        >
          <div className="hero-loading-content" aria-hidden="true">
            <span />
            <i />
            <i />
            <small />
          </div>
        </section>
      ) : (
        <section className="hero hero-clean hero-world">
          <div className="hero-statement">
            <p className="eyebrow">{settings.eyebrow}</p>
            <h1>
              <span>{settings.headline_primary}</span>
              <em>{settings.headline_accent}</em>
            </h1>
            <span className="hero-period" aria-hidden="true" />
            <p className="hero-copy">{settings.description}</p>
          </div>

          <InteractiveWorld />
        </section>
      )}

      <section className="samples-shell" id="beats">
        <div className="catalog-toolbar">
          <div className="catalog-tabs" aria-label="Beat catalogue">
            <strong>All beats</strong>
            <span>New</span>
          </div>

          <div className="catalog-search">
            <label>
              <span className="sr-only">Search beats</span>
              <input
                aria-label="Search beats"
                placeholder="Search beats"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <span>Newest</span>
          </div>
        </div>

        {loading ? (
          <div className="catalog-empty">
            <div className="empty-wave" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, index) => (
                <i key={index} />
              ))}
            </div>
            <p className="eyebrow">LOADING CATALOG</p>
          </div>
        ) : visibleBeats.length === 0 ? (
          <div className="catalog-empty">
            <p className="eyebrow">
              {beats.length === 0 ? "COMING SOON" : "NO RESULTS"}
            </p>
            <h3>
              {beats.length === 0
                ? "No beats available yet."
                : "No beats match your search."}
            </h3>
          </div>
        ) : (
          <>
            <div className="sample-grid">
              {visibleBeats.map((beat) => {
                const cover = coverUrlFor(beat);
                const previewUrl = publicUrl(
                  "beat-previews",
                  beat.preview_path
                );
                const isActive = activeBeat?.id === beat.id;
                const rowDuration =
                  durations[beat.id] ||
                  (isActive ? duration : 0);
                const rowCurrentTime = isActive ? currentTime : 0;

                return (
                  <article
                    className={`sample-card ${
                      isActive ? "is-active" : ""
                    }`}
                    key={beat.id}
                  >
                    <div className="sample-cover-wrap">
                      <div
                        className="sample-cover"
                        style={
                          cover
                            ? { backgroundImage: `url(${cover})` }
                            : undefined
                        }
                      />
                      <span className="preview-label">Preview</span>
                    </div>

                    <button
                      className="sample-play"
                      onClick={() => playBeat(beat)}
                      aria-label={`${
                        isActive && playing ? "Pause" : "Play"
                      } ${beat.title}`}
                    >
                      {isActive && playing ? "Ⅱ" : "▶"}
                    </button>

                    <div className="sample-info">
                      <h3>
                        {beat.title}
                        {beat.catalog_code && (
                          <small className="catalog-code">
                            {beat.catalog_code}
                          </small>
                        )}
                      </h3>
                      <p>{beat.producer}</p>
                      <div className="sample-meta">
                        <span className="format-pill">
                          MP3{beat.wav_path ? " + WAV" : ""}
                        </span>
                        <span>{formatTime(rowDuration)}</span>
                      </div>
                    </div>

                    <div className="sample-waveform">
                      <WaveformCanvas
                        src={previewUrl}
                        currentTime={rowCurrentTime}
                        duration={rowDuration}
                        playing={isActive && playing}
                        compact
                        onDuration={(seconds) =>
                          rememberDuration(beat.id, seconds)
                        }
                        onSeek={(seconds) => seekBeat(beat, seconds)}
                      />
                      {isActive && (
                        <span className="waveform-position">
                          {formatTime(currentTime)}
                        </span>
                      )}
                    </div>

                    <div className="sample-footer">
                      <strong>${Number(beat.price).toFixed(2)}</strong>
                      <div className="sample-actions">
                        <button
                          className="buy-now-btn"
                          onClick={() => buyNow(beat)}
                        >
                          Buy now
                        </button>
                        <button
                          className={
                            has(beat.id)
                              ? "card-add-btn added"
                              : "card-add-btn"
                          }
                          onClick={() => toggleCartItem(beat)}
                        >
                          {has(beat.id) ? "Added" : "Add"}
                        </button>
                        {workspaceEnabled && (
                          <button
                            type="button"
                            className="workspace-open-btn"
                            onClick={() => setWorkspaceBeat(beat)}
                            aria-label={`Open writing workspace for ${beat.title}`}
                            title="Open writing workspace"
                          >
                            <svg
                              className="workspace-notepad-icon"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              focusable="false"
                            >
                              <rect x="6" y="3.5" width="14" height="17" rx="2" />
                              <path d="M9.5 8h7M9.5 12h7M9.5 16h5" />
                              <path d="M6 7H3.5M6 11H3.5M6 15H3.5" />
                            </svg>
                            <span className="sr-only">Open writing workspace</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {visibleCount < filteredBeats.length && (
              <div className="load-more-wrap" ref={loadMoreRef}>
                <button
                  className="load-more-btn"
                  onClick={() =>
                    setVisibleCount((count) =>
                      Math.min(
                        count + PAGE_SIZE,
                        filteredBeats.length
                      )
                    )
                  }
                >
                  Load more <span>⌄</span>
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {!loading && aboutVisible && (
        <section className="about-band" id="about">
          <p className="eyebrow">
            {settings.settings?.about?.eyebrow ||
              "THE YE2K STANDARD"}
          </p>
          <h2>
            {settings.settings?.about?.headline ||
              "Built for artists who care how the record feels."}
          </h2>
          <p>
            {settings.settings?.about?.description ||
              "Every beat comes with clear pricing and immediate access to every included file after payment."}
          </p>
        </section>
      )}

      <footer>
        <div className="brand footer-brand" aria-label={footerLogoText}>
          <span>{footerLogoText}</span>
        </div>
        <p>Premium beats. Clear pricing. Instant delivery.</p>
        <div>
          <button type="button" onClick={() => setLegalModal("terms")}>
            Terms
          </button>
          <button type="button" onClick={() => setLegalModal("privacy")}>
            Privacy
          </button>
        </div>
      </footer>

      {workspaceBeat && (
        <div
          className="workspace-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setWorkspaceBeat(null);
            }
          }}
        >
          <section
            className="beat-workspace"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-title"
          >
            <header className="workspace-header">
              <div>
                <p>{workspaceBeat.catalog_code || "YE2K"}</p>
                <h2 id="workspace-title">Creative Session</h2>
                <strong>{workspaceBeat.title}</strong>
                <span>{workspaceBeat.producer}</span>
              </div>
              <button
                className="workspace-close"
                onClick={() => setWorkspaceBeat(null)}
                aria-label="Close workspace"
              >
                ×
              </button>
            </header>

            <div className="workspace-player">
              <button
                className="workspace-play"
                onClick={() => playBeat(workspaceBeat)}
                aria-label={`${
                  activeBeat?.id === workspaceBeat.id && playing
                    ? "Pause"
                    : "Play"
                } ${workspaceBeat.title}`}
              >
                {activeBeat?.id === workspaceBeat.id && playing ? "Ⅱ" : "▶"}
              </button>

              <div>
                <WaveformCanvas
                  src={publicUrl(
                    "beat-previews",
                    workspaceBeat.preview_path
                  )}
                  currentTime={
                    activeBeat?.id === workspaceBeat.id ? currentTime : 0
                  }
                  duration={
                    durations[workspaceBeat.id] ||
                    (activeBeat?.id === workspaceBeat.id ? duration : 0)
                  }
                  playing={
                    activeBeat?.id === workspaceBeat.id && playing
                  }
                  onSeek={(seconds) => seekBeat(workspaceBeat, seconds)}
                  onDuration={(seconds) =>
                    rememberDuration(workspaceBeat.id, seconds)
                  }
                />
                <div className="workspace-time">
                  <span>
                    {formatTime(
                      activeBeat?.id === workspaceBeat.id
                        ? currentTime
                        : 0
                    )}
                  </span>
                  <span>
                    {formatTime(
                      durations[workspaceBeat.id] ||
                        (activeBeat?.id === workspaceBeat.id
                          ? duration
                          : 0)
                    )}
                  </span>
                </div>
              </div>
            </div>

            {lyricsEnabled && (
              <div className="workspace-notes">
                <div className="workspace-notes-heading">
                  <div>
                    <p>NOTEPAD</p>
                    <h3>Write while the beat plays.</h3>
                  </div>
                  <span>
                    {autoSaveEnabled
                      ? workspaceSaved
                        ? "● Saved"
                        : "● Saving"
                      : "Manual save"}
                  </span>
                </div>

                <textarea
                  ref={workspaceTextareaRef}
                  value={workspaceNotes}
                  onChange={(event) => {
                    setWorkspaceNotes(event.target.value);
                    setWorkspaceSaved(false);

                    if (workspaceBeat) {
                      window.localStorage.setItem(
                        `ye2k-notes-view:${workspaceBeat.id}`,
                        JSON.stringify({
                          scrollTop: event.currentTarget.scrollTop,
                          selectionStart: event.currentTarget.selectionStart,
                          selectionEnd: event.currentTarget.selectionEnd
                        })
                      );
                    }
                  }}
                  onScroll={(event) => {
                    if (!workspaceBeat) return;

                    window.localStorage.setItem(
                      `ye2k-notes-view:${workspaceBeat.id}`,
                      JSON.stringify({
                        scrollTop: event.currentTarget.scrollTop,
                        selectionStart: event.currentTarget.selectionStart,
                        selectionEnd: event.currentTarget.selectionEnd
                      })
                    );
                  }}
                  onSelect={(event) => {
                    if (!workspaceBeat) return;

                    window.localStorage.setItem(
                      `ye2k-notes-view:${workspaceBeat.id}`,
                      JSON.stringify({
                        scrollTop: event.currentTarget.scrollTop,
                        selectionStart: event.currentTarget.selectionStart,
                        selectionEnd: event.currentTarget.selectionEnd
                      })
                    );
                  }}
                  placeholder="Start writing…"
                  spellCheck
                />
              </div>
            )}

            <footer className="workspace-actions">
              <div>
                {lyricsEnabled && !autoSaveEnabled && (
                  <button className="workspace-save" onClick={saveWorkspaceNotes}>Save notes</button>
                )}
                {lyricsEnabled && txtDownloadEnabled && (
                  <button
                    className="workspace-download"
                    onClick={downloadWorkspaceNotes}
                  >
                    <span aria-hidden="true">↓</span>
                    Download TXT
                  </button>
                )}
              </div>

              <button
                className="workspace-buy"
                onClick={() => {
                  buyNow(workspaceBeat);
                  setWorkspaceBeat(null);
                }}
              >
                Buy beat — ${Number(workspaceBeat.price).toFixed(2)}
              </button>
            </footer>
          </section>
        </div>
      )}

      {legalModal && (
        <div
          className="legal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setLegalModal(null);
            }
          }}
        >
          <section
            className="legal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-modal-title"
          >
            <div className="legal-modal-header">
              <div>
                <p className="legal-kicker">YE2K</p>
                <h2 id="legal-modal-title">
                  {legalModal === "terms" ? "Terms of Use" : "Privacy Policy"}
                </h2>
              </div>
              <button
                type="button"
                className="legal-close"
                onClick={() => setLegalModal(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="legal-modal-body">
              {legalModal === "terms" ? (
                <>
                  <section>
                    <h3>Digital purchases</h3>
                    <p>
                      All products are delivered digitally. By completing a
                      purchase, you confirm that the beat title, included file
                      formats, price, and order details are correct.
                    </p>
                  </section>
                  <section>
                    <h3>Download access</h3>
                    <p>
                      Secure download links are issued after verified payment.
                      You are responsible for saving purchased files before a
                      temporary link expires. YE2K may reissue access when an
                      order can be verified.
                    </p>
                  </section>
                  <section>
                    <h3>Refunds</h3>
                    <p>
                      Because digital files are delivered immediately, sales are
                      generally final. Refunds may be considered for duplicate
                      charges, inaccessible files, or another verified technical
                      failure that YE2K cannot correct.
                    </p>
                  </section>
                  <section>
                    <h3>Rights and ownership</h3>
                    <p>
                      Copyright and ownership remain with YE2K unless a separate
                      written agreement states otherwise. A purchase grants only
                      the usage rights described with that product or provided in
                      writing. Files may not be resold, redistributed, shared, or
                      offered as standalone downloads.
                    </p>
                  </section>
                  <section>
                    <h3>Availability and liability</h3>
                    <p>
                      YE2K may update pricing, availability, and site features at
                      any time. To the fullest extent permitted by law, YE2K is
                      not responsible for indirect losses, lost profits, or
                      third-party service interruptions.
                    </p>
                  </section>
                </>
              ) : (
                <>
                  <section>
                    <h3>Information collected</h3>
                    <p>
                      YE2K may collect account details, contact information,
                      order records, download activity, and basic technical data
                      needed to operate and secure the store.
                    </p>
                  </section>
                  <section>
                    <h3>Payments</h3>
                    <p>
                      Payments are processed by Stripe. YE2K does not store full
                      card numbers. Stripe may process payment and fraud-prevention
                      information under its own privacy terms.
                    </p>
                  </section>
                  <section>
                    <h3>Supabase and service providers</h3>
                    <p>
                      Supabase is used for database, authentication, and file
                      storage services. Hosting, analytics, email, and security
                      providers may receive only the information reasonably needed
                      to provide their services.
                    </p>
                  </section>
                  <section>
                    <h3>How information is used</h3>
                    <p>
                      Information is used to complete purchases, deliver files,
                      maintain order history, prevent abuse, provide support, and
                      improve site reliability. YE2K does not sell personal
                      information.
                    </p>
                  </section>
                  <section>
                    <h3>Requests</h3>
                    <p>
                      You may request access, correction, or deletion of eligible
                      personal information by contacting the support email shown
                      on the site. Certain transaction records may be retained for
                      legal, accounting, or fraud-prevention purposes.
                    </p>
                  </section>
                </>
              )}
            </div>

            <div className="legal-modal-footer">
              <button type="button" onClick={() => setLegalModal(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      <div
        className={`cart-overlay ${cartOpen ? "is-open" : ""}`}
        onClick={() => setCartOpen(false)}
        aria-hidden={!cartOpen}
      />

      <aside
        className={`cart-drawer ${cartOpen ? "is-open" : ""}`}
        aria-hidden={!cartOpen}
        aria-label="Shopping cart"
      >
        <div className="cart-drawer-header">
          <div>
            <p className="eyebrow">YOUR SELECTION</p>
            <h2>Cart</h2>
          </div>
          <button
            className="cart-close"
            onClick={() => setCartOpen(false)}
            aria-label="Close cart"
          >
            ×
          </button>
        </div>

        <div className="cart-drawer-items">
          {items.length === 0 ? (
            <div className="cart-drawer-empty">
              <p>Your cart is empty.</p>
              <span>Add a beat to start your order.</span>
            </div>
          ) : (
            items.map((item) => (
              <div className="cart-drawer-item" key={item.id}>
                <div
                  className="cart-drawer-cover"
                  style={{
                    backgroundImage: `url(${coverUrlFor(item)})`
                  }}
                />
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.producer}</span>
                  <small>
                    MP3{item.wav_path ? " + WAV" : ""}
                  </small>
                </div>
                <b>${Number(item.price).toFixed(2)}</b>
                <button
                  onClick={() => remove(item.id)}
                  aria-label={`Remove ${item.title}`}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className="cart-drawer-footer">
          <div className="cart-drawer-total">
            <span>Subtotal</span>
            <strong>${total.toFixed(2)}</strong>
          </div>
          <Link
            href="/checkout"
            className={`checkout-btn ${
              items.length === 0 ? "disabled" : ""
            }`}
            onClick={() => setCartOpen(false)}
          >
            Checkout securely <span>→</span>
          </Link>
          <p className="secure-note">
            Secure payment · Instant digital delivery
          </p>
        </div>
      </aside>

    </main>
  );
}
