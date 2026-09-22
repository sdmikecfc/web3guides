# S6 promo v2 (Mike: "more mechs, like S5's tanks showing up, and text that
# is not AI generic but still loud"). New beats: the intro flyover carries a
# two-line war cry, then EIGHT mechs slam in one after another under PICK
# YOUR MECH, then the four games each carry their own loud line, then the
# end card. Whole thing ~29s, both formats.
import subprocess, os
from PIL import Image, ImageDraw, ImageFont

SP = r"C:\Users\Mike\AppData\Local\Temp\claude\C--Users-Mike-Desktop-trading-bot--claude-worktrees-clever-clarke-50cbb4\447c6f2b-c4f9-4db6-af73-7917a13a8086\scratchpad"
GAMES = r"C:\Users\Mike\Desktop\web3guides\public\Promo Video Game"
MECHS = r"C:\Users\Mike\Desktop\web3guides\public\s6-art\mech"
FONT = "C\\:/Windows/Fonts/segoeuib.ttf"
AMBER = (240, 179, 64)

# the loud lines: game-true, imperative, zero marketing filler
CLIPS = [
    ("iron jaw.mp4", "IRON JAW", "PUNCH OUT THE MACHINES"),
    ("strain.mp4", "STRAIN", "BE THE OUTBREAK"),
    ("stopclock.mp4", "STOPCLOCK", "TIME MOVES WHEN YOU DO"),
    ("riot.mp4", "RIOT", "TAKE BACK THE STREETS"),
]
SLAM_MECHS = ["juggernaut", "viper", "colossus", "spectre", "atlas", "hornet", "paladin", "ram"]
SLAM_T = 0.45

def run(args):
    subprocess.run(["ffmpeg", "-y", "-v", "error"] + args, check=True)

def dtxt(text, fs, color, y, box=True, enable=None):
    e = f":enable='{enable}'" if enable else ""
    b = ":box=1:boxcolor=0x0C1014@0.62:boxborderw=" + str(int(fs * 0.4)) if box else ""
    return (f"drawtext=fontfile='{FONT}':text='{text}':fontsize={fs}:fontcolor={color}"
            f":x=(w-text_w)/2:y={y}{b}{e}")

def fit(W, H):
    # blur the pad at QUARTER res then upscale: same look, ~16x less work
    # (the full-res gblur was what ran the filter graph out of memory)
    qw, qh = W // 4, H // 4
    return (f"split=2[bg][fg];[bg]scale={qw}:{qh}:force_original_aspect_ratio=increase,"
            f"crop={qw}:{qh},gblur=sigma=8,eq=brightness=-0.12,scale={W}:{H}[bgb];"
            f"[fg]scale={W}:{H}:force_original_aspect_ratio=decrease[fgs];"
            f"[bgb][fgs]overlay=(W-w)/2:(H-h)/2")

def mech_plate(key, W, H):
    """Static comp: mech on the dark bracket ground, name below. PNG out."""
    out = os.path.join(SP, f"_mech_{key}_{W}.png")
    im = Image.new("RGB", (W, H), (11, 13, 16))
    d = ImageDraw.Draw(im)
    # radial glow behind the mech
    glow = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(glow)
    r = int(min(W, H) * 0.42)
    for i in range(r, 0, -6):
        gd.ellipse([W//2 - i, int(H*0.44) - i, W//2 + i, int(H*0.44) + i], fill=int(38 * (1 - i / r)))
    im.paste(Image.new("RGB", (W, H), (46, 58, 70)), (0, 0), glow)
    m = Image.open(os.path.join(MECHS, f"{key}.webp")).convert("RGBA")
    box = int(min(W, H) * 0.72)
    m.thumbnail((box, box))
    im.paste(m, (W//2 - m.width//2, int(H*0.46) - m.height//2), m)
    d = ImageDraw.Draw(im)
    s = min(W, H)
    try:
        FB = ImageFont.truetype("segoeuib.ttf", int(s * 0.055))
        FS = ImageFont.truetype("segoeuib.ttf", int(s * 0.03))
    except OSError:
        FB = FS = ImageFont.load_default()
    d.text((W//2, int(H*0.085)), "PICK YOUR MECH", font=FS, fill=AMBER, anchor="mm")
    d.text((W//2, int(H*0.85)), key.upper(), font=FB, fill=(233, 237, 241), anchor="mm")
    im.save(out)
    return out

def build(W, H, intro_src, out):
    segs = []
    m = min(W, H)
    # ── intro: flyover with the war cry in two beats ──
    seg0 = os.path.join(SP, f"_seg0_{W}.mp4")
    warcry = (
        dtxt("THE MACHINES TOOK THE GRID", int(m * 0.052), "white", "h*0.34", enable="between(t,0.3,2.5)") + "," +
        dtxt("TAKE IT BACK", int(m * 0.085), "0xF0B340", "h*0.34", enable="between(t,2.5,5)") + "," +
        dtxt("SEASON 6 · UPRISING", int(m * 0.026), "0xF0B340", "h*0.26", enable="between(t,0.3,5)")
    )
    run(["-i", intro_src, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "5",
         "-vf", f"{fit(W, H)},{warcry},fps=30,format=yuv420p", "-shortest",
         "-c:v", "libx264", "-crf", "20", "-threads", "2", "-c:a", "aac", seg0])
    segs.append(seg0)
    # ── the mech wall: eight slams (zoompan punch-in per plate) ──
    for k in SLAM_MECHS:
        plate = mech_plate(k, W, H)
        seg = os.path.join(SP, f"_slam_{k}_{W}.mp4")
        frames = max(8, int(SLAM_T * 30))
        run(["-loop", "1", "-t", str(SLAM_T), "-i", plate,
             "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", str(SLAM_T),
             "-vf", f"scale={W}:{H},zoompan=z='max(1.0,1.28-0.028*in)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H},fps=30,format=yuv420p",
             "-shortest", "-c:v", "libx264", "-crf", "20", "-threads", "2", "-c:a", "aac", seg])
        segs.append(seg)
    # ── the four games, each with its loud line + name tag ──
    for i, (fn, name, line) in enumerate(CLIPS):
        seg = os.path.join(SP, f"_seg{i+1}_{W}.mp4")
        fs_line = int(m * 0.052)
        fs_tag = int(m * 0.032)
        overlay = (
            dtxt(line, fs_line, "white", "h*0.12", enable="between(t,0.25,3.6)") + "," +
            dtxt(name, fs_tag, "0xF0B340", f"h-{int(fs_tag*2.8)}")
        )
        run(["-ss", "1.5", "-t", "4.0", "-i", os.path.join(GAMES, fn),
             "-vf", f"{fit(W, H)},{overlay},fps=30,format=yuv420p",
             "-af", "afade=t=in:d=0.2,afade=t=out:st=3.6:d=0.4,aformat=sample_rates=48000:channel_layouts=stereo",
             "-c:v", "libx264", "-crf", "20", "-threads", "2", "-c:a", "aac", seg])
        segs.append(seg)
    # ── end card ──
    segE = os.path.join(SP, f"_segE_{W}.mp4")
    card = os.path.join(SP, "endcard_169.png" if W > H else "endcard_916.png")
    run(["-loop", "1", "-t", "4", "-i", card,
         "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "4",
         "-vf", f"scale={W}:{H},zoompan=z='1+0.03*in/120':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H},fade=t=in:d=0.5,fps=30,format=yuv420p",
         "-shortest", "-c:v", "libx264", "-crf", "20", "-threads", "2", "-c:a", "aac", segE])
    segs.append(segE)
    # ── concat demuxer + stream copy: every segment already matches
    #    (h264 yuv420p 30fps + aac 48k stereo), so the join decodes NOTHING ──
    lst = os.path.join(SP, f"_concat_{W}.txt")
    with open(lst, "w", encoding="utf-8", newline="\n") as f:
        for s in segs:
            f.write("file '" + s.replace("\\", "/") + "'\n")
    run(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart", out])
    os.remove(lst)
    for s in segs:
        os.remove(s)
    print("built", out, os.path.getsize(out) // 1024, "KB")

if __name__ == "__main__":
    build(1920, 1080, os.path.join(SP, "flyover.mp4"), os.path.join(SP, "launchwars_s6_promo_169.mp4"))
    build(1080, 1920, r"C:\Users\Mike\Desktop\web3guides\public\s6-art\pilot\anim\vega.mp4", os.path.join(SP, "launchwars_s6_promo_916.mp4"))
