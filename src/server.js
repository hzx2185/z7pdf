const express = require('express');
const helmet = require('helmet');
const path = require('path');

const { stmts, DATA_DIR, STORAGE_DIR } = require('./db');
const { nowIso, ensureDefaultSettings } = require('./utils/common');
const { authenticateSession } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const workspaceRoutes = require('./routes/workspace');
const shareRoutes = require('./routes/share');
const adminRoutes = require('./routes/admin');
const toolsRoutes = require('./routes/tools');
const visualRoutes = require('./routes/visual');

const app = express();

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  originAgentCluster: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static('public', {
  maxAge: '1d',
  setHeaders(res, filePath) {
    if (/\.(?:html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));
app.use(
  '/vendor/pdfjs',
  express.static(path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build'), { maxAge: '7d' })
);
app.use(authenticateSession);

// 健康检查端点
app.get('/health', (req, res) => {
  try {
    stmts.getSetting.get('app_name');
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// 业务路由模块
app.use(authRoutes);
app.use(workspaceRoutes);
app.use(shareRoutes);
app.use(adminRoutes);
app.use(toolsRoutes);
app.use(visualRoutes);

// Session 清理定时任务
setInterval(() => {
  try {
    stmts.deleteExpiredSessions.run(nowIso());
  } catch (error) {
    console.error('清理过期 Session 失败:', error);
  }
}, 10 * 60 * 1000);

// 初始化数据库
ensureDefaultSettings();

// 启动服务器
const PORT = process.env.PORT || 39010;
const HOST = process.env.HOST || '0.0.0.0';
const { bootstrap } = require('./services/bootstrap-service');

function logAdminBootstrapBanner(admin) {
  const banner = '='.repeat(72);
  const displayHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;

  console.log('');
  console.log(banner);
  console.log('Z7 PDF 首次管理员初始化完成');
  console.log('请立即保存以下后台登录信息:');
  console.log(`后台地址: http://${displayHost}:${PORT}/admin.html`);
  console.log(`管理员邮箱: ${admin.email}`);
  console.log(`管理员密码: ${admin.password}`);
  console.log(admin.generated ? '密码来源: 系统首次启动自动生成。' : '密码来源: ADMIN_PASSWORD 环境变量。');
  console.log('重要提示: 登录后台后请立即修改管理员密码。');
  console.log(banner);
}

async function startServer() {
  let bootstrapResult = null;

  try {
    bootstrapResult = await bootstrap();
  } catch (error) {
    console.error('Bootstrap failed, continuing startup:', error);
  }

  app.listen(PORT, HOST, () => {
    console.log(`Z7 PDF 工作台已启动: http://${HOST}:${PORT}`);
    console.log(`数据目录: ${DATA_DIR}`);
    console.log(`存储目录: ${STORAGE_DIR}`);

    if (bootstrapResult?.removedSettingsCount) {
      console.log(`已清理 ${bootstrapResult.removedSettingsCount} 个废弃配置项。`);
    }

    if (bootstrapResult?.admin?.created) {
      logAdminBootstrapBanner(bootstrapResult.admin);
    }
  });
}

startServer().catch((error) => {
  console.error('Server startup failed:', error);
});
