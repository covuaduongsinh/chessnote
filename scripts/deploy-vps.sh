#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "♟️  ChessNote VPS Deployment Script — Ubuntu (217.15.160.118)"
echo "🌐 Domain: chessnote.dsc.edu.vn"
echo "=========================================================="

# 1. Kiểm tra file .env
if [ ! -f .env ]; then
    echo "⚠️  Chưa tìm thấy file .env, đang tự động tạo từ .env.vps.example..."
    cp .env.vps.example .env
    echo "✅ Đã tạo file .env với DOMAIN_NAME=chessnote.dsc.edu.vn."
    echo "👉 Bạn có thể chỉnh sửa mật khẩu trong .env bất cứ lúc nào bằng lệnh: nano .env"
fi

# 2. Kiểm tra và cài đặt Docker trên Ubuntu
if ! command -v docker &> /dev/null; then
    echo "📦 Docker chưa được cài đặt. Đang cài đặt Docker cho Ubuntu..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER || true
    echo "✅ Cài đặt Docker thành công!"
fi

# 3. Kiểm tra Docker Compose
if ! docker compose version &> /dev/null; then
    echo "📦 Đang cài đặt docker-compose-plugin..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

# 4. Build và khởi chạy Docker Stack
echo "🚀 Đang build và khởi chạy ChessNote Stack (App + Sync Hub + AI + Caddy SSL)..."
docker compose -f docker-compose.vps.yml up -d --build

# 5. Kiểm tra trạng thái các container
echo "=========================================================="
echo "📊 Trạng thái các dịch vụ đang chạy:"
docker compose -f docker-compose.vps.yml ps

echo "=========================================================="
echo "🎉 Triển khai thành công trên VPS Ubuntu!"
echo "🔒 HTTPS Web App: https://chessnote.dsc.edu.vn"
echo "📡 Cloud Sync Hub: https://chessnote.dsc.edu.vn/sync/"
echo "⚡ Realtime Push: wss://chessnote.dsc.edu.vn/_push"
echo "=========================================================="
