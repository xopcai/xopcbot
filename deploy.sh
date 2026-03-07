#!/bin/bash

set -e

cd /root/xopc/xopcbot

<<<<<<< HEAD
echo "🗑️ 卸载旧版本..."
npm uninstall -g @xopcai/xopcbot

=======
>>>>>>> 30aee12 (fix(telegram): properly send images to LLM and improve message handling)
echo "📦 构建中..."
npm run build

echo "📥 安装中..."
npm i -g .

echo "🔄 重启服务..."
xopcbot gateway restart

echo "✅ 完成!"
