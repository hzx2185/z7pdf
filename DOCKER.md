# Docker 镜像说明

## 定位

这个文件描述项目当前使用的标准 Docker 镜像和 `docker-compose.yml` 运行方式。

当前默认方案仍然使用宿主机目录绑定 `./data:/app/data`，方便你直接查看、备份和迁移数据。

为了减少不同机器上的目录权限问题，镜像启动时会先尝试修正 `/app/data` 的属主，再切回 `node` 用户运行服务。

## 镜像结构

项目的 `Dockerfile` 采用三阶段：

1. `base`
   安装运行期系统依赖：
   - `ghostscript`
   - `qpdf`
   - `ocrmypdf`
   - `unpaper`
   - `tesseract-ocr`
   - `tesseract-ocr-eng`
   - `tesseract-ocr-chi-sim`

2. `deps`
   只安装 Node.js 依赖，执行：

   ```bash
   npm ci --omit=dev
   ```

3. `runtime`
   复制 `src/`、`public/` 和 `node_modules`，创建 `/app/data`，切换为 `node` 用户，并启用健康检查。

这样做的目的：
- 让依赖层和源码层分离，提升构建缓存命中率。
- 保持最终镜像结构清晰，只包含运行所需文件。
- 用非 root 用户运行，符合常规生产部署习惯。

## 构建镜像

```bash
docker build -t z7pdf:latest .
```

## 运行镜像

```bash
docker run -d \
  --name z7pdf \
  -p 39010:39010 \
  -v "$(pwd)/data:/app/data" \
  z7pdf:latest
```

说明：
- 容器端口：`39010`
- 数据目录：`/app/data`
- 宿主机目录：`./data`
- 健康检查地址：`/health`
- 启动时会自动尝试修正 `./data` 的写入权限

## docker-compose.yml

当前仓库根目录的 `docker-compose.yml` 内容如下：

```yaml
services:
  z7pdf:
    image: ${Z7PDF_IMAGE:-z7pdf:latest}
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${Z7PDF_CONTAINER_NAME:-z7pdf}
    ports:
      - "${Z7PDF_PORT:-39010}:39010"
    environment:
      PORT: "39010"
      HOST: "0.0.0.0"
      TZ: ${TZ:-Asia/Shanghai}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

生产运行：

```bash
docker compose up -d --build
```

停止：

```bash
docker compose down
```

说明：
- `docker compose down` 不会删除宿主机上的 `./data` 目录，数据会保留。
- 如果 `./data` 不存在，Docker 会在首次启动时创建。
- 容器入口脚本会在启动时尝试对 `./data` 执行 `chown node:node`，然后再以 `node` 用户运行应用。
- 在 Linux 宿主机上，这通常会让 `./data` 的属主变成 `1000:1000`。

## 环境变量与隐私

当前 `docker-compose.yml` 只包含以下环境变量：
- `PORT`
- `HOST`
- `TZ`

这些都不是敏感信息。

当前仓库中的 `docker-compose.yml` 不包含：
- 管理员邮箱
- 管理员密码
- SMTP 用户名或密码
- API Key
- Token

如果后续你要加入敏感配置，建议改成以下方式之一：
- 使用宿主机环境变量注入
- 使用 `.env` 文件，但不要提交到仓库
- 使用部署平台的 Secret 管理能力

## 目录权限处理

镜像构建阶段不能处理宿主机 bind mount 的权限，因为那时 `./data` 还没有被挂进容器。

所以当前做法放在容器启动阶段：
- 入口脚本先创建 `/app/data` 和临时目录
- 如果当前用户是 root，就尝试把 `/app/data` 和 `/tmp/z7pdf` 调整为 `node:node`
- 然后再降权，用 `node` 用户启动实际服务

这样可以兼顾两点：
- 平时仍然用非 root 运行应用
- 启动时尽量自动修正宿主机目录权限

如果你的部署环境禁止容器修改 bind mount 属主，仍可能需要手动执行：

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

## 构建上下文过滤

`.dockerignore` 已排除：
- `data/`
- `node_modules/`
- `.git/`
- `.vscode/`
- `.aider.*`
- 本地日志和测试产物

这样可以减少构建上下文体积，并避免把本地状态误打入镜像。
