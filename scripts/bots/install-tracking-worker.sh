#!/usr/bin/env bash
# Invoked by the user's local installer. Separate from website/Reporter release.
set -euo pipefail
umask 077
upload=${1:?Upload directory required}
case "$upload" in /root/mk-tracking-upload-[a-f0-9]*) ;; *) echo 'Invalid upload directory'; exit 1;; esac
[[ "$upload" =~ ^/root/mk-tracking-upload-[a-f0-9]{32}$ ]] || exit 1
[[ -d "$upload" && ! -L "$upload" && "$(realpath -e -- "$upload")" == "$upload" ]] || { echo 'Unsafe upload path'; exit 1; }
switch_started=0
install_confirmed=0
rollback_ready=0
cleanup_upload() {
 local result=$?
 trap - EXIT
 cd /
 if (( result != 0 && switch_started == 1 && install_confirmed == 0 && rollback_ready == 1 )); then
  echo 'Update startup failed. Restoring the previous Model Kombat collector.'
  if cp -p "$upload/rollback/settings.env" /etc/model-kombat-tracking.env.new &&
     mv -f /etc/model-kombat-tracking.env.new /etc/model-kombat-tracking.env &&
     cp -p "$upload/rollback/node" /opt/model-kombat-tracking/runtime/node.new &&
     mv -f /opt/model-kombat-tracking/runtime/node.new /opt/model-kombat-tracking/runtime/node &&
     cp -p "$upload/rollback/service" /etc/systemd/system/model-kombat-tracking.service.new &&
     mv -f /etc/systemd/system/model-kombat-tracking.service.new /etc/systemd/system/model-kombat-tracking.service &&
     ln -sfn "$previous" /opt/model-kombat-tracking/current.new &&
     mv -Tf /opt/model-kombat-tracking/current.new /opt/model-kombat-tracking/current &&
     systemctl daemon-reload && systemctl restart model-kombat-tracking.service &&
     systemctl is-active --quiet model-kombat-tracking.service; then
   echo 'Previous collector restored. The new update was not installed successfully.'
  else
   echo 'Automatic restoration needs attention: check model-kombat-tracking.service.'
   # Preserve the private recovery files if automatic restoration cannot finish.
   rm -f -- "$upload/settings.env"
   exit "$result"
  fi
 fi
 # Only this invocation's exact staging directory. rm does not follow links;
 # the mount boundary option also prevents crossing a nested filesystem.
 if [[ -d "$upload" && ! -L "$upload" && "$(realpath -e -- "$upload")" == "$upload" ]]; then
  rm -rf --one-file-system -- "$upload" || echo 'Could not remove this temporary upload.'
 fi
 exit "$result"
}
trap cleanup_upload EXIT
[[ $(id -u) == 0 ]] || { echo 'Run this installer using the root login.'; exit 1; }
command -v systemctl >/dev/null || { echo 'This installer needs a systemd Linux server.'; exit 1; }
# Keep overlapping user retries from changing the same release concurrently.
exec 9>/run/lock/model-kombat-tracking-install.lock
flock -n 9 || { echo 'Another Model Kombat installation is running. Existing collector unchanged.'; exit 1; }
for target in /root /opt /var/lib; do
 free_kb=$(df -Pk "$target" | awk 'NR==2 {print $4}')
 free_inodes=$(df -Pi "$target" | awk 'NR==2 {print $4}')
 if (( free_kb < 524288 || free_inodes < 30000 )); then
  echo "Not enough installation space on $target: need 512 MiB and 30000 free file entries. Existing collector unchanged."
  exit 1
 fi
done
if [[ -f /etc/systemd/system/model-kombat-tracking.service ]] && ! grep -Fq 'Model Kombat public trade verification' /etc/systemd/system/model-kombat-tracking.service; then
 echo 'An unrecognized service already uses model-kombat-tracking. Nothing was replaced.'; exit 1
fi
node_path=$(command -v node || true)
npm_path=$(command -v npm || true)
[[ -n "$node_path" && -n "$npm_path" ]] || { echo 'Node.js 20 or newer and npm are required on the droplet.'; exit 1; }
"$node_path" -e 'if(Number(process.versions.node.split(".")[0])<20)process.exit(1)' || { echo 'Node.js 20 or newer is required.'; exit 1; }
[[ "$node_path" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { echo 'Unsupported Node installation path.'; exit 1; }
unset NODE_PATH
for directory in /opt/model-kombat-tracking /opt/model-kombat-tracking/releases /opt/model-kombat-tracking/runtime; do
 [[ ! -L "$directory" ]] || { echo 'Unexpected collector directory link.'; exit 1; }
done
id mk-tracking >/dev/null 2>&1 || useradd --system --home-dir /var/lib/model-kombat-tracking --shell /usr/sbin/nologin mk-tracking
install -d -m 755 /opt/model-kombat-tracking /opt/model-kombat-tracking/releases
install -d -o mk-tracking -g mk-tracking -m 700 /var/lib/model-kombat-tracking
release_tool="$upload/scripts/bots/lib/worker-release.cjs"
release_id=$("$node_path" "$release_tool" id "$upload/manifest.json")
[[ "$release_id" =~ ^[a-f0-9]{16}$ ]] || exit 1
release="/opt/model-kombat-tracking/releases/$release_id"
previous=$(readlink -e /opt/model-kombat-tracking/current || true)
if [[ -n "$previous" && ! "$previous" =~ ^/opt/model-kombat-tracking/releases/[a-f0-9]{16}$ ]]; then
 echo 'Unexpected current collector path. Nothing replaced.'; exit 1
fi
if [[ -e "$release" || -L "$release" ]]; then
 # Never npm ci inside a release that may be running. Reuse only a complete,
 # verified installation made with this Node major version.
 "$node_path" "$release_tool" verify "$release" "$release_id"
 cd "$release"
 echo 'Reusing this verified collector release; no duplicate dependency installation.'
else
 # Failed downloads/builds stay inside this upload and are removed on exit.
 candidate="$upload/candidate"
 install -d -m 755 "$candidate"
 tar -xzf "$upload/worker.tar.gz" -C "$candidate" --no-same-owner
 "$node_path" "$release_tool" verify-files "$candidate" "$release_id"
 cd "$candidate"
 "$npm_path" ci --omit=dev --ignore-scripts --no-audit --no-fund --cache "$upload/npm-cache"
fi
# Build, test and confirm database setup before switching the existing service.
"$npm_path" test
"$node_path" scripts/bots/worker-install-preflight.cjs "$upload/settings.env"
if [[ "$PWD" != "$release" ]]; then
 "$node_path" -e 'require("fs").writeFileSync(".install-complete.json",JSON.stringify({releaseId:process.argv[1],nodeMajor:Number(process.versions.node.split(".")[0])})+"\n")' "$release_id"
 "$node_path" "$release_tool" verify "$candidate" "$release_id"
 chmod -R a+rX "$candidate"
 mv -T "$candidate" "$release"
 cd "$release"
fi
if [[ -n "$previous" ]]; then
 install -d -m 700 "$upload/rollback"
 cp -p /etc/model-kombat-tracking.env "$upload/rollback/settings.env"
 cp -p /etc/systemd/system/model-kombat-tracking.service "$upload/rollback/service"
 cp -p /opt/model-kombat-tracking/runtime/node "$upload/rollback/node"
 rollback_ready=1
 if [[ "$previous" != "$release" ]]; then
  ln -sfn "$previous" /opt/model-kombat-tracking/previous.new
  mv -Tf /opt/model-kombat-tracking/previous.new /opt/model-kombat-tracking/previous
 fi
fi
switch_started=1
install -m 600 "$upload/settings.env" /etc/model-kombat-tracking.env.new
mv -f /etc/model-kombat-tracking.env.new /etc/model-kombat-tracking.env
# Copy just the Node executable if nvm lives beneath /root. Never alter its
# installation or the runtime of any existing service.
install -d -m 755 /opt/model-kombat-tracking/runtime
if ! cmp -s "$node_path" /opt/model-kombat-tracking/runtime/node; then
 install -m 755 "$node_path" /opt/model-kombat-tracking/runtime/node.new
 mv -f /opt/model-kombat-tracking/runtime/node.new /opt/model-kombat-tracking/runtime/node
fi
ln -sfn "$release" /opt/model-kombat-tracking/current.new
mv -Tf /opt/model-kombat-tracking/current.new /opt/model-kombat-tracking/current
cat >/etc/systemd/system/model-kombat-tracking.service.new <<'UNIT'
[Unit]
Description=Model Kombat public trade verification (separate from Reporter)
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=mk-tracking
Group=mk-tracking
WorkingDirectory=/opt/model-kombat-tracking/current
EnvironmentFile=/etc/model-kombat-tracking.env
Environment=NODE_ENV=production
Environment=MK_WORKER_STATE_DIR=/var/lib/model-kombat-tracking
Environment=MK_WORKER_POLL_MINUTES=15
ExecStart=/opt/model-kombat-tracking/runtime/node scripts/bots/run-trade-worker.cjs --write --watch
Restart=on-failure
RestartSec=30
TimeoutStopSec=45
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/model-kombat-tracking
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
UNIT
mv -f /etc/systemd/system/model-kombat-tracking.service.new /etc/systemd/system/model-kombat-tracking.service
systemctl daemon-reload
systemctl enable model-kombat-tracking.service
started_ms=$(date +%s%3N)
systemctl restart model-kombat-tracking.service
sleep 2
systemctl is-active --quiet model-kombat-tracking.service || { journalctl -u model-kombat-tracking.service -n 15 --no-pager; exit 1; }
confirmed=0
for attempt in {1..10}; do
 if /opt/model-kombat-tracking/runtime/node -e 'const fs=require("fs");try{const s=JSON.parse(fs.readFileSync("/var/lib/model-kombat-tracking/backend-worker-status.json","utf8"));process.exit(s.workerVersion==="mk-public-worker-12-router-reconciliation"&&Date.parse(s.updatedAt)>=Number(process.argv[1])?0:1);}catch{process.exit(1);}' "$started_ms"; then confirmed=1; break; fi
 sleep 1
done
if [[ "$confirmed" != 1 ]]; then
 echo 'Files installed, but the updated collector has not confirmed startup. Do not use an older audit as its result.'
 journalctl -u model-kombat-tracking.service -n 20 --no-pager
 exit 1
fi
install_confirmed=1
if [[ "$previous" == "$release" || -z "$previous" ]]; then
 previous=$(readlink -e /opt/model-kombat-tracking/previous || true)
fi
# Prune only hash-verified collector releases, after successful new startup.
# Current plus one previous release are retained; unknown paths are untouched.
"$node_path" "$release_tool" prune "$release" "$previous" || echo 'Old-release cleanup skipped; collector startup was confirmed.'
echo 'Confirmed running version: mk-public-worker-12-router-reconciliation'
echo 'Model Kombat collector installed and running. It restarts after a reboot.'
echo 'The first audit is running. Cash tracking is not confirmed until its report passes.'
echo 'Campaign dates, website, Reporter and shared accounting were not changed.'
echo 'The private database report will show the new audit as it progresses.'
