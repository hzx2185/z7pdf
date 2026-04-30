const { createCanvas } = require('@napi-rs/canvas');
const { BlendMode, rgb } = require('pdf-lib');
const { pdfColorFromHex } = require('../utils/color');

const HEADER_FOOTER_COLOR_MAP = {
  orange: rgb(0.75, 0.35, 0.14),
  slate: rgb(0.2, 0.29, 0.35),
  red: rgb(0.75, 0.2, 0.2)
};

const TEXT_HIGHLIGHT_COLOR = rgb(1, 0.82, 0.4);
const TEXT_UNDERLINE_COLOR = rgb(1, 0.47, 0.24);

function getHeaderFooterColor(input) {
  return pdfColorFromHex(input) || HEADER_FOOTER_COLOR_MAP[input] || HEADER_FOOTER_COLOR_MAP.slate;
}

function clampOpacity(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.min(1, Math.max(0, Number(fallback || 0)));
  }
  return Math.min(1, Math.max(0, parsed));
}

function normalizeHexColor(input, fallback = '#111827') {
  const value = String(input || fallback).trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(value)) {
    return value.startsWith('#') ? value : `#${value}`;
  }
  return fallback.startsWith('#') ? fallback : `#${fallback}`;
}

function canvasColorFromHex(input, opacity = 1, fallback = '#111827') {
  const hex = normalizeHexColor(input, fallback).slice(1);
  return `rgba(${Number.parseInt(hex.slice(0, 2), 16)}, ${Number.parseInt(hex.slice(2, 4), 16)}, ${Number.parseInt(hex.slice(4, 6), 16)}, ${clampOpacity(opacity, 1)})`;
}

function resolvePdfColor(input, fallback = '#111827') {
  return pdfColorFromHex(input) || pdfColorFromHex(fallback) || rgb(0.07, 0.1, 0.15);
}

function normalizeAnnotationPoint(point) {
  return {
    x: Math.min(1, Math.max(0, Number(point?.x || 0))),
    y: Math.min(1, Math.max(0, Number(point?.y || 0)))
  };
}

function normalizeAnnotationRect(rect) {
  const x = Math.min(1, Math.max(0, Number(rect?.x || 0)));
  const y = Math.min(1, Math.max(0, Number(rect?.y || 0)));
  const w = Math.min(1 - x, Math.max(0, Number(rect?.w || 0)));
  const h = Math.min(1 - y, Math.max(0, Number(rect?.h || 0)));
  if (!(w > 0) || !(h > 0)) {
    return null;
  }
  return { x, y, w, h };
}

function wrapCanvasTextLines(ctx, text, maxWidth) {
  const safeWidth = Math.max(12, Number(maxWidth || 0));
  const paragraphs = String(text || '').split(/\r?\n/);
  const lines = [];

  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push('');
      return;
    }

    let current = '';
    for (const character of paragraph) {
      if (!current && /\s/.test(character)) {
        continue;
      }
      const candidate = current + character;
      if (current && ctx.measureText(candidate).width > safeWidth) {
        lines.push(current.trimEnd());
        current = /\s/.test(character) ? '' : character;
      } else {
        current = candidate;
      }
    }

    lines.push((current || paragraph).trimEnd());
  });

  return lines.length > 0 ? lines : [''];
}

async function drawTextboxAnnotation(pdf, page, annotation, pageW, pageH) {
  const rect = normalizeAnnotationRect(annotation?.rect);
  if (!rect || !String(annotation?.text || '').trim()) {
    return;
  }

  const width = rect.w * pageW;
  const height = rect.h * pageH;
  if (!(width > 0) || !(height > 0)) {
    return;
  }

  const x = rect.x * pageW;
  const y = (1 - rect.y - rect.h) * pageH;
  const lineWidth = Math.max(0.8, Number(annotation.lineWidth || 1.25));
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: resolvePdfColor(annotation.fillColor, '#fff7ed'),
    opacity: clampOpacity(annotation.fillOpacity, 0.92),
    borderColor: resolvePdfColor(annotation.strokeColor, '#f97316'),
    borderWidth: lineWidth,
    borderOpacity: clampOpacity(annotation.strokeOpacity, 0.9)
  });

  const canvasWidth = Math.max(1, Math.ceil(width));
  const canvasHeight = Math.max(1, Math.ceil(height));
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  const fontSize = Math.max(10, Math.min(canvasHeight * 0.45, Number(annotation.fontSize || 14)));
  const padding = Math.max(4, Number(annotation.padding || 8));
  const textAreaWidth = Math.max(12, canvasWidth - padding * 2);
  const textAreaHeight = Math.max(0, canvasHeight - padding * 2);
  const lineHeight = fontSize * 1.35;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = canvasColorFromHex(annotation.textColor, annotation.textOpacity, '#111827');
  ctx.font = `500 ${fontSize}px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif`;
  ctx.textBaseline = 'top';

  wrapCanvasTextLines(ctx, annotation.text, textAreaWidth).forEach((line, index) => {
    const top = padding + index * lineHeight;
    if (top + lineHeight > padding + textAreaHeight + 1) {
      return;
    }
    ctx.fillText(line, padding, top);
  });

  const textImage = await pdf.embedPng(canvas.toBuffer('image/png'));
  page.drawImage(textImage, {
    x,
    y,
    width,
    height
  });
}

async function drawVisualAnnotation(pdf, page, annotation, pageW, pageH) {
  if (!annotation || typeof annotation !== 'object') {
    return;
  }

  if (annotation.type === 'pencil' && Array.isArray(annotation.points) && annotation.points.length >= 2) {
    const thickness = Math.max(1, Number(annotation.lineWidth || 2));
    const color = resolvePdfColor(annotation.strokeColor, '#dc2626');
    const opacity = clampOpacity(annotation.strokeOpacity, 0.8);
    for (let pointIndex = 0; pointIndex < annotation.points.length - 1; pointIndex += 1) {
      const start = annotation.points[pointIndex];
      const end = annotation.points[pointIndex + 1];
      page.drawLine({
        start: { x: start[0] * pageW, y: (1 - start[1]) * pageH },
        end: { x: end[0] * pageW, y: (1 - end[1]) * pageH },
        thickness,
        color,
        opacity
      });
    }
    return;
  }

  if (annotation.type === 'rect' && annotation.rect) {
    const rect = normalizeAnnotationRect(annotation.rect);
    if (!rect) {
      return;
    }

    page.drawRectangle({
      x: rect.x * pageW,
      y: (1 - rect.y - rect.h) * pageH,
      width: rect.w * pageW,
      height: rect.h * pageH,
      color: resolvePdfColor(annotation.fillColor, '#2dd4bf'),
      opacity: clampOpacity(annotation.fillOpacity, 0.14),
      borderColor: resolvePdfColor(annotation.strokeColor, '#0f766e'),
      borderWidth: Math.max(1, Number(annotation.lineWidth || 2)),
      borderOpacity: clampOpacity(annotation.strokeOpacity, 0.94)
    });
    return;
  }

  if (annotation.type === 'arrow' && annotation.start && annotation.end) {
    const start = normalizeAnnotationPoint(annotation.start);
    const end = normalizeAnnotationPoint(annotation.end);
    const startX = start.x * pageW;
    const startY = (1 - start.y) * pageH;
    const endX = end.x * pageW;
    const endY = (1 - end.y) * pageH;
    const lineWidth = Math.max(1, Number(annotation.lineWidth || 2.5));
    const color = resolvePdfColor(annotation.strokeColor, '#2563eb');
    const opacity = clampOpacity(annotation.strokeOpacity, 0.96);
    const length = Math.hypot(endX - startX, endY - startY);
    if (length < 4) {
      return;
    }

    const angle = Math.atan2(endY - startY, endX - startX);
    const headLength = Math.min(length * 0.32, Math.max(lineWidth * 6, 14));
    const headAngle = Math.PI / 7;

    page.drawLine({
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      thickness: lineWidth,
      color,
      opacity
    });
    page.drawLine({
      start: { x: endX, y: endY },
      end: {
        x: endX - headLength * Math.cos(angle - headAngle),
        y: endY - headLength * Math.sin(angle - headAngle)
      },
      thickness: lineWidth,
      color,
      opacity
    });
    page.drawLine({
      start: { x: endX, y: endY },
      end: {
        x: endX - headLength * Math.cos(angle + headAngle),
        y: endY - headLength * Math.sin(angle + headAngle)
      },
      thickness: lineWidth,
      color,
      opacity
    });
    return;
  }

  if (annotation.type === 'textbox' && annotation.rect && annotation.text) {
    await drawTextboxAnnotation(pdf, page, annotation, pageW, pageH);
    return;
  }

  const rects = Array.isArray(annotation.rects) ? annotation.rects : [];
  if (rects.length === 0) {
    return;
  }

  if (annotation.type === 'text-highlight') {
    rects.forEach((rect) => {
      const width = Number(rect.w || 0) * pageW;
      const height = Number(rect.h || 0) * pageH;
      if (width <= 0 || height <= 0) {
        return;
      }
      page.drawRectangle({
        x: Number(rect.x || 0) * pageW,
        y: (1 - Number(rect.y || 0) - Number(rect.h || 0)) * pageH,
        width,
        height,
        color: TEXT_HIGHLIGHT_COLOR,
        opacity: 0.38,
        blendMode: BlendMode.Multiply
      });
    });
    return;
  }

  if (annotation.type === 'text-underline') {
    rects.forEach((rect) => {
      const width = Number(rect.w || 0) * pageW;
      const height = Number(rect.h || 0) * pageH;
      if (width <= 0 || height <= 0) {
        return;
      }

      const lineY =
        (1 - Number(rect.y || 0) - Number(rect.h || 0)) * pageH +
        Math.max(1.2, height * 0.08);

      page.drawLine({
        start: { x: Number(rect.x || 0) * pageW, y: lineY },
        end: { x: (Number(rect.x || 0) + Number(rect.w || 0)) * pageW, y: lineY },
        thickness: Math.max(1, height * 0.09),
        color: TEXT_UNDERLINE_COLOR,
        opacity: 0.95
      });
    });
  }
}

function computeAlignedX(width, textWidth, align, margin) {
  if (align === 'left') {
    return margin;
  }
  if (align === 'right') {
    return width - textWidth - margin;
  }
  return (width - textWidth) / 2;
}

function resolveHeaderFooterTemplate(template, context) {
  return String(template || '').replace(
    /\{\{\s*(page|pages|file|date|datetime)\s*\}\}/gi,
    (_, token) => {
      const key = String(token || '').toLowerCase();
      if (key === 'page') return String(context.pageNumber || '');
      if (key === 'pages') return String(context.totalPages || '');
      if (key === 'file') return String(context.fileName || '');
      if (key === 'date') return String(context.dateLabel || '');
      if (key === 'datetime') return String(context.datetimeLabel || '');
      return '';
    }
  );
}

function drawHeaderFooter(page, options, font, context) {
  const width = page.getWidth();
  const height = page.getHeight();
  const fontSize = Math.max(8, Number(options.fontSize || 10));
  const margin = Math.max(8, Number(options.margin || 24));
  const opacity = Math.min(1, Math.max(0.1, Number(options.opacity || 0.85)));
  const color = getHeaderFooterColor(options.color || 'slate');
  const align = ['left', 'center', 'right'].includes(options.align) ? options.align : 'center';
  const headerText = resolveHeaderFooterTemplate(options.headerText, context).trim();
  const footerText = resolveHeaderFooterTemplate(options.footerText, context).trim();

  if (headerText) {
    const headerWidth = font.widthOfTextAtSize(headerText, fontSize);
    page.drawText(headerText, {
      x: computeAlignedX(width, headerWidth, align, margin),
      y: height - margin - fontSize,
      size: fontSize,
      font,
      color,
      opacity
    });
  }

  if (footerText) {
    const footerWidth = font.widthOfTextAtSize(footerText, fontSize);
    page.drawText(footerText, {
      x: computeAlignedX(width, footerWidth, align, margin),
      y: margin,
      size: fontSize,
      font,
      color,
      opacity
    });
  }
}

module.exports = {
  drawHeaderFooter,
  drawVisualAnnotation
};
