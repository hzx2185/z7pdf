const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const JSZip = require('jszip');
const { execFile } = require('child_process');
const { promisify } = require('util');
const {
  PDFDocument,
  degrees,
  PageSizes,
  rgb
} = require('pdf-lib');

const { sanitizeFilename, getDisplayFilename } = require('./workspace-service');
const {
  addMarksPdf: addMarksPdfWithDeps,
  addMarksPdfBuffer: addMarksPdfBufferWithDeps
} = require('./pdf-marks-service');

const execFileAsync = promisify(execFile);

const PAGE_SIZE_MAP = {
  keep: null,
  A3: PageSizes.A3,
  A4: PageSizes.A4,
  A5: PageSizes.A5,
  Letter: PageSizes.Letter,
  Legal: PageSizes.Legal
};

const COMPRESS_PRESET_MAP = {
  low: '/printer',
  medium: '/ebook',
  high: '/screen'
};

function stripPdfExtension(filename) {
  return sanitizeFilename(filename, 'document.pdf').replace(/\.pdf$/i, '');
}

function buildAttachmentDisposition(filename, fallback = 'download.bin') {
  const safeName = getDisplayFilename(filename, fallback);
  const fallbackName = String(safeName || fallback)
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/"/g, '')
    .replace(/[;\r\n]/g, '_');

  return `attachment; filename="${fallbackName || fallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

async function loadPdf(buffer, filename, password) {
  try {
    const options = { ignoreEncryption: false };
    if (password) {
      options.password = password;
    }
    return await PDFDocument.load(buffer, options);
  } catch (_error) {
    if (password) {
      throw new Error(`无法读取 PDF，密码可能不正确：${filename}`);
    }
    throw new Error(`无法读取 PDF：${filename}`);
  }
}

function uniqueOrdered(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

function parsePageSelection(selection, pageCount) {
  const normalized = String(selection || 'all').trim().toLowerCase();

  if (normalized === 'all' || normalized === '*') {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  if (normalized === 'odd') {
    return Array.from({ length: pageCount }, (_, index) => index).filter(
      (index) => (index + 1) % 2 === 1
    );
  }

  if (normalized === 'even') {
    return Array.from({ length: pageCount }, (_, index) => index).filter(
      (index) => (index + 1) % 2 === 0
    );
  }

  const result = [];

  for (const segment of normalized.split(',')) {
    const token = segment.trim();
    if (!token) {
      continue;
    }

    if (token.includes('-')) {
      const [startRaw, endRaw] = token.split('-');
      const start = Number(startRaw);
      const end = Number(endRaw);

      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end < 1 ||
        start > pageCount ||
        end > pageCount
      ) {
        throw new Error(`页码范围无效：${token}`);
      }

      const step = start <= end ? 1 : -1;
      for (let page = start; step > 0 ? page <= end : page >= end; page += step) {
        result.push(page - 1);
      }
      continue;
    }

    const pageNumber = Number(token);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
      throw new Error(`页码无效：${token}`);
    }
    result.push(pageNumber - 1);
  }

  if (result.length === 0) {
    throw new Error('请选择至少一个有效页码。');
  }

  return uniqueOrdered(result);
}

function chunkPageIndices(pageIndices, chunkSize) {
  const chunks = [];
  for (let index = 0; index < pageIndices.length; index += chunkSize) {
    chunks.push(pageIndices.slice(index, index + chunkSize));
  }
  return chunks;
}

function computeContainSize(srcWidth, srcHeight, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / srcWidth, targetHeight / srcHeight);
  return {
    width: srcWidth * scale,
    height: srcHeight * scale
  };
}

function computeKeepSize(srcWidth, srcHeight, targetWidth, targetHeight) {
  const scale = Math.min(1, targetWidth / srcWidth, targetHeight / srcHeight);
  return {
    width: srcWidth * scale,
    height: srcHeight * scale
  };
}

function normalizePageRotation(rotation) {
  return ((Number(rotation || 0) % 360) + 360) % 360;
}

function resolveVisiblePageBox(page) {
  const cropBox = typeof page?.getCropBox === 'function' ? page.getCropBox() : null;
  if (cropBox && cropBox.width > 0 && cropBox.height > 0) {
    return {
      left: cropBox.x,
      bottom: cropBox.y,
      right: cropBox.x + cropBox.width,
      top: cropBox.y + cropBox.height,
      width: cropBox.width,
      height: cropBox.height
    };
  }

  const width = Number(page?.getWidth?.() || 0);
  const height = Number(page?.getHeight?.() || 0);
  return {
    left: 0,
    bottom: 0,
    right: width,
    top: height,
    width,
    height
  };
}

function resolvePageOrientation(baseWidth, baseHeight, orientation) {
  if (orientation === 'landscape' || orientation === 'portrait') {
    return orientation;
  }
  return baseWidth > baseHeight ? 'landscape' : 'portrait';
}

function computePageSize(baseWidth, baseHeight, pageSize, orientation) {
  const resolvedOrientation = resolvePageOrientation(baseWidth, baseHeight, orientation);
  if (!pageSize) {
    if (resolvedOrientation === 'landscape' && baseWidth < baseHeight) {
      return [baseHeight, baseWidth];
    }
    if (resolvedOrientation === 'portrait' && baseWidth > baseHeight) {
      return [baseHeight, baseWidth];
    }
    return [baseWidth, baseHeight];
  }

  const [width, height] = pageSize;
  if (resolvedOrientation === 'landscape') {
    return width >= height ? [width, height] : [height, width];
  }
  return width <= height ? [width, height] : [height, width];
}

function parseHexColor(input) {
  const value = String(input || '').trim();
  if (!/^#?[0-9a-fA-F]{6}$/.test(value)) {
    return null;
  }

  const hex = value.startsWith('#') ? value.slice(1) : value;
  const toUnit = (segment) => Number.parseInt(segment, 16) / 255;
  return rgb(toUnit(hex.slice(0, 2)), toUnit(hex.slice(2, 4)), toUnit(hex.slice(4, 6)));
}

async function mergePdfs(files) {
  const merged = await PDFDocument.create();

  for (const file of files) {
    const source = await loadPdf(file.buffer, file.originalname);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }

  return merged.save({ useObjectStreams: true, addDefaultPage: false });
}

async function imagesToPdf(images, options = {}) {
  const {
    layout = '1',
    pageSize = 'A4',
    margin = 10,
    gap = 5,
    fit = 'contain'
  } = options;

  const pdfDoc = await PDFDocument.create();
  const pageSizes = {
    A3: [841.89, 1190.55],
    A4: [595.28, 841.89],
    A5: [420.94, 595.28],
    Letter: [612, 792],
    Legal: [612, 1008]
  };
  const [pageW, pageH] = pageSizes[pageSize] || pageSizes.A4;
  const mmToPoints = (mm) => (mm * 72) / 25.4;
  const marginPts = mmToPoints(margin);
  const gapPts = mmToPoints(gap);
  const layoutMap = {
    1: [1, 1],
    2: [1, 2],
    4: [2, 2],
    6: [2, 3],
    9: [3, 3]
  };
  const [cols, rows] = layoutMap[layout] || [1, 1];
  const perPage = cols * rows;
  const slotW = (pageW - 2 * marginPts - (cols - 1) * gapPts) / cols;
  const slotH = (pageH - 2 * marginPts - (rows - 1) * gapPts) / rows;

  for (let imageIndex = 0; imageIndex < images.length; imageIndex += perPage) {
    const page = pdfDoc.addPage([pageW, pageH]);

    for (let slotIndex = 0; slotIndex < perPage && imageIndex + slotIndex < images.length; slotIndex += 1) {
      const imageFile = images[imageIndex + slotIndex];
      const imageBuffer = imageFile.buffer;
      const imageName = imageFile.originalname || imageFile.name || 'image';
      let embeddedImage;

      try {
        if (imageName.toLowerCase().endsWith('.png')) {
          embeddedImage = await pdfDoc.embedPng(imageBuffer);
        } else {
          embeddedImage = await pdfDoc.embedJpg(imageBuffer);
        }
      } catch (_error) {
        continue;
      }

      const col = slotIndex % cols;
      const row = Math.floor(slotIndex / cols);
      const x = marginPts + col * (slotW + gapPts);
      const y = pageH - marginPts - (row + 1) * slotH - row * gapPts;

      let drawW = slotW;
      let drawH = slotH;
      if (fit === 'contain') {
        const scale = Math.min(slotW / embeddedImage.width, slotH / embeddedImage.height);
        drawW = embeddedImage.width * scale;
        drawH = embeddedImage.height * scale;
      } else if (fit === 'cover') {
        const scale = Math.max(slotW / embeddedImage.width, slotH / embeddedImage.height);
        drawW = embeddedImage.width * scale;
        drawH = embeddedImage.height * scale;
      }

      page.drawImage(embeddedImage, {
        x: x + (slotW - drawW) / 2,
        y: y + (slotH - drawH) / 2,
        width: drawW,
        height: drawH
      });
    }
  }

  return pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
}

async function organizePdf(file, options) {
  const src = await loadPdf(file.buffer, file.originalname);
  const pageCount = src.getPageCount();
  const pageSelection = parsePageSelection(options.selection || 'all', pageCount);
  const deleteSelection = options.deleteSelection
    ? new Set(parsePageSelection(options.deleteSelection, pageCount))
    : new Set();
  const out = await PDFDocument.create();

  let keptPages = pageSelection.filter((index) => !deleteSelection.has(index));
  if (keptPages.length === 0) {
    throw new Error('处理后没有剩余页面，请调整页码范围。');
  }

  if (options.reverse === 'true') {
    keptPages = [...keptPages].reverse();
  }

  const copied = await out.copyPages(src, keptPages);
  copied.forEach((page) => out.addPage(page));

  return out.save({ useObjectStreams: true, addDefaultPage: false });
}

async function rotateSelectedPages(file, options) {
  const src = await loadPdf(file.buffer, file.originalname);
  const out = await PDFDocument.create();
  const pageCount = src.getPageCount();
  const rotateBy = Number(options.rotate || 0);
  const selected = new Set(parsePageSelection(options.selection || 'all', pageCount));
  const copied = await out.copyPages(src, src.getPageIndices());

  copied.forEach((page, index) => {
    if (selected.has(index)) {
      const nextRotation = (page.getRotation().angle + rotateBy + 360) % 360;
      page.setRotation(degrees(nextRotation));
    }
    out.addPage(page);
  });

  return out.save({ useObjectStreams: true, addDefaultPage: false });
}

async function resizePdf(file, options) {
  return resizePdfBuffer(file.buffer, file.originalname, options);
}

async function resizePdfBuffer(buffer, filename, options) {
  const src = await loadPdf(buffer, filename);
  const out = await PDFDocument.create();
  const pageSize = PAGE_SIZE_MAP[options.pageSize] || null;
  const orientation = options.orientation || 'auto';
  const fitMode = options.fitMode || 'contain';
  const margin = Math.max(0, Number(options.margin || 0));
  const backgroundColor = parseHexColor(options.backgroundColor) || rgb(1, 1, 1);
  const srcPages = await out.copyPages(src, src.getPageIndices());

  for (const srcPage of srcPages) {
    const visibleBox = resolveVisiblePageBox(srcPage);
    const originalWidth = visibleBox.width;
    const originalHeight = visibleBox.height;
    const pageRotation = normalizePageRotation(srcPage.getRotation().angle);
    const isQuarterTurn = pageRotation === 90 || pageRotation === 270;
    const layoutWidth = isQuarterTurn ? originalHeight : originalWidth;
    const layoutHeight = isQuarterTurn ? originalWidth : originalHeight;
    const [targetWidth, targetHeight] = computePageSize(
      layoutWidth,
      layoutHeight,
      pageSize,
      orientation
    );

    if (!pageSize && margin === 0 && fitMode === 'keep') {
      out.addPage(srcPage);
      continue;
    }

    let embeddedPage;
    try {
      embeddedPage = await out.embedPage(srcPage, {
        left: visibleBox.left,
        bottom: visibleBox.bottom,
        right: visibleBox.right,
        top: visibleBox.top
      });
    } catch (_error) {
      out.addPage(srcPage);
      continue;
    }

    const newPage = out.addPage([targetWidth, targetHeight]);
    newPage.drawRectangle({
      x: 0,
      y: 0,
      width: targetWidth,
      height: targetHeight,
      color: backgroundColor
    });

    const availableWidth = Math.max(1, targetWidth - margin * 2);
    const availableHeight = Math.max(1, targetHeight - margin * 2);
    let drawBoxWidth = availableWidth;
    let drawBoxHeight = availableHeight;

    if (fitMode !== 'stretch') {
      const fitted = fitMode === 'keep'
        ? computeKeepSize(
            layoutWidth,
            layoutHeight,
            availableWidth,
            availableHeight
          )
        : computeContainSize(
            layoutWidth,
            layoutHeight,
            availableWidth,
            availableHeight
          );
      drawBoxWidth = fitted.width;
      drawBoxHeight = fitted.height;
    }

    const boxX = (targetWidth - drawBoxWidth) / 2;
    const boxY = (targetHeight - drawBoxHeight) / 2;
    let drawWidth = drawBoxWidth;
    let drawHeight = drawBoxHeight;
    let drawX = boxX;
    let drawY = boxY;
    let drawRotation = 0;

    if (pageRotation === 90) {
      drawWidth = drawBoxHeight;
      drawHeight = drawBoxWidth;
      drawX = boxX + drawBoxWidth;
      drawRotation = 90;
    } else if (pageRotation === 180) {
      drawX = boxX + drawBoxWidth;
      drawY = boxY + drawBoxHeight;
      drawRotation = 180;
    } else if (pageRotation === 270) {
      drawWidth = drawBoxHeight;
      drawHeight = drawBoxWidth;
      drawY = boxY + drawBoxHeight;
      drawRotation = 270;
    }

    newPage.drawPage(embeddedPage, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
      rotate: degrees(drawRotation)
    });
  }

  return out.save({ useObjectStreams: true, addDefaultPage: false });
}

async function splitPdf(file, options) {
  const src = await loadPdf(file.buffer, file.originalname);
  const pageCount = src.getPageCount();
  const mode = options.mode || 'ranges';
  const baseName = stripPdfExtension(file.originalname);
  const zip = new JSZip();
  let groups = [];

  if (mode === 'ranges') {
    const rawRanges = String(options.ranges || '')
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (rawRanges.length === 0) {
      throw new Error('请至少填写一个拆分页码范围。');
    }
    groups = rawRanges.map((range) => parsePageSelection(range, pageCount));
  } else if (mode === 'every') {
    const every = Number(options.every || 1);
    if (!Number.isInteger(every) || every < 1) {
      throw new Error('每份页数必须是大于等于 1 的整数。');
    }
    groups = chunkPageIndices(
      Array.from({ length: pageCount }, (_, index) => index),
      every
    );
  } else {
    throw new Error('不支持的拆分模式。');
  }

  for (const [groupIndex, pageIndices] of groups.entries()) {
    const part = await PDFDocument.create();
    const pages = await part.copyPages(src, pageIndices);
    pages.forEach((page) => part.addPage(page));
    const bytes = await part.save({ useObjectStreams: true, addDefaultPage: false });
    zip.file(
      `${baseName}_part_${String(groupIndex + 1).padStart(2, '0')}.pdf`,
      bytes
    );
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function addMarksPdf(file, options) {
  return addMarksPdfWithDeps(file, options, {
    loadPdf,
    parsePageSelection
  });
}

async function addMarksPdfBuffer(buffer, filename, options) {
  return addMarksPdfBufferWithDeps(buffer, filename, options, {
    loadPdf,
    parsePageSelection
  });
}

async function compressPdf(file, level) {
  return compressPdfBuffer(file.buffer, level);
}

async function compressPdfBuffer(buffer, level) {
  const preset = COMPRESS_PRESET_MAP[level] || COMPRESS_PRESET_MAP.medium;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'z7pdf-'));
  const sourceFile = path.join(tempDir, 'input.pdf');
  const outputFile = path.join(tempDir, 'output.pdf');

  try {
    await fs.writeFile(sourceFile, buffer);
    await execFileAsync('gs', [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-dPDFSETTINGS=${preset}`,
      `-sOutputFile=${outputFile}`,
      sourceFile
    ]);
    return await fs.readFile(outputFile);
  } catch (_error) {
    const fallback = await PDFDocument.load(buffer, { ignoreEncryption: false });
    return Buffer.from(
      await fallback.save({
        useObjectStreams: true,
        addDefaultPage: false
      })
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function securePdf(file, options) {
  return securePdfBuffer(file.buffer, options);
}

async function securePdfBuffer(buffer, options) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'z7pdf-secure-'));
  const sourceFile = path.join(tempDir, 'input.pdf');
  const outputFile = path.join(tempDir, 'output.pdf');

  try {
    await fs.writeFile(sourceFile, buffer);

    if (options.action === 'encrypt') {
      if (!options.password) {
        throw new Error('请输入加密密码。');
      }
      await execFileAsync('qpdf', [
        '--encrypt',
        options.password,
        options.password,
        '256',
        '--',
        sourceFile,
        outputFile
      ]);
    } else if (options.action === 'decrypt') {
      if (!options.password) {
        throw new Error('请输入原始密码。');
      }
      await execFileAsync('qpdf', [
        `--password=${options.password}`,
        '--decrypt',
        sourceFile,
        outputFile
      ]);
    } else {
      throw new Error('不支持的安全操作。');
    }

    return await fs.readFile(outputFile);
  } catch (_error) {
    if (options.action === 'decrypt') {
      throw new Error('解密失败，请确认密码是否正确。');
    }
    if (options.action === 'encrypt') {
      throw new Error('PDF 加密失败。');
    }
    throw _error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  PAGE_SIZE_MAP,
  COMPRESS_PRESET_MAP,
  loadPdf,
  parsePageSelection,
  chunkPageIndices,
  stripPdfExtension,
  buildAttachmentDisposition,
  mergePdfs,
  imagesToPdf,
  organizePdf,
  rotateSelectedPages,
  resizePdf,
  resizePdfBuffer,
  splitPdf,
  addMarksPdf,
  addMarksPdfBuffer,
  compressPdf,
  compressPdfBuffer,
  securePdf,
  securePdfBuffer
};
