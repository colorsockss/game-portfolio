#!/usr/bin/env bash
# MMO Live를 키우기와 같은 VPS(Ubuntu)에 준비한다. root로 한 번 돌리고, 다시 돌려도 같은 상태가 된다.
# 배포 사용자 deploy와 그 SSH 키는 키우기의 setup.sh가 만든 것을 함께 쓴다(CI의 VPS_SSH_KEY가 같다).
# /srv/mmo의 폴더, 게임 서버 서비스 mmo-server(TCP 7777, 모든 인터페이스. Caddy를 거치지 않음), 사냥하는 봇 20명의 서비스
# mmo-bots(같은 VPS에서 루프백으로 붙음. mmo backlog 30), deploy가 두 서비스를 다시 시작하는 권한을 만들고, ufw가 켜져 있으면 7777을 연다. 저장소가 VPS에 없으므로 이 파일을 VPS에 붙여 넣어 돌린다.
#   bash mmo-setup.sh
set -euo pipefail

port=7777
id deploy >/dev/null 2>&1 || { echo "User deploy is missing; run idle/server/deploy/setup.sh first (both games share it)." >&2; exit 1; }

# 1. 폴더. 저장 데이터는 deploy만 읽는다.
install -d -m 755 -o deploy -g deploy /srv/mmo /srv/mmo/server /srv/mmo/server/releases
install -d -m 750 -o deploy -g deploy /srv/mmo/data

# 2. 게임 서버 서비스. 릴리스는 .NET 런타임을 함께 실은 빌드라 VPS에 .NET을 설치하지 않는다. 첫 배포가 current 링크를
# 만들어야 시작할 수 있으므로 여기서는 켜 두기만 한다.
cat > /etc/systemd/system/mmo-server.service <<UNIT
[Unit]
Description=MMORPG game server
After=network.target

[Service]
User=deploy
WorkingDirectory=/srv/mmo/server/current
ExecStart=/srv/mmo/server/current/PortfolioMmo.Server --port $port --database /srv/mmo/data/mmo.sqlite --demo
# 프로세스가 끝나면(저장 실패, 틱의 예외, 멈춤 감시. mmo backlog 38, 39) 다시 띄운다.
Restart=always
RestartSec=2
# SIGTERM을 받으면 모두에게 SERVER_SHUTDOWN을 보내고 위치를 저장한 뒤 내려간다. 저장 큐의 한도(10초)보다 길게 기다린다.
TimeoutStopSec=30
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/srv/mmo/data

[Install]
WantedBy=multi-user.target
UNIT
# 사냥하는 봇 20명. 릴리스의 bots/(부하 봇의 빌드)를 쓰고, 시간 제한 없이 돌며 서버가 다시 뜨면 다시 로그인한다. 로그인 ID는 livebot_0000부터다.
cat > /etc/systemd/system/mmo-bots.service <<UNIT
[Unit]
Description=MMORPG hunting bots
After=mmo-server.service

[Service]
User=deploy
WorkingDirectory=/srv/mmo/server/current/bots
ExecStart=/srv/mmo/server/current/bots/LoadTest --host 127.0.0.1 --port $port --bots 20 --demo-bots 10 --hunt --seconds 0 --half-extent 285 --prefix livebot
Restart=always
RestartSec=10
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable mmo-server mmo-bots

# 3. deploy가 sudo로 할 수 있는 것은 이 서비스를 다시 시작하는 것뿐이다. 문법을 검사한 뒤에 넣는다.
rule=$(mktemp)
printf '%s\n' 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart mmo-server' 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart mmo-bots' > "$rule"
visudo -cf "$rule"
install -m 440 "$rule" /etc/sudoers.d/mmo-deploy
rm -f "$rule"

# 4. 방화벽. ufw가 켜져 있으면 연다. Hostinger 패널의 방화벽을 쓰고 있다면 거기서도 TCP 7777을 열어야 한다.
if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
  ufw allow "$port/tcp"
fi

echo "[mmo] Ready: mmo-server is enabled on TCP $port, and mmo-server and mmo-bots start after the first deploy."
echo "[mmo] Architecture: $(uname -m) (the deploy action picks the matching .NET runtime)"
