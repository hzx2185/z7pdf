#!/bin/bash
# 开发模式启动脚本 - 修改代码后自动生效

echo "🚀 启动开发模式..."
echo "📝 文件挂载已启用,修改代码后自动生效"
echo ""

# 停止现有容器
docker compose -f docker-compose.yml -f docker-compose.dev.yml down 2>/dev/null

# 启动开发模式
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 等待服务启动
sleep 3

# 显示状态
echo "✅ 服务已启动!"
echo ""
echo "访问地址:"
echo "  主页:     http://127.0.0.1:39010"
echo "  管理后台: http://127.0.0.1:39010/admin.html"
echo ""
echo "查看日志: docker compose logs -f"
echo "停止服务: docker compose down"
