#!/bin/bash
# openclaw.json 解锁脚本 — 需要用户口令
echo "⚠️ 你正在请求解锁 openclaw.json"
echo "请输入口令（由于长煦设定）："
read -s PASSPHRASE
if [ "$PASSPHRASE" = "焰崽你可以改了" ]; then
    chattr -i /root/.openclaw/openclaw.json
    echo "✅ 已解锁，60秒后自动重新锁定"
    (sleep 60 && chattr +i /root/.openclaw/openclaw.json && echo "🔒 openclaw.json 已自动重新锁定") &
else
    echo "❌ 口令错误，拒绝解锁"
    exit 1
fi
