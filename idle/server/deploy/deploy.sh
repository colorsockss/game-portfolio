#!/usr/bin/env bash
# 게임 서버 번들(server/dist)을 Live VPS에 내보낸다. 커밋마다 releases/<커밋>/에 올리고, current 링크를 한 번에 바꿔
# 다시 시작한 뒤 Caddy를 거쳐 서버가 답하는지 본다. 이미 올린 커밋을 주면 올리기 없이 그 릴리스로 돌아간다(롤백).
#   npm run build -w @idle/server && server/deploy/deploy.sh <커밋> [--stage]
# --stage는 올리기만 하고 current와 서비스는 그대로 둔다. 나중에 같은 커밋으로 다시 부르면 공개된다(4.12절의 올리기와 공개).
# 접속은 VPS_HOST(기본 idle.dennou.cloud), VPS_USER(기본 deploy), VPS_SSH(ssh 명령과 옵션, 기본 ssh)로 받는다.
# VPS는 setup.sh로 준비해 둔다. 설계: idle/docs/superpowers/specs/2026-10-30-patch-design.md 4.8절, 4.9절.
set -euo pipefail

release="${1:?Usage: deploy.sh <commit> [--stage]}"
stage="${2:-}"
case "$release" in *[!0-9a-f]*) echo "The release name must be a commit hash, got $release." >&2; exit 1 ;; esac
host="${VPS_HOST:-idle.dennou.cloud}"
remote="${VPS_USER:-deploy}@$host"
# ssh 명령과 옵션(예: ssh -i $HOME/Keys/idle-deploy). 단어로 나눠 쓴다.
read -r -a ssh_cmd <<< "${VPS_SSH:-ssh}"
root=/srv/idle/server
dist="$(cd "$(dirname "$0")/.." && pwd)/dist"

# 1. 올린다. 같은 커밋은 내용도 같으므로 이미 있으면 덮지 않는다. 반쯤 올린 것이 그 이름으로 남지 않도록 임시 폴더에
# 올린 뒤 이름을 바꾼다.
if "${ssh_cmd[@]}" "$remote" test -d "$root/releases/$release"; then
  echo "[deploy] releases/$release is already on the VPS"
else
  test -f "$dist/main.mjs" || { echo "No server bundle in $dist; run npm run build -w @idle/server first." >&2; exit 1; }
  rsync -rt -e "${ssh_cmd[*]}" "$dist/" "$remote:$root/releases/.$release.tmp/"
  "${ssh_cmd[@]}" "$remote" mv "$root/releases/.$release.tmp" "$root/releases/$release"
  echo "[deploy] uploaded releases/$release"
fi

if [ "$stage" = --stage ]; then
  echo "[deploy] staged releases/$release (the live server is unchanged)"
  exit 0
fi

# 2. current를 임시 링크의 rename으로 한 번에 바꾸고 다시 시작한다. 접속이 끊기고 클라이언트는 다시 붙는다.
"${ssh_cmd[@]}" "$remote" "ln -sfn releases/$release $root/current.tmp && mv -T $root/current.tmp $root/current && sudo systemctl restart idle-server"

# 3. Caddy를 거쳐 서버가 답하는지 본다. 서버는 WebSocket이 아닌 요청에 404로 답하고, 닿지 못하면 Caddy가 502를 준다.
# 다시 시작은 옛 프로세스를 멈춘 뒤에 끝나므로 404는 새 서버의 것이다.
code=none
for _ in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "https://$host/ws" || true)
  if [ "$code" = 404 ]; then
    echo "[deploy] idle-server answers on releases/$release"
    exit 0
  fi
  sleep 1
done
echo "idle-server did not answer through Caddy (last status $code)." >&2
exit 1
