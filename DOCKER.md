# Docker 镜像说明

## 定位

这个文件描述项目当前使用的标准 Docker 镜像和 `docker-compose.yml` 运行方式。

当前默认方案仍然使用宿主机目录绑定 `./data:/app/data`，方便你直接查看、备份和迁移数据。

为了减少不同机器上的目录权限问题，镜像启动时会先尝试修正 `/app/data` 的属主，再切回 `node` 用户运行服务。

镜像不需要浏览器访问第三方 CDN：前端使用的 `pdf-lib` 和 `pdfjs-dist` 均从容器内 `node_modules` 通过 `/vendor/` 路径提供。

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
- 首次启动如果数据库中还没有管理员账号，会自动写入管理员账号；未设置 `ADMIN_PASSWORD` 时会生成随机密码并输出到容器日志

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
      ADMIN_EMAIL: ${ADMIN_EMAIL:-}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
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
- 如果你使用 `docker compose up -d --build`，初始管理员随机密码不会直接显示在当前命令末尾，需要再执行 `docker compose logs --tail=50 z7pdf` 查看

## 环境变量与隐私

当前 `docker-compose.yml` 默认只写入非敏感运行配置，并预留初始管理员环境变量占位：
- `PORT`
- `HOST`
- `TZ`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

其中 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 的真实值应从宿主机环境变量、未提交的 `.env` 或 Secret 管理系统注入；仓库中的 compose 文件不包含真实密码。

当前仓库中的 `docker-compose.yml` 不包含真实的：
- 管理员邮箱值
- 管理员密码值
- SMTP 用户名或密码
- API Key
- Token

如果后续你要加入敏感配置，建议改成以下方式之一：
- 使用宿主机环境变量注入
- 使用 `.env` 文件，但不要提交到仓库
- 使用部署平台的 Secret 管理能力

示例：

```bash
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD='replace-with-a-long-random-password' \
docker compose up -d --build
```

或在未提交的 `.env` 中保存：

```dotenv
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-long-random-password
```

不要把以下内容提交到仓库、镜像或公开日志：
- `ADMIN_PASSWORD`
- SMTP 密码
- 反向代理证书私钥
- API Key、Token、Cookie
- 生产数据库或用户上传文件

首次启动时如果未提供 `ADMIN_PASSWORD`，应用会生成随机管理员密码并写入启动日志。完成首次登录后建议立即修改密码，并限制能查看容器日志的人员范围。

## 数据目录、备份与删除

`./data` 是最重要的持久化目录，通常包含：
- `app.db`、`app.db-wal`、`app.db-shm`
- 会员上传和在线保存的文件
- 分享、兑换码、会员有效期等数据库记录

建议：
- 定期备份整个 `./data` 目录，而不是只备份 `app.db`。
- 备份前可短暂停止容器，避免 SQLite WAL 文件处于写入中。
- 备份文件同样可能包含用户 PDF 和账号记录，应按敏感数据管理。
- 删除容器不会删除 `./data`；只有手动删除宿主机目录才会清空数据。

备份示例：

```bash
docker compose stop
tar -czf z7pdf-data-$(date +%Y%m%d-%H%M%S).tar.gz data
docker compose up -d
```

恢复时解压到仓库根目录的 `data/`，并确认权限允许容器中的 `node` 用户写入。

## 公网部署安全建议

如果通过域名或公网 IP 提供服务，建议至少配置：
- HTTPS 反向代理
- 上传体积限制，避免超大文件耗尽磁盘或内存
- 访问日志保留策略，避免长期保存敏感 URL、分享 token 或账号信息
- 防火墙或网关限制管理后台访问来源
- 强管理员密码和受控的容器日志访问权限

分享链接应视为访问凭证。公开分享知道链接即可访问；敏感文件应使用密码、到期时间和下载次数限制。

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
