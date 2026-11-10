#!/usr/bin/env bash
# 서버 빌드(mmo/server/dist)를 Live VPS에 내보낸다. 커밋마다 releases/<커밋>/에 올리고, current 링크를 한 번에 바꿔 다시
# 시작한 뒤 바깥에서 7777로 Ping을 보내 Pong이 오는지 본다. 이미 올린 커밋을 주면 올리기 없이 그 릴리스로 돌아간다(롤백).
#   dotnet publish mmo/server/src -c Release -r linux-x64 --self-contained -o mmo/server/dist && mmo/server/deploy/deploy.sh <커밋>
# ssh 접속은 키우기와 같은 VPS_HOST(기본 idle.dennou.cloud), VPS_USER(기본 deploy), VPS_SSH(ssh 명령과 옵션, 기본 ssh)로 받고,
# 게임 서버의 주소는 MMO_HOST(기본 mmo.dennou.cloud)다. VPS는 setup.sh로 준비해 둔다.
set -euo pipefail

release="${1:?Usage: deploy.sh <commit>}"
case "$release" in *[!0-9a-f]*) echo "The release name must be a commit hash, got $release." >&2; exit 1 ;; esac
remote="${VPS_USER:-deploy}@${VPS_HOST:-idle.dennou.cloud}"
read -r -a ssh_cmd <<< "${VPS_SSH:-ssh}"
game_host="${MMO_HOST:-mmo.dennou.cloud}"
root=/srv/mmo/server
here="$(cd "$(dirname "$0")" && pwd)"
dist="$here/../dist"

# 1. 올린다. 같은 커밋은 내용도 같으므로 이미 있으면 덮지 않는다. 반쯤 올린 것이 그 이름으로 남지 않도록 임시 폴더에
# 올린 뒤 이름을 바꾼다.
if "${ssh_cmd[@]}" "$remote" test -d "$root/releases/$release"; then
  echo "[deploy] releases/$release is already on the VPS"
else
  test -x "$dist/PortfolioMmo.Server" || { echo "No server build in $dist; run dotnet publish first." >&2; exit 1; }
  rsync -rlt -e "${ssh_cmd[*]}" "$dist/" "$remote:$root/releases/.$release.tmp/"
  "${ssh_cmd[@]}" "$remote" mv "$root/releases/.$release.tmp" "$root/releases/$release"
  echo "[deploy] uploaded releases/$release"
fi

# 2. current를 임시 링크의 rename으로 한 번에 바꾸고 다시 시작한다. 옛 서버는 SERVER_SHUTDOWN을 보내고 위치를 저장한 뒤 내려간다.
"${ssh_cmd[@]}" "$remote" "ln -sfn releases/$release $root/current.tmp && mv -T $root/current.tmp $root/current && sudo systemctl restart mmo-server"

# 3. 바깥에서 붙어 새 서버가 답하는지 본다. 다시 시작은 옛 프로세스를 멈춘 뒤에 끝나므로 Pong은 새 서버의 것이다.
for _ in $(seq 1 20); do
  if node "$here/check.mjs" "$game_host" 7777 2>/dev/null; then
    echo "[deploy] mmo-server answers on $game_host:7777 with releases/$release"
    # 릴리스 하나가 .NET 런타임을 함께 실어 약 81 MB라 가장 최근 5개만 남긴다(지금 것은 지우지 않음). 롤백은 그 안에서만 된다.
    "${ssh_cmd[@]}" "$remote" "cd $root/releases && ls -1t | grep -vxF '$release' | tail -n +5 | xargs -r rm -rf --"
    exit 0
  fi
  sleep 1
done
node "$here/check.mjs" "$game_host" 7777
