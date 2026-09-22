"""Download a file from the Vast box through Jupyter's contents API.

    python scripts/sd/vast/vast_get.py /workspace/bb/out/x.png local/dir/
"""
import base64, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vast_shell as vs
from vast_put import clean_remote

def get_file(remote, local_dir):
    r = vs.api("/api/contents" + remote + "?content=1&format=base64")
    os.makedirs(local_dir, exist_ok=True)
    out = os.path.join(local_dir, os.path.basename(remote))
    open(out, "wb").write(base64.b64decode(r["content"]))
    return out

if __name__ == "__main__":
    print(get_file(clean_remote(sys.argv[1]), sys.argv[2]))
