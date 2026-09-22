import * as THREE from "three";

/** Soft, layered flame tongues. One small shared sprite, no video or per-frame texture uploads. */
export function flameTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.filter = "blur(3px)";
  const outer = ctx.createLinearGradient(0, 0, 0, 128);
  outer.addColorStop(0, "rgba(255,65,0,0)"); outer.addColorStop(.22, "rgba(255,100,12,.65)");
  outer.addColorStop(.65, "rgba(255,184,54,.95)"); outer.addColorStop(.9, "rgba(255,232,151,.9)"); outer.addColorStop(1, "rgba(255,180,45,0)");
  ctx.fillStyle = outer; ctx.beginPath(); ctx.moveTo(15, 120);
  ctx.bezierCurveTo(-4, 84, 37, 59, 30, 3); ctx.bezierCurveTo(58, 40, 35, 67, 51, 85);
  ctx.bezierCurveTo(72, 121, 39, 131, 15, 120); ctx.fill();
  ctx.filter = "blur(2px)";
  const core = ctx.createLinearGradient(0, 45, 0, 128);
  core.addColorStop(0, "rgba(255,236,157,0)"); core.addColorStop(.5, "rgba(255,245,190,.9)"); core.addColorStop(.85, "rgba(255,255,226,1)"); core.addColorStop(1, "rgba(255,235,155,0)");
  ctx.fillStyle = core; ctx.beginPath(); ctx.moveTo(22, 122);
  ctx.bezierCurveTo(11, 103, 36, 79, 34, 51); ctx.bezierCurveTo(52, 99, 42, 103, 44, 118); ctx.closePath(); ctx.fill();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
