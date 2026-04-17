import { mapDisplayPointToOriginal } from "./editor-geometry.js?v=0414b";
import {
  cloneAnnotation,
  findSelectableAnnotationIndexAtPoint
} from "./editor-annotation-utils.js?v=0414b";
import {
  deleteManagedVisualAnnotation,
  undoManagedPreviewEdit,
  updateManagedVisualUndoAvailability
} from "./editor-history-runtime.js?v=0414b";
import {
  applyManagedOverlayAnnotationInteraction,
  beginManagedOverlayAnnotationInteraction,
  drawManagedOverlayData,
  editManagedOverlayTextBox,
  attachManagedOverlayEvents,
  finalizeManagedDraftAnnotation,
  finalizeManagedOverlayAnnotationInteraction,
  mountManagedPreviewOverlay,
  redrawManagedPreviewOverlay,
  selectManagedOverlayAnnotation,
  updateManagedOverlayCursor
} from "./editor-overlay-runtime.js?v=0414b";
import {
  setManagedPreviewTool,
  syncManagedPreviewToolButtons
} from "./editor-preview-runtime.js?v=0414b";

export function ensureManagedPreviewPageState(page) {
  if (!page) return;
  if (!Array.isArray(page.annotations)) {
    page.annotations = [];
  }
  if (!Array.isArray(page.visualHistory)) {
    page.visualHistory = [];
  }
}

export function getManagedPreviewToolHelper(tool) {
  if (tool === "pencil") {
    return "按住拖动画线，点已有标注可选中，按 Delete 删除；支持 Ctrl/Cmd+Z 撤销。";
  }
  if (tool === "rect") {
    return "拖出一个矩形标注区域；选中后可拖动移动或拖角点缩放，按 Delete 删除。";
  }
  if (tool === "arrow") {
    return "按住拖出箭头方向；选中后可拖动移动或拖端点改方向，按 Delete 删除。";
  }
  if (tool === "textbox") {
    return "单击页面放置文本框；选中后可拖动移动或拖角点缩放，双击可改内容，按 Delete 删除。";
  }
  if (tool === "crop") {
    return "拖出保留区域，已有裁剪框时可在框内按住拖动微调位置。";
  }
  return "先选中一个页面，再用画线、矩形、箭头、文本或裁剪进行编辑。支持 Ctrl/Cmd+Z 撤销，按 Esc 关闭。";
}

export function updateManagedPreviewHelper({
  helperElement,
  message = "",
  tool
}) {
  if (!helperElement) return;
  helperElement.textContent = message || getManagedPreviewToolHelper(tool);
}

export function pushManagedVisualHistory(page, entry) {
  ensureManagedPreviewPageState(page);
  page.visualHistory.push(entry);
}

export function getManagedSelectedVisualAnnotation({
  state,
  page = null
}) {
  const selected = state.selectedVisualAnnotation;
  if (!selected) return null;
  if (page && selected.pageId !== page.id) return null;
  return selected;
}

export function setManagedSelectedVisualAnnotation({
  state,
  page,
  index
}) {
  if (!page || !Number.isInteger(index) || index < 0) {
    state.selectedVisualAnnotation = null;
    return;
  }
  state.selectedVisualAnnotation = {
    pageId: page.id,
    index
  };
}

export function clearManagedSelectedVisualAnnotation({
  state,
  pageId = null
} = {}) {
  if (!state.selectedVisualAnnotation) return;
  if (pageId != null && state.selectedVisualAnnotation.pageId !== pageId) return;
  state.selectedVisualAnnotation = null;
}

function isManagedAnnotationStyleTool(tool) {
  return ["pencil", "rect", "arrow", "textbox"].includes(tool);
}

function annotationManagedToolSupportsFill(tool) {
  return tool === "rect" || tool === "textbox";
}

function annotationManagedToolSupportsText(tool) {
  return tool === "textbox";
}

function normalizeManagedHexColorValue(value, fallback = "#111827") {
  const input = String(value || fallback).trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(input)) {
    return input.startsWith("#") ? input : `#${input}`;
  }
  return fallback.startsWith("#") ? fallback : `#${fallback}`;
}

export function getManagedAnnotationDefaultStyle({
  state,
  tool
}) {
  const defaults = state.annotationDefaults?.[tool];
  return defaults ? { ...defaults } : null;
}

function getManagedAnnotationStyleContext({
  state,
  getActiveVisualPage
}) {
  const page = getActiveVisualPage?.();
  const selected = getManagedSelectedVisualAnnotation({ state, page });
  const annotation =
    page && selected && Array.isArray(page.annotations)
      ? page.annotations[selected.index] || null
      : null;
  const tool = annotation?.type || state.activeTool || null;
  return { page, selected, annotation, tool };
}

export function syncManagedAnnotationStyleBar({
  state,
  controls,
  getActiveVisualPage
}) {
  if (!controls.annotationStyleBar) return;

  const { page, annotation, tool } = getManagedAnnotationStyleContext({
    state,
    getActiveVisualPage
  });
  const visible = Boolean(page && isManagedAnnotationStyleTool(tool) && state.activeTool && state.activeTool !== "crop");
  controls.annotationStyleBar.classList.toggle("hidden", !visible);
  controls.annotationStyleBar.setAttribute("aria-hidden", String(!visible));
  if (!visible) {
    return;
  }

  const defaults = getManagedAnnotationDefaultStyle({ state, tool }) || {};
  const source = annotation || defaults;
  controls.annotationStyleScope.textContent = annotation ? "当前样式" : "新建默认";

  if (controls.annotationStrokeColor) {
    controls.annotationStrokeColor.value = normalizeManagedHexColorValue(
      source.strokeColor,
      defaults.strokeColor || "#111827"
    );
  }
  if (controls.annotationFillColor) {
    controls.annotationFillColor.value = normalizeManagedHexColorValue(
      source.fillColor,
      defaults.fillColor || "#fff7ed"
    );
  }
  if (controls.annotationTextColor) {
    controls.annotationTextColor.value = normalizeManagedHexColorValue(
      source.textColor,
      defaults.textColor || "#111827"
    );
  }
  if (controls.annotationLineWidth) {
    controls.annotationLineWidth.value = String(source.lineWidth ?? defaults.lineWidth ?? 2);
  }

  controls.annotationFillField?.classList.toggle("hidden", !annotationManagedToolSupportsFill(tool));
  controls.annotationTextField?.classList.toggle("hidden", !annotationManagedToolSupportsText(tool));
}

export function refreshManagedActiveAnnotationVisuals({
  state,
  previewModal,
  previewState,
  workspaceTextEditorState,
  page,
  redrawPreviewOverlay,
  renderImmersiveAnnotationLayer,
  renderWorkspaceAnnotationLayer,
  updateThumbCard,
  updateMeta,
  updateUndoAvailability,
  syncAnnotationStyleBar
}) {
  if (state.previewPage === page) {
    redrawPreviewOverlay?.();
  }
  if (!previewModal.classList.contains("hidden") && state.pages[previewState.currentIndex] === page) {
    renderImmersiveAnnotationLayer?.();
  }
  if (workspaceTextEditorState.pageId === page.id) {
    renderWorkspaceAnnotationLayer?.();
  }
  updateThumbCard?.(page);
  updateMeta?.();
  updateUndoAvailability?.();
  syncAnnotationStyleBar?.();
}

export function applyManagedAnnotationStyleControls({
  state,
  controls,
  getActiveVisualPage,
  refreshVisuals,
  setResult
}) {
  const { page, selected, annotation, tool } = getManagedAnnotationStyleContext({
    state,
    getActiveVisualPage
  });
  if (!page || !isManagedAnnotationStyleTool(tool)) {
    return;
  }

  const nextStrokeColor = normalizeManagedHexColorValue(controls.annotationStrokeColor?.value, "#111827");
  const nextFillColor = normalizeManagedHexColorValue(controls.annotationFillColor?.value, "#fff7ed");
  const nextTextColor = normalizeManagedHexColorValue(controls.annotationTextColor?.value, "#111827");
  const nextLineWidth = Number(controls.annotationLineWidth?.value || 2);

  if (annotation && selected) {
    const previousAnnotation = cloneAnnotation(annotation);
    annotation.lineWidth = nextLineWidth;
    if ("strokeColor" in annotation || ["pencil", "rect", "arrow", "textbox"].includes(annotation.type)) {
      annotation.strokeColor = nextStrokeColor;
    }
    if (annotationManagedToolSupportsFill(annotation.type)) {
      annotation.fillColor = nextFillColor;
    }
    if (annotationManagedToolSupportsText(annotation.type)) {
      annotation.textColor = nextTextColor;
    }

    if (JSON.stringify(annotation) !== JSON.stringify(previousAnnotation)) {
      pushManagedVisualHistory(page, {
        type: "annotation-update",
        index: selected.index,
        previousAnnotation
      });
      refreshVisuals?.(page);
      setResult?.("已更新标注样式。");
    } else {
      refreshVisuals?.(page);
    }
    return;
  }

  const defaults = state.annotationDefaults[tool];
  if (!defaults) return;
  defaults.lineWidth = nextLineWidth;
  defaults.strokeColor = nextStrokeColor;
  if (annotationManagedToolSupportsFill(tool)) {
    defaults.fillColor = nextFillColor;
  }
  if (annotationManagedToolSupportsText(tool)) {
    defaults.textColor = nextTextColor;
  }
  refreshVisuals?.(page);
  setResult?.(
    `已更新${tool === "textbox" ? "文本框" : tool === "rect" ? "矩形" : tool === "arrow" ? "箭头" : "画线"}默认样式。`
  );
}

export function getManagedWorkspaceVisualPage({
  state,
  previewModal,
  selectedIndices
}) {
  if (!previewModal.classList.contains("hidden")) {
    return null;
  }

  const indexes = selectedIndices?.() || [];
  if (indexes.length !== 1) {
    return null;
  }

  return state.pages[indexes[0]] || null;
}

export function getManagedActiveVisualPage({
  state,
  previewModal,
  previewState,
  getWorkspaceVisualPage
}) {
  if (state.previewPage) {
    return state.previewPage;
  }
  if (!previewModal.classList.contains("hidden")) {
    return state.pages[previewState.currentIndex] || null;
  }
  return getWorkspaceVisualPage?.();
}

export function deleteManagedSelectedVisualAnnotationController({
  state,
  getActiveVisualPage,
  refreshVisuals,
  setResult
}) {
  const page = getActiveVisualPage?.();
  const selected = getManagedSelectedVisualAnnotation({ state, page });
  return deleteManagedVisualAnnotation({
    page,
    selected,
    clearSelectedAnnotation: ({ pageId } = {}) =>
      clearManagedSelectedVisualAnnotation({ state, pageId }),
    pushVisualHistory: pushManagedVisualHistory,
    cloneAnnotation,
    refreshVisuals,
    setResult
  });
}

export function updateManagedAnnotationUndoAvailabilityController({
  activePage,
  undoButton
}) {
  updateManagedVisualUndoAvailability({
    activePage,
    undoButton
  });
}

export function undoManagedAnnotationEditController({
  state,
  previewState,
  previewModal,
  page,
  redrawPreviewOverlay,
  renderImmersiveAnnotationLayer,
  hidePreviewSelectionToolbar,
  getWorkspaceVisualPage,
  hideWorkspaceSelectionToolbar,
  updateThumbCard,
  updateMeta,
  updateUndoAvailability,
  syncAnnotationStyleBar,
  updatePreviewHelper,
  setResult
}) {
  undoManagedPreviewEdit({
    page,
    state,
    previewState,
    previewModal,
    cloneAnnotation,
    cloneCrop: (crop) => (crop ? { ...crop } : null),
    clearSelectedAnnotation: ({ pageId } = {}) =>
      clearManagedSelectedVisualAnnotation({ state, pageId }),
    redrawPreviewOverlay,
    renderImmersiveAnnotationLayer,
    hidePreviewSelectionToolbar,
    getWorkspaceVisualPage,
    hideWorkspaceSelectionToolbar,
    updateThumbCard,
    updateMeta,
    updateUndoAvailability,
    syncAnnotationStyleBar,
    updatePreviewHelper,
    setResult
  });
}

export function syncManagedPreviewToolButtonsController({
  state,
  controls
}) {
  syncManagedPreviewToolButtons({
    activeTool: state.activeTool,
    controls
  });
}

export function setManagedActivePreviewToolController({
  state,
  tool,
  updateThumbCard,
  removeCropLivePreview,
  clearWorkspaceTextEditor,
  getSelectedIndex,
  openVisualEditorForPage,
  renderCropLivePreview,
  updateMeta,
  ensureInPlaceEditor,
  scheduleWorkspaceTextEditorSync,
  updateUndoAvailability,
  updatePreviewHelper,
  syncAnnotationStyleBar,
  controls
}) {
  setManagedPreviewTool({
    state,
    tool,
    clearSelectedVisualAnnotation: ({ pageId } = {}) =>
      clearManagedSelectedVisualAnnotation({ state, pageId }),
    syncToolButtons: () =>
      syncManagedPreviewToolButtonsController({
        state,
        controls
      }),
    updateThumbCard,
    removeCropLivePreview,
    clearWorkspaceTextEditor,
    getSelectedIndex,
    openVisualEditorForPage,
    renderCropLivePreview,
    updateMeta,
    ensureInPlaceEditor,
    scheduleWorkspaceTextEditorSync,
    updateUndoAvailability,
    updatePreviewHelper,
    syncAnnotationStyleBar
  });
}

export function redrawManagedAnnotationPreviewOverlayController({
  state,
  documentApi = globalThis.document,
  drawExistingPageData
}) {
  redrawManagedPreviewOverlay({
    documentApi,
    page: state.previewPage,
    showCropFrame: state.activeTool === "crop",
    drawOverlay: drawExistingPageData
  });
}

export function mountManagedAnnotationPreviewCanvasController({
  state,
  targetElement,
  page,
  drawExistingPageData,
  setupCanvasEvents,
  documentApi = globalThis.document,
  requestFrame = globalThis.requestAnimationFrame
}) {
  mountManagedPreviewOverlay({
    documentApi,
    requestFrame,
    targetElement,
    page,
    showCropFrame: state.activeTool === "crop",
    drawOverlay: drawExistingPageData,
    setupOverlayEvents: setupCanvasEvents
  });
}

export function drawManagedExistingPageDataController({
  state,
  overlay,
  page,
  options = {}
}) {
  drawManagedOverlayData({
    overlay,
    page,
    coordinateSpace: options.coordinateSpace || "original",
    showCropFrame: Boolean(options.showCropFrame),
    selectedAnnotation: getManagedSelectedVisualAnnotation({ state, page })
  });
}

export function setupManagedAnnotationCanvasEventsController({
  state,
  overlay,
  page,
  previewModal,
  previewState,
  workspaceTextEditorState,
  drawExistingPageData,
  renderImmersiveAnnotationLayer,
  renderWorkspaceAnnotationLayer,
  syncAnnotationStyleBar,
  updateThumbCard,
  updateMeta,
  updateUndoAvailability,
  renderCropLivePreview,
  isPointInCrop,
  cloneCrop,
  clampCropToBounds,
  cropsEqual,
  setResult,
  openPreview
}) {
  const stopOverlayEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const getCoords = (event) => {
    const rect = overlay.getBoundingClientRect();
    const displayPoint = {
      x: (event.clientX - rect.left) / Math.max(1, rect.width),
      y: (event.clientY - rect.top) / Math.max(1, rect.height)
    };
    return mapDisplayPointToOriginal(displayPoint, page.rotation);
  };

  const redrawOverlay = (showCropFrame = state.activeTool === "crop") => {
    drawExistingPageData?.(overlay, page, {
      coordinateSpace: "display",
      showCropFrame
    });
  };

  const refreshLinkedLayers = () => {
    if (!previewModal.classList.contains("hidden") && state.pages[previewState.currentIndex] === page) {
      renderImmersiveAnnotationLayer?.();
    }
    if (workspaceTextEditorState.pageId === page.id) {
      renderWorkspaceAnnotationLayer?.();
    }
  };

  const refreshSelectionDisplay = () => {
    redrawOverlay(state.activeTool === "crop");
    refreshLinkedLayers();
    syncAnnotationStyleBar?.();
  };

  const selectAnnotationAtIndex = (index) => {
    selectManagedOverlayAnnotation({
      index,
      page,
      clearSelectedAnnotation: ({ pageId } = {}) =>
        clearManagedSelectedVisualAnnotation({ state, pageId }),
      setSelectedAnnotation: (currentPage, currentIndex) =>
        setManagedSelectedVisualAnnotation({
          state,
          page: currentPage,
          index: currentIndex
        }),
      refreshSelectionDisplay
    });
  };

  const editTextBoxAtIndex = (index) =>
    editManagedOverlayTextBox({
      index,
      page,
      pushVisualHistory: pushManagedVisualHistory,
      setSelectedAnnotation: (currentPage, currentIndex) =>
        setManagedSelectedVisualAnnotation({
          state,
          page: currentPage,
          index: currentIndex
        }),
      refreshSelectionDisplay,
      updateThumbCard,
      updateMeta,
      updateUndoAvailability,
      setResult
    });

  const beginSelectedAnnotationInteraction = (annotationIndex, point) =>
    beginManagedOverlayAnnotationInteraction({
      annotationIndex,
      point,
      page,
      state,
      overlay,
      setSelectedAnnotation: (currentPage, currentIndex) =>
        setManagedSelectedVisualAnnotation({
          state,
          page: currentPage,
          index: currentIndex
        }),
      refreshSelectionDisplay
    });

  const applySelectedAnnotationInteraction = (point) =>
    applyManagedOverlayAnnotationInteraction({
      point,
      page,
      interaction: state.previewInteraction,
      refreshSelectionDisplay
    });

  const finalizeSelectedAnnotationInteraction = () =>
    finalizeManagedOverlayAnnotationInteraction({
      page,
      state,
      redrawOverlay,
      refreshLinkedLayers,
      updateThumbCard,
      updateMeta,
      pushVisualHistory: pushManagedVisualHistory,
      updateUndoAvailability,
      setSelectedAnnotation: (currentPage, currentIndex) =>
        setManagedSelectedVisualAnnotation({
          state,
          page: currentPage,
          index: currentIndex
        }),
      setResult
    });

  const finalizeDraftAnnotation = () =>
    finalizeManagedDraftAnnotation({
      page,
      state,
      redrawOverlay,
      refreshLinkedLayers,
      updateThumbCard,
      updateMeta,
      pushVisualHistory: pushManagedVisualHistory,
      updateUndoAvailability,
      setSelectedAnnotation: (currentPage, currentIndex) =>
        setManagedSelectedVisualAnnotation({
          state,
          page: currentPage,
          index: currentIndex
        })
    });

  const updateCropCursor = (coords) => {
    updateManagedOverlayCursor({
      overlay,
      page,
      coords,
      activeTool: state.activeTool,
      previewInteraction: state.previewInteraction,
      getSelectedAnnotation: () => getManagedSelectedVisualAnnotation({ state, page }),
      findSelectableAnnotationIndexAtPoint,
      isPointInCrop
    });
  };

  attachManagedOverlayEvents({
    overlay,
    page,
    state,
    stopOverlayEvent,
    getCoords,
    ensurePreviewPageState: ensureManagedPreviewPageState,
    getSelectedAnnotation: () => getManagedSelectedVisualAnnotation({ state, page }),
    setSelectedAnnotation: (currentPage, currentIndex) =>
      setManagedSelectedVisualAnnotation({
        state,
        page: currentPage,
        index: currentIndex
      }),
    clearSelectedAnnotation: ({ pageId } = {}) =>
      clearManagedSelectedVisualAnnotation({ state, pageId }),
    getAnnotationDefaultStyle: (tool) =>
      getManagedAnnotationDefaultStyle({ state, tool }),
    findSelectableAnnotationIndexAtPoint,
    selectAnnotationAtIndex,
    beginSelectedAnnotationInteraction,
    editTextBoxAtIndex,
    refreshSelectionDisplay,
    redrawOverlay,
    refreshLinkedLayers,
    updateThumbCard,
    updateMeta,
    updateUndoAvailability,
    renderCropLivePreview,
    cloneCrop,
    isPointInCrop,
    clampCropToBounds,
    cropsEqual,
    pushVisualHistory: pushManagedVisualHistory,
    setResult,
    openPreview,
    applySelectedAnnotationInteraction,
    finalizeSelectedAnnotationInteraction,
    finalizeDraftAnnotation,
    updateCursor: updateCropCursor
  });
}
