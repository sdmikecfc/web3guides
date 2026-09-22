import { AFTERMATH_FRAMES_V7, FPS_V7, MAX_FRAMES_V7, acceptSpecialV7, createFightV7, stepFightV7, validBuildV7, type BuildV7, type ResultV7, type SpecialCommandV7 } from "@/lib/bots/v7";

export const REMASTER_STYLES = ["tank", "speed", "ranged"] as const;
export type RemasterStyle = typeof REMASTER_STYLES[number];
export type RemasterMode = "fight" | "turntable" | "weapon-demo";
export interface RemasterQuery { style?: string; rival?: string; seed?: string; mode?: string; clean?: string }
export const remasterPreviewEnabled = () => process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_BOTS_REMASTER_PREVIEW === "1";
export function readRemasterQuery(query: RemasterQuery) {
  const style: RemasterStyle = REMASTER_STYLES.includes(query.style as RemasterStyle) ? query.style as RemasterStyle : "tank";
  const rival: RemasterStyle = REMASTER_STYLES.includes(query.rival as RemasterStyle) ? query.rival as RemasterStyle : style === "tank" ? "speed" : "tank";
  const seed = query.seed !== undefined && /^\d+$/.test(query.seed) && Number(query.seed) <= 4294967295 ? Number(query.seed) : 75;
  const mode: RemasterMode = query.mode === "turntable" || query.mode === "weapon-demo" ? query.mode : "fight";
  return { style, rival, seed, mode, clean: query.clean === "1" };
}

export function assertRemasterProof(builds: [BuildV7, BuildV7], result?: ResultV7 | null) {
  const versions = ["rulesVersion", "rigVersion", "motionVersion", "collisionVersion", "presentationVersion"] as const;
  if (!builds.every(validBuildV7) || result && (!result.builds.every(validBuildV7) || result.builds.some((build, side) => build.style !== builds[side].style || build.manifestHash !== builds[side].manifestHash) || versions.some(key => result[key] !== builds[0][key]))) {
    throw new Error("This recorded preview uses earlier rules. Reload the preview to start a new fight.");
  }
}

/** Reconstruct accepted commands against the exact hero builds. The aftermath
 * advances presentation only; the simulation and its result stay at knockout. */
export function remasterFrame(builds: [BuildV7, BuildV7], seed: number, autoSpecial: boolean, commands: readonly SpecialCommandV7[], frame: number) {
  assertRemasterProof(builds);
  const target = Math.max(0, Math.min(MAX_FRAMES_V7 + AFTERMATH_FRAMES_V7, Math.floor(Number.isFinite(frame) ? frame : 0)));
  const state = createFightV7(builds, seed, { autoSpecial: [autoSpecial, true], defensePlans: ["balanced", "balanced"] });
  let commandIndex = 0;
  const inputs = () => { while (commandIndex < commands.length && commands[commandIndex].frame === state.frame && !state.done) { const receipt = acceptSpecialV7(state, commands[commandIndex++]); if (!receipt.accepted) throw new Error(receipt.reason ?? "The recorded Special could not replay."); } };
  while (!state.done && state.frame < target) { inputs(); stepFightV7(state); }
  inputs();
  return { state, commandIndex, displayFrame: state.done ? Math.min(target, state.frame + AFTERMATH_FRAMES_V7) : state.frame };
}
export const remasterTime = (frame: number) => `${Math.floor(frame / FPS_V7)}.${Math.floor(frame % FPS_V7 / (FPS_V7 / 10))}s`;
