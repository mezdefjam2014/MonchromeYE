"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";
import type { Beat, Site, SiteSettings } from "@/lib/types";

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
    branding: {
      headerLogoText: "YE2K",
      footerLogoText: "YE2K",
      faviconPath: "",
      shareImagePath: "",
      siteTitle: "YE2K — Original Production",
      siteDescription: "Original production. Immediate preview. Secure delivery."
    },
    about: {
      visible: true,
      eyebrow: "THE YE2K STANDARD",
      headline: "Built for artists who care how the record feels.",
      description: "Every beat comes with clear pricing and immediate access to every included file after payment."
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
    },
    hero: {
      globeVisible: true
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
  const [sites, setSites] = useState<Site[]>([]);
  const [activeSite, setActiveSite] = useState<Site | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [shareImageFile, setShareImageFile] = useState<File | null>(null);

  async function refresh(targetSite: Site | null = activeSite) {
    if (!targetSite) return;

    const [beatsResult, settingsResult] = await Promise.all([
      supabase
        .from("beats")
        .select("*")
        .eq("site_id", targetSite.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("storefront_settings")
        .select("*")
        .eq("site_id", targetSite.id)
        .maybeSingle()
    ]);

    if (beatsResult.error) setMessage(beatsResult.error.message);
    setBeats(
      ((beatsResult.data || []) as Beat[]).map((beat) => ({
        ...beat,
        site_slug: targetSite.slug
      }))
    );

    if (settingsResult.data) {
      setSiteSettings(settingsResult.data as SiteSettings);
    } else {
      setSiteSettings({
        ...defaultSiteSettings,
        site_id: targetSite.id,
        settings: {
          ...(defaultSiteSettings.settings || {}),
          branding: {
            ...(defaultSiteSettings.settings?.branding || {}),
            headerLogoText: targetSite.name,
            footerLogoText: targetSite.name
          }
        }
      });
    }
  }

  async function loadSites(preferredSiteId?: string) {
    const { data, error } = await supabase
      .from("sites")
      .select("*")
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    const nextSites = (data || []) as Site[];
    setSites(nextSites);

    const nextSite =
      nextSites.find((site) => site.id === preferredSiteId) ||
      nextSites.find((site) => site.id === activeSite?.id) ||
      nextSites.find((site) => site.is_default) ||
      nextSites[0] ||
      null;

    setActiveSite(nextSite);

    if (nextSite) {
      await refresh(nextSite);
    }
  }

  async function selectSite(siteId: string) {
    const nextSite = sites.find((site) => site.id === siteId) || null;
    setActiveSite(nextSite);
    resetForm();

    if (nextSite) {
      await refresh(nextSite);
    }
  }

  async function duplicateSite() {
    if (!activeSite) return;

    const name = window.prompt("New site name");
    if (!name?.trim()) return;

    const suggestedSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const slug = window.prompt("New site slug", suggestedSlug)?.trim();
    if (!slug) return;

    const prefix =
      window.prompt("Catalog prefix", slug.slice(0, 2).toUpperCase())?.trim().toUpperCase() ||
      "ST";

    setSettingsBusy(true);
    setSettingsMessage("");

    try {
      const { data: site, error: siteError } = await supabase
        .from("sites")
        .insert({
          name: name.trim(),
          slug,
          catalog_prefix: prefix.slice(0, 6),
          is_default: false,
          active: true
        })
        .select()
        .single();

      if (siteError) throw siteError;

      const duplicatedSettings = {
        ...siteSettings,
        id: undefined,
        site_id: site.id,
        settings: {
          ...(siteSettings.settings || {}),
          branding: {
            ...(siteSettings.settings?.branding || {}),
            headerLogoText: name.trim(),
            footerLogoText: name.trim(),
            faviconPath: "",
            shareImagePath: "",
            siteTitle: `${name.trim()} — Original Production`
          },
          media: {
            ...(siteSettings.settings?.media || {}),
            globalCoverPath: ""
          }
        },
        updated_at: new Date().toISOString()
      };

      const { error: settingsError } = await supabase
        .from("storefront_settings")
        .insert(duplicatedSettings);

      if (settingsError) throw settingsError;

      setSettingsMessage("New storefront created. Its beats and uploads are separate.");
      await loadSites(site.id);
    } catch (error) {
      setSettingsMessage(
        error instanceof Error ? error.message : "Could not duplicate storefront."
      );
    } finally {
      setSettingsBusy(false);
    }
  }

  async function deleteSite() {
    if (!activeSite || activeSite.is_default) return;

    const confirmed = window.confirm(
      `Permanently delete "${activeSite.name}"?\n\nThis removes its beats, settings, artwork, previews, MP3s, and WAVs from Supabase. Existing payment records are preserved without the deleted site link. This cannot be undone.`
    );

    if (!confirmed) return;

    const typedSlug = window.prompt(
      `Type ${activeSite.slug} to confirm permanent deletion.`
    );

    if (typedSlug !== activeSite.slug) {
      setSettingsMessage("Storefront deletion canceled.");
      return;
    }

    setSettingsBusy(true);
    setSettingsMessage("");

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your admin session expired. Sign in again.");
      }

      const response = await fetch(
        `/api/admin/sites/${encodeURIComponent(activeSite.id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || "Could not delete the storefront."
        );
      }

      setSettingsMessage(
        `${result.site?.name || "Storefront"} deleted. ${
          result.removedFiles || 0
        } storage file(s) removed.`
      );
      setActiveSite(null);
      setBeats([]);
      resetForm();
      await loadSites();
    } catch (error) {
      setSettingsMessage(
        error instanceof Error
          ? error.message
          : "Could not delete the storefront."
      );
    } finally {
      setSettingsBusy(false);
    }
  }

  async function saveSiteSettings(event: React.FormEvent) {
    event.preventDefault();
    setSettingsBusy(true);
    setSettingsMessage("");

    try {
      if (!activeSite) throw new Error("Choose a storefront first.");

      let globalCoverPath = siteSettings.settings?.media?.globalCoverPath || "";
      let faviconPath = siteSettings.settings?.branding?.faviconPath || "";
      let shareImagePath = siteSettings.settings?.branding?.shareImagePath || "";

      if (globalCover) {
        const extension = globalCover.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${activeSite.slug}/site/global-cover.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("beat-covers")
          .upload(path, globalCover, { upsert: true });

        if (uploadError) throw uploadError;
        globalCoverPath = path;
      }

      if (faviconFile) {
        const extension = faviconFile.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${activeSite.slug}/branding/favicon.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("beat-covers")
          .upload(path, faviconFile, { upsert: true });

        if (uploadError) throw uploadError;
        faviconPath = path;
      }

      if (shareImageFile) {
        const extension = shareImageFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${activeSite.slug}/branding/share-image.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("beat-covers")
          .upload(path, shareImageFile, { upsert: true });

        if (uploadError) throw uploadError;
        shareImagePath = path;
      }

      const settings = {
        ...(siteSettings.settings || {}),
        media: {
          ...(siteSettings.settings?.media || {}),
          globalCoverPath
        },
        branding: {
          headerLogoText:
            siteSettings.settings?.branding?.headerLogoText?.trim() || activeSite.name,
          footerLogoText:
            siteSettings.settings?.branding?.footerLogoText?.trim() || activeSite.name,
          faviconPath,
          shareImagePath,
          siteTitle:
            siteSettings.settings?.branding?.siteTitle?.trim() ||
            `${activeSite.name} — Original Production`,
          siteDescription:
            siteSettings.settings?.branding?.siteDescription?.trim() ||
            siteSettings.description.trim()
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
        },
        announcement: {
          enabled: siteSettings.settings?.announcement?.enabled === true,
          text:
            siteSettings.settings?.announcement?.text?.trim() ||
            "NEW DROP — AVAILABLE NOW",
          link: siteSettings.settings?.announcement?.link?.trim() || "",
          openInNewTab:
            siteSettings.settings?.announcement?.openInNewTab === true
        },
        creative: {
          workspaceEnabled:
            siteSettings.settings?.creative?.workspaceEnabled === true,
          lyricsEnabled:
            siteSettings.settings?.creative?.lyricsEnabled !== false,
          autoSaveEnabled:
            siteSettings.settings?.creative?.autoSaveEnabled !== false,
          txtDownloadEnabled:
            siteSettings.settings?.creative?.txtDownloadEnabled !== false
        },
        hero: {
          globeVisible:
            siteSettings.settings?.hero?.globeVisible !== false
        }
      };

      const payload = {
        site_id: activeSite.id,
        eyebrow: siteSettings.eyebrow.trim(),
        headline_primary: siteSettings.headline_primary.trim(),
        headline_accent: siteSettings.headline_accent.trim(),
        description: siteSettings.description.trim(),
        settings,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from("storefront_settings")
        .upsert(payload, { onConflict: "site_id" })
        .select()
        .single();

      if (error) throw error;

      setSiteSettings(data as SiteSettings);
      setGlobalCover(null);
      setFaviconFile(null);
      setShareImageFile(null);
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
      if (data.session) loadSites();
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
      await loadSites();
    }

    setBusy(false);
  }

  async function upload(file: File, bucket: string, beatId: string, name: string) {
    if (!activeSite) throw new Error("Choose a storefront first.");

    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${activeSite.slug}/${beatId}/${name}.${ext}`;
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
      if (!activeSite) throw new Error("Choose a storefront first.");

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
        site_id: activeSite.id,
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
        ? await supabase
            .from("beats")
            .update(payload)
            .eq("id", beatId)
            .eq("site_id", activeSite.id)
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
      .eq("id", beat.id)
      .eq("site_id", beat.site_id);

    if (error) setMessage(error.message);
    else refresh();
  }

  async function deleteBeat(beat: Beat) {
    const confirmed = window.confirm(
      `Delete "${beat.title}" permanently? This removes the beat from the storefront, database, and Supabase Storage.`
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    try {
      const { error: deleteError } = await supabase
        .from("beats")
        .delete()
        .eq("id", beat.id)
        .eq("site_id", beat.site_id);

      if (deleteError) throw deleteError;

      const globalCoverPath =
        siteSettings.settings?.media?.globalCoverPath || "";

      const storageDeletes: PromiseLike<unknown>[] = [];

      if (beat.preview_path) {
        storageDeletes.push(
          supabase.storage
            .from("beat-previews")
            .remove([beat.preview_path])
        );
      }

      const paidFiles = [beat.mp3_path, beat.wav_path].filter(
        (path): path is string => Boolean(path)
      );

      if (paidFiles.length > 0) {
        storageDeletes.push(
          supabase.storage
            .from("beat-files")
            .remove(paidFiles)
        );
      }

      if (
        beat.cover_path &&
        beat.cover_path !== globalCoverPath
      ) {
        storageDeletes.push(
          supabase.storage
            .from("beat-covers")
            .remove([beat.cover_path])
        );
      }

      const cleanupResults = await Promise.all(storageDeletes);
      const cleanupFailed = cleanupResults.some(
        (result) =>
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          Boolean((result as { error?: unknown }).error)
      );

      if (editingBeat?.id === beat.id) {
        resetForm();
      }

      setMessage(
        cleanupFailed
          ? "Beat deleted. One or more old storage files could not be removed."
          : "Beat deleted permanently."
      );

      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Delete failed."
      );
    } finally {
      setBusy(false);
    }
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

      <nav className="admin-section-nav" aria-label="Back office sections">
        <a href="#admin-storefronts">Storefronts</a>
        <a href="#admin-website">Website</a>
        <a href="#admin-upload">Upload</a>
        <a href="#admin-catalog">Catalog</a>
      </nav>

      <section id="admin-storefronts" className="admin-panel site-manager-panel admin-anchor-section">
        <div className="settings-heading">
          <div>
            <p className="eyebrow">STOREFRONTS</p>
            <h2>{activeSite?.name || "Choose a site"}</h2>
          </div>
          <p>Each storefront has separate settings, beats, and upload folders. Stripe remains shared.</p>
        </div>

        <div className="site-manager-actions">
          <label>
            Managing storefront
            <select
              value={activeSite?.id || ""}
              onChange={(event) => selectSite(event.target.value)}
            >
              {sites.map((site) => (
                <option value={site.id} key={site.id}>
                  {site.name} / {site.slug}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="primary-btn"
            onClick={duplicateSite}
            disabled={!activeSite || settingsBusy}
          >
            Duplicate storefront
          </button>

          <button
            type="button"
            className="danger-btn"
            onClick={deleteSite}
            disabled={
              !activeSite ||
              activeSite.is_default ||
              settingsBusy
            }
            title={
              activeSite?.is_default
                ? "The default storefront cannot be deleted."
                : "Permanently delete this storefront and its Supabase files."
            }
          >
            Delete storefront
          </button>

          {activeSite && (
            <a
              className="ghost-btn site-preview-link"
              href={activeSite.is_default ? "/" : `/s/${activeSite.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              Open storefront
            </a>
          )}
        </div>
      </section>

      <section id="admin-website" className="admin-panel homepage-settings-panel admin-anchor-section">
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

          <div className="settings-subsection branding-settings">
            <div>
              <p className="eyebrow">BRANDING</p>
              <h3>Logo text</h3>
              <p className="settings-help">
                Change the text inside the existing top and footer logo badges.
              </p>
            </div>

            <div className="form-grid">
              <label>
                Top logo text
                <input
                  value={siteSettings.settings?.branding?.headerLogoText || ""}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        branding: {
                          ...(siteSettings.settings?.branding || {}),
                          headerLogoText: event.target.value
                        }
                      }
                    })
                  }
                  maxLength={12}
                  placeholder="YE2K"
                />
              </label>

              <label>
                Bottom logo text
                <input
                  value={siteSettings.settings?.branding?.footerLogoText || ""}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        branding: {
                          ...(siteSettings.settings?.branding || {}),
                          footerLogoText: event.target.value
                        }
                      }
                    })
                  }
                  maxLength={12}
                  placeholder="YE2K"
                />
              </label>
            </div>

            <div className="form-grid branding-meta-grid">
              <label>
                Browser / Google title
                <input
                  value={siteSettings.settings?.branding?.siteTitle || ""}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        branding: {
                          ...(siteSettings.settings?.branding || {}),
                          siteTitle: event.target.value
                        }
                      }
                    })
                  }
                  placeholder="YE2K — Original Production"
                />
              </label>

              <label>
                Search and share description
                <input
                  value={siteSettings.settings?.branding?.siteDescription || ""}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        branding: {
                          ...(siteSettings.settings?.branding || {}),
                          siteDescription: event.target.value
                        }
                      }
                    })
                  }
                  placeholder="Original production. Immediate preview. Secure delivery."
                />
              </label>

              <label className="settings-upload-field">
                Favicon
                <small>PNG, JPG, or WebP. Square images work best.</small>
                <input
                  key={`favicon-${settingsFileInputKey}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setFaviconFile(event.target.files?.[0] || null)}
                />
              </label>

              <label className="settings-upload-field">
                Google / social share image
                <small>Recommended size: 1200 × 630.</small>
                <input
                  key={`share-${settingsFileInputKey}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setShareImageFile(event.target.files?.[0] || null)}
                />
              </label>
            </div>

            {siteSettings.settings?.branding?.faviconPath && (
              <p className="settings-current-file">
                Favicon: {siteSettings.settings.branding.faviconPath}
              </p>
            )}
            {siteSettings.settings?.branding?.shareImagePath && (
              <p className="settings-current-file">
                Share image: {siteSettings.settings.branding.shareImagePath}
              </p>
            )}
          </div>

          <div className="settings-subsection global-artwork-settings">
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

          <div className="settings-subsection announcement-settings">
            <div>
              <p className="eyebrow">ANNOUNCEMENT</p>
              <h3>Drop-style announcement</h3>
            </div>

            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={siteSettings.settings?.announcement?.enabled === true}
                onChange={(event) =>
                  setSiteSettings({
                    ...siteSettings,
                    settings: {
                      ...(siteSettings.settings || {}),
                      announcement: {
                        ...(siteSettings.settings?.announcement || {}),
                        enabled: event.target.checked
                      }
                    }
                  })
                }
              />
              <span>
                <strong>Show announcement bar</strong>
                <small>Display a simple message above the header.</small>
              </span>
            </label>

            <div className="form-grid">
              <label>
                Announcement text
                <input
                  value={siteSettings.settings?.announcement?.text || ""}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        announcement: {
                          ...(siteSettings.settings?.announcement || {}),
                          text: event.target.value
                        }
                      }
                    })
                  }
                  placeholder="NEW DROP — 2K018 AVAILABLE NOW"
                />
              </label>

              <label>
                Announcement link
                <input
                  value={siteSettings.settings?.announcement?.link || ""}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        announcement: {
                          ...(siteSettings.settings?.announcement || {}),
                          link: event.target.value
                        }
                      }
                    })
                  }
                  placeholder="#beats or https://..."
                />
              </label>
            </div>

            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={siteSettings.settings?.announcement?.openInNewTab === true}
                onChange={(event) =>
                  setSiteSettings({
                    ...siteSettings,
                    settings: {
                      ...(siteSettings.settings || {}),
                      announcement: {
                        ...(siteSettings.settings?.announcement || {}),
                        openInNewTab: event.target.checked
                      }
                    }
                  })
                }
              />
              <span>
                <strong>Open in new tab</strong>
                <small>Useful for external links.</small>
              </span>
            </label>
          </div>

          <div className="settings-subsection creative-settings">
            <div>
              <p className="eyebrow">CREATIVE WORKSPACE</p>
              <h3>Optional writing mode</h3>
            </div>

            <div className="creative-toggle-grid">
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={siteSettings.settings?.creative?.workspaceEnabled === true}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        creative: {
                          ...(siteSettings.settings?.creative || {}),
                          workspaceEnabled: event.target.checked
                        }
                      }
                    })
                  }
                />
                <span>
                  <strong>Enable beat workspace</strong>
                  <small>Adds a Write button to each beat.</small>
                </span>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={siteSettings.settings?.creative?.lyricsEnabled !== false}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        creative: {
                          ...(siteSettings.settings?.creative || {}),
                          lyricsEnabled: event.target.checked
                        }
                      }
                    })
                  }
                />
                <span>
                  <strong>Enable notepad</strong>
                  <small>Lets visitors write lyrics in the workspace.</small>
                </span>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={siteSettings.settings?.creative?.autoSaveEnabled !== false}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        creative: {
                          ...(siteSettings.settings?.creative || {}),
                          autoSaveEnabled: event.target.checked
                        }
                      }
                    })
                  }
                />
                <span>
                  <strong>Auto-save notes</strong>
                  <small>Saves separately for each beat in the browser.</small>
                </span>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={siteSettings.settings?.creative?.txtDownloadEnabled !== false}
                  onChange={(event) =>
                    setSiteSettings({
                      ...siteSettings,
                      settings: {
                        ...(siteSettings.settings || {}),
                        creative: {
                          ...(siteSettings.settings?.creative || {}),
                          txtDownloadEnabled: event.target.checked
                        }
                      }
                    })
                  }
                />
                <span>
                  <strong>Enable TXT download</strong>
                  <small>Lets visitors save their notes to their device.</small>
                </span>
              </label>
            </div>
          </div>

          <div className="settings-subsection hero-settings">
            <div>
              <p className="eyebrow">HERO WORLD</p>
              <h3>Interactive globe</h3>
            </div>

            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={siteSettings.settings?.hero?.globeVisible !== false}
                onChange={(event) =>
                  setSiteSettings({
                    ...siteSettings,
                    settings: {
                      ...(siteSettings.settings || {}),
                      hero: {
                        ...(siteSettings.settings?.hero || {}),
                        globeVisible: event.target.checked
                      }
                    }
                  })
                }
              />
              <span>
                <strong>Show interactive globe</strong>
                <small>
                  Turn this off to use a full-width headline without leaving an empty gap.
                </small>
              </span>
            </label>
          </div>

          <div className="settings-subsection about-settings">
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
        <section id="admin-upload" className="admin-panel upload-panel admin-anchor-section">
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

        <aside id="admin-catalog" className="admin-panel catalog-panel admin-anchor-section">
          <p className="eyebrow">CATALOG</p>
          <h2>{beats.length} beats</h2>
          <div className="admin-list">
            {beats.length === 0 ? (
              <p className="empty-copy">No beats uploaded yet.</p>
            ) : (
              beats.map((beat) => (
                <article key={beat.id} className="admin-item">
                  <div>
                    <strong>
                      {beat.title}
                      {beat.catalog_code && (
                        <small className="admin-catalog-code">
                          {beat.catalog_code}
                        </small>
                      )}
                    </strong>
                    <span>{beat.producer} · ${Number(beat.price).toFixed(2)}</span>
                  </div>
                  <div className="admin-item-actions">
                    <button
                      className="ghost-btn"
                      onClick={() => beginEdit(beat)}
                      disabled={busy}
                    >
                      Edit
                    </button>
                    <button
                      className="status-btn"
                      onClick={() => toggleStatus(beat)}
                      disabled={busy}
                    >
                      {beat.status}
                    </button>
                    <button
                      className="danger-btn"
                      onClick={() => deleteBeat(beat)}
                      disabled={busy}
                    >
                      Delete
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
