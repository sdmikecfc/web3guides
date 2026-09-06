# S6 promo v3 (Mike: "the trailer doesn't explain what launch wars is...
# 'buy real domains' 'earn real money' type of stuff with screens... too much
# focus on the mini-games... the font is even worse").
# Structure: war cry -> REAL SCREENS with the value props (Doma scroll, the
# live map, the war board) -> one short arcade block -> four mech slams ->
# end card. Type is PIL-rendered Bahnschrift Condensed (not drawtext Segoe),
# letterspaced, on transparent overlays.
import subprocess, os
from PIL import Image, ImageDraw, ImageFont

SP = r"C:\Users\Mike\AppData\Local\Temp\claude\C--Users-Mike-Desktop-trading-bot--claude-worktrees-clever-clarke-50cbb4\447c6f2b-c4f9-4db6-af73-7917a13a8086\scratchpad"
GAMES = r"C:\Users\Mike\Desktop\web3guides\public\Promo Video Game"
MECHS = r"C:\Users\Mike\Desktop\web3guides\public\s6-art\mech"
AMBER = (240, 179, 64, 255)
INK = (240, 244, 248, 255)

def font(px):
    # Bahnschrift is a variable font: pull the condensed semibold axis.
    try:
        f = ImageFont.truetype("bahnschrift.ttf", px)
        try:
            f.set_variation_by_name("SemiBold Condensed")
        except OSError:
            pass
        return f
    except OSError:
        for cand in ("ariblk.ttf", "impact.ttf", "segoeuib.ttf"):
            try:
                return ImageFont.truetype(cand, px)
            except OSError:
                continue
        return ImageFont.load_default()

def spaced(d, xy, text, f, fill, tracking, anchor_mid_x, plate=True):
    # manual letterspacing: PIL has none. anchor per-char, centred as a block.
    # plate=True (Mike 2026-08-17: "maybe need a background to your text
    # because sometimes it is impossible to read"): every line sits on its
    # own dark rounded band, the same grammar as the map's marker pills.
    widths = [d.textlength(ch, font=f) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = anchor_mid_x - total / 2
    y = xy
    if plate:
        asc, desc = f.getmetrics()
        pad_x = f.size * 0.55
        pad_y = f.size * 0.22
        d.rounded_rectangle(
            [x - pad_x, y - pad_y, x + total + pad_x, y + asc + desc * 0.4 + pad_y],
            radius=(asc + pad_y * 2) / 2.4,
            fill=(10, 13, 17, 216),
        )
    for ch, w in zip(text, widths):
        d.text((x, y), ch, font=f, fill=fill, stroke_width=max(2, f.size // 26), stroke_fill=(8, 10, 13, 230))
        x += w + tracking
    return total

def text_overlay(W, H, big, sub=None, eyebrow=None, y_frac=0.30):
    """Full-frame transparent overlay: eyebrow / BIG / sub, Bahnschrift."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = min(W, H)
    y = H * y_frac
    if eyebrow:
        spaced(d, y, eyebrow, font(int(m * 0.032)), AMBER, int(m * 0.012), W / 2)
        y += m * 0.055
    fb = font(int(m * 0.088))
    spaced(d, y, big, fb, INK, int(m * 0.006), W / 2)
    y += m * 0.105
    if sub:
        spaced(d, y, sub, font(int(m * 0.036)), AMBER, int(m * 0.008), W / 2)
    p = os.path.join(SP, f"_txt_{abs(hash((W, big, sub, eyebrow)))}.png")
    im.save(p)
    return p

def run(args):
    subprocess.run(["ffmpeg", "-y", "-v", "error"] + args, check=True)

def fit(W, H):
    qw, qh = W // 4, H // 4
    return (f"[0:v]split=2[bg][fg];[bg]scale={qw}:{qh}:force_original_aspect_ratio=increase,"
            f"crop={qw}:{qh},gblur=sigma=8,eq=brightness=-0.12,scale={W}:{H}[bgb];"
            f"[fg]scale={W}:{H}:force_original_aspect_ratio=decrease[fgs];"
            f"[bgb][fgs]overlay=(W-w)/2:(H-h)/2[base]")

SILENCE = ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
ENC = ["-c:v", "libx264", "-crf", "20", "-threads", "2", "-c:a", "aac"]

def seg_video(src, t, W, H, overlay_png, out, ss=None, keep_audio=False):
    """A source video fitted (blur-pad) + one full-frame overlay PNG on top."""
    args = (["-ss", str(ss)] if ss is not None else []) + ["-t", str(t), "-i", src]
    n_in = 1
    if overlay_png:
        args += ["-loop", "1", "-t", str(t), "-i", overlay_png]
        n_in += 1
    if not keep_audio:
        args += SILENCE
    fc = fit(W, H)
    if overlay_png:
        fc += ";[base][1:v]overlay=0:0,fps=30,format=yuv420p[v]"
    else:
        fc += ";[base]fps=30,format=yuv420p[v]"
    amap = ["-map", "0:a"] if keep_audio else ["-map", f"{n_in}:a", "-shortest"]
    af = ["-af", f"afade=t=in:d=0.15,afade=t=out:st={max(0.0, t - 0.3)}:d=0.3,aformat=sample_rates=48000:channel_layouts=stereo"] if keep_audio else []
    run(args + ["-filter_complex", fc, "-map", "[v]"] + amap + af + ENC + [out])

def seg_still(src, t, W, H, overlay_png, out, pan_full_page=False, fade_in=False):
    """A still (or tall page) with slow motion: zoompan push or vertical pan."""
    im = Image.open(src)
    if pan_full_page and im.height > im.width * H / W * 1.15:
        # slow vertical pan down a tall page: crop a W:H window sliding down
        sh = int(im.width * H / W)
        travel = im.height - sh
        vf = (f"[0:v]crop={im.width}:{sh}:0:'min({travel},{travel}*t/{t})',scale={W}:{H}")
    else:
        vf = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
              f"zoompan=z='1+0.045*in/{int(t*30)}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}")
    fc = vf
    if overlay_png:
        fc += f"[b];[b][1:v]overlay=0:0"
    fc += (",fade=t=in:d=0.4" if fade_in else "") + ",fps=30,format=yuv420p[v]"
    args = ["-loop", "1", "-t", str(t), "-i", src]
    n_in = 1
    if overlay_png:
        args += ["-loop", "1", "-t", str(t), "-i", overlay_png]
        n_in += 1
    args += SILENCE
    run(args + ["-filter_complex", fc, "-map", "[v]", "-map", f"{n_in}:a", "-shortest"] + ENC + [out])

def mech_plate(key, W, H, cry=None):
    out = os.path.join(SP, f"_mech_{key}_{W}.png")
    im = Image.new("RGB", (W, H), (11, 13, 16))
    glow = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(glow)
    r = int(min(W, H) * 0.42)
    for i in range(r, 0, -6):
        gd.ellipse([W // 2 - i, int(H * 0.44) - i, W // 2 + i, int(H * 0.44) + i], fill=int(38 * (1 - i / r)))
    im.paste(Image.new("RGB", (W, H), (46, 58, 70)), (0, 0), glow)
    mch = Image.open(os.path.join(MECHS, f"{key}.webp")).convert("RGBA")
    box = int(min(W, H) * 0.72)
    mch.thumbnail((box, box))
    im.paste(mch, (W // 2 - mch.width // 2, int(H * 0.46) - mch.height // 2), mch)
    d = ImageDraw.Draw(im)
    m = min(W, H)
    spaced(d, int(H * 0.07), "PICK YOUR MECH", font(int(m * 0.030)), AMBER, int(m * 0.012), W / 2)
    if cry:
        spaced(d, int(H * 0.16), cry, font(int(m * 0.052)), INK, int(m * 0.006), W / 2)
    spaced(d, int(H * 0.83), key.upper(), font(int(m * 0.055)), INK, int(m * 0.01), W / 2)
    im.save(out)
    return out

def endcard(W, H):
    out = os.path.join(SP, f"_end3_{W}.png")
    im = Image.new("RGB", (W, H), (11, 13, 16))
    d = ImageDraw.Draw(im)
    m = min(W, H)
    i, arm = int(m * 0.045), int(m * 0.075)
    for cx, cy, dx, dy in [(i, i, 1, 1), (W - i, i, -1, 1), (i, H - i, 1, -1), (W - i, H - i, -1, -1)]:
        d.line([(cx, cy), (cx + arm * dx, cy)], fill=AMBER, width=4)
        d.line([(cx, cy), (cx, cy + arm * dy)], fill=AMBER, width=4)
    y = H * (0.28 if W > H else 0.32)
    spaced(d, y, "SEASON 6 · UPRISING", font(int(m * 0.03)), AMBER, int(m * 0.012), W / 2)
    y += m * 0.06
    spaced(d, y, "LAUNCH WARS", font(int(m * 0.105)), INK, int(m * 0.006), W / 2)
    y += m * 0.135
    spaced(d, y, "BUY REAL DOMAINS. EARN REAL MONEY.", font(int(m * 0.037)), INK, int(m * 0.006), W / 2)
    y += m * 0.058
    spaced(d, y, "$1,000 SEASON POOL · EVERY DOMAIN PAYS ITS HOLDERS", font(int(m * 0.026)), (170, 180, 189, 255), int(m * 0.005), W / 2)
    y += m * 0.10
    spaced(d, y, "LAUNCHWARS.XYZ", font(int(m * 0.062)), AMBER, int(m * 0.008), W / 2)
    im.save(out)
    return out

CLIPS = [("iron jaw.mp4", "IRON JAW"), ("strain.mp4", "STRAIN"), ("stopclock.mp4", "STOPCLOCK"), ("riot.mp4", "RIOT")]
SLAMS = ["juggernaut", "viper", "spectre", "hornet"]

def build(W, H, out):
    segs = []
    def S(name):
        p = os.path.join(SP, f"_p3_{name}_{W}.mp4")
        segs.append(p)
        return p
    # 1. the cockpit power-on: dark, engine ignites, lights kick on, first
    #    steps - the title lands as it starts walking (native engine audio)
    seg_video(os.path.join(SP, "ignition.mp4"), 5.2, W, H, None, S("ign1"), keep_audio=True)
    seg_video(os.path.join(SP, "ignition.mp4"), 2.8, W, H,
              text_overlay(W, H, "LAUNCH WARS", sub="SEASON 6 · UPRISING", y_frac=0.34), S("ign2"), ss=5.2, keep_audio=True)
    # 2. the $5 flash: one second of the flyover, one line
    seg_video(os.path.join(SP, "flyover.mp4"), 1.2, W, H,
              text_overlay(W, H, "PLAY FOR JUST $5", y_frac=0.68), S("map"))
    # 3. the money: war board
    seg_still(os.path.join(SP, "scr_board.png"), 3.4, W, H,
              text_overlay(W, H, "EARN REAL MONEY", sub="$1,000 SEASON POOL · PAID BY PERCENT BONDED", y_frac=0.68), S("board"))
    # 4. the real market: Doma page pan, right before the games
    seg_still(os.path.join(SP, "scr_doma_full.png"), 4.0, W, H,
              text_overlay(W, H, "BUY REAL DOMAINS", sub="LIVE ON DOMA", y_frac=0.68), S("doma"), pan_full_page=True)
    # 5. arcade: one intro card + four QUICK cuts
    seg_still(os.path.join(SP, "scr_arcade.png"), 1.8, W, H,
              text_overlay(W, H, "FREE MECH ARCADE", sub="PLAY FREE · EARN SIGNAL", y_frac=0.66), S("arc"))
    for i, (fn, name) in enumerate(CLIPS):
        seg_video(os.path.join(GAMES, fn), 1.2, W, H,
                  text_overlay(W, H, name, y_frac=0.76), S(f"g{i}"), ss=2.0, keep_audio=True)
    # 6. the mech slideshow carries the war cry
    for k in SLAMS:
        plate = mech_plate(k, W, H, cry="THE MACHINES TOOK THE GRID")
        p = S(f"slam_{k}")
        run(["-loop", "1", "-t", "0.45", "-i", plate] + SILENCE +
            ["-filter_complex",
             f"[0:v]scale={W}:{H},zoompan=z='max(1.0,1.28-0.028*in)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H},fps=30,format=yuv420p[v]",
             "-map", "[v]", "-map", "1:a", "-shortest"] + ENC + [p])
    # 7. Vega closes it: TAKE IT BACK + the address (she IS the end card)
    VEGA = "C:/Users/Mike/Desktop/web3guides/public/s6-art/pilot/anim/vega.mp4"
    seg_video(VEGA, 4.0, W, H,
              text_overlay(W, H, "TAKE IT BACK", sub="LAUNCHWARS.XYZ", y_frac=0.62), S("vega"))
    # join: copy concat, zero decoders
    lst = os.path.join(SP, f"_c3_{W}.txt")
    with open(lst, "w", encoding="utf-8", newline="\n") as f:
        for p in segs:
            f.write("file '" + p.replace("\\", "/") + "'\n")
    run(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart", out])
    os.remove(lst)
    for p in segs:
        os.remove(p)
    print("built", out, os.path.getsize(out) // 1024, "KB")

if __name__ == "__main__":
    build(1920, 1080, os.path.join(SP, "launchwars_s6_promo_169.mp4"))
    build(1080, 1920, os.path.join(SP, "launchwars_s6_promo_916.mp4"))
