import {
  mapOriginalRectToDisplay,
  normalizePageRotation
} from "./editor-geometry.js?v=0414b";

const MANAGED_PAGE_SIZE_MAP = {
  A3: { width: 841.89, height: 1190.55 },
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 420.94, height: 595.28 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 }
};

function computeManagedViewportContainSize(srcWidth, srcHeight, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / srcWidth, targetHeight / srcHeight);
  return {
    width: Math.max(1, srcWidth * scale),
    height: Math.max(1, srcHeight * scale)
  };
}

function computeManagedViewportKeepSize(srcWidth, srcHeight, targetWidth, targetHeight) {
  const scale = Math.min(1, targetWidth / srcWidth, targetHeight / srcHeight);
  return {
    width: Math.max(1, srcWidth * scale),
    height: Math.max(1, srcHeight * scale)
  };
}

export function cloneManagedCrop(crop) {
  if (!crop) return null;
  return {
    x: Number(crop.x || 0),
    y: Number(crop.y || 0),
    w: Number(crop.w || 0),
    h: Number(crop.h || 0)
  };
}

export function areManagedCropsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) < 0.0001 &&
    Math.abs(a.y - b.y) < 0.0001 &&
    Math.abs(a.w - b.w) < 0.0001 &&
    Math.abs(a.h - b.h) < 0.0001
  );
}

export function clampManagedCropToBounds(crop) {
  if (!crop) return null;
  const width = Math.min(1, Math.max(0.005, Number(crop.w || 0)));
  const height = Math.min(1, Math.max(0.005, Number(crop.h || 0)));
  return {
    x: Math.min(1 - width, Math.max(0, Number(crop.x || 0))),
    y: Math.min(1 - height, Math.max(0, Number(crop.y || 0))),
    w: width,
    h: height
  };
}

export function invalidateManagedPageDisplayCache(page) {
  if (!page) return;
  page.displayCanvas = null;
  page.displayCanvasSource = null;
  page.displayCanvasRotation = null;
}

export function getManagedPageDisplayCanvas({
  page,
  documentApi = globalThis.document
}) {
  const sourceCanvas = page?.canvas;
  if (!(sourceCanvas instanceof HTMLCanvasElement)) return null;
  if (sourceCanvas.width <= 0 || sourceCanvas.height <= 0) return null;

  const rotation = normalizePageRotation(page.rotation);
  if (rotation === 0) {
    invalidateManagedPageDisplayCache(page);
    return sourceCanvas;
  }

  if (
    page.displayCanvas &&
    page.displayCanvasSource === sourceCanvas &&
    page.displayCanvasRotation === rotation
  ) {
    return page.displayCanvas;
  }

  const rotatedCanvas = documentApi.createElement("canvas");
  if (rotation === 90 || rotation === 270) {
    rotatedCanvas.width = sourceCanvas.height;
    rotatedCanvas.height = sourceCanvas.width;
  } else {
    rotatedCanvas.width = sourceCanvas.width;
    rotatedCanvas.height = sourceCanvas.height;
  }

  const context = rotatedCanvas.getContext("2d");
  if (!context) return sourceCanvas;

  context.save();
  if (rotation === 90) {
    context.translate(rotatedCanvas.width, 0);
    context.rotate(Math.PI / 2);
  } else if (rotation === 180) {
    context.translate(rotatedCanvas.width, rotatedCanvas.height);
    context.rotate(Math.PI);
  } else if (rotation === 270) {
    context.translate(0, rotatedCanvas.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(sourceCanvas, 0, 0);
  context.restore();

  page.displayCanvas = rotatedCanvas;
  page.displayCanvasSource = sourceCanvas;
  page.displayCanvasRotation = rotation;
  return rotatedCanvas;
}

function shouldManagedShowFullPageWhileEditing({
  state,
  page
}) {
  return state.activeTool === "crop" && state.previewPage === page;
}

export function getManagedDisplayCropRect({
  state,
  page,
  ignoreEditingState = false
}) {
  const crop = ignoreEditingState
    ? clampManagedCropToBounds(page?.crop)
    : (
      shouldManagedShowFullPageWhileEditing({ state, page })
        ? null
        : clampManagedCropToBounds(page?.crop)
    );
  if (!crop) {
    return { x: 0, y: 0, w: 1, h: 1 };
  }
  return mapOriginalRectToDisplay(crop, page.rotation) || { x: 0, y: 0, w: 1, h: 1 };
}

export function applyManagedPageStageViewport({
  state,
  stage,
  surface,
  page,
  displayCanvas
}) {
  if (!stage || !surface) return;

  const fullWidth = Math.max(1, displayCanvas?.width || page?.canvas?.width || 1);
  const fullHeight = Math.max(1, displayCanvas?.height || page?.canvas?.height || 1);
  const visibleRect = getManagedDisplayCropRect({
    state,
    page
  });
  const visibleWidth = Math.max(1, Math.round(fullWidth * visibleRect.w));
  const visibleHeight = Math.max(1, Math.round(fullHeight * visibleRect.h));
  const rotation = normalizePageRotation(page?.rotation);
  const previewSettings = state?.pagePreviewSettings || {};
  const pageSizeConfig = MANAGED_PAGE_SIZE_MAP[previewSettings.pageSize] || null;
  const previewEnabled = Boolean(previewSettings.enabled && pageSizeConfig);
  const visibleAspectRatio = visibleWidth / Math.max(1, visibleHeight);
  const resolvedOrientation =
    previewSettings.orientation === "landscape" || previewSettings.orientation === "portrait"
      ? previewSettings.orientation
      : visibleWidth > visibleHeight
        ? "landscape"
        : "portrait";
  const targetPageWidth = previewEnabled
    ? (resolvedOrientation === "landscape" ? Math.max(pageSizeConfig.width, pageSizeConfig.height) : Math.min(pageSizeConfig.width, pageSizeConfig.height))
    : visibleWidth;
  const targetPageHeight = previewEnabled
    ? (resolvedOrientation === "landscape" ? Math.min(pageSizeConfig.width, pageSizeConfig.height) : Math.max(pageSizeConfig.width, pageSizeConfig.height))
    : visibleHeight;
  const previewMargin = previewEnabled ? Math.max(0, Number(previewSettings.margin || 0)) : 0;
  const availableWidth = Math.max(1, targetPageWidth - previewMargin * 2);
  const availableHeight = Math.max(1, targetPageHeight - previewMargin * 2);
  let drawBoxWidth = visibleWidth;
  let drawBoxHeight = visibleHeight;

  if (previewEnabled) {
    if (previewSettings.fitMode === "stretch") {
      drawBoxWidth = availableWidth;
      drawBoxHeight = availableHeight;
    } else {
      const fitted = previewSettings.fitMode === "keep"
        ? computeManagedViewportKeepSize(
          visibleWidth,
          visibleHeight,
          availableWidth,
          availableHeight
        )
        : computeManagedViewportContainSize(
          visibleWidth,
          visibleHeight,
          availableWidth,
          availableHeight
        );
      drawBoxWidth = fitted.width;
      drawBoxHeight = fitted.height;
    }
  }

  const pageShape =
    visibleAspectRatio >= 3.2
      ? "long-landscape"
      : visibleAspectRatio <= (1 / 3.2)
        ? "long-portrait"
        : "regular";
  const computeSpecialStageSize = () => {
    if (pageShape === "long-portrait") {
      const scale = Math.min(140 / visibleWidth, 320 / visibleHeight);
      return {
        width: Math.max(24, Math.round(visibleWidth * scale)),
        height: Math.max(80, Math.round(visibleHeight * scale))
      };
    }
    if (pageShape === "long-landscape") {
      const scale = Math.min(320 / visibleWidth, 180 / visibleHeight);
      return {
        width: Math.max(80, Math.round(visibleWidth * scale)),
        height: Math.max(24, Math.round(visibleHeight * scale))
      };
    }
    return null;
  };
  const specialStageSize = computeSpecialStageSize();

  stage.style.aspectRatio = `${targetPageWidth} / ${targetPageHeight}`;
  stage.dataset.rotation = String(rotation);
  stage.dataset.pageShape = pageShape;
  surface.dataset.rotation = String(rotation);
  stage.style.background = previewEnabled
    ? String(previewSettings.backgroundColor || "#ffffff")
    : "";

  if (specialStageSize) {
    stage.style.width = `${specialStageSize.width}px`;
    stage.style.height = `${specialStageSize.height}px`;
    stage.style.maxWidth = "100%";
  } else {
    stage.style.width = "100%";
    stage.style.height = "";
    stage.style.maxWidth = "";
  }

  const drawBoxLeft = ((targetPageWidth - drawBoxWidth) / 2 / targetPageWidth) * 100;
  const drawBoxTop = ((targetPageHeight - drawBoxHeight) / 2 / targetPageHeight) * 100;
  const drawBoxWidthPercent = (drawBoxWidth / targetPageWidth) * 100;
  const drawBoxHeightPercent = (drawBoxHeight / targetPageHeight) * 100;

  surface.style.width = `${drawBoxWidthPercent / Math.max(visibleRect.w, 0.005)}%`;
  surface.style.height = `${drawBoxHeightPercent / Math.max(visibleRect.h, 0.005)}%`;
  surface.style.left = `${drawBoxLeft - (drawBoxWidthPercent * visibleRect.x / Math.max(visibleRect.w, 0.005))}%`;
  surface.style.top = `${drawBoxTop - (drawBoxHeightPercent * visibleRect.y / Math.max(visibleRect.h, 0.005))}%`;
}

export function removeManagedCropLivePreview({
  documentApi = globalThis.document
}) {
  documentApi.getElementById("editorCropLivePreview")?.remove();
}

export function ensureManagedCropLivePreview({
  state,
  thumbGrid,
  page,
  documentApi = globalThis.document
}) {
  if (state.activeTool !== "crop" || !page) {
    removeManagedCropLivePreview({ documentApi });
    return null;
  }

  const card = thumbGrid.querySelector(`[data-page-id="${page.id}"]`);
  const preview = card?.querySelector(".thumb-preview");
  if (!preview) return null;

  let root = preview.querySelector("#editorCropLivePreview");
  if (!root) {
    root = documentApi.createElement("div");
    root.id = "editorCropLivePreview";
    root.className = "crop-live-preview";
    root.innerHTML = `
      <div class="crop-live-preview-head">
        <span>实时裁剪预览</span>
      </div>
      <canvas class="crop-live-preview-canvas" width="220" height="180"></canvas>
      <div class="crop-live-preview-meta">拖动裁剪框后即时更新</div>
    `;
    preview.appendChild(root);
  }

  return {
    root,
    canvas: root.querySelector(".crop-live-preview-canvas"),
    meta: root.querySelector(".crop-live-preview-meta")
  };
}

export function renderManagedCropLivePreview({
  state,
  thumbGrid,
  page,
  getPageDisplayCanvas,
  documentApi = globalThis.document
}) {
  const elements = ensureManagedCropLivePreview({
    state,
    thumbGrid,
    page,
    documentApi
  });
  if (!elements) return;

  const { canvas, meta } = elements;
  const context = canvas?.getContext("2d");
  const displayCanvas = getPageDisplayCanvas?.(page);
  if (!canvas || !context || !displayCanvas) return;

  const cropRect = getManagedDisplayCropRect({
    state,
    page,
    ignoreEditingState: true
  });
  const sx = Math.round(cropRect.x * displayCanvas.width);
  const sy = Math.round(cropRect.y * displayCanvas.height);
  const sw = Math.max(1, Math.round(cropRect.w * displayCanvas.width));
  const sh = Math.max(1, Math.round(cropRect.h * displayCanvas.height));
  const previewHeight = 180;
  const previewWidth = Math.max(120, Math.min(260, Math.round(previewHeight * (sw / Math.max(1, sh)))));

  if (canvas.width !== previewWidth || canvas.height !== previewHeight) {
    canvas.width = previewWidth;
    canvas.height = previewHeight;
  }
  elements.root.style.width = `${previewWidth + 20}px`;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f6efe6";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const pad = 12;
  const availableWidth = Math.max(1, canvas.width - pad * 2);
  const availableHeight = Math.max(1, canvas.height - pad * 2);
  const scale = Math.min(availableWidth / sw, availableHeight / sh);
  const drawWidth = Math.max(1, sw * scale);
  const drawHeight = Math.max(1, sh * scale);
  const dx = (canvas.width - drawWidth) / 2;
  const dy = (canvas.height - drawHeight) / 2;

  context.save();
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(74, 52, 36, 0.18)";
  context.shadowBlur = 12;
  context.shadowOffsetY = 4;
  context.fillRect(dx, dy, drawWidth, drawHeight);
  context.shadowColor = "transparent";
  context.drawImage(displayCanvas, sx, sy, sw, sh, dx, dy, drawWidth, drawHeight);
  context.strokeStyle = "rgba(15, 108, 115, 0.36)";
  context.lineWidth = 1;
  context.strokeRect(dx + 0.5, dy + 0.5, Math.max(0, drawWidth - 1), Math.max(0, drawHeight - 1));
  context.restore();

  if (!page.crop) {
    meta.textContent = "拖动或移动裁剪框后显示最终效果";
  } else {
    meta.textContent = `保留 ${Math.round(cropRect.w * 100)}% × ${Math.round(cropRect.h * 100)}%`;
  }
}

export function isManagedPointInCrop(coords, crop) {
  if (!coords || !crop) return false;
  return (
    coords.x >= crop.x &&
    coords.x <= crop.x + crop.w &&
    coords.y >= crop.y &&
    coords.y <= crop.y + crop.h
  );
}
