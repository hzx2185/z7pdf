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
  StandardFonts,
  rgb
} = require('pdf-lib');

const { sanitizeFilename, getDisplayFilename } = require('./workspace-service');

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

const WATERMARK_COLOR_MAP = {
  orange: rgb(0.75, 0.35, 0.14),
  slate: rgb(0.2, 0.29, 0.35),
  red: rgb(0.75, 0.2, 0.2)
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

function computePageSize(baseWidth, baseHeight, pageSize, orientation) {
  if (!pageSize) {
    if (orientation === 'landscape' && baseWidth < baseHeight) {
      return [baseHeight, baseWidth];
    }
    if (orientation === 'portrait' && baseWidth > baseHeight) {
      return [baseHeight, baseWidth];
    }
    return [baseWidth, baseHeight];
  }

  const [width, height] = pageSize;
  if (orientation === 'landscape') {
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

function getWatermarkColor(input) {
  return parseHexColor(input) || WATERMARK_COLOR_MAP[input] || WATERMARK_COLOR_MAP.orange;
}

function normalizePosition(position) {
  return ['center', 'header', 'footer', 'tile'].includes(position) ? position : 'center';
}

function drawPageNumber(page, currentPage, totalPages, options, font) {
  const width = page.getWidth();
  const height = page.getHeight();
  const size = Math.max(8, Number(options.pageNumberFontSize || options.fontSize || 12));
  const margin = Math.max(12, Number(options.margin || 24));
  const text = `${currentPage} / ${totalPages}`;
  const textWidth = font.widthOfTextAtSize(text, size);

  let x = margin;
  if (options.align === 'center') {
    x = (width - textWidth) / 2;
  } else if (options.align === 'right') {
    x = width - textWidth - margin;
  }

  const y = options.vertical === 'top' ? height - margin - size : margin;
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: rgb(0.22, 0.22, 0.24),
    opacity: 0.78
  });
}

function drawBatesNumber(page, currentPage, options, font) {
  const width = page.getWidth();
  const height = page.getHeight();
  const size = Math.max(8, Number(options.batesFontSize || options.fontSize || 12));
  const margin = Math.max(12, Number(options.batesMargin || options.margin || 24));
  const prefix = String(options.batesPrefix || '').trim();
  const start = Math.max(1, Number(options.batesStart || 1));
  const digits = Math.min(12, Math.max(2, Number(options.batesDigits || 6)));
  const text = `${prefix}${String(start + currentPage - 1).padStart(digits, '0')}`;
  const textWidth = font.widthOfTextAtSize(text, size);

  let x = margin;
  if (options.batesAlign === 'center') {
    x = (width - textWidth) / 2;
  } else if (options.batesAlign === 'right') {
    x = width - textWidth - margin;
  }

  const y = options.batesVertical === 'top' ? height - margin - size : margin;
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: rgb(0.22, 0.22, 0.24),
    opacity: 0.88
  });
}

function drawWatermark(page, text, options, font) {
  const width = page.getWidth();
  const height = page.getHeight();
  const fontSize = Math.max(16, Number(options.fontSize || 36));
  const opacity = Math.min(0.95, Math.max(0.05, Number(options.opacity || 0.18)));
  const color = getWatermarkColor(options.color);
  const position = normalizePosition(options.position);
  const angle = Number(options.rotate || -30);
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = font.heightAtSize(fontSize);

  const draw = (x, y, rotate = angle) =>
    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color,
      opacity,
      rotate: degrees(rotate)
    });

  if (position === 'tile') {
    const stepX = Math.max(textWidth + 90, 170);
    const stepY = Math.max(textHeight + 90, 130);

    for (let y = 40; y < height + stepY; y += stepY) {
      for (let x = -40; x < width + stepX; x += stepX) {
        draw(x, y);
      }
    }
    return;
  }

  if (position === 'header') {
    draw((width - textWidth) / 2, height - textHeight - 36, 0);
    return;
  }

  if (position === 'footer') {
    draw((width - textWidth) / 2, 28, 0);
    return;
  }

  draw((width - textWidth) / 2, (height - textHeight) / 2);
}

function parseWatermarkImageDataUrl(input) {
  const value = String(input || '').trim();
  const match = value.match(/^data:(image\/png|image\/jpeg);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error('图片水印仅支持 PNG 或 JPG 格式。');
  }

  const mimeType = match[1].toLowerCase();
  const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!bytes.length) {
    throw new Error('图片水印内容为空。');
  }

  return { mimeType, bytes };
}

function drawImageWatermark(page, image, options) {
  const width = page.getWidth();
  const height = page.getHeight();
  const opacity = Math.min(0.95, Math.max(0.05, Number(options.opacity || 0.18)));
  const position = normalizePosition(options.position);
  const angle = Number(options.rotate || -30);
  const scalePercent = Math.min(90, Math.max(8, Number(options.imageScale || 24)));
  const maxWidth = width * (scalePercent / 100);
  const imageWidth = image.width || 1;
  const imageHeight = image.height || 1;
  const ratio = imageHeight / imageWidth;
  const drawWidth = maxWidth;
  const drawHeight = drawWidth * ratio;

  const draw = (x, y, rotate = angle) =>
    page.drawImage(image, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
      opacity,
      rotate: degrees(rotate)
    });

  if (position === 'tile') {
    const stepX = Math.max(drawWidth + 80, 150);
    const stepY = Math.max(drawHeight + 80, 130);

    for (let y = 30; y < height + stepY; y += stepY) {
      for (let x = -30; x < width + stepX; x += stepX) {
        draw(x, y);
      }
    }
    return;
  }

  if (position === 'header') {
    draw((width - drawWidth) / 2, height - drawHeight - 32, 0);
    return;
  }

  if (position === 'footer') {
    draw((width - drawWidth) / 2, 24, 0);
    return;
  }

  draw((width - drawWidth) / 2, (height - drawHeight) / 2);
}

function normalizeStampPosition(position) {
  return ['topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'center'].includes(position)
    ? position
    : 'bottomRight';
}

function drawImageStamp(page, image, options) {
  const width = page.getWidth();
  const height = page.getHeight();
  const opacity = Math.min(1, Math.max(0.1, Number(options.stampOpacity || 0.92)));
  const position = normalizeStampPosition(options.stampPosition);
  const angle = Number(options.stampRotate || -8);
  const scalePercent = Math.min(50, Math.max(5, Number(options.stampScale || 18)));
  const margin = Math.max(0, Number(options.stampMargin || 24));
  const drawWidth = width * (scalePercent / 100);
  const drawHeight = drawWidth * ((image.height || 1) / (image.width || 1));
  let x = margin;
  let y = margin;

  if (position === 'topLeft') {
    x = margin;
    y = height - drawHeight - margin;
  } else if (position === 'topRight') {
    x = width - drawWidth - margin;
    y = height - drawHeight - margin;
  } else if (position === 'bottomLeft') {
    x = margin;
    y = margin;
  } else if (position === 'bottomRight') {
    x = width - drawWidth - margin;
    y = margin;
  } else {
    x = (width - drawWidth) / 2;
    y = (height - drawHeight) / 2;
  }

  page.drawImage(image, {
    x,
    y,
    width: drawWidth,
    height: drawHeight,
    opacity,
    rotate: degrees(angle)
  });
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
  const orientation = options.orientation || 'portrait';
  const fitMode = options.fitMode || 'contain';
  const margin = Math.max(0, Number(options.margin || 0));
  const backgroundColor = parseHexColor(options.backgroundColor) || rgb(1, 1, 1);
  const srcPages = await out.copyPages(src, src.getPageIndices());

  for (const srcPage of srcPages) {
    const originalWidth = srcPage.getWidth();
    const originalHeight = srcPage.getHeight();
    const [targetWidth, targetHeight] = computePageSize(
      originalWidth,
      originalHeight,
      pageSize,
      orientation
    );

    if (!pageSize && margin === 0 && fitMode === 'keep') {
      out.addPage(srcPage);
      continue;
    }

    let embeddedPage;
    try {
      embeddedPage = await out.embedPage(srcPage);
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
    let drawWidth = availableWidth;
    let drawHeight = availableHeight;

    if (fitMode !== 'stretch') {
      const fitted = computeContainSize(
        originalWidth,
        originalHeight,
        availableWidth,
        availableHeight
      );
      drawWidth = fitted.width;
      drawHeight = fitted.height;
    }

    const x = (targetWidth - drawWidth) / 2;
    const y = (targetHeight - drawHeight) / 2;
    newPage.drawPage(embeddedPage, {
      x,
      y,
      width: drawWidth,
      height: drawHeight
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
  return addMarksPdfBuffer(file.buffer, file.originalname, options);
}

async function addMarksPdfBuffer(buffer, filename, options) {
  const src = await loadPdf(buffer, filename);
  const totalPages = src.getPageCount();
  const markMode = options.markMode || 'watermark';
  const selection = new Set(parsePageSelection(options.selection || 'all', totalPages));
  const includeWatermark =
    options.watermarkEnabled === true ||
    options.watermarkEnabled === 'true' ||
    markMode === 'watermark' ||
    markMode === 'both';
  const includePageNumbers =
    options.pageNumbersEnabled === true ||
    options.pageNumbersEnabled === 'true' ||
    markMode === 'pageNumber' ||
    markMode === 'both';
  const includeBates = options.batesEnabled === true || options.batesEnabled === 'true';
  const includeStamp = options.stampEnabled === true || options.stampEnabled === 'true';
  const needsTextWatermark =
    includeWatermark && String(options.watermarkKind || 'text').trim() !== 'image';
  const needsPageNumbers = includePageNumbers || includeBates;
  const font =
    needsTextWatermark || needsPageNumbers
      ? await src.embedFont(StandardFonts.Helvetica)
      : null;
  let watermarkImage = null;
  let stampImage = null;

  if (includeWatermark) {
    if (String(options.watermarkKind || 'text').trim() === 'image') {
      const { mimeType, bytes } = parseWatermarkImageDataUrl(options.imageDataUrl || '');
      watermarkImage =
        mimeType === 'image/png' ? await src.embedPng(bytes) : await src.embedJpg(bytes);
    } else if (!String(options.text || '').trim()) {
      throw new Error('请填写水印文字。');
    }
  }

  if (includeStamp) {
    const { mimeType, bytes } = parseWatermarkImageDataUrl(options.stampImageDataUrl || '');
    stampImage =
      mimeType === 'image/png' ? await src.embedPng(bytes) : await src.embedJpg(bytes);
  }

  src.getPages().forEach((page, index) => {
    if (!selection.has(index)) {
      return;
    }

    if (includeWatermark) {
      if (watermarkImage) {
        drawImageWatermark(page, watermarkImage, options);
      } else {
        drawWatermark(page, String(options.text || '').trim(), options, font);
      }
    }

    if (includePageNumbers) {
      drawPageNumber(page, index + 1, totalPages, options, font);
    }

    if (includeBates) {
      drawBatesNumber(page, index + 1, options, font);
    }

    if (includeStamp && stampImage) {
      drawImageStamp(page, stampImage, options);
    }
  });

  return src.save({ useObjectStreams: true, addDefaultPage: false });
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
