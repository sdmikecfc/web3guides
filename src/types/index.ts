// ─── Guide ───────────────────────────────────────────────────────────────────

export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface Guide {
  id: string;
  subdomain: string;
  title: string;
  summary: string;
  difficulty: Difficulty;
  tags: string[];
  source_url: string;
  published_at: string; // ISO 8601
  slug: string;
  cover_image?: string | null;
  read_time_minutes?: number | null;
  author?: string | null;
  content?: string | null;
}

// ─── Subdomain config ────────────────────────────────────────────────────────

export interface SubdomainConfig {
  key: string;
  label: string;
  description: string;
  accentColor: string;           // Tailwind colour token used in className strings
  accentHex: string;             // Hex used for inline styles / CSS vars
  glowHex: string;               // rgba glow
  emoji: string;
  gradientFrom: string;
  gradientTo: string;
}

export type SubdomainKey =
  | "eth"
  | "legal"
  | "sol"
  | "rwa"
  | "tax"
  | "easy"
  | "btc"
  | "defi"
  | "bigmike"
  | "staking"
  | "layer2"
  | "bridge"
  | "beginner"
  | "security"
  | "jobs"
  | "medium"
  | "advanced"
  | "doma";
