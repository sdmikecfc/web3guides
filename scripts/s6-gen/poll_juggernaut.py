# Poll the Vast box until Juggernaut lands, then fire the style-lock render.
# Same urllib+Bearer pattern the S5/S6 comfy drivers use.
import json
import subprocess
import sys
import time
import urllib.request

BASE = "http://66.114.157.224:40794"
TOKEN = open(r"C:/Users/Mike/Desktop/web3guides/.comfy_token").read().strip()
JUGG = "Juggernaut-XL_v9.safetensors"

def checkpoints():
    r = urllib.request.Request(BASE + "/object_info/CheckpointLoaderSimple")
    r.add_header("Authorization", "Bearer " + TOKEN)
    j = json.load(urllib.request.urlopen(r, timeout=30))
    return j["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]

DEADLINE = time.time() + 40 * 60
while time.time() < DEADLINE:
    try:
        have = checkpoints()
        if JUGG in have:
            print(f"juggernaut ON BOX after wait; firing stylelock", flush=True)
            rc = subprocess.run(
                [sys.executable, "comfy-s6-pilots.py", "--stylelock"],
                cwd=r"C:/Users/Mike/Desktop/web3guides",
            ).returncode
            print(f"stylelock exit {rc}", flush=True)
            sys.exit(rc)
        print(f"not yet ({time.strftime('%H:%M:%S')}): {have}", flush=True)
    except Exception as e:
        print(f"poll error: {e}", flush=True)
    time.sleep(30)
print("TIMED OUT after 40min - is the wget running?", flush=True)
sys.exit(1)
