import {
  clampUnit,
  mapOriginalPointToDisplay,
  mapOriginalRectToDisplay,
  normalizePageRotation
} from "./editor-geometry.js?v=0414b";
import {
  clampAnnotationRect,
  drawArrowOnCanvas,
  drawSelectedAnnotationOutline,
  getAnnotationCanvasScale,
  rgbaFromHex,
  wrapCanvasTextLines
} from "./editor-annotation-utils.js?v=0414b";

function resolveManagedOverlayMount(targetElement) {
  const surface = targetElement.closest(".thumb-page-surface");
  const stage = targetElement.closest(".thumb-page-stage");
  const container = surface || stage || targetElement.closest(".thumb-preview");
  return {
    surface,
    stage,
    container
  };
}

function redrawManagedPreviewOverlay({
  documentApi = globalThis.document,
  overlayId = "editorCanvasOverlay",
  page,
  showCropFrame,
  drawOverlay
}) {
  const overlay = documentApi?.getElementById?.(overlayId);
  if (!overlay || !page) return false;

  drawOverlay?.(overlay, page, {
    coordinateSpace: "display",
    showCropFrame
  });
  return true;
}

function mountManagedPreviewOverlay({
  documentApi = globalThis.document,
  requestFrame = globalThis.requestAnimationFrame,
  targetElement,
  page,
  overlayId = "editorCanvasOverlay",
  overlayClassName = "edit-overlay-container",
  showCropFrame,
  drawOverlay,
  setupOverlayEvents
}) {
  const existingOverlay = documentApi?.getElementById?.(overlayId);
  if (existingOverlay) {
    existingOverlay.remove();
  }

  const { surface, stage, container } = resolveManagedOverlayMount(targetElement);
  if (!container) return false;

  const overlay = documentApi.createElement("canvas");
  overlay.id = overlayId;
  overlay.className = overlayClassName;

  const mountOverlay = () => {
    overlay.width = targetElement.width;
    overlay.height = targetElement.height;

    overlay.style.position = "absolute";
    overlay.style.inset = surface || stage ? "0" : "auto";
    overlay.style.left = surface || stage ? "0" : `${targetElement.offsetLeft}px`;
    overlay.style.top = surface || stage ? "0" : `${targetElement.offsetTop}px`;
    overlay.style.width = surface || stage ? "100%" : `${targetElement.offsetWidth}px`;
    overlay.style.height = surface || stage ? "100%" : `${targetElement.offsetHeight}px`;
    overlay.style.pointerEvents = "auto";
    overlay.style.touchAction = "none";
    overlay.draggable = false;

    container.appendChild(overlay);

    drawOverlay?.(overlay, page, {
      coordinateSpace: "display",
      showCropFrame
    });
    setupOverlayEvents?.(overlay, page, targetElement.width, targetElement.height);
  };

  requestFrame?.(mountOverlay);
  return true;
}

function drawManagedOverlayData({
  overlay,
  page,
  coordinateSpace = "original",
  showCropFrame = false,
  selectedAnnotation = null
}) {
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const rotation = normalizePageRotation(page?.rotation);
  const toCanvasRect = (rect) => {
    const mappedRect =
      coordinateSpace === "display"
        ? mapOriginalRectToDisplay(rect, rotation)
        : clampAnnotationRect(rect);
    if (!mappedRect) return null;

    return {
      x: mappedRect.x * overlay.width,
      y: mappedRect.y * overlay.height,
      w: mappedRect.w * overlay.width,
      h: mappedRect.h * overlay.height
    };
  };

  const toCanvasPoint = (point) => {
    const mappedPoint =
      coordinateSpace === "display"
        ? mapOriginalPointToDisplay(point, rotation)
        : { x: clampUnit(point?.x), y: clampUnit(point?.y) };

    return {
      x: mappedPoint.x * overlay.width,
      y: mappedPoint.y * overlay.height
    };
  };

  const canvasScale = getAnnotationCanvasScale(overlay, page);

  if (page.annotations && page.annotations.length > 0) {
    page.annotations.forEach((annotation, annotationIndex) => {
      if (annotation.type === "text-highlight" && Array.isArray(annotation.rects)) {
        ctx.save();
        ctx.fillStyle = "rgba(255, 218, 121, 0.42)";
        annotation.rects.forEach((rect) => {
          const canvasRect = toCanvasRect(rect);
          if (!canvasRect) return;
          ctx.fillRect(canvasRect.x, canvasRect.y, canvasRect.w, canvasRect.h);
        });
        ctx.restore();
        return;
      }

      if (annotation.type === "text-underline" && Array.isArray(annotation.rects)) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 119, 61, 0.95)";
        ctx.lineCap = "round";
        annotation.rects.forEach((rect) => {
          const canvasRect = toCanvasRect(rect);
          if (!canvasRect) return;
          const x = canvasRect.x;
          const y = canvasRect.y + canvasRect.h - 1;
          const w = canvasRect.w;
          const thickness = Math.max(2, canvasRect.h * 0.12);
          ctx.lineWidth = thickness;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + w, y);
          ctx.stroke();
        });
        ctx.restore();
        return;
      }

      if (annotation.type === "rect" && annotation.rect) {
        const canvasRect = toCanvasRect(annotation.rect);
        if (!canvasRect) return;

        ctx.save();
        ctx.fillStyle = rgbaFromHex(annotation.fillColor, annotation.fillOpacity ?? 0.14, "#2dd4bf");
        ctx.strokeStyle = rgbaFromHex(annotation.strokeColor, annotation.strokeOpacity ?? 0.94, "#0f766e");
        ctx.lineWidth = Math.max(1.5, Number(annotation.lineWidth || 2) * canvasScale);
        ctx.fillRect(canvasRect.x, canvasRect.y, canvasRect.w, canvasRect.h);
        ctx.strokeRect(canvasRect.x, canvasRect.y, canvasRect.w, canvasRect.h);
        ctx.restore();

        if (selectedAnnotation?.index === annotationIndex) {
          drawSelectedAnnotationOutline(ctx, annotation, toCanvasRect, toCanvasPoint, canvasScale);
        }
        return;
      }

      if (annotation.type === "arrow" && annotation.start && annotation.end) {
        drawArrowOnCanvas(ctx, toCanvasPoint(annotation.start), toCanvasPoint(annotation.end), {
          color: rgbaFromHex(annotation.strokeColor, annotation.strokeOpacity ?? 0.96, "#2563eb"),
          lineWidth: Math.max(1.5, Number(annotation.lineWidth || 2.5) * canvasScale)
        });

        if (selectedAnnotation?.index === annotationIndex) {
          drawSelectedAnnotationOutline(ctx, annotation, toCanvasRect, toCanvasPoint, canvasScale);
        }
        return;
      }

      if (annotation.type === "textbox" && annotation.rect && annotation.text) {
        const canvasRect = toCanvasRect(annotation.rect);
        if (!canvasRect) return;

        const lineWidth = Math.max(1, Number(annotation.lineWidth || 1.25) * canvasScale);
        const padding = Math.max(6, Number(annotation.padding || 8) * canvasScale);
        const fontSize = Math.max(12, Number(annotation.fontSize || 14) * canvasScale);
        const textWidth = Math.max(12, canvasRect.w - padding * 2);
        const textHeight = Math.max(0, canvasRect.h - padding * 2);

        ctx.save();
        ctx.fillStyle = rgbaFromHex(annotation.fillColor, annotation.fillOpacity ?? 0.9, "#fff7ed");
        ctx.strokeStyle = rgbaFromHex(annotation.strokeColor, annotation.strokeOpacity ?? 0.9, "#f97316");
        ctx.lineWidth = lineWidth;
        ctx.fillRect(canvasRect.x, canvasRect.y, canvasRect.w, canvasRect.h);
        ctx.strokeRect(canvasRect.x, canvasRect.y, canvasRect.w, canvasRect.h);
        ctx.fillStyle = rgbaFromHex(annotation.textColor, annotation.textOpacity ?? 0.98, "#111827");
        ctx.font = `500 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textBaseline = "top";
        const lines = wrapCanvasTextLines(ctx, annotation.text, textWidth);
        const lineHeight = fontSize * 1.35;
        const clipX = canvasRect.x + padding;
        const clipY = canvasRect.y + padding;
        ctx.beginPath();
        ctx.rect(clipX, clipY, textWidth, textHeight);
        ctx.clip();
        lines.forEach((line, index) => {
          const y = clipY + index * lineHeight;
          if (y + lineHeight > clipY + textHeight + 1) return;
          ctx.fillText(line, clipX, y);
        });
        ctx.restore();

        if (selectedAnnotation?.index === annotationIndex) {
          drawSelectedAnnotationOutline(ctx, annotation, toCanvasRect, toCanvasPoint, canvasScale);
        }
        return;
      }

      if (annotation.type === "pencil" && annotation.points.length >= 2) {
        ctx.save();
        ctx.strokeStyle = rgbaFromHex(annotation.strokeColor, annotation.strokeOpacity ?? 0.8, "#dc2626");
        ctx.lineWidth = Math.max(1.25, Number(annotation.lineWidth || 2) * canvasScale);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const firstPoint = toCanvasPoint({ x: annotation.points[0][0], y: annotation.points[0][1] });
        ctx.beginPath();
        ctx.moveTo(firstPoint.x, firstPoint.y);
        for (let index = 1; index < annotation.points.length; index += 1) {
          const nextPoint = toCanvasPoint({
            x: annotation.points[index][0],
            y: annotation.points[index][1]
          });
          ctx.lineTo(nextPoint.x, nextPoint.y);
        }
        ctx.stroke();
        ctx.restore();

        if (selectedAnnotation?.index === annotationIndex) {
          drawSelectedAnnotationOutline(ctx, annotation, toCanvasRect, toCanvasPoint, canvasScale);
        }
      }
    });
  }

  if (page.crop && showCropFrame) {
    const cropRect = toCanvasRect(page.crop);
    if (!cropRect) return;

    const cropX = cropRect.x;
    const cropY = cropRect.y;
    const cropW = cropRect.w;
    const cropH = cropRect.h;

    ctx.save();
    ctx.fillStyle = "rgba(37, 99, 235, 0.14)";
    ctx.fillRect(0, 0, overlay.width, cropY);
    ctx.fillRect(0, cropY, cropX, cropH);
    ctx.fillRect(cropX + cropW, cropY, overlay.width - cropX - cropW, cropH);
    ctx.fillRect(0, cropY + cropH, overlay.width, overlay.height - cropY - cropH);
    ctx.restore();

    ctx.strokeStyle = "#2563eb";
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropW, cropH);
    ctx.setLineDash([]);
  }
}
