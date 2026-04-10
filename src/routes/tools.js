const express = require('express');
const multer = require('multer');
const path = require('path');

const { DATA_DIR } = require('../db');
const { normalizeUploadedFiles, withPdfExtension } = require('../services/workspace-service');
const {
  PAGE_SIZE_MAP,
  COMPRESS_PRESET_MAP,
  stripPdfExtension,
  buildAttachmentDisposition,
  mergePdfs,
  imagesToPdf,
  compressPdf,
  organizePdf,
  rotateSelectedPages,
  resizePdf,
  splitPdf,
  addMarksPdf,
  securePdf
} = require('../services/pdf-service');

const router = express.Router();

const upload = multer({
  dest: path.join(DATA_DIR, 'temp'),
  limits: { fileSize: 100 * 1024 * 1024 }
});

function sendPdf(res, bytes, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', buildAttachmentDisposition(filename, 'download.pdf'));
  return res.send(Buffer.from(bytes));
}

function sendZip(res, bytes, filename) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', buildAttachmentDisposition(filename, 'download.zip'));
  return res.send(Buffer.from(bytes));
}

router.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    port: Number(process.env.PORT || 39010)
  });
});

router.post('/api/merge', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).json({ error: '请至少上传两个 PDF 文件。' });
    }

    await normalizeUploadedFiles(req.files);
    const mergedBytes = await mergePdfs(req.files);
    return sendPdf(res, mergedBytes, 'merged.pdf');
  } catch (error) {
    return res.status(400).json({ error: error.message || 'PDF 合并失败。' });
  }
});

router.post('/api/image-to-pdf', upload.array('images', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请至少上传一张图片。' });
    }

    await normalizeUploadedFiles(req.files);

    const options = {
      layout: String(req.body.layout || '1'),
      pageSize: String(req.body.pageSize || 'A4'),
      margin: Number(req.body.margin || 10),
      gap: Number(req.body.gap || 5),
      fit: String(req.body.fit || 'contain')
    };

    if (!['1', '2', '4', '6', '9'].includes(options.layout)) {
      return res.status(400).json({ error: '布局仅支持 1/2/4/6/9 张每页。' });
    }
    if (!['A3', 'A4', 'A5', 'Letter', 'Legal'].includes(options.pageSize)) {
      return res.status(400).json({ error: '页面尺寸仅支持 A3/A4/A5/Letter/Legal。' });
    }
    if (!['contain', 'cover', 'fill'].includes(options.fit)) {
      return res.status(400).json({ error: '适应模式仅支持 contain/cover/fill。' });
    }

    const bytes = await imagesToPdf(req.files, options);
    const filename = req.body.filename || 'images_to_pdf.pdf';
    return sendPdf(res, bytes, withPdfExtension(filename, 'images_to_pdf.pdf'));
  } catch (error) {
    return res.status(400).json({ error: error.message || '图片转 PDF 失败。' });
  }
});

router.post('/api/compress', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传一个 PDF 文件。' });
    }

    await normalizeUploadedFiles([req.file]);

    const level = String(req.body.level || 'medium');
    if (!(level in COMPRESS_PRESET_MAP)) {
      return res.status(400).json({ error: '压缩级别仅支持 low/medium/high。' });
    }

    const bytes = await compressPdf(req.file, level);
    const filename = withPdfExtension(req.file.originalname, 'compressed.pdf');
    return sendPdf(res, bytes, `compressed_${filename}`);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'PDF 压缩失败。' });
  }
});

router.post('/api/organize', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传一个 PDF 文件。' });
    }

    await normalizeUploadedFiles([req.file]);

    const bytes = await organizePdf(req.file, {
      selection: req.body.selection || 'all',
      deleteSelection: req.body.deleteSelection || '',
      reverse: req.body.reverse || 'false'
    });
    const filename = withPdfExtension(req.file.originalname, 'organized.pdf');
    return sendPdf(res, bytes, `organized_${filename}`);
  } catch (error) {
    return res.status(400).json({ error: error.message || '页面整理失败。' });
  }
});

router.post('/api/rotate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传一个 PDF 文件。' });
    }

    await normalizeUploadedFiles([req.file]);

    const rotate = Number(req.body.rotate || 0);
    if (![90, 180, 270].includes(rotate)) {
      return res.status(400).json({ error: '旋转角度仅支持 90/180/270。' });
    }

    const bytes = await rotateSelectedPages(req.file, {
      rotate,
      selection: req.body.selection || 'all'
    });
    const filename = withPdfExtension(req.file.originalname, 'rotated.pdf');
    return sendPdf(res, bytes, `rotated_${filename}`);
  } catch (error) {
    return res.status(400).json({ error: error.message || '页面旋转失败。' });
  }
});

router.post('/api/resize', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传一个 PDF 文件。' });
    }

    await normalizeUploadedFiles([req.file]);

    const pageSize = req.body.pageSize || 'keep';
    if (!(pageSize in PAGE_SIZE_MAP)) {
      return res.status(400).json({ error: '不支持的页面尺寸。' });
    }

    const orientation = req.body.orientation || 'portrait';
    if (!['portrait', 'landscape'].includes(orientation)) {
      return res.status(400).json({ error: '页面方向仅支持 portrait/landscape。' });
    }

    const fitMode = req.body.fitMode || 'contain';
    if (!['contain', 'stretch', 'keep'].includes(fitMode)) {
      return res.status(400).json({ error: '不支持的缩放模式。' });
    }

    const bytes = await resizePdf(req.file, {
      pageSize,
      orientation,
      fitMode,
      margin: req.body.margin || 0
    });
    const filename = withPdfExtension(req.file.originalname, 'resized.pdf');
    return sendPdf(res, bytes, `resized_${filename}`);
  } catch (error) {
    return res.status(400).json({ error: error.message || '页面尺寸调整失败。' });
  }
});

router.post('/api/split', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传一个 PDF 文件。' });
    }

    await normalizeUploadedFiles([req.file]);

    const bytes = await splitPdf(req.file, {
      mode: req.body.mode || 'ranges',
      ranges: req.body.ranges || '',
      every: req.body.every || '1'
    });
    return sendZip(res, bytes, `${stripPdfExtension(req.file.originalname)}_split.zip`);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'PDF 拆分失败。' });
  }
});

router.post('/api/mark', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传一个 PDF 文件。' });
    }

    await normalizeUploadedFiles([req.file]);

    const markMode = req.body.markMode || 'watermark';
    if (!['watermark', 'pageNumber', 'both'].includes(markMode)) {
      return res.status(400).json({ error: '不支持的标记模式。' });
    }

    const bytes = await addMarksPdf(req.file, {
      markMode,
      selection: req.body.selection || 'all',
      pageNumbersEnabled: markMode === 'pageNumber' || markMode === 'both',
      watermarkKind: req.body.watermarkKind || 'text',
      watermarkEnabled: markMode === 'watermark' || markMode === 'both',
      text: req.body.text || '',
      imageDataUrl: req.body.imageDataUrl || '',
      imageName: req.body.imageName || '',
      position: req.body.position || 'center',
      opacity: req.body.opacity || '0.18',
      color: req.body.color || 'orange',
      rotate: req.body.rotate || '-30',
      fontSize: req.body.fontSize || '36',
      imageScale: req.body.imageScale || '24',
      align: req.body.align || 'right',
      vertical: req.body.vertical || 'bottom',
      margin: req.body.margin || '24',
      batesEnabled: req.body.batesEnabled || 'false',
      batesPrefix: req.body.batesPrefix || '',
      batesStart: req.body.batesStart || '1',
      batesDigits: req.body.batesDigits || '6',
      batesAlign: req.body.batesAlign || 'right',
      batesVertical: req.body.batesVertical || 'bottom',
      batesFontSize: req.body.batesFontSize || '12',
      batesMargin: req.body.batesMargin || '24'
    });
    const filename = withPdfExtension(req.file.originalname, 'marked.pdf');
    return sendPdf(res, bytes, `marked_${filename}`);
  } catch (error) {
    return res.status(400).json({ error: error.message || '加水印或页码失败。' });
  }
});

router.post('/api/security', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传一个 PDF 文件。' });
    }

    await normalizeUploadedFiles([req.file]);

    const action = req.body.action || 'encrypt';
    const bytes = await securePdf(req.file, {
      action,
      password: String(req.body.password || '')
    });

    const base = withPdfExtension(req.file.originalname, 'secured.pdf');
    const filename = action === 'encrypt' ? `encrypted_${base}` : `decrypted_${base}`;
    return sendPdf(res, bytes, filename);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'PDF 安全处理失败。' });
  }
});

module.exports = router;
