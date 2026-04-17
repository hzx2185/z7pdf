const { PDFDocument, degrees } = require('pdf-lib');

const { loadPdf } = require('./pdf-service');
const { drawVisualAnnotation } = require('./visual-annotation-service');
const { applyVisualPostProcessing, splitPdfBuffer, convertPdfToImagesZipBuffer } = require('./visual-postprocess-service');
const { normalizeVisualRecipe } = require('./visual-recipe-service');

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

async function appendNormalizedSourcePage(out, srcPage, extraRotation = 0) {
  const visibleBox = resolveVisiblePageBox(srcPage);
  const sourceRotation = normalizePageRotation(srcPage.getRotation().angle);
  const totalRotation = normalizePageRotation(sourceRotation + extraRotation);
  const isQuarterTurn = totalRotation === 90 || totalRotation === 270;
  const layoutWidth = isQuarterTurn ? visibleBox.height : visibleBox.width;
  const layoutHeight = isQuarterTurn ? visibleBox.width : visibleBox.height;
  const embeddedPage = await out.embedPage(srcPage, {
    left: visibleBox.left,
    bottom: visibleBox.bottom,
    right: visibleBox.right,
    top: visibleBox.top
  });

  const page = out.addPage([layoutWidth, layoutHeight]);
  let drawX = 0;
  let drawY = 0;
  let drawWidth = visibleBox.width;
  let drawHeight = visibleBox.height;
  let drawRotation = 0;

  if (totalRotation === 90) {
    drawX = layoutWidth;
    drawWidth = layoutHeight;
    drawHeight = layoutWidth;
    drawRotation = 90;
  } else if (totalRotation === 180) {
    drawX = layoutWidth;
    drawY = layoutHeight;
    drawRotation = 180;
  } else if (totalRotation === 270) {
    drawY = layoutHeight;
    drawWidth = layoutHeight;
    drawHeight = layoutWidth;
    drawRotation = 270;
  }

  page.drawPage(embeddedPage, {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
    rotate: degrees(drawRotation)
  });

  return page;
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

  for (const [index, state] of orderedPages.entries()) {
    let page = null;
    if (state.kind === 'blank') {
      page = out.addPage([state.width || 595, state.height || 842]);
    } else {
      page = await appendNormalizedSourcePage(
        out,
        sources[state.fileIndex].pdf.getPage(state.sourceIndex),
        state.rotation
      );
    }
    if (!page) {
      throw new Error(`导出失败：第 ${index + 1} 页未能正确生成。`);
    }

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
        for (const annotation of meta.annotations) {
          await drawVisualAnnotation(out, page, annotation, pageW, pageH);
        }
      }
    }
  }

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
