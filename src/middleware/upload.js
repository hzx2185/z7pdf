const fs = require('fs/promises');
const multer = require('multer');

const { TEMP_DIR } = require('../db');

const DEFAULT_TEMP_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const upload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 100 * 1024 * 1024 }
});

function flattenUploadedFiles(req) {
  if (!req) return [];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') {
    return Object.values(req.files).flat();
  }
  return req.file ? [req.file] : [];
}

async function removeUploadedFiles(files = []) {
  const paths = files.map((file) => file?.path).filter(Boolean);
  await Promise.all(paths.map((filePath) => fs.rm(filePath, { force: true }).catch(() => {})));
}

function cleanupUploadedFiles(req, res, next) {
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    removeUploadedFiles(flattenUploadedFiles(req)).catch((error) => {
      console.error('清理上传临时文件失败:', error);
    });
  };

  res.once('finish', cleanup);
  res.once('close', cleanup);
  next();
}

async function cleanStaleTempFiles(maxAgeMs = DEFAULT_TEMP_FILE_MAX_AGE_MS) {
  const cutoff = Date.now() - maxAgeMs;
  let entries = [];

  try {
    entries = await fs.readdir(TEMP_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('读取临时目录失败:', error);
    }
    return 0;
  }

  let removedCount = 0;
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile()) return;
      const filePath = `${TEMP_DIR}/${entry.name}`;
      try {
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs <= cutoff) {
          await fs.rm(filePath, { force: true });
          removedCount += 1;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error('清理过期临时文件失败:', error);
        }
      }
    })
  );
  return removedCount;
}

module.exports = {
  upload,
  cleanupUploadedFiles,
  cleanStaleTempFiles
};
