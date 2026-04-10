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
const paymentRoutes = require('./routes/payment');
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
app.use(express.static('public', { maxAge: '1d' }));
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
app.use(paymentRoutes);
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

// 启动副作用模块
const { bootstrap } = require('./services/bootstrap-service');
bootstrap().catch(err => console.error('Bootstrap failed:', err));

// 启动服务器
const PORT = process.env.PORT || 39010;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Z7 PDF 工作台已启动: http://${HOST}:${PORT}`);
  console.log(`数据目录: ${DATA_DIR}`);
  console.log(`存储目录: ${STORAGE_DIR}`);
});
