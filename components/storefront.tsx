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
    document.body.classList.toggle("cart-drawer-open", cartOpen);

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCartOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.classList.remove("cart-drawer-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [cartOpen]);

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
      <header className="site-header">
        <Link href="/" className="brand">
          <span>YE2K</span>
        </Link>

        <nav>
          <a href="#beats" className="active">
            Beats
          </a>
          {aboutVisible && <a href="#about">About</a>}
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
                      <h3>{beat.title}</h3>
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

      {aboutVisible && (
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
          <a href="#">Terms</a>
          <a href="#">Privacy</a>
        </div>
      </footer>

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
