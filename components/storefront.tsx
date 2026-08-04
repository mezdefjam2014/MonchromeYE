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

    setWorkspaceNotes(
      window.localStorage.getItem(`ye2k-notes:${workspaceBeat.id}`) || ""
    );
    setWorkspaceSaved(false);
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
          <Link href="/" className="brand">
            <span>YE2K</span>
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
        <section className="hero hero-clean hero-loading" aria-label="Loading website content">
          <div className="hero-loading-content" aria-hidden="true">
            <span />
            <i />
            <i />
            <small />
          </div>
        </section>
      ) : (
        <section className="hero hero-clean">
          <div>
            <p className="eyebrow">{settings.eyebrow}</p>
            <h1>
              {settings.headline_primary}
              <br />
              <em>{settings.headline_accent}</em>
            </h1>
            <p className="hero-copy">{settings.description}</p>
          </div>
        </section>
      )}

      <section className="samples-shell" id="beats">
        <div className="samples-header">
          <div>
            <p className="eyebrow">YE2K CATALOG</p>
            <h2>Latest releases</h2>
          </div>

          <div className="samples-tools">
            <input
              aria-label="Search beats"
              placeholder="Search beats…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              className="mini-cart cart-trigger"
              onClick={() => setCartOpen(true)}
            >
              Cart <b>{items.length}</b>
            </button>
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
                            className="workspace-open-btn"
                            onClick={() => setWorkspaceBeat(beat)}
                          >
                            Write
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
        <div className="brand">
          <span>YE2K</span>
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
                <p>
                  {workspaceBeat.catalog_code || "YE2K"} / CREATIVE SESSION
                </p>
                <h2 id="workspace-title">{workspaceBeat.title}</h2>
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
                        ? "Saved in this browser"
                        : "Auto-saving"
                      : "Manual save"}
                  </span>
                </div>

                <textarea
                  value={workspaceNotes}
                  onChange={(event) => {
                    setWorkspaceNotes(event.target.value);
                    setWorkspaceSaved(false);
                  }}
                  placeholder="Start writing…"
                  spellCheck
                />
              </div>
            )}

            <footer className="workspace-actions">
              <div>
                {lyricsEnabled && !autoSaveEnabled && (
                  <button onClick={saveWorkspaceNotes}>Save notes</button>
                )}
                {lyricsEnabled && txtDownloadEnabled && (
                  <button onClick={downloadWorkspaceNotes}>
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
