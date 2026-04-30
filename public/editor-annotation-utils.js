import { clampUnit } from "./editor-geometry.js?v=0414b";

function pointInRect(point, rect, padding = 0) {
  if (!point || !rect) return false;
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.w + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.h + padding
  );
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < 0.000001 && Math.abs(dy) < 0.000001) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
    )
  );
  const closestX = start.x + dx * projection;
  const closestY = start.y + dy * projection;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function getRectHandlePoints(rect) {
  return {
    nw: { x: rect.x, y: rect.y },
    ne: { x: rect.x + rect.w, y: rect.y },
    sw: { x: rect.x, y: rect.y + rect.h },
    se: { x: rect.x + rect.w, y: rect.y + rect.h }
  };
}

function applyDeltaToPoint(point, dx, dy) {
  return {
    x: clampUnit(Number(point?.x || 0) + dx),
    y: clampUnit(Number(point?.y || 0) + dy)
  };
}

function getAnnotationMoveDelta(bounds, dx, dy) {
  const safeBounds = bounds || { x: 0, y: 0, w: 0, h: 0 };
  const clampedDx = Math.min(1 - (safeBounds.x + safeBounds.w), Math.max(-safeBounds.x, dx));
  const clampedDy = Math.min(1 - (safeBounds.y + safeBounds.h), Math.max(-safeBounds.y, dy));
  return { dx: clampedDx, dy: clampedDy };
}

function moveRectWithinBounds(rect, dx, dy) {
  if (!rect) return null;
  return {
    x: Math.min(1 - rect.w, Math.max(0, rect.x + dx)),
    y: Math.min(1 - rect.h, Math.max(0, rect.y + dy)),
    w: rect.w,
    h: rect.h
  };
}

export function cloneAnnotation(annotation) {
  return {
    ...annotation,
    points: Array.isArray(annotation?.points)
      ? annotation.points.map((point) => [Number(point[0] || 0), Number(point[1] || 0)])
      : [],
    rect: annotation?.rect
      ? {
          x: Number(annotation.rect.x || 0),
          y: Number(annotation.rect.y || 0),
          w: Number(annotation.rect.w || 0),
          h: Number(annotation.rect.h || 0)
        }
      : null,
    rects: Array.isArray(annotation?.rects)
      ? annotation.rects.map((rect) => ({
          x: Number(rect?.x || 0),
          y: Number(rect?.y || 0),
          w: Number(rect?.w || 0),
          h: Number(rect?.h || 0)
        }))
      : [],
    start: annotation?.start
      ? {
          x: Number(annotation.start.x || 0),
          y: Number(annotation.start.y || 0)
        }
      : null,
    end: annotation?.end
      ? {
          x: Number(annotation.end.x || 0),
          y: Number(annotation.end.y || 0)
        }
      : null
  };
}

export function clampAnnotationRect(rect) {
  const x = Math.min(1, Math.max(0, Number(rect?.x || 0)));
  const y = Math.min(1, Math.max(0, Number(rect?.y || 0)));
  const w = Math.min(1 - x, Math.max(0, Number(rect?.w || 0)));
  const h = Math.min(1 - y, Math.max(0, Number(rect?.h || 0)));
  if (w < 0.001 || h < 0.001) {
    return null;
  }
  return { x, y, w, h };
}

export function clampAnnotationPoint(point) {
  return {
    x: clampUnit(point?.x),
    y: clampUnit(point?.y)
  };
}

export function getAnnotationCanvasScale(overlay, page) {
  const pageWidth = Math.max(1, Number(page?.width || overlay?.width || 1));
  const pageHeight = Math.max(1, Number(page?.height || overlay?.height || 1));
  const scaleX = Math.max(0.01, overlay.width / pageWidth);
  const scaleY = Math.max(0.01, overlay.height / pageHeight);
  return (scaleX + scaleY) / 2;
}

export function rgbaFromHex(input, opacity = 1, fallback = "#111827") {
  const value = String(input || fallback).trim();
  const source = /^#?[0-9a-fA-F]{6}$/.test(value)
    ? (value.startsWith("#") ? value.slice(1) : value)
    : (fallback.startsWith("#") ? fallback.slice(1) : fallback);
  const alpha = Math.min(1, Math.max(0, Number(opacity ?? 1)));
  return `rgba(${Number.parseInt(source.slice(0, 2), 16)}, ${Number.parseInt(source.slice(2, 4), 16)}, ${Number.parseInt(source.slice(4, 6), 16)}, ${alpha})`;
}

export function distanceBetweenPoints(start, end) {
  const dx = Number(end?.x || 0) - Number(start?.x || 0);
  const dy = Number(end?.y || 0) - Number(start?.y || 0);
  return Math.hypot(dx, dy);
}

export function drawArrowOnCanvas(ctx, start, end, { color, lineWidth = 2 } = {}) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;

  const angle = Math.atan2(dy, dx);
  const headLength = Math.min(length * 0.32, Math.max(lineWidth * 5, 14));
  const headAngle = Math.PI / 7;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - headAngle),
    end.y - headLength * Math.sin(angle - headAngle)
  );
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + headAngle),
    end.y - headLength * Math.sin(angle + headAngle)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function wrapCanvasTextLines(ctx, text, maxWidth) {
  const safeWidth = Math.max(12, Number(maxWidth || 0));
  const paragraphs = String(text || "").split(/\r?\n/);
  const lines = [];

  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push("");
      return;
    }

    let current = "";
    for (const character of paragraph) {
      if (!current && /\s/.test(character)) {
        continue;
      }
      const candidate = current + character;
      if (current && ctx.measureText(candidate).width > safeWidth) {
        lines.push(current.trimEnd());
        current = /\s/.test(character) ? "" : character;
      } else {
        current = candidate;
      }
    }

    lines.push((current || paragraph).trimEnd());
  });

  return lines.length > 0 ? lines : [""];
}

export function createTextBoxRect(origin, text) {
  const lines = String(text || "").split(/\r?\n/);
  const lineCount = Math.max(1, lines.length);
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const width = Math.min(0.52, Math.max(0.22, 0.12 + longestLine * 0.014));
  const height = Math.min(0.36, Math.max(0.1, 0.05 + lineCount * 0.05));
  return clampAnnotationRect({
    x: Math.min(Math.max(0, origin?.x ?? 0), 1 - width),
    y: Math.min(Math.max(0, origin?.y ?? 0), 1 - height),
    w: width,
    h: height
  });
}

function getAnnotationBounds(annotation) {
  if (!annotation) return null;
  if ((annotation.type === "rect" || annotation.type === "textbox") && annotation.rect) {
    return clampAnnotationRect(annotation.rect);
  }
  if (annotation.type === "arrow" && annotation.start && annotation.end) {
    const pad = 0.006;
    return clampAnnotationRect({
      x: Math.max(0, Math.min(annotation.start.x, annotation.end.x) - pad),
      y: Math.max(0, Math.min(annotation.start.y, annotation.end.y) - pad),
      w: Math.abs(annotation.end.x - annotation.start.x) + pad * 2,
      h: Math.abs(annotation.end.y - annotation.start.y) + pad * 2
    });
  }
  if (annotation.type === "pencil" && Array.isArray(annotation.points) && annotation.points.length > 0) {
    const xs = annotation.points.map((point) => Number(point?.[0] || 0));
    const ys = annotation.points.map((point) => Number(point?.[1] || 0));
    const pad = 0.006;
    return clampAnnotationRect({
      x: Math.max(0, Math.min(...xs) - pad),
      y: Math.max(0, Math.min(...ys) - pad),
      w: Math.max(...xs) - Math.min(...xs) + pad * 2,
      h: Math.max(...ys) - Math.min(...ys) + pad * 2
    });
  }
  return null;
}

export function isDirectSelectableAnnotation(annotation) {
  return ["pencil", "rect", "arrow", "textbox"].includes(annotation?.type);
}

export function findSelectableAnnotationIndexAtPoint(page, point) {
  const annotations = Array.isArray(page?.annotations) ? page.annotations : [];
  const tolerance = 0.014;

  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    const annotation = annotations[index];
    if (!isDirectSelectableAnnotation(annotation)) continue;

    if ((annotation.type === "rect" || annotation.type === "textbox") && annotation.rect) {
      if (pointInRect(point, annotation.rect, tolerance)) {
        return index;
      }
      continue;
    }

    if (annotation.type === "arrow" && annotation.start && annotation.end) {
      const bounds = getAnnotationBounds(annotation);
      if (!bounds || !pointInRect(point, bounds, tolerance * 1.5)) {
        continue;
      }
      if (pointToSegmentDistance(point, annotation.start, annotation.end) <= tolerance) {
        return index;
      }
      continue;
    }

    if (annotation.type === "pencil" && Array.isArray(annotation.points) && annotation.points.length >= 2) {
      const bounds = getAnnotationBounds(annotation);
      if (!bounds || !pointInRect(point, bounds, tolerance * 1.5)) {
        continue;
      }

      for (let pointIndex = 0; pointIndex < annotation.points.length - 1; pointIndex += 1) {
        const start = {
          x: Number(annotation.points[pointIndex]?.[0] || 0),
          y: Number(annotation.points[pointIndex]?.[1] || 0)
        };
        const end = {
          x: Number(annotation.points[pointIndex + 1]?.[0] || 0),
          y: Number(annotation.points[pointIndex + 1]?.[1] || 0)
        };
        if (pointToSegmentDistance(point, start, end) <= tolerance) {
          return index;
        }
      }
    }
  }

  return -1;
}

export function getAnnotationHandleAtPoint(annotation, point, tolerance = 0.018) {
  if (!annotation || !point) return null;

  if ((annotation.type === "rect" || annotation.type === "textbox") && annotation.rect) {
    const handles = getRectHandlePoints(annotation.rect);
    for (const [handle, coords] of Object.entries(handles)) {
      if (Math.hypot(point.x - coords.x, point.y - coords.y) <= tolerance) {
        return handle;
      }
    }
    return null;
  }

  if (annotation.type === "arrow" && annotation.start && annotation.end) {
    if (Math.hypot(point.x - annotation.start.x, point.y - annotation.start.y) <= tolerance) {
      return "start";
    }
    if (Math.hypot(point.x - annotation.end.x, point.y - annotation.end.y) <= tolerance) {
      return "end";
    }
  }

  return null;
}

export function getSelectedAnnotationCursor(annotation, point) {
  const handle = getAnnotationHandleAtPoint(annotation, point);
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  if (handle === "start" || handle === "end") return "grab";
  if (!annotation) return null;

  if (annotation.type === "rect" || annotation.type === "textbox") {
    return pointInRect(point, annotation.rect, 0.014) ? "move" : null;
  }
  if (annotation.type === "arrow") {
    return findSelectableAnnotationIndexAtPoint({ annotations: [annotation] }, point) >= 0 ? "move" : null;
  }
  if (annotation.type === "pencil") {
    return findSelectableAnnotationIndexAtPoint({ annotations: [annotation] }, point) >= 0 ? "move" : null;
  }
  return null;
}

export function moveAnnotationFromSnapshot(annotation, dx, dy) {
  if (!annotation) return null;

  if ((annotation.type === "rect" || annotation.type === "textbox") && annotation.rect) {
    const delta = getAnnotationMoveDelta(annotation.rect, dx, dy);
    return {
      ...annotation,
      rect: moveRectWithinBounds(annotation.rect, delta.dx, delta.dy)
    };
  }

  if (annotation.type === "arrow" && annotation.start && annotation.end) {
    const bounds = getAnnotationBounds(annotation);
    const delta = getAnnotationMoveDelta(bounds, dx, dy);
    return {
      ...annotation,
      start: applyDeltaToPoint(annotation.start, delta.dx, delta.dy),
      end: applyDeltaToPoint(annotation.end, delta.dx, delta.dy)
    };
  }

  if (annotation.type === "pencil" && Array.isArray(annotation.points) && annotation.points.length > 0) {
    const bounds = getAnnotationBounds(annotation);
    const delta = getAnnotationMoveDelta(bounds, dx, dy);
    return {
      ...annotation,
      points: annotation.points.map((point) => [
        clampUnit(Number(point?.[0] || 0) + delta.dx),
        clampUnit(Number(point?.[1] || 0) + delta.dy)
      ])
    };
  }

  return cloneAnnotation(annotation);
}

export function resizeRectFromHandle(rect, handle, point, minSize = 0.03) {
  if (!rect || !handle || !point) return null;

  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;
  let nextLeft = left;
  let nextRight = right;
  let nextTop = top;
  let nextBottom = bottom;

  if (handle === "nw" || handle === "sw") {
    nextLeft = Math.min(right - minSize, Math.max(0, point.x));
  }
  if (handle === "ne" || handle === "se") {
    nextRight = Math.max(left + minSize, Math.min(1, point.x));
  }
  if (handle === "nw" || handle === "ne") {
    nextTop = Math.min(bottom - minSize, Math.max(0, point.y));
  }
  if (handle === "sw" || handle === "se") {
    nextBottom = Math.max(top + minSize, Math.min(1, point.y));
  }

  return clampAnnotationRect({
    x: nextLeft,
    y: nextTop,
    w: nextRight - nextLeft,
    h: nextBottom - nextTop
  });
}

export function updateArrowEndpointFromSnapshot(annotation, endpoint, point) {
  if (!annotation || annotation.type !== "arrow") return null;
  const nextPoint = clampAnnotationPoint(point);
  return {
    ...annotation,
    start: endpoint === "start" ? nextPoint : clampAnnotationPoint(annotation.start),
    end: endpoint === "end" ? nextPoint : clampAnnotationPoint(annotation.end)
  };
}

export function drawSelectedAnnotationOutline(ctx, annotation, toCanvasRect, toCanvasPoint, canvasScale) {
  const bounds = getAnnotationBounds(annotation);
  const canvasRect = toCanvasRect(bounds);
  if (!canvasRect) return;

  const pad = Math.max(4, canvasScale * 6);
  ctx.save();
  ctx.strokeStyle = "rgba(37, 99, 235, 0.95)";
  ctx.setLineDash([8, 5]);
  ctx.lineWidth = Math.max(1.5, canvasScale * 1.5);
  ctx.strokeRect(
    canvasRect.x - pad,
    canvasRect.y - pad,
    canvasRect.w + pad * 2,
    canvasRect.h + pad * 2
  );
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(37, 99, 235, 0.95)";
  ctx.fillRect(canvasRect.x - pad - 1, canvasRect.y - pad - 1, pad + 2, pad + 2);

  if ((annotation.type === "rect" || annotation.type === "textbox") && annotation.rect) {
    const handles = getRectHandlePoints(annotation.rect);
    Object.values(handles).forEach((handlePoint) => {
      const canvasPoint = toCanvasPoint(handlePoint);
      const size = Math.max(8, canvasScale * 12);
      ctx.fillRect(canvasPoint.x - size / 2, canvasPoint.y - size / 2, size, size);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1.5, canvasScale * 1.2);
      ctx.strokeRect(canvasPoint.x - size / 2, canvasPoint.y - size / 2, size, size);
    });
  }

  if (annotation.type === "arrow" && annotation.start && annotation.end) {
    [annotation.start, annotation.end].forEach((handlePoint) => {
      const size = Math.max(5, canvasScale * 7);
      const canvasPoint = toCanvasPoint(handlePoint);
      ctx.beginPath();
      ctx.arc(canvasPoint.x, canvasPoint.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1.5, canvasScale * 1.2);
      ctx.stroke();
    });
  }
  ctx.restore();
}

export function promptTextBoxText(initialText = "") {
  const rawText = window.prompt("请输入文本内容，换行可输入 \\n", String(initialText || ""));
  if (rawText == null) return null;
  const nextText = String(rawText).replace(/\\n/g, "\n").trim();
  return nextText || null;
}
