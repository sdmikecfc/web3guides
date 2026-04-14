// ─── Article visuals ─────────────────────────────────────────────────────────
// Structured visual data authored by the AI alongside article content.
// Stored as JSONB in Supabase and injected between sections at render time.

export interface StatVisualItem  { value: string; label: string; }
export interface StepVisualItem  { step: string; detail: string; }

export type ArticleVisual =
  | { type: "stats";      after_section: string; items: StatVisualItem[] }
  | { type: "comparison"; after_section: string; left: { label: string; points: string[] }; right: { label: string; points: string[] } }
  | { type: "steps";      after_section: string; heading?: string; items: StepVisualItem[] }
  | { type: "callout";    after_section: string; variant: "insight" | "warning" | "tip"; heading: string; body: string }
  | { type: "checklist";  after_section: string; heading: string; items: string[] };

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
  visuals?: ArticleVisual[] | null;
  key_points?: string[] | null;
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
  logoUrl?: string;          // optional image logo — overrides emoji when set
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
  | "doma"
  | "aivm"
  | "pai3"
  | "ink"
  | "domains";
