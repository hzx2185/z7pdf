const path = require('path');
const fsSync = require('fs');
const fs = require('fs').promises;
const os = require('os');
const JSZip = require('jszip');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { PDFDocument, StandardFonts, BlendMode, rgb, degrees } = require('pdf-lib');

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
const { drawHeaderFooter } = require('./visual-annotation-service');

const execFileAsync = promisify(execFile);

const PDFA_LEVEL_MAP = {
  '1b': 1,
  '2b': 2,
  '3b': 3
};

function normalizePageRotation(rotation) {
  return ((Number(rotation || 0) % 360) + 360) % 360;
}

function resolveVisiblePageBox(page) {
  const cropBox = typeof page?.getCropBox === 'function' ? page.getCropBox() : null;
  if (cropBox && cropBox.width > 0 && cropBox.height > 0) {
    return {
      width: cropBox.width,
      height: cropBox.height
    };
  }

  return {
    width: Number(page?.getWidth?.() || 0),
    height: Number(page?.getHeight?.() || 0)
  };
}

function resolveDrawImagePlacement(pageWidth, pageHeight, imageWidth, imageHeight) {
  const pageIsLandscape = pageWidth > pageHeight;
  const imageIsLandscape = imageWidth > imageHeight;

  if (pageIsLandscape === imageIsLandscape) {
    return {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      rotate: 0
    };
  }

  if (pageIsLandscape) {
    return {
      x: pageWidth,
      y: 0,
      width: pageHeight,
      height: pageWidth,
      rotate: 90
    };
  }

  return {
    x: 0,
    y: pageHeight,
    width: pageHeight,
    height: pageWidth,
    rotate: 270
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
    const sourcePdf = await loadPdf(buffer, 'scan-source.pdf');
    const sourcePageLayouts = sourcePdf.getPages().map((page) => {
      const visibleBox = resolveVisiblePageBox(page);
      const rotation = normalizePageRotation(page.getRotation().angle);
      const isQuarterTurn = rotation === 90 || rotation === 270;
      return {
        width: isQuarterTurn ? visibleBox.height : visibleBox.width,
        height: isQuarterTurn ? visibleBox.width : visibleBox.height
      };
    });

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
      const pageLayout = sourcePageLayouts[outPdf.getPageCount()] || null;
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
      const pageWidth = Math.max(1, Number(pageLayout?.width || embeddedJpg.width));
      const pageHeight = Math.max(1, Number(pageLayout?.height || embeddedJpg.height));
      const page = outPdf.addPage([pageWidth, pageHeight]);
      const placement = resolveDrawImagePlacement(
        pageWidth,
        pageHeight,
        embeddedJpg.width,
        embeddedJpg.height
      );
      page.drawImage(embeddedJpg, {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        rotate: placement.rotate ? degrees(placement.rotate) : undefined
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

module.exports = {
  applyVisualPostProcessing,
  splitPdfBuffer,
  convertPdfToImagesZipBuffer
};
