export type Beat = {
  id: string;
  title: string;
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
    about?: {
      visible?: boolean;
      eyebrow?: string;
      headline?: string;
      description?: string;
    };
    [key: string]: unknown;
  };
  updated_at: string;
};
