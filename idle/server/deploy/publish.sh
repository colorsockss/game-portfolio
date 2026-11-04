#!/usr/bin/env bash
# 서버와 패치를 Live로 낸다(4.12절의 공개). <서버 커밋>이 지금 Live 서버가 아니면 그 릴리스(VPS에 올라가 있어야 함)로 바꾸고,
# <패치 버전>이 있으면 그 버전의 API 채널 포인터를 그것으로 옮긴다. 빈 값은 건너뛴다. 서버를 먼저 바꾸므로 포인터를 옮기기까지
# 짧게 어긋날 수 있지만, 막힌 클라이언트는 "새 버전이 필요합니다"에서 다시 시도하면 맞춰진다.
#   server/deploy/publish.sh <서버 커밋|""> <패치 버전|"">
# CI(.github/workflows/idle-release.yml)의 내보내기와 공개·롤백이 함께 부른다. 접속은 deploy.sh와 같고(VPS_HOST, VPS_USER,
# VPS_SSH), 패치 폴더는 tools/patch.mjs의 PATCH_TARGET이다.
set -euo pipefail

server="${1-}"
version="${2-}"
deploy="$(cd "$(dirname "$0")" && pwd)"
remote="${VPS_USER:-deploy}@${VPS_HOST:-idle.dennou.cloud}"
read -r -a ssh_cmd <<< "${VPS_SSH:-ssh}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

if [ -n "$server" ]; then
  current=$("${ssh_cmd[@]}" "$remote" 'readlink /srv/idle/server/current || true')
  if [ "$server" != "${current##*/}" ]; then
    "${ssh_cmd[@]}" "$remote" test -d "/srv/idle/server/releases/$server" \
      || { echo "::error::The server $server is not on the VPS; stage it first." >&2; exit 1; }
    "$deploy/deploy.sh" "$server"
    echo "Server \`${server:0:7}\` is live." >> "$summary"
  fi
fi
if [ -n "$version" ]; then
  node "$deploy/../../client/TypeScript/tools/patch.mjs" release "$version"
  echo "Patch \`$version\` is live." >> "$summary"
fi
