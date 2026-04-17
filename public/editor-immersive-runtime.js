import {
  activateManagedSearch,
  cancelManagedTextLayer,
  clearDomSelection,
  clearSearchHighlightClasses,
  collectSearchMatches,
  computeFloatingToolbarPosition,
  ensurePageSearchIndex,
  executeDocumentSearch,
  getPageTextContent,
  MANAGED_PREVIEW_SEARCH_STATE_KEYS,
  normalizeSearchQuery,
  normalizeSearchText,
  renderSearchMatchClassHighlights,
  resetManagedSearchState,
  scheduleManagedSearch,
  setManagedSearchActiveMatch,
  updateSearchUi
} from "./editor-search-runtime.js?v=0414b";
import {
  closeManagedPreview,
  deleteManagedPreviewPage,
  navigateManagedPreview,
  openManagedPreview,
  renderManagedPreviewAtCurrentIndex,
  rotateManagedPreviewPage,
  updateManagedPreviewPagination,
} from "./editor-preview-runtime.js?v=0414b";
import {
  applyManagedTextSelectionAnnotation,
  getTextSelectionSnapshot,
  mapClientRectToStageAnnotationRect,
  renderManagedTextLayer
} from "./editor-preview-text-runtime.js?v=0414b";

export function createManagedImmersivePreviewState() {
  return {
    scale: 1,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    stageRef: null,
    imgRef: null,
    annotationCanvasRef: null,
    textLayer: null,
    textLayerRef: null,
    loadingToken: null,
    textSelection: null,
    searchQuery: "",
    normalizedSearchQuery: "",
    searchMatches: [],
    searchMatchesByPage: new Map(),
    activeSearchMatchIndex: -1,
    searchTimer: null,
    searchRunId: 0,
    searchPending: false,
    currentIndex: -1
  };
}

function ensureManagedPreviewSearchIndex(page) {
  return ensurePageSearchIndex(page, normalizeSearchText);
}

export function updateManagedImmersiveTransform({
  previewState,
  levelElement
}) {
  if (!previewState.stageRef) return;
  const { scale, translateX, translateY } = previewState;
  const stage = previewState.stageRef;
  const rotation = stage.dataset.rotation || "0";
  stage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotation}deg)`;

  if (levelElement) {
    levelElement.textContent = `${Math.round(scale * 100)}%`;
  }
}

export function resetManagedImmersiveZoom({
  previewState,
  updateTransform,
  fitWidth = false,
  windowApi = globalThis.window
}) {
  if (!previewState.imgRef || !previewState.stageRef) return;
  previewState.translateX = 0;
  previewState.translateY = 0;

  const stage = previewState.stageRef;
  const rotation = parseInt(previewState.stageRef?.dataset.rotation || "0", 10);
  const parent = stage.parentElement;
  if (!parent) {
    previewState.scale = 1;
    updateTransform?.();
    return;
  }

  // Measure the stage at base scale so "适应" truly fits the current viewport container.
  stage.style.transform = `translate(0px, 0px) scale(1) rotate(${rotation}deg)`;
  const stageRect = stage.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const availableWidth = Math.max(120, parentRect.width - 16);
  const availableHeight = Math.max(120, parentRect.height - 16);
  const baseWidth = Math.max(1, stageRect.width);
  const baseHeight = Math.max(1, stageRect.height);
  const scaleX = availableWidth / baseWidth;
  const scaleY = availableHeight / baseHeight;

  if (fitWidth) {
    previewState.scale = Math.max(0.25, Math.min(scaleX, 1));
  } else {
    previewState.scale = Math.max(0.25, Math.min(scaleX, scaleY, 1));
  }

  updateTransform?.();
}

export function cancelManagedImmersiveTextLayer({
  previewState
}) {
  cancelManagedTextLayer(previewState, {
    warnMessage: "Preview text layer cancel failed"
  });
}

export function updateManagedPreviewSearchUiController({
  previewState,
  statusElement,
  prevButton,
  nextButton
}) {
  updateSearchUi({
    statusElement,
    prevButton,
    nextButton,
    pending: previewState.searchPending,
    normalizedQuery: previewState.normalizedSearchQuery,
    matchesLength: previewState.searchMatches.length,
    activeMatchIndex: previewState.activeSearchMatchIndex
  });
}

export function clearManagedPreviewSearchHighlights({
  previewState
}) {
  clearSearchHighlightClasses(previewState.textLayerRef);
}

export function getManagedPreviewSearchMatchesForPage({
  previewState,
  pageIndex
}) {
  return previewState.searchMatchesByPage.get(pageIndex) || [];
}

export function renderManagedPreviewSearchHighlights({
  state,
  previewState
}) {
  const pageIndex = previewState.currentIndex;
  const page = state.pages[pageIndex];
  const pageMatches = getManagedPreviewSearchMatchesForPage({
    previewState,
    pageIndex
  });
  const searchIndex = page?.previewSearchIndex;
  const textDivs = previewState.textLayer?.textDivs || [];
  renderSearchMatchClassHighlights({
    rootElement: previewState.textLayerRef,
    textDivs,
    itemRanges: searchIndex?.itemRanges || [],
    pageMatches,
    activeMatch: previewState.searchMatches[previewState.activeSearchMatchIndex] || null
  });
}

export function hideManagedPreviewSelectionToolbar({
  previewState,
  toolbar,
  clearSelection = false
}) {
  previewState.textSelection = null;

  if (toolbar) {
    toolbar.classList.add("hidden");
    toolbar.setAttribute("aria-hidden", "true");
  }

  if (clearSelection) {
    clearDomSelection();
  }
}

export function positionManagedPreviewSelectionToolbar({
  toolbar,
  previewBody,
  selectionSnapshot
}) {
  if (!toolbar || !previewBody || !selectionSnapshot) return;

  const bodyRect = previewBody.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  const { left, top } = computeFloatingToolbarPosition({
    anchorX: selectionSnapshot.anchorX,
    top: selectionSnapshot.top,
    bottom: selectionSnapshot.bottom,
    toolbarRect,
    boundaryRect: bodyRect
  });

  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
}

export function showManagedPreviewSelectionToolbar({
  previewState,
  toolbar,
  selectionSnapshot,
  positionSelectionToolbar,
  requestFrame = globalThis.requestAnimationFrame
}) {
  previewState.textSelection = selectionSnapshot;

  if (!toolbar) return;

  toolbar.classList.remove("hidden");
  toolbar.setAttribute("aria-hidden", "false");

  requestFrame(() => {
    if (previewState.textSelection === selectionSnapshot) {
      positionSelectionToolbar?.(selectionSnapshot);
    }
  });
}

export function getManagedPreviewTextSelectionSnapshot({
  previewState,
  previewModal
}) {
  if (previewModal.classList.contains("hidden")) {
    return null;
  }

  return getTextSelectionSnapshot({
    hostElement: previewState.textLayerRef,
    mapClientRect: (clientRect) =>
      mapClientRectToStageAnnotationRect(
        clientRect,
        previewState.stageRef,
        previewState.scale
      ),
    pageRef: {
      pageIndex: previewState.currentIndex
    }
  });
}

export function renderManagedImmersiveAnnotationLayerController({
  state,
  previewState,
  drawExistingPageData
}) {
  if (!previewState.annotationCanvasRef) return;
  const page = state.pages[previewState.currentIndex];
  if (!page) return;
  drawExistingPageData?.(previewState.annotationCanvasRef, page);
}

export function applyManagedPreviewTextAnnotationController({
  previewState,
  state,
  type,
  hideSelectionToolbar,
  ensurePageState,
  pushVisualHistory,
  updateThumbCard,
  updateMeta,
  renderImmersiveAnnotationLayer,
  redrawPreviewOverlay,
  updateUndoAvailability,
  setResult
}) {
  const selectionSnapshot = previewState.textSelection;
  const page = state.pages[previewState.currentIndex];
  applyManagedTextSelectionAnnotation({
    type,
    selectionSnapshot,
    page,
    isSelectionValid: (snapshot) => snapshot.pageIndex === previewState.currentIndex,
    clearToolbar: hideSelectionToolbar,
    ensurePageState,
    pushVisualHistory,
    updateThumbCard,
    updateMeta,
    renderPrimaryLayer: () => {
      renderImmersiveAnnotationLayer?.();
    },
    renderSecondaryLayer: (currentPage) => {
      if (state.previewPage === currentPage) {
        redrawPreviewOverlay?.();
      }
    },
    updateUndoAvailability,
    setResult,
    buildMessage: (currentType) =>
      currentType === "text-highlight" ? "已添加文字高亮。" : "已添加文字下划线。"
  });
}

export function resetManagedPreviewSearchStateController({
  previewState,
  clearInput = false,
  inputElement,
  updateUi,
  clearHighlights
}) {
  resetManagedSearchState({
    searchState: previewState,
    clearInput,
    inputElement,
    updateUi,
    clearHighlights,
    keyMap: MANAGED_PREVIEW_SEARCH_STATE_KEYS
  });
}

export function setManagedActivePreviewSearchMatchController({
  previewState,
  index,
  updateUi,
  renderHighlights,
  renderPreviewAtCurrentIndex
}) {
  setManagedSearchActiveMatch({
    searchState: previewState,
    index,
    updateUi,
    renderHighlights,
    keyMap: MANAGED_PREVIEW_SEARCH_STATE_KEYS,
    onSelectMatch: (nextMatch) => {
      if (!nextMatch) {
        renderHighlights?.();
        return;
      }

      if (nextMatch.pageIndex !== previewState.currentIndex) {
        previewState.currentIndex = nextMatch.pageIndex;
        renderPreviewAtCurrentIndex?.();
        return;
      }

      renderHighlights?.();
    }
  });
}

export function stepManagedPreviewSearchController({
  previewState,
  delta,
  setActivePreviewSearchMatch
}) {
  if (previewState.searchMatches.length === 0) return;
  setActivePreviewSearchMatch?.(previewState.activeSearchMatchIndex + delta);
}

export async function runManagedPreviewSearchController({
  state,
  previewState,
  query,
  updateUi,
  clearHighlights,
  renderHighlights,
  setActivePreviewSearchMatch,
  resetSearchState,
  yieldControl,
  consoleApi = globalThis.console
}) {
  const normalizedQuery = normalizeSearchQuery(query);

  previewState.searchQuery = query;
  previewState.normalizedSearchQuery = normalizedQuery;

  if (!normalizedQuery) {
    previewState.searchQuery = "";
    previewState.normalizedSearchQuery = "";
    resetSearchState?.({ clearInput: true });
    return;
  }

  previewState.searchRunId += 1;
  const runId = previewState.searchRunId;
  previewState.searchPending = true;
  previewState.searchMatches = [];
  previewState.searchMatchesByPage = new Map();
  previewState.activeSearchMatchIndex = -1;
  updateUi?.();
  clearHighlights?.();

  try {
    const result = await executeDocumentSearch({
      pages: state.pages,
      normalizedQuery,
      ensureSearchIndex: ensureManagedPreviewSearchIndex,
      collectMatches: collectSearchMatches,
      isCancelled: () => previewState.searchRunId !== runId,
      yieldControl
    });

    if (!result) return;
    const { matches, matchesByPage } = result;

    previewState.searchPending = false;
    previewState.searchMatches = matches;
    previewState.searchMatchesByPage = matchesByPage;

    if (matches.length === 0) {
      previewState.activeSearchMatchIndex = -1;
      updateUi?.();
      renderHighlights?.();
      return;
    }

    const firstMatchOnCurrentPage = matches.findIndex(
      (match) => match.pageIndex === previewState.currentIndex
    );

    setActivePreviewSearchMatch?.(firstMatchOnCurrentPage >= 0 ? firstMatchOnCurrentPage : 0);
  } catch (error) {
    if (previewState.searchRunId !== runId) return;
    previewState.searchPending = false;
    previewState.searchMatches = [];
    previewState.searchMatchesByPage = new Map();
    previewState.activeSearchMatchIndex = -1;
    updateUi?.();
    consoleApi.warn("Preview search failed", error);
  }
}

export function scheduleManagedPreviewSearchController({
  previewState,
  query,
  runSearch,
  updateUi,
  clearHighlights
}) {
  scheduleManagedSearch({
    searchState: previewState,
    query,
    normalizeQuery: normalizeSearchQuery,
    runSearch,
    updateUi,
    clearHighlights,
    keyMap: MANAGED_PREVIEW_SEARCH_STATE_KEYS
  });
}

export async function renderManagedImmersiveTextLayerController({
  pdfjsLib,
  page,
  stage,
  canvas,
  rotation = 0,
  loadingToken,
  previewState,
  cancelTextLayer,
  renderSearchHighlights
}) {
  await renderManagedTextLayer({
    pdfjsLib,
    page,
    getTextContent: getPageTextContent,
    stage,
    canvas,
    rotation,
    fallbackScale: 1.5,
    isCurrent: () =>
      previewState.loadingToken === loadingToken &&
      previewState.stageRef === stage,
    className: "preview-text-layer textLayer",
    assignLayer: (textLayer, textLayerContainer) => {
      previewState.textLayer = textLayer;
      previewState.textLayerRef = textLayerContainer;
    },
    isAssignedLayer: (textLayer) => previewState.textLayer === textLayer,
    cancelAssignedLayer: cancelTextLayer,
    onReady: () => {
      renderSearchHighlights?.();
    },
    warnMessage: "Preview text layer render failed"
  });
}

export function updateManagedImmersivePaginationController({
  previewState,
  totalPages,
  currentElement,
  totalElement
}) {
  updateManagedPreviewPagination({
    previewState,
    totalPages,
    currentElement,
    totalElement
  });
}

export function navigateManagedPreviewController({
  previewState,
  pageCount,
  delta,
  renderPreviewAtCurrentIndex
}) {
  navigateManagedPreview({
    previewState,
    pageCount,
    delta,
    renderCurrent: renderPreviewAtCurrentIndex
  });
}

export async function renderManagedPreviewAtCurrentIndexController({
  pages,
  previewState,
  previewBody,
  previewSettings,
  updatePagination,
  updateSearchUi,
  getMatchesForPage,
  cancelTextLayer,
  hideSelectionToolbar,
  ensureCanvas,
  renderAnnotationLayer,
  renderTextLayer,
  resetZoom
}) {
  await renderManagedPreviewAtCurrentIndex({
    pages,
    previewState,
    previewBody,
    previewSettings,
    updatePagination,
    updateSearchUi,
    getMatchesForPage,
    cancelTextLayer,
    hideSelectionToolbar,
    ensureCanvas,
    renderAnnotationLayer,
    startTextLayerRender: (currentPage, stage, canvas, loadingToken) => {
      void renderTextLayer?.(currentPage, stage, canvas, loadingToken);
    },
    resetZoom
  });
}

export function rotateManagedPreviewPageController({
  pages,
  previewState,
  delta,
  pushHistory,
  invalidatePageDisplayCache,
  resetZoom,
  renderAnnotationLayer,
  renderThumbs,
  markMetadataDirty
}) {
  rotateManagedPreviewPage({
    pages,
    previewState,
    delta,
    pushHistory,
    invalidatePageDisplayCache,
    resetZoom,
    renderAnnotationLayer,
    renderThumbs,
    markMetadataDirty
  });
}

export function deleteManagedPreviewPageController({
  pages,
  selectedPages,
  previewState,
  pushHistory,
  closePreview,
  renderPreviewAtCurrentIndex,
  renderThumbs,
  confirmDelete = () => globalThis.confirm?.("确定要删除当前页面吗？")
}) {
  deleteManagedPreviewPage({
    pages,
    selectedPages,
    previewState,
    pushHistory,
    confirmDelete,
    closePreview,
    renderCurrent: renderPreviewAtCurrentIndex,
    renderThumbs
  });
}

export async function openManagedPreviewController({
  pages,
  selectedPages,
  previewState,
  setResult,
  hideWorkspaceSelectionToolbar,
  resetPreviewSearchState,
  previewModal,
  renderPreviewAtCurrentIndex
}) {
  openManagedPreview({
    pages,
    selectedPages,
    previewState,
    setResult,
    hideWorkspaceSelectionToolbar,
    resetPreviewSearchState,
    previewModal,
    renderCurrent: renderPreviewAtCurrentIndex
  });
}

export function closeManagedPreviewController({
  state,
  previewState,
  previewBody,
  previewModal,
  removeCropLivePreview,
  clearSelectedVisualAnnotation,
  cancelTextLayer,
  hidePreviewSelectionToolbar,
  hideWorkspaceSelectionToolbar,
  resetPreviewSearchState,
  syncPreviewToolButtons,
  updateUndoAvailability,
  resetPreviewHelper,
  syncAnnotationStyleBar,
  renderThumbs,
  hasWorkspaceSearchQuery,
  scheduleWorkspaceTextEditorSync
}) {
  closeManagedPreview({
    state,
    previewState,
    previewBody,
    previewModal,
    removeCropLivePreview,
    clearSelectedVisualAnnotation,
    cancelTextLayer,
    hidePreviewSelectionToolbar,
    hideWorkspaceSelectionToolbar,
    resetPreviewSearchState,
    syncPreviewToolButtons,
    updateUndoAvailability,
    resetPreviewHelper,
    syncAnnotationStyleBar,
    renderThumbs,
    hasWorkspaceSearchQuery,
    scheduleWorkspaceTextEditorSync
  });
}
