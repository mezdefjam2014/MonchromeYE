export type Beat = {
  id: string;
  title: string;
  catalog_code: string | null;
  slug: string;
  producer: string;
  price: number;
  status: "draft" | "published" | "archived" | "sold";
  cover_path: string;
  preview_path: string;
  mp3_path: string;
  wav_path: string | null;
  created_at: string;
};

export type SiteSettings = {
  id: number;
  eyebrow: string;
  headline_primary: string;
  headline_accent: string;
  description: string;
  settings?: {
    media?: {
      globalCoverPath?: string;
    };
    branding?: {
      headerLogoText?: string;
      footerLogoText?: string;
    };
    about?: {
      visible?: boolean;
      eyebrow?: string;
      headline?: string;
      description?: string;
    };
    announcement?: {
      enabled?: boolean;
      text?: string;
      link?: string;
      openInNewTab?: boolean;
    };
    creative?: {
      workspaceEnabled?: boolean;
      lyricsEnabled?: boolean;
      autoSaveEnabled?: boolean;
      txtDownloadEnabled?: boolean;
    };
    hero?: {
      globeVisible?: boolean;
    };
    [key: string]: unknown;
  };
  updated_at: string;
};
