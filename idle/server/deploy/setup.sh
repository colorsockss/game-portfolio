#!/usr/bin/env bash
# 키우기 Live를 VPS(Ubuntu, Caddy가 80·443을 맡음)에 준비한다. root로 한 번 돌리고, 다시 돌려도 같은 상태가 된다.
# 배포 사용자 deploy와 그 SSH 키, /srv/idle의 폴더, Caddy 사이트 idle.dennou.cloud, 게임 서버 서비스 idle-server,
# deploy가 그 서비스를 다시 시작하는 권한 한 줄을 만든다. 저장소가 VPS에 없으므로 이 파일을 VPS에 붙여 넣어 돌린다.
#   bash idle-setup.sh 'ssh-ed25519 AAAA… idle-ci'      (인자는 CI 배포 키의 공개 키 한 줄)
# 설계: idle/docs/superpowers/specs/2026-10-30-patch-design.md 4.6절, 4.9절.
set -euo pipefail

key="${1:?Usage: bash idle-setup.sh '<the deploy public key line>'}"
case "$key" in ssh-ed25519\ *) ;; *) echo "The key must be one ssh-ed25519 public key line." >&2; exit 1 ;; esac
# VPS에 이미 있는 Node(22.13 이상이어야 node:sqlite가 있음). 다른 앱과 함께 쓴다.
node_bin=/usr/local/bin/node
caddyfile=/etc/caddy/Caddyfile
site=/etc/caddy/idle.caddy

# 1. 배포 사용자. 비밀번호 없이 SSH 키로만 들어온다.
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
grep -qxF "$key" /home/deploy/.ssh/authorized_keys || echo "$key" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# 2. 폴더. 패치 폴더는 Caddy(사용자 caddy)가 읽고, 저장 데이터는 deploy만 읽는다.
install -d -m 755 -o deploy -g deploy /srv/idle /srv/idle/patch /srv/idle/server /srv/idle/server/releases
install -d -m 750 -o deploy -g deploy /srv/idle/data

# 3. Caddy 사이트. 기존 Caddyfile에는 import 한 줄만 더한다. 검사가 실패하면 Caddyfile을 되돌리고, 통과하면 reload한다
# (다시 시작하지 않으므로 다른 사이트가 끊기지 않음). 인증서는 Caddy가 다른 사이트처럼 받는다.
cat > "$site" <<'CADDY'
idle.dennou.cloud {
	handle /ws {
		reverse_proxy 127.0.0.1:8080
	}
	handle_path /patch/* {
		root * /srv/idle/patch
		header /channels/* Cache-Control "no-cache"
		header /aa/* Cache-Control "public, max-age=31536000, immutable"
		header /v/* Cache-Control "public, max-age=31536000, immutable"
		file_server
	}
	handle {
		respond 404
	}
}
CADDY
cp "$caddyfile" "$caddyfile.before-idle"
grep -qxF "import $site" "$caddyfile" || printf '\nimport %s\n' "$site" >> "$caddyfile"
if ! caddy validate --config "$caddyfile" --adapter caddyfile; then
  cp "$caddyfile.before-idle" "$caddyfile"
  echo "Caddy rejected the config; $caddyfile is restored." >&2
  exit 1
fi
systemctl reload caddy

# 4. 게임 서버 서비스. Caddy 뒤의 127.0.0.1에만 열고, 쓰는 곳은 저장 데이터 폴더뿐이다. 첫 배포가 current 링크를
# 만들어야 시작할 수 있으므로 여기서는 켜 두기만 한다.
cat > /etc/systemd/system/idle-server.service <<UNIT
[Unit]
Description=Idle RPG game server
After=network.target

[Service]
User=deploy
WorkingDirectory=/srv/idle/server/current
Environment=HOST=127.0.0.1 PORT=8080 DATABASE_PATH=/srv/idle/data/game.sqlite
ExecStart=$node_bin --enable-source-maps main.mjs
Restart=on-failure
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/srv/idle/data

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable idle-server

# 5. deploy가 sudo로 할 수 있는 것은 이 서비스를 다시 시작하는 것뿐이다. 문법을 검사한 뒤에 넣는다.
rule=$(mktemp)
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart idle-server' > "$rule"
visudo -cf "$rule"
install -m 440 "$rule" /etc/sudoers.d/idle-deploy
rm -f "$rule"

echo "[idle] Ready: https://idle.dennou.cloud/patch/ and /ws (idle-server is enabled and starts after the first deploy)."
echo "[idle] Host key for VPS_KNOWN_HOSTS: $(ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub)"
