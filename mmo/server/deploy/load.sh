#!/usr/bin/env bash
# Live VPS에서 Live와 따로 서버의 부하를 잰다(mmo backlog 63). current 릴리스의 서버를 빈 임시 데이터베이스로 다른 포트(7790)에 띄우고,
# 같은 릴리스의 봇(bots/LoadTest)을 루프백으로 붙여 정한 시간 동안 돌린 뒤, 서버 로그(10초 통계)와 봇의 끝 줄을 내고 둘 다 끈다.
# Live의 데이터와 서비스는 건드리지 않는다. 앞에 VPS와 OS의 한도(Live 서버 프로세스의 열린 파일 한도, 소켓 버퍼)를 찍는다.
#   mmo/server/deploy/load.sh <봇 수> <서버의 --spawn-half-extent(m)> <초> [봇 인자…]
#   mmo/server/deploy/load.sh 2000 285 70 --hunt --half-extent 285            흩은 봇
#   mmo/server/deploy/load.sh 500 0 70 --gather 16,-39 --gather-radius 15     마을에 모은 봇
# ssh 접속은 deploy.sh와 같은 VPS_HOST, VPS_USER, VPS_SSH로 받는다. 동접 상한은 봇 수로 둔다.
set -euo pipefail

bots="${1:?Usage: load.sh <bots> <spawn half-extent m> <seconds> [bot args]}"
half="${2:?}"
seconds="${3:?}"
shift 3
# 인자는 원격 셸에 그대로 들어가므로 숫자와 봇 인자에 쓰는 글자만 받는다.
for number in "$bots" "$half" "$seconds"; do
  case "$number" in '' | *[!0-9]*) echo "Expected a number, got '$number'." >&2; exit 1 ;; esac
done
for arg in "$@"; do
  case "$arg" in *[!-a-z0-9.,]*) echo "Unexpected bot argument '$arg'." >&2; exit 1 ;; esac
done
remote="${VPS_USER:-deploy}@${VPS_HOST:-idle.dennou.cloud}"
read -r -a ssh_cmd <<< "${VPS_SSH:-ssh}"

"${ssh_cmd[@]}" "$remote" bash -s -- "$bots" "$half" "$seconds" "$@" <<'REMOTE'
set -euo pipefail
bots=$1 half=$2 seconds=$3
shift 3
port=7790
current=/srv/mmo/server/current
work=$(mktemp -d /tmp/mmo-load.XXXXXX)
server= botpid=
cleanup() {
  [ -n "$botpid" ] && kill "$botpid" 2>/dev/null
  [ -n "$server" ] && kill "$server" 2>/dev/null
  wait 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

echo "[load] release $(basename "$(readlink -f "$current")"), $(nproc) cores,$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2), memory $(free -m | awk '/^Mem/{print $2}') MB, load $(cut -d' ' -f1-3 /proc/loadavg)"
echo "[load] this shell: open files soft $(ulimit -Sn), hard $(ulimit -Hn)"
live=$(systemctl show -p MainPID --value mmo-server 2>/dev/null || true)
echo "[load] Live mmo-server (pid $live): $(grep 'open files' "/proc/$live/limits" 2>/dev/null || echo 'limits unreadable')"
for key in fs.file-max fs.nr_open net.core.somaxconn net.ipv4.tcp_max_syn_backlog net.core.rmem_max net.core.wmem_max net.ipv4.tcp_rmem net.ipv4.tcp_wmem net.ipv4.ip_local_port_range; do
  echo "[load] $key = $(sysctl -n "$key" 2>/dev/null | tr '\t' ' ')"
done

"$current/PortfolioMmo.Server" --port "$port" --database "$work/load.sqlite" --spawn-half-extent "$half" --max-players "$bots" > "$work/server.log" 2>&1 &
server=$!
for _ in $(seq 1 100); do grep -q "Listening on port" "$work/server.log" && break; sleep 0.2; done
grep -q "Listening on port" "$work/server.log" || { cat "$work/server.log"; echo "[load] The server did not start." >&2; exit 1; }
echo "[load] test server (pid $server): $(grep 'open files' "/proc/$server/limits")"

started=$(date +%s)
"$current/bots/LoadTest" --host 127.0.0.1 --port "$port" --bots "$bots" --seconds "$seconds" "$@" > "$work/bots.log" 2>&1 &
botpid=$!
# 반쯤 지났을 때 서버가 연 파일 수(연결마다 소켓 하나)와 두 프로세스의 CPU(시작부터의 평균)를 본다. 봇도 같은 VPS에서 돌기 때문이다.
sleep $(( seconds / 2 ))
echo "[load] at $(( $(date +%s) - started )) s: server has $(ls "/proc/$server/fd" | wc -l) open files, load $(cut -d' ' -f1-3 /proc/loadavg)"
ps -o pid=,pcpu=,rss=,comm= -p "$server,$botpid" | sed 's/^/[load] ps /'
status=0
wait "$botpid" || status=$?
botpid=
echo "[load] bots ran $(( $(date +%s) - started )) s and exited with $status"
echo "----- server log"
cat "$work/server.log"
echo "----- bots (last 40 lines)"
tail -n 40 "$work/bots.log"
REMOTE
