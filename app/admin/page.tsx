"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";
import type { Beat, SiteSettings } from "@/lib/types";

type FormState = {
  title: string;
  producer: string;
  price: string;
  status: "draft" | "published";
};

const initial: FormState = {
  title: "",
  producer: "YE2K",
  price: "29.99",
  status: "draft"
};

const defaultSiteSettings: SiteSettings = {
  id: 1,
  eyebrow: "ORIGINAL SOUND · INSTANT DELIVERY",
  headline_primary: "Find the beat that",
  headline_accent: "changes everything.",
  description:
    "Premium production for artists building the next era. Preview instantly, scrub every track, and download your files after checkout.",
  settings: {
    media: {
      globalCoverPath: ""
    },
    about: {
      visible: true,
      eyebrow: "THE YE2K STANDARD",
      headline: "Built for artists who care how the record feels.",
      description: "Every beat comes with clear pricing and immediate access to every included file after payment."
    }
  },
  updated_at: ""
};

export default function AdminPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [sessionReady, setSessionReady] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [password, setPassword] = useState("");
  const [form, setForm] = useState(initial);
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<File | null>(null);
  const [mp3, setMp3] = useState<File | null>(null);
  const [wav, setWav] = useState<File | null>(null);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [editingBeat, setEditingBeat] = useState<Beat | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(defaultSiteSettings);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [globalCover, setGlobalCover] = useState<File | null>(null);
  const [settingsFileInputKey, setSettingsFileInputKey] = useState(0);

  async function refresh() {
    const [beatsResult, settingsResult] = await Promise.all([
      supabase.from("beats").select("*").order("created_at", { ascending: false }),
      supabase.from("site_settings").select("*").eq("id", 1).maybeSingle()
    ]);

    if (beatsResult.error) setMessage(beatsResult.error.message);
    setBeats((beatsResult.data || []) as Beat[]);
    if (settingsResult.data) setSiteSettings(settingsResult.data as SiteSettings);
  }

  async function saveSiteSettings(event: React.FormEvent) {
    event.preventDefault();
    setSettingsBusy(true);
    setSettingsMessage("");

    try {
      let globalCoverPath = siteSettings.settings?.media?.globalCoverPath || "";

      if (globalCover) {
        const extension = globalCover.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `site/global-cover.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("beat-covers")
          .upload(path, globalCover, { upsert: true });

        if (uploadError) throw uploadError;
        globalCoverPath = path;
      }

      const settings = {
        ...(siteSettings.settings || {}),
        media: {
          ...(siteSettings.settings?.media || {}),
          globalCoverPath
        },
        about: {
          visible: siteSettings.settings?.about?.visible !== false,
          eyebrow:
            siteSettings.settings?.about?.eyebrow?.trim() || "THE YE2K STANDARD",
          headline:
            siteSettings.settings?.about?.headline?.trim() ||
            "Built for artists who care how the record feels.",
          description:
            siteSettings.settings?.about?.description?.trim() ||
            "Every beat comes with clear pricing and immediate access to every included file after payment."
        }
      };

      const payload = {
        id: 1,
        eyebrow: siteSettings.eyebrow.trim(),
        headline_primary: siteSettings.headline_primary.trim(),
        headline_accent: siteSettings.headline_accent.trim(),
        description: siteSettings.description.trim(),
        settings,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from("site_settings")
        .upsert(payload, { onConflict: "id" })
        .select()
        .single();

      if (error) throw error;

      setSiteSettings(data as SiteSettings);
      setGlobalCover(null);
      setSettingsFileInputKey((value) => value + 1);
      setSettingsMessage("Website settings updated.");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "Settings update failed.");
    } finally {
      setSettingsBusy(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session));
      setSessionReady(true);
      if (data.session) refresh();
    });
  }, [supabase]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password
    });

    if (error) setMessage(error.message);
    else {
      setAuthenticated(true);
      await refresh();
    }

    setBusy(false);
  }

  async function upload(file: File, bucket: string, beatId: string, name: string) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${beatId}/${name}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });

    if (error) throw error;
    return path;
  }

  function resetForm() {
    setEditingBeat(null);
    setForm(initial);
    setCover(null);
    setPreview(null);
    setMp3(null);
    setWav(null);
    setFileInputKey((value) => value + 1);
  }

  function beginEdit(beat: Beat) {
    setEditingBeat(beat);
    setForm({
      title: beat.title,
      producer: beat.producer,
      price: String(beat.price),
      status: beat.status === "published" ? "published" : "draft"
    });
    setCover(null);
    setPreview(null);
    setMp3(null);
    setWav(null);
    setMessage("");
    setFileInputKey((value) => value + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveBeat(event: React.FormEvent) {
    event.preventDefault();

    const globalCoverPath = siteSettings.settings?.media?.globalCoverPath || "";

    if (!editingBeat && (!preview || !mp3 || (!cover && !globalCoverPath))) {
      setMessage(
        "Preview MP3 and full MP3 are required. Add artwork or set a global beat image in Website Settings."
      );
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const beatId = editingBeat?.id || crypto.randomUUID();
      const slug = form.title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const coverPath = cover
        ? await upload(cover, "beat-covers", beatId, "cover")
        : editingBeat?.cover_path || globalCoverPath;
      const previewPath = preview
        ? await upload(preview, "beat-previews", beatId, "preview")
        : editingBeat?.preview_path;
      const mp3Path = mp3
        ? await upload(mp3, "beat-files", beatId, "master")
        : editingBeat?.mp3_path;
      const wavPath = wav
        ? await upload(wav, "beat-files", beatId, "master-wav")
        : editingBeat?.wav_path || null;

      if (!coverPath || !previewPath || !mp3Path) {
        throw new Error("Preview MP3, full MP3, and either beat artwork or a global beat image are required.");
      }

      const payload = {
        title: form.title.trim(),
        slug,
        producer: form.producer.trim(),
        price: Number(form.price),
        status: form.status,
        cover_path: coverPath,
        preview_path: previewPath,
        mp3_path: mp3Path,
        wav_path: wavPath,
        updated_at: new Date().toISOString()
      };

      const result = editingBeat
        ? await supabase.from("beats").update(payload).eq("id", beatId)
        : await supabase.from("beats").insert({ id: beatId, ...payload });

      if (result.error) throw result.error;

      setMessage(editingBeat ? "Beat updated successfully." : "Beat saved successfully.");
      resetForm();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(beat: Beat) {
    const status = beat.status === "published" ? "draft" : "published";
    const { error } = await supabase
      .from("beats")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", beat.id);

    if (error) setMessage(error.message);
    else refresh();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAuthenticated(false);
  }

  if (!sessionReady) return <main className="center-screen">Loading…</main>;

  if (!authenticated) {
    return (
      <main className="admin-shell login-shell">
        <section className="login-card">
          <div className="brand brand-large"><span>YE2K</span></div>
          <p className="eyebrow">PRIVATE BACK OFFICE</p>
          <h1>Sign in to manage your catalog.</h1>
          <form onSubmit={signIn} className="stack">
            <label>
              Email
              <input
                type="email"
                value={userEmail}
                onChange={(event) => setUserEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          {message && <p className="form-message">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <div className="brand"><span>YE2K</span></div>
          <p>Catalog administration</p>
        </div>
        <button className="ghost-btn" onClick={signOut}>Sign out</button>
      </header>

      <section className="admin-panel homepage-settings-panel">
        <div className="settings-heading">
          <div>
            <p className="eyebrow">HOMEPAGE SETTINGS</p>
            <h2>Website content</h2>
          </div>
          <p>Manage homepage text, the shared beat image, and the About section.</p>
        </div>

        <form onSubmit={saveSiteSettings} className="admin-form">
          <div className="form-grid">
            <label>
              Eyebrow
              <input
                value={siteSettings.eyebrow}
                onChange={(event) =>
                  setSiteSettings({ ...siteSettings, eyebrow: event.target.value })
                }
                required
              />
            </label>

            <label>
              Main headline
              <input
                value={siteSettings.headline_primary}
                onChange={(event) =>
                  setSiteSettings({ ...siteSettings, headline_primary: event.target.value })
                }
                required
              />
            </label>

            <label>
              Highlighted headline
              <input
                value={siteSettings.headline_accent}
                onChange={(event) =>
                  setSiteSettings({ ...siteSettings, headline_accent: event.target.value })
                }
                required
              />
            </label>

            <label className="settings-description-field">
              Description
              <textarea
                value={siteSettings.description}
                onChange={(event) =>
                  setSiteSettings({ ...siteSettings, description: event.target.value })
                }
                rows={4}
                required
              />
            </label>
          </div>

          <div className="settings-subsection">
            <div>
              <p className="eyebrow">GLOBAL BEAT IMAGE</p>
              <h3>Use one image for every beat</h3>
              <p className="settings-help">
                This image is used automatically for new beats unless you upload custom artwork.
                Existing custom artwork remains unchanged.
              </p>
            </div>

            <label className="settings-upload-field">
              Shared artwork
              <input
                key={settingsFileInputKey}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setGlobalCover(event.target.files?.[0] || null)}
              />
            </label>

            {siteSettings.settings?.media?.globalCoverPath && (
              <p className="settings-current-file">
                Current: {siteSettings.settings.media.globalCoverPath}
              </p>
            )}
          </div>

          <div className="settings-subsection">
            <div>
              <p className="eyebrow">ABOUT SECTION</p>
              <h3>Edit the About content</h3>
            </div>

            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={siteSettings.settings?.about?.visible !== false}
                onChange={(event) =>
                  setSiteSettings({
                    ...siteSettings,
                    settings: {
                      ...(siteSettings.settings || {}),
                      about: {
                        ...(siteSettings.settings?.about || {}),
                        visible: event.target.checked
                      }
                    }
                  })
                }
              />
              <span>
                <strong>Show About section</strong>
                <small>Turn this off to hide the section from the storefront.</small>
              </span>
            </label>

            <div className="form-grid">
              <label>
                About eyebrow
                <input
                  value={siteSettings.settings?.about?.eyebrow || ""}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        about: {
                          ...(siteSettings.settings?.about || {}),
                          eyebrow: event.target.value
                        }
                      }
                    })
                  }
                />
              </label>

              <label>
                About headline
                <input
                  value={siteSettings.settings?.about?.headline || ""}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        about: {
                          ...(siteSettings.settings?.about || {}),
                          headline: event.target.value
                        }
                      }
                    })
                  }
                />
              </label>

              <label className="settings-description-field">
                About description
                <textarea
                  value={siteSettings.settings?.about?.description || ""}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        about: {
                          ...(siteSettings.settings?.about || {}),
                          description: event.target.value
                        }
                      }
                    })
                  }
                  rows={4}
                />
              </label>
            </div>
          </div>

          <button className="primary-btn settings-save-btn" disabled={settingsBusy}>
            {settingsBusy ? "Saving…" : "Save website settings"}
          </button>
        </form>

        {settingsMessage && <p className="form-message">{settingsMessage}</p>}
      </section>

      <div className="admin-grid">
        <section className="admin-panel">
          <p className="eyebrow">{editingBeat ? "EDIT RELEASE" : "NEW RELEASE"}</p>
          <h1>{editingBeat ? `Edit ${editingBeat.title}` : "Upload a beat"}</h1>

          <form onSubmit={saveBeat} className="admin-form">
            <div className="form-grid">
              <label>
                Title
                <input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  required
                />
              </label>

              <label>
                Producer
                <input
                  value={form.producer}
                  onChange={(event) => setForm({ ...form, producer: event.target.value })}
                  required
                />
              </label>

              <label>
                Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setForm({ ...form, price: event.target.value })}
                  required
                />
              </label>

              <label>
                Status
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value as FormState["status"] })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>
            </div>

            <div className="upload-grid" key={fileInputKey}>
              <label>
                Artwork
                <small>
                  {editingBeat
                    ? "Leave empty to keep the current file"
                    : siteSettings.settings?.media?.globalCoverPath
                      ? "Optional — the global artwork will be used automatically"
                      : "Required until a global beat image is set"}
                </small>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setCover(event.target.files?.[0] || null)}
                  required={!editingBeat && !siteSettings.settings?.media?.globalCoverPath}
                />
              </label>

              <label>
                Preview MP3 {editingBeat && <small>Leave empty to keep current file</small>}
                <input
                  type="file"
                  accept="audio/mpeg"
                  onChange={(event) => setPreview(event.target.files?.[0] || null)}
                  required={!editingBeat}
                />
              </label>

              <label>
                Full MP3 {editingBeat && <small>Leave empty to keep current file</small>}
                <input
                  type="file"
                  accept="audio/mpeg"
                  onChange={(event) => setMp3(event.target.files?.[0] || null)}
                  required={!editingBeat}
                />
              </label>

              <label>
                WAV {editingBeat && <small>Upload only to add or replace WAV</small>}
                <input
                  type="file"
                  accept="audio/wav,audio/x-wav"
                  onChange={(event) => setWav(event.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div className="admin-form-actions">
              <button className="primary-btn" disabled={busy}>
                {busy ? "Saving…" : editingBeat ? "Update beat" : "Save beat"}
              </button>
              {editingBeat && (
                <button type="button" className="ghost-btn" onClick={resetForm} disabled={busy}>
                  Cancel editing
                </button>
              )}
            </div>
          </form>

          {message && <p className="form-message">{message}</p>}
        </section>

        <aside className="admin-panel">
          <p className="eyebrow">CATALOG</p>
          <h2>{beats.length} beats</h2>
          <div className="admin-list">
            {beats.length === 0 ? (
              <p className="empty-copy">No beats uploaded yet.</p>
            ) : (
              beats.map((beat) => (
                <article key={beat.id} className="admin-item">
                  <div>
                    <strong>{beat.title}</strong>
                    <span>{beat.producer} · ${Number(beat.price).toFixed(2)}</span>
                  </div>
                  <div className="admin-item-actions">
                    <button className="ghost-btn" onClick={() => beginEdit(beat)}>Edit</button>
                    <button className="status-btn" onClick={() => toggleStatus(beat)}>
                      {beat.status}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
