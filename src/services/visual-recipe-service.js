const OCR_LANGUAGE_WHITELIST = new Set([
  'eng',
  'chi_sim',
  'chi_sim+eng',
  'eng+chi_sim'
]);

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
            orientation: ['portrait', 'landscape', 'auto'].includes(
              String(recipe.resize.orientation || 'auto').trim()
            )
              ? String(recipe.resize.orientation || 'auto').trim()
              : 'auto',
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

module.exports = {
  normalizeVisualRecipe
};
