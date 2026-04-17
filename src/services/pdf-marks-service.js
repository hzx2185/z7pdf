const { PDFDocument, degrees, StandardFonts, rgb } = require('pdf-lib');

const WATERMARK_COLOR_MAP = {
  orange: rgb(0.75, 0.35, 0.14),
  slate: rgb(0.2, 0.29, 0.35),
  red: rgb(0.75, 0.2, 0.2)
};

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

async function addMarksPdfBuffer(buffer, filename, options, { loadPdf, parsePageSelection }) {
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

async function addMarksPdf(file, options, deps) {
  return addMarksPdfBuffer(file.buffer, file.originalname, options, deps);
}

module.exports = {
  addMarksPdf,
  addMarksPdfBuffer
};
