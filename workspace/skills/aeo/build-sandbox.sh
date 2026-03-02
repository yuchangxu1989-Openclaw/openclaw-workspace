#!/bin/bash
# AEO Sandbox Build Script
# 构建沙盒镜像并准备测试环境

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SANDBOX_DIR="$SCRIPT_DIR/skills/aeo/src/sandbox"
IMAGE_NAME="aeo-sandbox"
IMAGE_TAG="latest"

echo "========================================"
echo "AEO Sandbox Build Script"
echo "========================================"
echo ""

# 检查Docker
echo "[1/4] Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

docker info > /dev/null 2&>1 || {
    echo "❌ Docker daemon not running."
    exit 1
}

echo "✅ Docker is ready"

# 构建镜像
echo ""
echo "[2/4] Building sandbox image..."
cd "$SANDBOX_DIR"
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" . || {
    echo "❌ Build failed"
    exit 1
}

echo "✅ Image built: ${IMAGE_NAME}:${IMAGE_TAG}"

# 验证镜像
echo ""
echo "[3/4] Verifying image..."
docker run --rm "${IMAGE_NAME}:${IMAGE_TAG}" node --version

echo "✅ Image verified"

# 创建必要的目录
echo ""
echo "[4/4] Preparing directories..."
mkdir -p /tmp/aeo-sandbox-tasks
mkdir -p /tmp/aeo-backups
mkdir -p "$SCRIPT_DIR/skills/aeo/data/evaluation-results"

echo "✅ Directories ready"

# 显示镜像信息
echo ""
echo "========================================"
echo "Build Complete!"
echo "========================================"
echo ""
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Size: $(docker images ${IMAGE_NAME}:${IMAGE_TAG} --format '{{.Size}}')"
echo ""
echo "Next steps:"
echo "  1. Run integration test: node skills/aeo/src/aeo-integration.cjs"
echo "  2. Or require in your code:"
echo "     const { AEOIntegration } = require('./skills/aeo/src/aeo-integration.cjs');"
echo ""
