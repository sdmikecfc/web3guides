"""Run shell commands on a Vast ComfyUI box that has no sshd, through Jupyter's kernel API.

    python scripts/sd/vast/vast_shell.py "nvidia-smi"
    python scripts/sd/vast/vast_shell.py --file remote.sh

Why: the vastai/comfy template exposes Jupyter (8080) and ComfyUI (8188) behind a
Caddy Basic-auth proxy (user vastai, password = the instance's jupyter_token) and
assigns NO ssh port. A Jupyter kernel is a root shell with a websocket.
Auth: Caddy takes the token as ?token= on the query string, which leaves the
Authorization header free for Jupyter's own "token" scheme. A POST also needs
the _xsrf cookie, which only a PAGE load (/lab) sets, so we prime on /lab.
"""
import json, os, sys, uuid, time
import urllib.request, http.cookiejar
import websocket

def _load_env():
    """Host, port and token live in scripts/sd/vast/.vast.env (gitignored), never in source."""
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".vast.env")
    if os.path.exists(f):
        for line in open(f, encoding="utf-8"):
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v)
_load_env()
HOST = os.environ.get("VAST_HOST")
PORT = os.environ.get("VAST_JPORT")
TOKEN = os.environ.get("VAST_TOKEN")
if not (HOST and PORT and TOKEN):
    raise SystemExit("vast_shell: set VAST_HOST, VAST_JPORT and VAST_TOKEN (or scripts/sd/vast/.vast.env)")
BASE = "http://" + HOST + ":" + PORT
NL = chr(10)

_JAR = http.cookiejar.CookieJar()
_OPENER = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_JAR))
_XSRF = None


def _prime():
    global _XSRF
    req = urllib.request.Request(BASE + "/lab?token=" + TOKEN)
    req.add_header("Authorization", "token " + TOKEN)
    _OPENER.open(req, timeout=60).read()
    for c in _JAR:
        if c.name == "_xsrf":
            _XSRF = c.value


def api(path, method="GET", body=None):
    if _XSRF is None:
        _prime()
    sep = "&" if "?" in path else "?"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path + sep + "token=" + TOKEN, method=method, data=data)
    req.add_header("Authorization", "token " + TOKEN)
    req.add_header("Content-Type", "application/json")
    if _XSRF:
        req.add_header("X-XSRFToken", _XSRF)
    with _OPENER.open(req, timeout=900) as r:  # a 100 MB base64 tree takes minutes
        t = r.read().decode()
        return json.loads(t) if t else {}


def get_kernel():
    for k in api("/api/kernels"):
        if k.get("name") == "python3":
            return k["id"]
    return api("/api/kernels", "POST", {"name": "python3"})["id"]


def run(cmd, timeout=3600):
    kid = get_kernel()
    cookie = "; ".join(c.name + "=" + c.value for c in _JAR)
    ws = websocket.create_connection(
        "ws://" + HOST + ":" + PORT + "/api/kernels/" + kid + "/channels?token=" + TOKEN,
        header=["Authorization: token " + TOKEN], cookie=cookie, timeout=timeout)
    msg_id = uuid.uuid4().hex
    # the code the kernel runs, built without any backslash escapes on purpose
    code = NL.join([
        "import subprocess, sys",
        "p = subprocess.run(" + repr(cmd) + ", shell=True, executable='/bin/bash', capture_output=True, text=True)",
        "sys.stdout.write(p.stdout)",
        "sys.stderr.write(p.stderr)",
        "print('[exit ' + str(p.returncode) + ']')",
    ])
    hdr = {"msg_id": msg_id, "username": "bb", "session": uuid.uuid4().hex,
           "msg_type": "execute_request", "version": "5.3"}
    ws.send(json.dumps({"header": hdr, "parent_header": {}, "metadata": {}, "channel": "shell",
                        "content": {"code": code, "silent": False, "store_history": False,
                                    "allow_stdin": False, "stop_on_error": True}}))
    out = []
    t0 = time.time()
    while time.time() - t0 < timeout:
        m = json.loads(ws.recv())
        if m.get("parent_header", {}).get("msg_id") != msg_id:
            continue
        mt = m["msg_type"]
        if mt == "stream":
            out.append(m["content"]["text"])
        elif mt == "error":
            out.append(NL.join(m["content"].get("traceback", [])))
        elif mt == "status" and m["content"].get("execution_state") == "idle":
            break
    ws.close()
    return "".join(out)


if __name__ == "__main__":
    args = sys.argv[1:]
    cmd = open(args[1], encoding="utf-8").read() if args and args[0] == "--file" else " ".join(args)
    sys.stdout.write(run(cmd))
