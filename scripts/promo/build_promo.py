# S6 UPRISING promo assembly, both formats, from Mike's 4 recordings + the
# AI map flyover + the PIL end cards. Hard cuts, name tags, game audio kept
# under the gameplay, fade to the end card. No music track on purpose: X
# autoplays muted and TikTok wants a trending sound added in-app.
import subprocess, os

SP = r"C:\Users\Mike\AppData\Local\Temp\claude\C--Users-Mike-Desktop-trading-bot--claude-worktrees-clever-clarke-50cbb4\447c6f2b-c4f9-4db6-af73-7917a13a8086\scratchpad"
GAMES = r"C:\Users\Mike\Desktop\web3guides\public\Promo Video Game"
FONT = "C\\:/Windows/Fonts/segoeuib.ttf"
CUT = 4.0          # seconds of each gameplay clip
FADE = 0.5

CLIPS = [
    ("iron jaw.mp4", "IRON JAW"),
    ("strain.mp4", "STRAIN"),
    ("stopclock.mp4", "STOPCLOCK"),
    ("riot.mp4", "RIOT"),
]

def run(args):
    subprocess.run(["ffmpeg", "-y", "-v", "error"] + args, check=True)

def tag(text, W, H, big):
    # name tag: amber label on a dark box, lower third
    fs = int((64 if big else 52) * (H / 1080 if W > H else W / 1080))
    y = f"h-{int(fs*2.6)}"
    return (f"drawtext=fontfile='{FONT}':text='{text}':fontsize={fs}:fontcolor=0xF0B340"
            f":x=(w-text_w)/2:y={y}:box=1:boxcolor=0x0C1014@0.72:boxborderw={int(fs*0.45)}")

def fit(W, H):
    # blur-pad fill: the clip covers the frame blurred, the sharp copy fits inside
    return (f"split=2[bg][fg];[bg]scale={W}:{H}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H},gblur=sigma=24,eq=brightness=-0.12[bgb];"
            f"[fg]scale={W}:{H}:force_original_aspect_ratio=decrease[fgs];"
            f"[bgb][fgs]overlay=(W-w)/2:(H-h)/2")

def build(W, H, intro_src, intro_is_video, out):
    segs = []
    n = len(CLIPS) + 2
    # intro
    seg0 = os.path.join(SP, f"_seg0_{W}.mp4")
    m = min(W, H)  # title scales by the NARROW side so 9:16 never clips
    title = (f"drawtext=fontfile='{FONT}':text='SEASON 6 · UPRISING':fontsize={int(m*0.030)}:fontcolor=0xF0B340"
             f":x=(w-text_w)/2:y=h*0.30:box=1:boxcolor=0x0C1014@0.55:boxborderw=18,"
             f"drawtext=fontfile='{FONT}':text='LAUNCH WARS':fontsize={int(m*0.082)}:fontcolor=white"
             f":x=(w-text_w)/2:y=h*0.36:box=1:boxcolor=0x0C1014@0.55:boxborderw=22")
    if intro_is_video:
        run(["-i", intro_src, "-t", "5", "-vf", f"{fit(W, H)},{title},fps=30,format=yuv420p",
             "-an", "-c:v", "libx264", "-crf", "20", seg0])
    else:
        run(["-loop", "1", "-t", "4", "-i", intro_src, "-vf",
             f"scale={W}:{H},zoompan=z='1+0.04*in/120':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H},{title},fps=30,format=yuv420p",
             "-an", "-c:v", "libx264", "-crf", "20", seg0])
    segs.append(seg0)
    # gameplay
    for i, (fn, name) in enumerate(CLIPS, start=1):
        seg = os.path.join(SP, f"_seg{i}_{W}.mp4")
        run(["-ss", "1.5", "-t", str(CUT), "-i", os.path.join(GAMES, fn),
             "-vf", f"{fit(W, H)},{tag(name, W, H, big=False)},fps=30,format=yuv420p",
             "-af", "afade=t=in:d=0.2,afade=t=out:st=3.6:d=0.4,aformat=sample_rates=48000:channel_layouts=stereo",
             "-c:v", "libx264", "-crf", "20", "-c:a", "aac", seg])
        segs.append(seg)
    # end card
    segE = os.path.join(SP, f"_segE_{W}.mp4")
    card = os.path.join(SP, "endcard_169.png" if W > H else "endcard_916.png")
    run(["-loop", "1", "-t", "4", "-i", card, "-vf",
         f"scale={W}:{H},zoompan=z='1+0.03*in/120':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H},fade=t=in:d={FADE},fps=30,format=yuv420p",
         "-an", "-c:v", "libx264", "-crf", "20", segE])
    segs.append(segE)
    # concat: silent segments need silent audio tracks to concat cleanly
    inputs = []
    fc = []
    for i, s in enumerate(segs):
        inputs += ["-i", s]
    for i, s in enumerate(segs):
        fc.append(f"[{i}:v]setpts=PTS-STARTPTS[v{i}];")
        has_audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a",
                                    "-show_entries", "stream=codec_type", "-of", "csv=p=0", s],
                                   capture_output=True, text=True).stdout.strip() != ""
        if has_audio:
            fc.append(f"[{i}:a]asetpts=PTS-STARTPTS[a{i}];")
        else:
            fc.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{5 if i==0 else 4}[a{i}];")
    fc.append("".join(f"[v{i}][a{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=1:a=1[v][a]")
    run(inputs + ["-filter_complex", "".join(fc), "-map", "[v]", "-map", "[a]",
                  "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
                  "-c:a", "aac", "-movflags", "+faststart", out])
    for s in segs:
        os.remove(s)
    print("built", out, os.path.getsize(out) // 1024, "KB")
