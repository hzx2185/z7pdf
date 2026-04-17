function clampMappedRect(rect) {
  const x = Math.min(1, Math.max(0, Number(rect?.x || 0)));
  const y = Math.min(1, Math.max(0, Number(rect?.y || 0)));
  const w = Math.min(1 - x, Math.max(0, Number(rect?.w || 0)));
  const h = Math.min(1 - y, Math.max(0, Number(rect?.h || 0)));
  if (w < 0.001 || h < 0.001) {
    return null;
  }
  return { x, y, w, h };
}

function rectFromPoints(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  const xs = points.map((point) => clampUnit(point?.x));
  const ys = points.map((point) => clampUnit(point?.y));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return clampMappedRect({
    x: minX,
    y: minY,
    w: Math.max(0, maxX - minX),
    h: Math.max(0, maxY - minY)
  });
}

export function normalizePageRotation(rotation) {
  return ((Number(rotation || 0) % 360) + 360) % 360;
}

export function clampUnit(value) {
  return Math.min(1, Math.max(0, Number(value || 0)));
}

export function mapOriginalPointToDisplay(point, rotation = 0) {
  const x = clampUnit(point?.x);
  const y = clampUnit(point?.y);
  switch (normalizePageRotation(rotation)) {
    case 90:
      return { x: 1 - y, y: x };
    case 180:
      return { x: 1 - x, y: 1 - y };
    case 270:
      return { x: y, y: 1 - x };
    default:
      return { x, y };
  }
}

export function mapDisplayPointToOriginal(point, rotation = 0) {
  const x = clampUnit(point?.x);
  const y = clampUnit(point?.y);
  switch (normalizePageRotation(rotation)) {
    case 90:
      return { x: y, y: 1 - x };
    case 180:
      return { x: 1 - x, y: 1 - y };
    case 270:
      return { x: 1 - y, y: x };
    default:
      return { x, y };
  }
}

export function mapOriginalRectToDisplay(rect, rotation = 0) {
  if (!rect) return null;
  return rectFromPoints([
    mapOriginalPointToDisplay({ x: rect.x, y: rect.y }, rotation),
    mapOriginalPointToDisplay({ x: rect.x + rect.w, y: rect.y }, rotation),
    mapOriginalPointToDisplay({ x: rect.x, y: rect.y + rect.h }, rotation),
    mapOriginalPointToDisplay({ x: rect.x + rect.w, y: rect.y + rect.h }, rotation)
  ]);
}

export function mapDisplayRectToOriginal(rect, rotation = 0) {
  if (!rect) return null;
  return rectFromPoints([
    mapDisplayPointToOriginal({ x: rect.x, y: rect.y }, rotation),
    mapDisplayPointToOriginal({ x: rect.x + rect.w, y: rect.y }, rotation),
    mapDisplayPointToOriginal({ x: rect.x, y: rect.y + rect.h }, rotation),
    mapDisplayPointToOriginal({ x: rect.x + rect.w, y: rect.y + rect.h }, rotation)
  ]);
}
