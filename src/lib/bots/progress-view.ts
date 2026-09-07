export interface ProgressView {
  source: "available" | "unavailable";
  activeDays: number | null;
  firstSeenAt: string | null;
  firstBuildAt: string | null;
  firstFightAt: string | null;
  awards: Array<{ id: string; kind: string; color: string; earnedAt: string }>;
}

export const PROGRESS_MILESTONES = [
  { id: "build.first", label: "Finish your first build", reward: "Mint bow", kind: "bow", color: "mint", swatch: "#a8c9b0", days: null },
  { id: "fight.first", label: "Finish your first fight", reward: "Coral flag", kind: "flag", color: "coral", swatch: "#e99984", days: null },
  { id: "return.3", label: "Visit on 3 days", reward: "Butter spring", kind: "spring", color: "butter", swatch: "#e9cc80", days: 3 },
  { id: "return.7", label: "Visit on 7 days", reward: "Sky bell", kind: "bell", color: "sky", swatch: "#a1c5dc", days: 7 },
  { id: "return.14", label: "Visit on 14 days", reward: "Lilac ears", kind: "ears", color: "lilac", swatch: "#c3aed6", days: 14 },
  { id: "return.30", label: "Visit on 30 days", reward: "Moss propeller", kind: "propeller", color: "moss", swatch: "#94a475", days: 30 },
] as const;

/** A counter or a local practice result is never evidence of an earned grant. */
export function progressMilestones(view: ProgressView | null) {
  return PROGRESS_MILESTONES.map(m => ({ ...m, earned: view?.source === "available" && view.awards.some(a => a.id === m.id && a.kind === m.kind && a.color === m.color) }));
}
