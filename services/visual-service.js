const path = require('path');
const fsSync = require('fs');
const fs = require('fs').promises;
const os = require('os');
const JSZip = require('jszip');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const {
  PDFDocument,
  StandardFonts,
  BlendMode,
  degrees,
  rgb
} = require('pdf-lib');

const { isOcrAvailable } = require('./plan-service');
const {
  loadPdf,
  parsePageSelection,
  chunkPageIndices,
  stripPdfExtension,
  resizePdfBuffer,
  addMarksPdfBuffer,
  compressPdfBuffer,
  securePdfBuffer
} = require('./pdf-service');

const execFileAsync = promisify(execFile);

const OCR_LANGUAGE_WHITELIST = new Set([
  'eng',
  'chi_sim',
  'chi_sim+eng',
  'eng+chi_sim'
]);

const PDFA_LEVEL_MAP = {
  '1b': 1,
  '2b': 2,
  '3b': 3
};

const HEADER_FOOTER_COLOR_MAP = {
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

function getHeaderFooterColor(input) {
  return parseHexColor(input) || HEADER_FOOTER_COLOR_MAP[input] || HEADER_FOOTER_COLOR_MAP.slate;
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

function normalizeVisualRecipe(recipe, files) {
  const pageTotals = files.map((file) => file.pageCount);
  const pageStates = Array.isArray(recipe.pages)
    ? recipe.pages
    : pageTotals.flatMap((pageCount, fileIndex) =>
        Array.from({ length: pageCount }, (_, sourceIndex) => ({
          fileIndex,
          sourceIndex,
          rotation: 0,
          deleted: false
        }))
      );

  const normalizedPages = pageStates.map((page, index) => {
    const kind = page.kind === 'blank' ? 'blank' : 'source';
    if (kind === 'blank') {
      const width = Number(page.width || 595);
      const height = Number(page.height || 842);
      if (!(width > 0) || !(height > 0)) {
        throw new Error(`编辑页配置无效：第 ${index + 1} 项的空白页尺寸不正确。`);
      }

      const rotation = Number(page.rotation || 0);
      return {
        kind,
        fileIndex: -1,
        sourceIndex: -1,
        width,
        height,
        rotation: ((rotation % 360) + 360) % 360,
        deleted: page.deleted === true || page.deleted === 'true'
      };
    }

    const fileIndex = Number(page.fileIndex || 0);
    const sourceIndex = Number(page.sourceIndex);
    if (!Number.isInteger(fileIndex) || fileIndex < 0 || fileIndex >= files.length) {
      throw new Error(`编辑页配置无效：第 ${index + 1} 项引用了不存在的文件。`);
    }
    if (
      !Number.isInteger(sourceIndex) ||
      sourceIndex < 0 ||
      sourceIndex >= pageTotals[fileIndex]
    ) {
      throw new Error(`编辑页配置无效：第 ${index + 1} 项引用了不存在的页面。`);
    }

    const rotation = Number(page.rotation || 0);
    return {
      kind,
      fileIndex,
      sourceIndex,
      width: Number(page.width || 0),
      height: Number(page.height || 0),
      rotation: ((rotation % 360) + 360) % 360,
      deleted: page.deleted === true || page.deleted === 'true'
    };
  });

  if (!normalizedPages.some((page) => !page.deleted)) {
    throw new Error('至少需要保留一页才能导出。');
  }

  return {
    pages: normalizedPages,
    resize:
      recipe.resize && recipe.resize.enabled
        ? {
            enabled: true,
            pageSize: String(recipe.resize.pageSize || 'keep').trim(),
            orientation:
              String(recipe.resize.orientation || 'portrait').trim() === 'landscape'
                ? 'landscape'
                : 'portrait',
            margin: Math.max(0, Number(recipe.resize.margin || 0)),
            backgroundColor: String(recipe.resize.backgroundColor || '#ffffff').trim(),
            fitMode: ['contain', 'stretch', 'keep'].includes(
              String(recipe.resize.fitMode || 'contain').trim()
            )
              ? String(recipe.resize.fitMode || 'contain').trim()
              : 'contain'
          }
        : null,
    grayscale: recipe.grayscale && recipe.grayscale.enabled ? recipe.grayscale : null,
    scanEffect:
      recipe.scanEffect && recipe.scanEffect.enabled
        ? {
            enabled: true,
            level: ['light', 'medium', 'strong'].includes(
              String(recipe.scanEffect.level || 'medium').trim()
            )
              ? String(recipe.scanEffect.level || 'medium').trim()
              : 'medium'
          }
        : null,
    ocr:
      recipe.ocr && recipe.ocr.enabled
        ? {
            enabled: true,
            language: OCR_LANGUAGE_WHITELIST.has(
              String(recipe.ocr.language || 'chi_sim+eng').trim()
            )
              ? String(recipe.ocr.language || 'chi_sim+eng').trim()
              : 'chi_sim+eng'
          }
        : null,
    pdfa:
      recipe.pdfa && recipe.pdfa.enabled
        ? {
            enabled: true,
            level: ['1b', '2b', '3b'].includes(
              String(recipe.pdfa.level || '2b').trim().toLowerCase()
            )
              ? String(recipe.pdfa.level || '2b').trim().toLowerCase()
              : '2b'
          }
        : null,
    invertColors: recipe.invertColors && recipe.invertColors.enabled ? recipe.invertColors : null,
    compression: recipe.compression && recipe.compression.enabled ? recipe.compression : null,
    security: recipe.security && recipe.security.enabled ? recipe.security : null,
    headerFooter:
      recipe.headerFooter && recipe.headerFooter.enabled
        ? {
            headerText: String(recipe.headerFooter.headerText || '').trim(),
            footerText: String(recipe.headerFooter.footerText || '').trim(),
            align: String(recipe.headerFooter.align || 'center').trim(),
            color: String(recipe.headerFooter.color || 'slate').trim(),
            fontSize: Number(recipe.headerFooter.fontSize || 10),
            margin: Number(recipe.headerFooter.margin || 24),
            opacity: Number(recipe.headerFooter.opacity || 0.85)
          }
        : null,
    metadata:
      recipe.metadata && recipe.metadata.enabled
        ? {
            clearExisting:
              recipe.metadata.clearExisting === true ||
              recipe.metadata.clearExisting === 'true',
            title: String(recipe.metadata.title || '').trim(),
            author: String(recipe.metadata.author || '').trim(),
            subject: String(recipe.metadata.subject || '').trim(),
            keywords: String(recipe.metadata.keywords || '').trim()
          }
        : null,
    split: recipe.split && recipe.split.enabled ? recipe.split : null,
    watermark:
      recipe.watermark && recipe.watermark.enabled
        ? {
            enabled: true,
            kind: String(recipe.watermark.kind || 'text').trim() === 'image' ? 'image' : 'text',
            text: String(recipe.watermark.text || '').trim(),
            imageDataUrl: String(recipe.watermark.imageDataUrl || '').trim(),
            imageName: String(recipe.watermark.imageName || '').trim(),
            position: String(recipe.watermark.position || 'center').trim(),
            color: String(recipe.watermark.color || 'orange').trim(),
            opacity: Number(recipe.watermark.opacity || 0.18),
            fontSize: Number(recipe.watermark.fontSize || 36),
            imageScale: Number(recipe.watermark.imageScale || 24),
            rotate: Number(recipe.watermark.rotate || -30)
          }
        : null,
    stamp:
      recipe.stamp && recipe.stamp.enabled
        ? {
            enabled: true,
            imageDataUrl: String(recipe.stamp.imageDataUrl || '').trim(),
            imageName: String(recipe.stamp.imageName || '').trim(),
            position: String(recipe.stamp.position || 'bottomRight').trim(),
            opacity: Number(recipe.stamp.opacity || 0.92),
            scale: Number(recipe.stamp.scale || 18),
            margin: Number(recipe.stamp.margin || 24),
            rotate: Number(recipe.stamp.rotate || -8)
          }
        : null,
    bates:
      recipe.bates && recipe.bates.enabled
        ? {
            enabled: true,
            prefix: String(recipe.bates.prefix || '').trim(),
            start: Math.max(1, Number(recipe.bates.start || 1)),
            digits: Math.min(12, Math.max(2, Number(recipe.bates.digits || 6))),
            align: String(recipe.bates.align || 'right').trim(),
            vertical: String(recipe.bates.vertical || 'bottom').trim(),
            fontSize: Number(recipe.bates.fontSize || 12),
            margin: Number(recipe.bates.margin || 24)
          }
        : null,
    pageNumbers: recipe.pageNumbers && recipe.pageNumbers.enabled ? recipe.pageNumbers : null,
    toImages:
      recipe.toImages && recipe.toImages.enabled
        ? {
            enabled: true,
            options: {
              format: String(recipe.toImages.options?.format || 'jpg').trim(),
              dpi: Number(recipe.toImages.options?.dpi || 200),
              quality: Number(recipe.toImages.options?.quality || 85)
            }
          }
        : null,
    visualMetadata: Array.isArray(recipe.visualMetadata) ? recipe.visualMetadata : []
  };
}

async function splitPdfBuffer(buffer, filename, options) {
  const src = await loadPdf(buffer, filename);
  const pageCount = src.getPageCount();
  const baseName = stripPdfExtension(filename);
  const zip = new JSZip();
  let groups = [];

  if (options.mode === 'every') {
    const every = Number(options.every || 1);
    if (!Number.isInteger(every) || every < 1) {
      throw new Error('拆分页数必须是大于等于 1 的整数。');
    }
    groups = chunkPageIndices(
      Array.from({ length: pageCount }, (_, index) => index),
      every
    );
  } else {
    const ranges = Array.isArray(options.ranges) ? options.ranges : [];
    if (ranges.length === 0) {
      throw new Error('请提供至少一个拆分范围。');
    }
    groups = ranges.map((range) => parsePageSelection(range, pageCount));
  }

  for (const [groupIndex, pageIndices] of groups.entries()) {
    const part = await PDFDocument.create();
    const pages = await part.copyPages(src, pageIndices);
    pages.forEach((page) => part.addPage(page));
    const bytes = await part.save({ useObjectStreams: true, addDefaultPage: false });
    zip.file(`${baseName}_part_${String(groupIndex + 1).padStart(2, '0')}.pdf`, bytes);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function updatePdfMetadataBuffer(buffer, filename, options) {
  const pdf = await loadPdf(buffer, filename);
  const clearExisting = options.clearExisting === true || options.clearExisting === 'true';

  if (clearExisting) {
    pdf.setTitle('');
    pdf.setAuthor('');
    pdf.setSubject('');
    pdf.setKeywords([]);
    pdf.setCreator('');
    pdf.setProducer('');
  }

  if (options.title) {
    pdf.setTitle(String(options.title));
  }
  if (options.author) {
    pdf.setAuthor(String(options.author));
  }
  if (options.subject) {
    pdf.setSubject(String(options.subject));
  }
  if (options.keywords) {
    pdf.setKeywords(
      String(options.keywords)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }

  pdf.setModificationDate(new Date());
  return pdf.save({ useObjectStreams: true, addDefaultPage: false });
}

async function addHeaderFooterBuffer(buffer, filename, options) {
  const pdf = await loadPdf(buffer, filename);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const totalPages = pdf.getPageCount();
  const fileName = stripPdfExtension(filename);
  const now = new Date();
  const dateLabel = now.toISOString().slice(0, 10);
  const datetimeLabel = now.toISOString().slice(0, 16).replace('T', ' ');

  pdf.getPages().forEach((page, index) => {
    drawHeaderFooter(page, options, font, {
      pageNumber: index + 1,
      totalPages,
      fileName,
      dateLabel,
      datetimeLabel
    });
  });

  return pdf.save({ useObjectStreams: true, addDefaultPage: false });
}

async function convertPdfToImagesZipBuffer(buffer, options = {}) {
  const format = String(options.format || 'jpg').trim();
  const dpi = Number(options.dpi || 200);
  const quality = Number(options.quality || 85);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'z7pdf-toimg-'));
  const sourceFile = path.join(tempDir, 'input.pdf');

  try {
    await fs.writeFile(sourceFile, buffer);

    let device = 'jpeg';
    let ext = 'jpg';
    if (format === 'png') {
      device = 'png16m';
      ext = 'png';
    } else if (format === 'webp') {
      device = 'webp';
      ext = 'webp';
    }

    const gsArgs = [
      `-sDEVICE=${device}`,
      '-dNOPAUSE',
      '-dBATCH',
      '-dQUIET',
      `-r${Math.max(72, Math.min(600, dpi))}`
    ];

    if (format === 'jpg') {
      gsArgs.push(`-dJPEGQ=${Math.max(1, Math.min(100, quality))}`);
    } else if (format === 'webp') {
      gsArgs.push(`-dWebPQuality=${Math.max(1, Math.min(100, quality))}`);
    }

    gsArgs.push(`-sOutputFile=${path.join(tempDir, `page-%d.${ext}`)}`, sourceFile);

    try {
      await execFileAsync('gs', gsArgs);
    } catch (error) {
      if (format === 'webp' && error.message.includes('device')) {
        const fallbackArgs = gsArgs.filter((arg) => !arg.startsWith('-dWebPQuality'));
        fallbackArgs[0] = '-sDEVICE=png16m';
        fallbackArgs[fallbackArgs.length - 2] = `-sOutputFile=${path.join(tempDir, 'page-%d.png')}`;
        ext = 'png';
        await execFileAsync('gs', fallbackArgs);
      } else {
        throw new Error(
          `PDF转图片失败：${error.message}。请确保已安装Ghostscript (gs命令)。`
        );
      }
    }

    const zip = new JSZip();
    const files = await fs.readdir(tempDir);
    const imageFiles = files
      .filter((file) => file.endsWith(`.${ext}`))
      .sort((left, right) => {
        const leftNum = Number((left.match(/\d+/) || ['0'])[0]);
        const rightNum = Number((right.match(/\d+/) || ['0'])[0]);
        return leftNum - rightNum;
      });

    for (const file of imageFiles) {
      zip.file(file, await fs.readFile(path.join(tempDir, file)));
    }

    return zip.generateAsync({ type: 'nodebuffer' });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function convertPdfToGrayscaleBuffer(buffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'z7pdf-gray-'));
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
      '-sColorConversionStrategy=Gray',
      '-dProcessColorModel=/DeviceGray',
      '-dAutoFilterColorImages=false',
      '-dAutoFilterGrayImages=false',
      `-sOutputFile=${outputFile}`,
      sourceFile
    ]);
    return await fs.readFile(outputFile);
  } catch (_error) {
    return buffer;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function applyScanEffectBuffer(buffer, level) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'z7pdf-scan-'));
  const sourceFile = path.join(tempDir, 'input.pdf');
  const presetMap = {
    light: { dpi: 200, quality: 85, whitePoint: 220, blackPoint: 20, gamma: 1.0 },
    medium: { dpi: 200, quality: 80, whitePoint: 190, blackPoint: 35, gamma: 1.0 },
    strong: { dpi: 200, quality: 75, whitePoint: 160, blackPoint: 50, gamma: 1.0 }
  };
  const preset = presetMap[level] || presetMap.medium;

  try {
    await fs.writeFile(sourceFile, buffer);
    await execFileAsync('gs', [
      '-sDEVICE=jpeg',
      '-dNOPAUSE',
      '-dBATCH',
      '-dQUIET',
      `-r${preset.dpi}`,
      '-dJPEGQ=100',
      `-sOutputFile=${path.join(tempDir, 'page-%04d.jpg')}`,
      sourceFile
    ]);

    const files = await fs.readdir(tempDir);
    const jpgFiles = files
      .filter((file) => file.endsWith('.jpg'))
      .sort((left, right) => Number((left.match(/\d+/) || ['0'])[0]) - Number((right.match(/\d+/) || ['0'])[0]));

    const outPdf = await PDFDocument.create();

    for (const jpg of jpgFiles) {
      const image = await loadImage(path.join(tempDir, jpg));
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, image.width, image.height);
      const imgData = ctx.getImageData(0, 0, image.width, image.height);
      const pixels = imgData.data;
      const { whitePoint, blackPoint, gamma } = preset;
      const range = whitePoint - blackPoint;

      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;

        if (luma >= whitePoint) {
          pixels[index] = 255;
          pixels[index + 1] = 255;
          pixels[index + 2] = 255;
        } else {
          let mappedLuma;
          if (luma <= blackPoint) {
            mappedLuma = luma * 0.8;
          } else {
            mappedLuma = Math.pow((luma - blackPoint) / range, gamma) * 255;
          }
          const scale = luma > 0 ? mappedLuma / luma : 1;
          pixels[index] = Math.min(255, Math.round(r * scale));
          pixels[index + 1] = Math.min(255, Math.round(g * scale));
          pixels[index + 2] = Math.min(255, Math.round(b * scale));
        }
      }

      ctx.putImageData(imgData, 0, 0);
      const processedBuffer = canvas.toBuffer('image/jpeg', { quality: preset.quality });
      const embeddedJpg = await outPdf.embedJpg(processedBuffer);
      const page = outPdf.addPage([embeddedJpg.width, embeddedJpg.height]);
      page.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: embeddedJpg.width,
        height: embeddedJpg.height
      });
    }

    return Buffer.from(await outPdf.save({ useObjectStreams: true, addDefaultPage: false }));
  } catch (_error) {
    return buffer;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function applyOcrToPdfBuffer(buffer, language) {
  if (!(await isOcrAvailable())) {
    throw new Error('当前环境未安装 OCR 依赖，请在镜像中安装 ocrmypdf 和 tesseract-ocr 后再试。');
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'z7pdf-ocr-'));
  const sourceFile = path.join(tempDir, 'input.pdf');
  const outputFile = path.join(tempDir, 'output.pdf');

  try {
    await fs.writeFile(sourceFile, buffer);
    await execFileAsync('ocrmypdf', [
      '--skip-text',
      '--rotate-pages',
      '--deskew',
      '--clean-final',
      '--optimize',
      '1',
      '--language',
      language || 'chi_sim+eng',
      sourceFile,
      outputFile
    ]);
    return await fs.readFile(outputFile);
  } catch (error) {
    const stderr = String(error?.stderr || '').trim();
    throw new Error(
      stderr
        ? `OCR 处理失败：${stderr.split('\n').slice(-1)[0]}`
        : 'OCR 处理失败，请检查文件是否为有效 PDF。'
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function resolvePdfaIccProfile() {
  const candidates = [
    '/System/Library/ColorSync/Profiles/sRGB Profile.icc',
    '/System/Library/ColorSync/Profiles/Display P3.icc',
    '/System/Library/ColorSync/Profiles/Generic RGB Profile.icc',
    '/Library/ColorSync/Profiles/WebSafeColors.icc'
  ];

  return candidates.find((candidate) => fsSync.existsSync(candidate)) || null;
}

function escapePostScriptPath(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

async function convertPdfToPdfaBuffer(buffer, level) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'z7pdf-pdfa-'));
  const sourceFile = path.join(tempDir, 'input.pdf');
  const outputFile = path.join(tempDir, 'output.pdf');
  const definitionFile = path.join(tempDir, 'PDFA_def.ps');
  const normalizedLevel = ['1b', '2b', '3b'].includes(String(level || '').toLowerCase())
    ? String(level).toLowerCase()
    : '2b';
  const pdfaVersion = PDFA_LEVEL_MAP[normalizedLevel] || 2;
  const iccProfile = resolvePdfaIccProfile();

  try {
    if (!iccProfile) {
      return buffer;
    }

    const escapedIccPath = escapePostScriptPath(iccProfile);
    const pdfaDefinition = [
      `% PDF/A-${normalizedLevel.toUpperCase()} output intent`,
      `/ICCProfile (${escapedIccPath}) def`,
      `[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark`,
      `[{icc_PDFA} << /N 3 >> /PUT pdfmark`,
      `[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark`,
      `[{OutputIntent_PDFA} <<`,
      `/Type /OutputIntent`,
      `/S /GTS_PDFA1`,
      `/OutputConditionIdentifier (sRGB IEC61966-2.1)`,
      `/Info (sRGB IEC61966-2.1)`,
      `/DestOutputProfile {icc_PDFA}`,
      `>> /PUT pdfmark`,
      `[{Catalog} << /OutputIntents [ {OutputIntent_PDFA} ] >> /PUT pdfmark`,
      ''
    ].join('\n');

    await fs.writeFile(sourceFile, buffer);
    await fs.writeFile(definitionFile, pdfaDefinition, 'utf8');
    await execFileAsync('gs', [
      '-sDEVICE=pdfwrite',
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-dPDFA=${pdfaVersion}`,
      '-dPDFACompatibilityPolicy=1',
      '-dNOOUTERSAVE',
      '-dAutoRotatePages=/None',
      '-sProcessColorModel=DeviceRGB',
      '-sColorConversionStrategy=RGB',
      '-dEmbedAllFonts=true',
      '-dSubsetFonts=true',
      '-dCompatibilityLevel=1.7',
      `-sOutputFile=${outputFile}`,
      definitionFile,
      sourceFile
    ]);
    return await fs.readFile(outputFile);
  } catch (_error) {
    return buffer;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function invertPdfColorsBuffer(buffer, filename) {
  const pdf = await loadPdf(buffer, filename);

  pdf.getPages().forEach((page) => {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
      color: rgb(1, 1, 1),
      blendMode: BlendMode.Difference
    });
  });

  return pdf.save({ useObjectStreams: true, addDefaultPage: false });
}

async function applyVisualPostProcessing(bytes, filename, normalized) {
  if (normalized.pdfa && normalized.security) {
    throw new Error('PDF/A 与加密不能同时启用。');
  }

  let output = bytes;

  if (normalized.resize) {
    output = await resizePdfBuffer(output, filename, normalized.resize);
  }

  if (normalized.watermark || normalized.pageNumbers || normalized.bates || normalized.stamp) {
    output = await addMarksPdfBuffer(output, filename, {
      watermarkEnabled: Boolean(normalized.watermark),
      pageNumbersEnabled: Boolean(normalized.pageNumbers),
      batesEnabled: Boolean(normalized.bates),
      stampEnabled: Boolean(normalized.stamp),
      selection: 'all',
      watermarkKind: normalized.watermark?.kind || 'text',
      text: normalized.watermark ? normalized.watermark.text : '',
      imageDataUrl: normalized.watermark?.imageDataUrl || '',
      position: normalized.watermark ? normalized.watermark.position : 'center',
      color: normalized.watermark ? normalized.watermark.color : 'orange',
      opacity: normalized.watermark ? normalized.watermark.opacity : 0.18,
      fontSize: normalized.watermark?.fontSize || normalized.pageNumbers?.fontSize || 12,
      imageScale: normalized.watermark?.imageScale || 24,
      rotate: normalized.watermark ? normalized.watermark.rotate : -30,
      align: normalized.pageNumbers ? normalized.pageNumbers.align : 'right',
      vertical: normalized.pageNumbers ? normalized.pageNumbers.vertical : 'bottom',
      pageNumberFontSize: normalized.pageNumbers?.fontSize || 12,
      margin: normalized.pageNumbers?.margin || normalized.resize?.margin || 24,
      batesPrefix: normalized.bates?.prefix || '',
      batesStart: normalized.bates?.start || 1,
      batesDigits: normalized.bates?.digits || 6,
      batesAlign: normalized.bates?.align || 'right',
      batesVertical: normalized.bates?.vertical || 'bottom',
      batesFontSize: normalized.bates?.fontSize || 12,
      batesMargin: normalized.bates?.margin || normalized.resize?.margin || 24,
      stampImageDataUrl: normalized.stamp?.imageDataUrl || '',
      stampPosition: normalized.stamp?.position || 'bottomRight',
      stampOpacity: normalized.stamp?.opacity || 0.92,
      stampScale: normalized.stamp?.scale || 18,
      stampMargin: normalized.stamp?.margin || 24,
      stampRotate: normalized.stamp?.rotate || -8
    });
  }

  if (normalized.grayscale) {
    output = await convertPdfToGrayscaleBuffer(output);
  }
  if (normalized.invertColors) {
    output = await invertPdfColorsBuffer(output, filename);
  }
  if (normalized.scanEffect) {
    output = await applyScanEffectBuffer(output, normalized.scanEffect.level);
  }
  if (normalized.ocr) {
    output = await applyOcrToPdfBuffer(output, normalized.ocr.language || 'chi_sim+eng');
  }
  if (normalized.compression) {
    output = await compressPdfBuffer(output, normalized.compression.level || 'medium');
  }
  if (normalized.headerFooter) {
    output = await addHeaderFooterBuffer(output, filename, normalized.headerFooter);
  }
  if (normalized.metadata) {
    output = await updatePdfMetadataBuffer(output, filename, normalized.metadata);
  }
  if (normalized.pdfa) {
    output = await convertPdfToPdfaBuffer(output, normalized.pdfa.level || '2b');
  }
  if (normalized.security) {
    output = await securePdfBuffer(output, {
      action: normalized.security.action || 'encrypt',
      password: String(normalized.security.password || '')
    });
  }

  return output;
}

async function visualEditPdf(files, recipe) {
  const sources = await Promise.all(
    files.map(async (file) => {
      const pdf = await loadPdf(file.buffer, file.originalname);
      return {
        file,
        pdf,
        pageCount: pdf.getPageCount()
      };
    })
  );

  const normalized = normalizeVisualRecipe(recipe, sources);
  const orderedPages = normalized.pages.filter((page) => !page.deleted);
  const out = await PDFDocument.create();
  const pagesBySource = new Map();

  orderedPages.forEach((page, index) => {
    if (page.kind !== 'source') {
      return;
    }
    if (!pagesBySource.has(page.fileIndex)) {
      pagesBySource.set(page.fileIndex, []);
    }
    pagesBySource.get(page.fileIndex).push({ page, index });
  });

  const orderedOutputPages = new Array(orderedPages.length);
  for (const [fileIndex, group] of pagesBySource.entries()) {
    const copiedPages = await out.copyPages(
      sources[fileIndex].pdf,
      group.map(({ page }) => page.sourceIndex)
    );
    group.forEach(({ index }, copiedIndex) => {
      orderedOutputPages[index] = copiedPages[copiedIndex];
    });
  }

  orderedPages.forEach((state, index) => {
    let page = orderedOutputPages[index];
    if (state.kind === 'blank') {
      page = out.addPage([state.width || 595, state.height || 842]);
      orderedOutputPages[index] = page;
    }
    if (!page) {
      throw new Error(`导出失败：第 ${index + 1} 页未能正确生成。`);
    }

    const nextRotation = (page.getRotation().angle + state.rotation + 360) % 360;
    page.setRotation(degrees(nextRotation));

    const meta = normalized.visualMetadata[index];
    if (meta) {
      const { width: pageW, height: pageH } = page.getSize();
      if (meta.crop) {
        const cropX = meta.crop.x * pageW;
        const cropY = (1 - meta.crop.y - meta.crop.h) * pageH;
        const cropW = meta.crop.w * pageW;
        const cropH = meta.crop.h * pageH;
        if (cropW > 0 && cropH > 0) {
          page.setCropBox(cropX, cropY, cropW, cropH);
        }
      }

      if (Array.isArray(meta.annotations) && meta.annotations.length > 0) {
        meta.annotations.forEach((annotation) => {
          if (annotation.type === 'pencil' && annotation.points.length >= 2) {
            for (let pointIndex = 0; pointIndex < annotation.points.length - 1; pointIndex += 1) {
              const start = annotation.points[pointIndex];
              const end = annotation.points[pointIndex + 1];
              page.drawLine({
                start: { x: start[0] * pageW, y: (1 - start[1]) * pageH },
                end: { x: end[0] * pageW, y: (1 - end[1]) * pageH },
                thickness: 2,
                color: rgb(0.86, 0.15, 0.15),
                opacity: 0.8
              });
            }
          }
        });
      }
    }

    if (state.kind === 'source') {
      out.addPage(page);
    }
  });

  let bytes = await out.save({ useObjectStreams: true, addDefaultPage: false });
  const baseFilename = files.length === 1 ? files[0].originalname : 'workbench.pdf';
  bytes = await applyVisualPostProcessing(bytes, baseFilename, normalized);

  if (normalized.toImages?.enabled) {
    return {
      kind: 'zip',
      bytes: await convertPdfToImagesZipBuffer(bytes, normalized.toImages.options || {})
    };
  }

  if (normalized.split) {
    return {
      kind: 'zip',
      bytes: await splitPdfBuffer(bytes, baseFilename, normalized.split)
    };
  }

  return { kind: 'pdf', bytes };
}

module.exports = {
  visualEditPdf
};
