"""Upload a local file or folder to the Vast box through Jupyter's contents API.

    python scripts/sd/vast/vast_put.py <local file or dir> <remote path under />
    python scripts/sd/vast/vast_put.py scripts/sd /workspace/bb/sd        # a whole tree, sent as one tar

A folder is tarred locally, PUT as one base64 file, then untarred on the box
with vast_shell.run, so a tree of a thousand small control maps is one request.
"""
import base64, io, os, sys, tarfile, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vast_shell as vs

def put_file(local, remote):
    data = open(local, "rb").read()
    body = {"type": "file", "format": "base64", "content": base64.b64encode(data).decode()}
    vs.api("/api/contents" + remote, "PUT", body)
    return len(data)

def put_tree(local, remote):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        tf.add(local, arcname=".")
    tmp = "/workspace/bb/_upload.tgz"
    vs.api("/api/contents" + tmp, "PUT", {"type": "file", "format": "base64", "content": base64.b64encode(buf.getvalue()).decode()})
    out = vs.run("mkdir -p " + remote + " && tar -xzf " + tmp + " -C " + remote + " && rm -f " + tmp + " && find " + remote + " -type f | wc -l")
    return buf.tell(), out.strip()

def clean_remote(r):
    """Git Bash on Windows rewrites a leading-slash argument into a path under
    its own install (C:/Program Files/Git/...). Undo that, and force one leading
    slash, so the remote path is what the caller typed."""
    r = r.replace(chr(92), "/")
    for junk in ("C:/Program Files/Git", "C:/Program Files (x86)/Git"):
        if r.startswith(junk):
            r = r[len(junk):]
    return "/" + r.lstrip("/")

if __name__ == "__main__":
    local, remote = sys.argv[1], clean_remote(sys.argv[2])
    if os.path.isdir(local):
        n, out = put_tree(local, remote)
        print("sent tar", n, "bytes; remote files:", out)
    else:
        print("sent", put_file(local, remote), "bytes ->", remote)
