"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart-provider";

type DownloadFile = {
  beatId: string;
  title: string;
  format: "MP3" | "WAV";
  url: string;
};

const MAX_ATTEMPTS = 20;
const RETRY_DELAY_MS = 1500;

export default function SuccessPage() {
  const { clear } = useCart();
  const [files, setFiles] = useState<DownloadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(
    "Stripe is confirming your payment and preparing your files…"
  );

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const token = params.get("token");

    if (!sessionId || !token) {
      setMessage(
        "This page is missing the secure order details."
      );
      setLoading(false);
      return;
    }

    async function loadDownloads(attempt = 1): Promise<void> {
      try {
        const response = await fetch(
          `/api/orders/downloads` +
          `?session_id=${encodeURIComponent(sessionId!)}` +
          `&token=${encodeURIComponent(token!)}`
        );

        const data = await response.json().catch(() => ({}));

        if (
          response.status === 409 &&
          data.processing &&
          attempt < MAX_ATTEMPTS
        ) {
          if (!cancelled) {
            setMessage(
              "Payment received. Waiting for Stripe's secure confirmation…"
            );
          }

          await new Promise((resolve) =>
            window.setTimeout(resolve, RETRY_DELAY_MS)
          );

          if (!cancelled) {
            return loadDownloads(attempt + 1);
          }

          return;
        }

        if (!response.ok) {
          throw new Error(
            data.error || "Could not prepare downloads."
          );
        }

        if (cancelled) return;

        clear();
        setFiles(data.files || []);
        setMessage(
          data.files?.length
            ? "Your secure download links are ready. They expire in 15 minutes."
            : "Your payment is complete, but no downloadable files were found."
        );
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not prepare downloads."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDownloads();

    return () => {
      cancelled = true;
    };
  }, [clear]);

  const grouped = files.reduce<Record<string, DownloadFile[]>>(
    (groups, file) => {
      groups[file.beatId] = [
        ...(groups[file.beatId] || []),
        file
      ];
      return groups;
    },
    {}
  );

  return (
    <main className="center-screen">
      <section className="success-card success-card-wide">
        <div className="success-mark">✓</div>
        <p className="eyebrow">PAYMENT COMPLETE</p>
        <h1>Your beats are ready.</h1>
        <p>{message}</p>

        {loading && (
          <div className="stripe-processing" aria-label="Preparing downloads">
            <i />
            <i />
            <i />
          </div>
        )}

        {!loading && Object.values(grouped).length > 0 && (
          <div className="download-list">
            {Object.values(grouped).map((beatFiles) => (
              <article
                className="download-item"
                key={beatFiles[0].beatId}
              >
                <div>
                  <strong>{beatFiles[0].title}</strong>
                  <span>
                    {beatFiles
                      .map((file) => file.format)
                      .join(" + ")}
                  </span>
                </div>

                <div className="download-actions">
                  {beatFiles.map((file) => (
                    <a
                      className="download-btn"
                      href={file.url}
                      key={file.format}
                    >
                      Download {file.format}
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}

        <Link href="/" className="primary-btn inline-btn">
          Return to YE2K
        </Link>
      </section>
    </main>
  );
}
