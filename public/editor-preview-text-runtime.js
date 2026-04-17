import { clampAnnotationRect } from "./editor-annotation-utils.js?v=0414b";
import { mapDisplayRectToOriginal, normalizePageRotation } from "./editor-geometry.js?v=0414b";
import { mergeTextAnnotationRects } from "./editor-search-runtime.js?v=0414b";

export function applyLayerFrame(layerElement, canvasElement, rotation = 0) {
  const normalizedRotation = ((Number(rotation || 0) % 360) + 360) % 360;
  layerElement.dataset.rotation = String(normalizedRotation);
  const useStageFrame = canvasElement instanceof Element && canvasElement.classList.contains("thumb-page-stage");
  const useSurfaceFrame = canvasElement instanceof Element && canvasElement.classList.contains("thumb-page-surface");
  layerElement.style.inset = useStageFrame || useSurfaceFrame ? "0" : "auto";
  layerElement.style.left = useStageFrame || useSurfaceFrame ? "0" : `${canvasElement.offsetLeft}px`;
  layerElement.style.top = useStageFrame || useSurfaceFrame ? "0" : `${canvasElement.offsetTop}px`;
  layerElement.style.right = "auto";
  layerElement.style.bottom = "auto";
  layerElement.style.width = useStageFrame || useSurfaceFrame ? "100%" : `${canvasElement.offsetWidth}px`;
  layerElement.style.height = useStageFrame || useSurfaceFrame ? "100%" : `${canvasElement.offsetHeight}px`;
  layerElement.style.transformOrigin = "center center";
  layerElement.style.transform = useSurfaceFrame ? "" : (normalizedRotation ? `rotate(${normalizedRotation}deg)` : "");
}

export function mapClientRectToStageAnnotationRect(clientRect, stageElement, scale = 1) {
  if (!stageElement) return null;

  const stageRect = stageElement.getBoundingClientRect();
  const stageWidth = Math.max(1, stageElement.offsetWidth || Number.parseFloat(stageElement.style.width) || 1);
  const stageHeight = Math.max(1, stageElement.offsetHeight || Number.parseFloat(stageElement.style.height) || 1);
  const safeScale = Math.max(0.01, Number(scale || 1));
  const rotation = ((parseInt(stageElement.dataset.rotation || "0", 10) % 360) + 360) % 360;
  const left = clientRect.left - stageRect.left;
  const top = clientRect.top - stageRect.top;
  const width = clientRect.width;
  const height = clientRect.height;

  let x = 0;
  let y = 0;
  let w = width / safeScale;
  let h = height / safeScale;

  if (rotation === 90) {
    x = top / safeScale;
    y = stageHeight - (left + width) / safeScale;
    w = height / safeScale;
    h = width / safeScale;
  } else if (rotation === 180) {
    x = stageWidth - (left + width) / safeScale;
    y = stageHeight - (top + height) / safeScale;
  } else if (rotation === 270) {
    x = stageWidth - (top + height) / safeScale;
    y = left / safeScale;
    w = height / safeScale;
    h = width / safeScale;
  } else {
    x = left / safeScale;
    y = top / safeScale;
  }

  return clampAnnotationRect({
    x: x / stageWidth,
    y: y / stageHeight,
    w: w / stageWidth,
    h: h / stageHeight
  });
}

export function mapClientRectToOriginalAnnotationRect(clientRect, surfaceElement) {
  if (!surfaceElement) return null;

  const surfaceRect = surfaceElement.getBoundingClientRect();
  const surfaceWidth = Math.max(1, surfaceRect.width || surfaceElement.offsetWidth || 1);
  const surfaceHeight = Math.max(1, surfaceRect.height || surfaceElement.offsetHeight || 1);
  const displayRect = clampAnnotationRect({
    x: (clientRect.left - surfaceRect.left) / surfaceWidth,
    y: (clientRect.top - surfaceRect.top) / surfaceHeight,
    w: clientRect.width / surfaceWidth,
    h: clientRect.height / surfaceHeight
  });

  if (!displayRect) return null;
  return mapDisplayRectToOriginal(displayRect, normalizePageRotation(surfaceElement.dataset.rotation));
}

export function getTextSelectionSnapshot({
  hostElement,
  mapClientRect,
  pageRef = {},
  selection = globalThis.window?.getSelection?.()
}) {
  if (!hostElement || typeof mapClientRect !== "function") {
    return null;
  }

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const ancestor =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;

  if (!(ancestor instanceof Node) || !hostElement.contains(ancestor)) {
    return null;
  }

  const selectedText = selection.toString().replace(/\s+/g, " ").trim();
  if (!selectedText) {
    return null;
  }

  const rects = mergeTextAnnotationRects(
    Array.from(range.getClientRects())
      .filter((rect) => rect.width > 1 && rect.height > 1)
      .map(mapClientRect)
      .filter(Boolean)
  );

  if (rects.length === 0) {
    return null;
  }

  const bound = range.getBoundingClientRect();
  return {
    ...pageRef,
    text: selectedText,
    rects,
    anchorX: bound.left + bound.width / 2,
    top: bound.top,
    bottom: bound.bottom
  };
}

function attachTextLayerInteractions(
  container,
  {
    stopEvents = [],
    selectionSyncEvents = [],
    onSelectionSync
  } = {}
) {
  stopEvents.forEach((eventName) => {
    container.addEventListener(eventName, (event) => {
      event.stopPropagation();
      if (eventName === "dragstart") {
        event.preventDefault();
      }
    });
  });

  selectionSyncEvents.forEach((eventName) => {
    container.addEventListener(eventName, () => {
      onSelectionSync?.();
    });
  });
}

function resolveTextLayerViewport({
  pdfPage,
  rotation = 0,
  canvas = null,
  fallbackScale = 1.5
}) {
  if (!canvas) {
    return pdfPage.getViewport({ scale: fallbackScale });
  }

  const baseViewport = pdfPage.getViewport({ scale: 1, rotation });
  const displayWidth = Math.max(1, canvas.offsetWidth);
  const scale = baseViewport.width > 0 ? displayWidth / baseViewport.width : fallbackScale;
  return pdfPage.getViewport({ scale, rotation });
}

export async function renderManagedTextLayer({
  pdfjsLib,
  page,
  getTextContent,
  stage,
  canvas = null,
  rotation = 0,
  fallbackScale = 1.5,
  isCurrent,
  className = "preview-text-layer textLayer",
  userSelect = "",
  prepareContainer,
  stopEvents = [],
  selectionSyncEvents = [],
  onSelectionSync,
  assignLayer,
  isAssignedLayer,
  cancelAssignedLayer,
  onReady,
  warnMessage = "Text layer render failed"
}) {
  try {
    const [pdfPage, textContent] = await Promise.all([
      page.pdf.getPage(page.sourceIndex + 1),
      getTextContent(page)
    ]);

    if (!textContent || !isCurrent()) {
      return;
    }

    const viewport = resolveTextLayerViewport({
      pdfPage,
      rotation,
      canvas,
      fallbackScale
    });

    const textLayerContainer = document.createElement("div");
    textLayerContainer.className = className;
    textLayerContainer.style.setProperty("--scale-factor", String(viewport.scale));
    if (userSelect) {
      textLayerContainer.style.webkitUserSelect = userSelect;
    }
    prepareContainer?.(textLayerContainer, viewport);
    attachTextLayerInteractions(textLayerContainer, {
      stopEvents,
      selectionSyncEvents,
      onSelectionSync
    });

    stage.appendChild(textLayerContainer);

    if (!isCurrent()) {
      textLayerContainer.remove();
      return;
    }

    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: textLayerContainer,
      viewport
    });

    assignLayer?.(textLayer, textLayerContainer, viewport);

    await textLayer.render();

    if (!isCurrent()) {
      if (isAssignedLayer?.(textLayer)) {
        cancelAssignedLayer?.();
      } else {
        textLayerContainer.remove();
      }
      return;
    }

    textLayerContainer.classList.add("is-ready");
    onReady?.(textLayer, textLayerContainer, viewport);
  } catch (error) {
    if (isCurrent()) {
      console.warn(warnMessage, error);
    }
  }
}

export function resolveWorkspaceMountTargets(thumbGrid, pageId) {
  const card = thumbGrid.querySelector(`[data-page-id="${pageId}"]`);
  const preview = card?.querySelector(".thumb-preview");
  const stage = card?.querySelector(".thumb-page-stage");
  const surface = stage?.querySelector(".thumb-page-surface") || stage;
  const canvas = surface?.querySelector("canvas") || preview?.querySelector("canvas");
  return { card, preview, stage, surface, canvas };
}

export function canMountWorkspaceTargets(targets) {
  return Boolean(
    targets.card &&
    targets.preview &&
    targets.stage &&
    targets.surface &&
    targets.canvas &&
    targets.canvas.offsetWidth > 0 &&
    targets.canvas.offsetHeight > 0
  );
}

export function isWorkspaceMountCurrent(textEditorState, pageId, surface, canvas) {
  return (
    textEditorState.pageId === pageId &&
    textEditorState.previewRef === surface &&
    textEditorState.canvasRef === canvas
  );
}

function assignWorkspaceMountState(textEditorState, { loadingToken, pageId, card, surface, canvas }) {
  textEditorState.loadingToken = loadingToken;
  textEditorState.pageId = pageId;
  textEditorState.cardRef = card;
  textEditorState.previewRef = surface;
  textEditorState.canvasRef = canvas;
}

export function createManagedCanvasLayer({
  className,
  canvas,
  surface,
  rotation = 0,
  applyLayerFrame: applyFrame = applyLayerFrame
}) {
  const layer = document.createElement("canvas");
  layer.className = className;
  layer.width = Math.max(1, Math.round(canvas.offsetWidth));
  layer.height = Math.max(1, Math.round(canvas.offsetHeight));
  applyFrame(layer, surface, rotation);
  surface.appendChild(layer);
  return layer;
}

export function prepareWorkspaceTextEditorMount({
  textEditorState,
  page,
  card,
  surface,
  canvas,
  applyLayerFrame: applyFrame = applyLayerFrame
}) {
  const loadingToken = Symbol("workspace-text-layer");
  assignWorkspaceMountState(textEditorState, {
    loadingToken,
    pageId: page.id,
    card,
    surface,
    canvas
  });

  card.classList.add("workspace-text-editing");
  card.draggable = false;

  const searchCanvas = createManagedCanvasLayer({
    className: "workspace-search-layer",
    canvas,
    surface,
    rotation: page.rotation || 0,
    applyLayerFrame: applyFrame
  });

  const annotationCanvas = createManagedCanvasLayer({
    className: "workspace-annotation-layer",
    canvas,
    surface,
    rotation: page.rotation || 0,
    applyLayerFrame: applyFrame
  });

  textEditorState.searchCanvasRef = searchCanvas;
  textEditorState.annotationCanvasRef = annotationCanvas;
  textEditorState.surfaceRef = annotationCanvas;

  return { loadingToken, searchCanvas, annotationCanvas };
}

export function syncManagedWorkspaceTextEditor({
  page,
  previousPageId,
  textEditorState,
  thumbGrid,
  resolveMountTargets,
  canMountTargets,
  isMountCurrent,
  clearTextEditor,
  onMissingTargets,
  onAlreadyMounted,
  prepareMount,
  renderAnnotationLayer,
  startTextLayerRender,
  updateUndoAvailability
}) {
  if (!page) {
    clearTextEditor({ clearSelection: previousPageId !== null });
    updateUndoAvailability?.();
    return;
  }

  const { card, preview, stage, surface, canvas } = resolveMountTargets(thumbGrid, page.id);

  if (!canMountTargets({ card, preview, stage, surface, canvas })) {
    onMissingTargets?.(page);
    clearTextEditor({ clearSelection: previousPageId !== page.id });
    updateUndoAvailability?.();
    return;
  }

  if (isMountCurrent(textEditorState, page.id, surface, canvas)) {
    onAlreadyMounted?.();
    updateUndoAvailability?.();
    return;
  }

  clearTextEditor({ clearSelection: previousPageId !== page.id });

  const { loadingToken } = prepareMount({
    textEditorState,
    page,
    card,
    surface,
    canvas
  });

  renderAnnotationLayer?.();

  if (!page.isBlank && page.pdf) {
    startTextLayerRender?.(page, surface, canvas, loadingToken);
  }

  updateUndoAvailability?.();
}

export function syncManagedSelectionToolbar({
  isSuppressed,
  getSnapshot,
  hideToolbar,
  showToolbar
}) {
  if (isSuppressed?.()) {
    hideToolbar?.();
    return;
  }

  const selectionSnapshot = getSnapshot?.();
  if (!selectionSnapshot) {
    hideToolbar?.();
    return;
  }

  showToolbar?.(selectionSnapshot);
}

export function refreshManagedSelectionToolbar({
  hasSelection,
  getSnapshot,
  hideToolbar,
  applySnapshot
}) {
  if (!hasSelection?.()) return;

  const selectionSnapshot = getSnapshot?.();
  if (!selectionSnapshot) {
    hideToolbar?.();
    return;
  }

  applySnapshot?.(selectionSnapshot);
}

export function applyManagedTextSelectionAnnotation({
  type,
  selectionSnapshot,
  page,
  isSelectionValid,
  clearToolbar,
  ensurePageState,
  pushVisualHistory,
  updateThumbCard,
  updateMeta,
  renderPrimaryLayer,
  renderSecondaryLayer,
  updateUndoAvailability,
  setResult,
  buildMessage
}) {
  if (!selectionSnapshot || !page || !isSelectionValid?.(selectionSnapshot, page)) {
    clearToolbar?.({ clearSelection: true });
    return false;
  }

  ensurePageState?.(page);
  const annotation = {
    type,
    text: selectionSnapshot.text,
    rects: selectionSnapshot.rects.map((rect) => ({ ...rect }))
  };

  page.annotations.push(annotation);
  pushVisualHistory?.(page, {
    type: "annotation-add",
    index: page.annotations.length - 1
  });

  updateThumbCard?.(page);
  updateMeta?.();
  renderPrimaryLayer?.(page);
  renderSecondaryLayer?.(page);
  updateUndoAvailability?.();
  clearToolbar?.({ clearSelection: true });
  setResult?.(buildMessage ? buildMessage(type) : "");
  return true;
}
