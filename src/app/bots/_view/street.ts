/**
 * SPROCKET ROW (screens doc 3.1): the street seen from across the road, a
 * band cropped from the street plate with the garage numbers painted onto
 * the BLANK brass plates in code (Baloo 2, the toy voice; the art carries
 * no lettering by law). Your door is centred and bright, the neighbours sit
 * at 70 percent, and the arrows walk the street ten doors at a time.
 *
 * A plain 2D canvas, not Pixi: one image, one band, seven numbers, and the
 * whole thing must keep working with public/bots-art deleted, so the same
 * geometry (setdressing.ts STREET, in source px) also draws seven flat clay
 * door fronts when the plate never loads. The owner sizes it with a
 * ResizeObserver on the wrapper (the Battlefield law) and calls render().
 */
"use client";

import { K, M } from "../_ui/tokens";
import { STREET } from "./setdressing";

export interface StreetOpts {
  small: boolean;
  /** the resolved Baloo 2 family (the owner reads --font-bots-toy) */
  toyFont: string;
  /** the player's own garage number: door index 3 of the plate, bright */
  mine: number;
  onDoorTap?: (garageNo: number) => void;
}

export interface StreetHandle {
  render: () => void;
  resize: (cssW: number, cssH: number, dpr: number) => void;
  /** walk the street: the door with this number becomes the centre */
  setCentre: (garageNo: number) => void;
  destroy: () => void;
}

const DOORS = STREET.plateXs.length;
const mod = (n: number, m: number) => ((n % m) + m) % m;

export function buildStreet(canvas: HTMLCanvasElement, opts: StreetOpts): StreetHandle {
  const ctx = canvas.getContext("2d");
  let cssW = 1;
  let cssH = 1;
  let centre = opts.mine;
  const band = opts.small ? { top: 640, bottom: 850 } : { top: STREET.bandTop, bottom: STREET.bandBottom };
  const bandH = band.bottom - band.top;

  // the plate, guarded: a missing file draws the flat street
  const img = new Image();
  let imgOk = false;
  img.onload = () => {
    imgOk = true;
    render();
  };
  img.onerror = () => {
    imgOk = false;
    render();
  };
  img.src = STREET.file;
  try {
    document.fonts?.load(`800 20px ${opts.toyFont}`).then(() => render()).catch(() => {});
  } catch {
    /* no font API: the fallback family draws */
  }

  /** source x of door index k (the plate tiles every DOORS doors) */
  const doorX = (k: number) => STREET.plateXs[mod(k, DOORS)] + Math.floor(k / DOORS) * STREET.srcW;
  /** door index of a garage number: mine sits at index 3, the middle door */
  const indexOf = (no: number) => no - opts.mine + 3;

  function render() {
    if (!ctx) return;
    const scale = cssH / bandH;
    const kc = indexOf(centre);
    const xc = doorX(kc);
    const sx = (x: number) => (x - xc) * scale + cssW / 2;
    const sy = (y: number) => (y - band.top) * scale;
    ctx.clearRect(0, 0, cssW, cssH);

    // which door indices are on screen
    const kMin = Math.floor((-cssW / 2 / scale + xc) / STREET.pitch) - 2;
    const kMax = Math.ceil((cssW / 2 / scale + xc) / STREET.pitch) + 2;

    if (imgOk && img.naturalWidth > 0) {
      const f = img.naturalWidth / STREET.srcW;
      const tMin = Math.floor((-cssW / 2 / scale + xc) / STREET.srcW);
      const tMax = Math.floor((cssW / 2 / scale + xc) / STREET.srcW);
      for (let t = tMin; t <= tMax; t++) {
        const x0 = sx(t * STREET.srcW);
        ctx.drawImage(img, 0, band.top * f, STREET.srcW * f, bandH * f, x0, 0, STREET.srcW * scale + 0.5, cssH);
      }
    } else {
      // the flat street: stepped sky, a roof band, seven clay door fronts, the pavement
      const skyTop = band.top;
      const roofY = STREET.plateY - 190;
      const doorTop = STREET.plateY - 80;
      const doorBottom = 850;
      const skyBands = ["#3b4b7a", "#4c5f92", "#6a7cae"];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = skyBands[i];
        ctx.fillRect(0, sy(skyTop + (i * (roofY - skyTop)) / 3), cssW, ((roofY - skyTop) / 3) * scale + 1);
      }
      ctx.fillStyle = "#a08e7a";
      ctx.fillRect(0, sy(roofY), cssW, (doorTop - roofY) * scale + 1);
      for (let k = kMin; k <= kMax; k++) {
        const x = doorX(k);
        const col = STREET.doorColors[mod(k, DOORS)];
        ctx.fillStyle = col;
        ctx.fillRect(sx(x - STREET.pitch / 2 + 4), sy(doorTop), (STREET.pitch - 8) * scale, (doorBottom - doorTop) * scale);
        ctx.fillStyle = "#f6e7c6";
        ctx.fillRect(sx(x - STREET.pitch / 2 + 44), sy(doorTop + 90), (STREET.pitch - 88) * scale, (doorBottom - doorTop - 90) * scale);
        ctx.fillStyle = K.brass;
        ctx.fillRect(sx(x - STREET.plateW / 2), sy(STREET.plateY - STREET.plateH / 2), STREET.plateW * scale, STREET.plateH * scale);
      }
      ctx.fillStyle = K.floor;
      ctx.fillRect(0, sy(doorBottom), cssW, cssH - sy(doorBottom) + 1);
    }

    // neighbours at 70 percent, the centre door bright
    ctx.fillStyle = "rgba(8,11,20,0.3)";
    for (let k = kMin; k <= kMax; k++) {
      if (k === kc) continue;
      const x = doorX(k);
      ctx.fillRect(sx(x - STREET.pitch / 2), 0, STREET.pitch * scale + 0.5, cssH);
    }

    // the numbers on the brass plates
    const px = Math.max(8, Math.round(STREET.plateH * scale * 0.62));
    ctx.font = `800 ${px}px ${opts.toyFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let k = kMin; k <= kMax; k++) {
      const x = doorX(k);
      const no = opts.mine + k - 3;
      if (no < 1) continue;
      const cx = sx(x);
      const cy = sy(STREET.plateY) + 1;
      ctx.fillStyle = k === kc ? K.ink : "rgba(27,19,16,0.75)";
      ctx.fillText(`No. ${String(no).padStart(4, "0")}`, cx, cy);
    }

    // the hairline's inner top highlight, painted so the frame reads as glass
    ctx.fillStyle = M.highlight;
    ctx.fillRect(0, 0, cssW, 1);
  }

  const onClick = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const scale = cssH / bandH;
    const kc = indexOf(centre);
    const srcX = (e.clientX - r.left - cssW / 2) / scale + doorX(kc);
    for (let k = kc - 6; k <= kc + 6; k++) {
      if (Math.abs(doorX(k) - srcX) <= STREET.pitch / 2) {
        const no = opts.mine + k - 3;
        if (no >= 1) opts.onDoorTap?.(no);
        return;
      }
    }
  };
  canvas.addEventListener("click", onClick);
  canvas.style.cursor = "pointer";

  return {
    render,
    resize(w, h, dpr) {
      cssW = Math.max(1, w);
      cssH = Math.max(1, h);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    },
    setCentre(no) {
      centre = Math.max(1, Math.floor(no));
      render();
    },
    destroy() {
      canvas.removeEventListener("click", onClick);
      img.onload = null;
      img.onerror = null;
    },
  };
}
