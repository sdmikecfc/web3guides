/** A keepsake made from the viewer's actual frame. No network or posting. */
export interface FightPostcardOptions {
  canvas: HTMLCanvasElement;
  winner: string;
  loser: string;
  replayUrl: string;
  hash: string;
}

interface Rect { x: number; y: number; width: number; height: number }

/** A portrait capture gets a side caption so the actual toys stay large. */
export function fightPostcardLayout(sourceWidth: number, sourceHeight: number) {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || !(sourceWidth > 0) || !(sourceHeight > 0)) throw new Error("The fight picture is not ready yet.");
  const sideCaption = sourceWidth / sourceHeight < 1.45;
  const frame: Rect = sideCaption
    ? { x: 48, y: 48, width: 910, height: 904 }
    : { x: 48, y: 48, width: 1504, height: 634 };
  const scale = Math.min(frame.width / sourceWidth, frame.height / sourceHeight);
  const image: Rect = {
    x: frame.x + (frame.width - sourceWidth * scale) / 2,
    y: frame.y + (frame.height - sourceHeight * scale) / 2,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
  return { width: 1600, height: 1000, sideCaption, frame, image };
}

/** Keep names and long links bounded without splitting a Unicode code point. */
export function postcardText(value: string, limit = 240): string {
  const chars = Array.from(value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim());
  const cap = Math.max(1, Math.floor(limit));
  return chars.length > cap ? chars.slice(0, cap - 1).join("") + "…" : chars.join("");
}

function fitLine(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  const chars = Array.from(text);
  let lo = 0, hi = chars.length;
  while (lo < hi) {
    const middle = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(chars.slice(0, middle).join("") + "…").width <= width) lo = middle;
    else hi = middle - 1;
  }
  return chars.slice(0, lo).join("").trimEnd() + "…";
}

function lines(ctx: CanvasRenderingContext2D, text: string, width: number, maximum: number): string[] {
  const out: string[] = [];
  let remaining = text;
  while (remaining && out.length < maximum) {
    if (ctx.measureText(remaining).width <= width || out.length === maximum - 1) {
      out.push(fitLine(ctx, remaining, width));
      break;
    }
    const chars = Array.from(remaining);
    let count = 1;
    while (count < chars.length && ctx.measureText(chars.slice(0, count + 1).join("")).width <= width) count++;
    const chunk = chars.slice(0, count).join("");
    const space = chunk.lastIndexOf(" ");
    const cut = space > chunk.length / 2 ? Array.from(chunk.slice(0, space)).length : count;
    out.push(chars.slice(0, cut).join("").trim());
    remaining = chars.slice(cut).join("").trimStart();
  }
  return out;
}

function rounded(ctx: CanvasRenderingContext2D, box: Rect, radius: number) {
  const { x, y, width: w, height: h } = box;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Call immediately after scene.render(). The source is copied before any await:
 * WebGL's default drawing buffer may be cleared as soon as this task yields. */
export async function downloadFightPostcard({ canvas, winner, loser, replayUrl, hash }: FightPostcardOptions): Promise<void> {
  const layout = fightPostcardLayout(canvas.width, canvas.height);
  const card = document.createElement("canvas");
  card.width = layout.width;
  card.height = layout.height;
  const ctx = card.getContext("2d");
  if (!ctx) throw new Error("The picture could not be saved.");
  ctx.fillStyle = "#eee1c9";
  ctx.fillRect(0, 0, card.width, card.height);
  rounded(ctx, layout.frame, 22);
  ctx.fillStyle = "#17120f";
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // This is the capture. It must stay synchronous, before fonts or PNG encoding.
  ctx.drawImage(canvas, layout.image.x, layout.image.y, layout.image.width, layout.image.height);
  ctx.restore();

  const winnerName = postcardText(winner, 100) || "Winner";
  const loserName = postcardText(loser, 100);
  let absoluteLink = replayUrl;
  try { absoluteLink = new URL(replayUrl, window.location.href).href; } catch { /* retain the caller's text */ }
  const link = postcardText(absoluteLink, 600);
  const code = postcardText(hash, 100);
  const declaredFont = canvas.style.getPropertyValue("--font-bots-toy").trim() || getComputedStyle(canvas).getPropertyValue("--font-bots-toy").trim();
  const titleFont = declaredFont && !declaredFont.includes("var(") ? declaredFont : '"Trebuchet MS", "Segoe UI", sans-serif';
  const bodyFont = '"Segoe UI", Arial, sans-serif';
  const monoFont = 'Consolas, "Courier New", monospace';
  const side = layout.sideCaption;
  const x = side ? 1012 : 64;
  const width = side ? 524 : 1472;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#816546";
  ctx.font = `600 20px ${bodyFont}`;
  ctx.fillText("The winner", x, side ? 158 : 728);
  ctx.fillStyle = "#2b2118";
  let titleSize = side ? 70 : 78;
  ctx.font = `800 ${titleSize}px ${titleFont}`;
  if (!side) {
    while (titleSize > 48 && ctx.measureText(winnerName).width > width) {
      titleSize -= 2;
      ctx.font = `800 ${titleSize}px ${titleFont}`;
    }
  }
  const nameLines = lines(ctx, winnerName, width, side ? 3 : 1);
  const titleTop = side ? 242 : 809;
  nameLines.forEach((line, index) => ctx.fillText(line, x, titleTop + index * 78));
  ctx.fillStyle = "#705b43";
  ctx.font = `400 28px ${bodyFont}`;
  if (loserName) {
    const subtitle = lines(ctx, `Beat ${loserName}.`, width, side ? 2 : 1);
    const y = side ? titleTop + nameLines.length * 78 + 20 : 854;
    subtitle.forEach((line, index) => ctx.fillText(line, x, y + index * 38));
  }

  const ruleY = side ? 690 : 892;
  ctx.strokeStyle = "#c8ae87";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, ruleY); ctx.lineTo(x + width, ruleY); ctx.stroke();
  ctx.fillStyle = "#816546";
  ctx.font = `600 18px ${bodyFont}`;
  ctx.fillText("Watch again", x, side ? 727 : 928);
  ctx.fillStyle = "#443526";
  ctx.font = `400 22px ${bodyFont}`;
  const urlLines = lines(ctx, link, side ? width : 1090, side ? 4 : 1);
  urlLines.forEach((line, index) => ctx.fillText(line, x, (side ? 764 : 961) + index * 30));
  ctx.fillStyle = "#816546";
  ctx.font = `600 18px ${bodyFont}`;
  ctx.textAlign = side ? "left" : "right";
  const codeX = side ? x : 1536;
  ctx.fillText("Fight code", codeX, side ? 914 : 928);
  ctx.fillStyle = "#443526";
  ctx.font = `600 23px ${monoFont}`;
  ctx.fillText(fitLine(ctx, code, side ? width : 300), codeX, side ? 948 : 961);

  const blob = await new Promise<Blob>((resolve, reject) => {
    card.toBlob(value => value ? resolve(value) : reject(new Error("The picture could not be saved.")), "image/png");
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const fileName = winnerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "robot";
  anchor.href = url;
  anchor.download = `${fileName}-fight.png`;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    anchor.remove();
  }
  // Give the browser time to take ownership of the download before release.
  window.setTimeout(() => URL.revokeObjectURL(url), 15000);
}
