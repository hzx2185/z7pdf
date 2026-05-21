# Z7 PDF 公开镜像部署说明

本文面向直接使用公开 Docker 镜像部署的用户。镜像地址：

```text
hzx2185/z7pdf:latest
```

后台“版本”页会从 Docker Hub 读取 `hzx2185/z7pdf` 的完整版本号标签（例如 `1.3.0`）来检查更新；仅发布 `latest` 时无法判断最新版本。

Z7 PDF 是一个自部署 PDF 在线编辑工作台，支持页面整理、合并、拆分、旋转、压缩、加密、水印、页码、OCR、PDF/A、会员空间、文件分享、兑换码会员和后台管理。

## 快速部署

创建 `docker-compose.yml`：

```yaml
services:
  z7pdf:
    image: hzx2185/z7pdf:latest
    container_name: z7pdf
    ports:
      - "39010:80"
    volumes:
      - ./data:/app/data
```

启动：

```bash
docker compose up -d
```

访问：
- 主页：http://127.0.0.1:39010
- 管理后台：http://127.0.0.1:39010/admin.html

端口说明：
- 宿主机访问端口：`39010`
- 容器内部端口：`80`

## 首次管理员

首次启动且数据库中还没有当前管理员邮箱时，系统会自动创建管理员：
- 默认邮箱：`admin@z7pdf.local`
- 默认密码：未设置 `ADMIN_PASSWORD` 时自动生成随机密码
- 查看密码：`docker logs z7pdf`

管理员不是第一个注册用户。普通注册和邮箱验证码自动注册创建的都是会员账号，不会自动获得后台权限。

登录后台后建议立即修改管理员密码，并控制容器日志访问权限。

如需固定首次管理员账号，可在首次启动前添加环境变量：

```yaml
services:
  z7pdf:
    image: hzx2185/z7pdf:latest
    container_name: z7pdf
    ports:
      - "39010:80"
    volumes:
      - ./data:/app/data
    environment:
      ADMIN_EMAIL: "admin@example.com"
      ADMIN_PASSWORD: "replace-with-a-long-random-password"
```

系统只会自动创建当前 `ADMIN_EMAIL` 对应的管理员邮箱；如果该邮箱已存在，后续重启不会覆盖它的密码。不要通过修改 `ADMIN_PASSWORD` 尝试重置已存在账号；如果把 `ADMIN_EMAIL` 改成数据库中不存在的新邮箱，启动时会创建这个新邮箱的管理员账号。

## 忘记管理员密码

优先检查首次启动日志。如果管理员密码是系统随机生成的，日志中会显示初始账号：

```bash
docker logs z7pdf
```

如果已在后台配置 SMTP，并且管理员邮箱是真实可收信邮箱，可以在登录窗口使用“忘记密码”通过邮箱验证码重置。

如果日志找不到、也无法收取验证码，先备份 `data/`，再在容器内直接重置 SQLite 里的管理员密码。下面命令会把指定邮箱设为管理员、更新密码哈希，并清理该账号已登录会话：

```bash
docker exec z7pdf node -e 'const crypto=require("crypto");const {DatabaseSync}=require("node:sqlite");const email=process.argv[1];const pass=process.argv[2];if(!email||!pass){console.error("Usage: node -e <script> <email> <new-password>");process.exit(1)}const db=new DatabaseSync("/app/data/app.db");const user=db.prepare("SELECT id,email FROM users WHERE email=?").get(email);if(!user){console.error("user not found:",email);process.exit(1)}const salt=crypto.randomBytes(16).toString("hex");const hash=salt+":"+crypto.scryptSync(pass,salt,64).toString("hex");db.prepare("UPDATE users SET password_hash=?, role=? WHERE id=?").run(hash,"admin",user.id);db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);console.log("admin password reset:",user.email);' admin@z7pdf.local 'NewStrongPassword123'
```

如果忘记管理员邮箱，可先列出现有管理员：

```bash
docker exec z7pdf node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync("/app/data/app.db");console.table(db.prepare("SELECT id,email,role,created_at FROM users WHERE role=? ORDER BY id").all("admin"));'
```

## 反向代理部署

如果通过 Nginx、Caddy、宝塔、1Panel、Cloudflare Tunnel 等反向代理访问，代理通常会带上 `X-Forwarded-For`。请在 Compose 中启用可信代理跳数，否则登录、验证码等限流组件会输出 `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` 提示。

只有一层可信反向代理时：

```yaml
services:
  z7pdf:
    image: hzx2185/z7pdf:latest
    container_name: z7pdf
    ports:
      - "39010:80"
    volumes:
      - ./data:/app/data
    environment:
      Z7PDF_TRUST_PROXY: "1"
```

多层反向代理时，把 `1` 改成实际可信代理跳数。不要在不可信网络直连容器时设置过大的值或 `true`，否则客户端可以伪造来源 IP，影响限流准确性。

Nginx upstream 可指向宿主机映射端口：

```nginx
location / {
  proxy_pass http://127.0.0.1:39010;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  client_max_body_size 200m;
}
```

## 数据持久化

`./data` 会挂载到容器内 `/app/data`，通常包含：
- SQLite 数据库：`app.db`、`app.db-wal`、`app.db-shm`
- 会员上传和在线保存的 PDF 文件
- 分享链接、兑换码、会员有效期等记录

停止或删除容器不会删除 `./data`。只有手动删除宿主机目录才会清空数据。

备份建议：

```bash
docker compose stop
tar -czf z7pdf-data-$(date +%Y%m%d-%H%M%S).tar.gz data
docker compose up -d
```

恢复时把备份解压回 `data/`，并确认容器有写入权限。

## 常用命令

```bash
# 查看日志和首次管理员密码
docker logs z7pdf

# 查看当前镜像标签
docker image inspect z7pdf --format '{{json .RepoTags}}'

# 停止服务
docker compose down

# 拉取新版镜像并重启
docker compose pull
docker compose up -d

# 查看健康状态
docker inspect --format='{{json .State.Health}}' z7pdf
```

## 功能概览

PDF 编辑：
- 合并、拆分、页面排序、插入空白页、删除页面
- 旋转、裁剪、页面尺寸调整
- 水印、页码、页眉页脚、标注
- 压缩、加密、解密、元数据、书签
- OCR 文字识别、PDF/A 归档、灰度、反色、扫描效果

会员与分享：
- 密码登录 / 邮箱验证码登录
- 会员个人文件空间和在线保存
- 多级目录、回收站、文件恢复和彻底删除
- 公开链接、密码访问、登录访问三种分享模式
- 分享到期时间和下载次数限制

后台管理：
- 用户、文件、分享和有效会员概览
- 套餐配置、兑换码生成、会员有效期调整
- 站点名称、注册开关、空间配额、SMTP 配置

## 隐私与安全

- PDF 处理和会员空间文件默认保存在当前服务器的 `data/` 目录。
- 前端 PDF 依赖由容器本地提供，不依赖第三方 CDN。
- OCR、压缩、加密和 PDF/A 使用容器内本地命令行工具处理。
- 邮箱验证码只在后台配置 SMTP 后发送。
- 不要把 `ADMIN_PASSWORD`、SMTP 密码、Token、私钥或证书写入公开仓库。
- 公网部署建议使用 HTTPS 反向代理，并限制上传体积。
- 公开分享链接应视为访问凭证，敏感文件建议设置密码、到期时间和下载次数限制。

## 目录权限

容器启动时会自动尝试修正 `/app/data` 的写入权限，然后再以非 root 用户运行服务。

如果宿主机策略禁止容器修改 bind mount 属主，可手动执行：

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```
