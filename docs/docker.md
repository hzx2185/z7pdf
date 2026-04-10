# Docker 架构与镜像构建

## 目标

本项目的 Docker 结构分成两类场景：
- 生产镜像：构建出可直接部署的标准镜像。
- 开发容器：在不重建镜像的前提下，挂载源码并实时调试。

## 目录职责

- `Dockerfile`
  生产镜像入口，使用多阶段构建。
- `.dockerignore`
  控制构建上下文，避免把本地数据库、依赖目录和工具痕迹打进镜像。
- `docker-compose.yml`
  生产运行编排，负责端口映射、环境变量和数据持久化。
- `docker-compose.dev.yml`
  开发态覆盖文件，只扩展命令和源码挂载。

## 镜像分层

当前 `Dockerfile` 采用三层：

1. `base`
   安装系统级运行依赖，如 `ghostscript`、`qpdf`、`ocrmypdf` 和 `tesseract`。
2. `deps`
   只处理 Node.js 依赖安装，执行 `npm ci --omit=dev`。
3. `runtime`
   复制运行时所需源码和 `node_modules`，创建数据目录，切换到 `node` 用户，并暴露健康检查。

这样做的目的：
- 依赖层和源码层分离，源码变更时更容易复用缓存。
- 最终镜像只保留运行所需文件，结构更清晰。
- 默认使用非 root 用户运行，更接近标准生产部署习惯。

## 构建生产镜像

```bash
docker build -t z7pdf:latest .
```

## 运行生产镜像

```bash
docker run -d \
  --name z7pdf \
  -p 39010:39010 \
  -v "$(pwd)/data:/app/data" \
  z7pdf:latest
```

默认服务端口为 `39010`，容器内数据目录为 `/app/data`。

## 使用 Compose 运行

生产模式：

```bash
docker compose up -d --build
```

开发模式：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

开发模式下会挂载这些源码目录：
- `public/`
- `routes/`
- `services/`
- `middleware/`
- `utils/`
- `server.js`
- `db.js`

同时使用 `npm run dev` 监听这些路径，修改后会在容器内自动重启服务。

## 健康检查

镜像内置 `/health` 健康检查。容器启动后，Docker 会定期访问：

```text
http://127.0.0.1:39010/health
```

只要返回 `200`，就视为服务正常。

## 持久化与环境变量

- 持久化目录：`/app/data`
- 默认端口：`39010`
- 默认监听地址：`0.0.0.0`

可通过环境变量覆盖：
- `PORT`
- `HOST`
- `TZ`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## 构建上下文过滤

`.dockerignore` 已排除这些内容：
- `data/`
- `node_modules/`
- `.git/`
- `.vscode/`
- `.aider.*`
- 日志文件和测试产物

这样可以减少构建上下文体积，避免把本地状态误打进镜像。
