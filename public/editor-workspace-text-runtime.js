import { normalizePageRotation } from "./editor-geometry.js?v=0414b";
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
  normalizeSearchQuery,
  normalizeSearchText,
  renderSearchMatchCanvasHighlights,
  resetManagedSearchState,
  scheduleManagedSearch,
  setManagedSearchActiveMatch,
  updateSearchUi
} from "./editor-search-runtime.js?v=0414b";
import {
  applyManagedTextSelectionAnnotation,
  applyLayerFrame,
  canMountWorkspaceTargets,
  getTextSelectionSnapshot,
  isWorkspaceMountCurrent,
  mapClientRectToOriginalAnnotationRect,
  prepareWorkspaceTextEditorMount,
  refreshManagedSelectionToolbar,
  renderManagedTextLayer,
  resolveWorkspaceMountTargets,
  syncManagedSelectionToolbar,
  syncManagedWorkspaceTextEditor
} from "./editor-preview-text-runtime.js?v=0414b";

export function createManagedWorkspaceTextEditorState() {
  return {
    pageId: null,
    cardRef: null,
    previewRef: null,
    canvasRef: null,
    searchCanvasRef: null,
    annotationCanvasRef: null,
    textLayer: null,
    textLayerRef: null,
    surfaceRef: null,
    loadingToken: null,
    textSelection: null
  };
}

export function createManagedWorkspaceTextEditorSyncState() {
  return {
    queued: false
  };
}

export function createManagedWorkspaceSearchState() {
  return {
    query: "",
    normalizedQuery: "",
    matches: [],
    matchesByPage: new Map(),
    activeMatchIndex: -1,
    timer: null,
    runId: 0,
    pending: false
  };
}

function ensureManagedWorkspaceSearchIndex(page) {
  return ensurePageSearchIndex(page, normalizeSearchText);
}

export function scheduleManagedWorkspaceTextEditorSync({
  syncState,
  requestFrame = globalThis.requestAnimationFrame,
  syncWorkspaceTextEditor
}) {
  if (syncState.queued) return;
  syncState.queued = true;
  requestFrame(() => {
    syncState.queued = false;
    syncWorkspaceTextEditor?.();
  });
}

export function setManagedWorkspaceSearchPanelVisible({
  panel,
  toggleButton,
  input,
  visible,
  focus = false,
  select = false,
  clear = false,
  resetSearchState,
  requestFrame = globalThis.requestAnimationFrame
}) {
  if (!panel || !toggleButton) return;

  panel.classList.toggle("hidden", !visible);
  toggleButton.classList.toggle("active", visible);
  toggleButton.setAttribute("aria-expanded", String(visible));

  if (!visible && clear) {
    resetSearchState?.({ clearInput: true });
  }

  if (visible && focus) {
    requestFrame(() => {
      input?.focus();
      if (select) {
        input?.select();
      }
    });
  }
}

export function updateManagedWorkspaceSearchUi({
  searchState,
  statusElement,
  prevButton,
  nextButton
}) {
  updateSearchUi({
    statusElement,
    prevButton,
    nextButton,
    pending: searchState.pending,
    normalizedQuery: searchState.normalizedQuery,
    matchesLength: searchState.matches.length,
    activeMatchIndex: searchState.activeMatchIndex
  });
}

export function resetManagedWorkspaceSearchState({
  searchState,
  clearInput = false,
  inputElement,
  updateUi,
  clearHighlights
}) {
  resetManagedSearchState({
    searchState,
    clearInput,
    inputElement,
    updateUi,
    clearHighlights
  });
}

export function focusManagedWorkspaceSearchMatch({
  state,
  match,
  hideSelectionToolbar,
  refreshSelectionCards,
  scrollToPage,
  updateWorkspaceNavigation,
  scheduleTextEditorSync
}) {
  if (!match) return;

  const page = state.pages[match.pageIndex];
  if (!page) return;

  hideSelectionToolbar?.();
  const previousSelection = new Set(state.selected);
  state.selected = new Set([match.pageIndex]);
  state.lastSelectedIndex = match.pageIndex;
  refreshSelectionCards?.(previousSelection);
  scrollToPage?.(page);
  updateWorkspaceNavigation?.();
  scheduleTextEditorSync?.();
}

export function setManagedWorkspaceSearchActiveMatch({
  searchState,
  index,
  updateUi,
  renderHighlights,
  onSelectMatch
}) {
  setManagedSearchActiveMatch({
    searchState,
    index,
    updateUi,
    renderHighlights,
    onSelectMatch
  });
}

export function stepManagedWorkspaceSearch({
  searchState,
  delta,
  setActiveMatch
}) {
  if (searchState.matches.length === 0) return;
  setActiveMatch?.(searchState.activeMatchIndex + delta);
}

export async function runManagedWorkspaceSearch({
  state,
  searchState,
  query,
  setSearchPanelVisible,
  updateUi,
  clearHighlights,
  renderHighlights,
  selectedIndices,
  setActiveMatch,
  yieldControl,
  consoleApi = globalThis.console
}) {
  const normalizedQuery = normalizeSearchQuery(query);

  searchState.query = query;
  searchState.normalizedQuery = normalizedQuery;

  if (!normalizedQuery) {
    clearHighlights?.();
    updateUi?.();
    return;
  }

  setSearchPanelVisible?.(true);

  searchState.runId += 1;
  const runId = searchState.runId;
  searchState.pending = true;
  searchState.matches = [];
  searchState.matchesByPage = new Map();
  searchState.activeMatchIndex = -1;
  updateUi?.();
  clearHighlights?.();

  try {
    const result = await executeDocumentSearch({
      pages: state.pages,
      normalizedQuery,
      ensureSearchIndex: ensureManagedWorkspaceSearchIndex,
      collectMatches: collectSearchMatches,
      isCancelled: () => searchState.runId !== runId,
      yieldControl
    });

    if (!result) return;
    const { matches, matchesByPage } = result;

    searchState.pending = false;
    searchState.matches = matches;
    searchState.matchesByPage = matchesByPage;

    if (matches.length === 0) {
      searchState.activeMatchIndex = -1;
      updateUi?.();
      renderHighlights?.();
      return;
    }

    const selectedIndex = selectedIndices?.()[0] ?? 0;
    const firstMatchOnSelectedPage = matches.findIndex((match) => match.pageIndex === selectedIndex);
    setActiveMatch?.(firstMatchOnSelectedPage >= 0 ? firstMatchOnSelectedPage : 0);
  } catch (error) {
    if (searchState.runId !== runId) return;
    searchState.pending = false;
    searchState.matches = [];
    searchState.matchesByPage = new Map();
    searchState.activeMatchIndex = -1;
    updateUi?.();
    consoleApi.warn("Workspace search failed", error);
  }
}

export function scheduleManagedWorkspaceSearch({
  searchState,
  query,
  runSearch,
  updateUi,
  clearHighlights
}) {
  scheduleManagedSearch({
    searchState,
    query,
    normalizeQuery: normalizeSearchQuery,
    runSearch,
    updateUi,
    clearHighlights
  });
}

export async function activateManagedWorkspaceSearch({
  searchState,
  query,
  runSearch,
  stepSearch
}) {
  await activateManagedSearch({
    searchState,
    query,
    normalizeQuery: normalizeSearchQuery,
    runSearch,
    stepSearch
  });
}

export function cancelManagedWorkspaceTextLayer({
  textEditorState
}) {
  cancelManagedTextLayer(textEditorState, {
    warnMessage: "Workspace text layer cancel failed"
  });
}

export function hideManagedWorkspaceSelectionToolbar({
  textEditorState,
  toolbar,
  clearSelection = false
}) {
  textEditorState.textSelection = null;

  if (toolbar) {
    toolbar.classList.add("hidden");
    toolbar.setAttribute("aria-hidden", "true");
  }

  if (clearSelection) {
    clearDomSelection();
  }
}

export function clearManagedWorkspaceTextEditor({
  textEditorState,
  hideSelectionToolbar,
  cancelTextLayer,
  clearSearchHighlights,
  clearSelection = false
}) {
  textEditorState.loadingToken = Symbol("workspace-text-layer-cleared");
  hideSelectionToolbar?.({ clearSelection });
  cancelTextLayer?.();
  textEditorState.searchCanvasRef?.remove();
  textEditorState.annotationCanvasRef?.remove();
  textEditorState.cardRef?.classList.remove("workspace-text-editing");
  if (textEditorState.cardRef) {
    textEditorState.cardRef.draggable = true;
  }
  textEditorState.pageId = null;
  textEditorState.cardRef = null;
  textEditorState.previewRef = null;
  textEditorState.canvasRef = null;
  textEditorState.searchCanvasRef = null;
  textEditorState.annotationCanvasRef = null;
  textEditorState.surfaceRef = null;
  clearSearchHighlights?.();
}

export function positionManagedWorkspaceSelectionToolbar({
  toolbar,
  selectionSnapshot,
  windowApi = globalThis.window
}) {
  if (!toolbar || !selectionSnapshot) return;

  const toolbarRect = toolbar.getBoundingClientRect();
  const { left, top } = computeFloatingToolbarPosition({
    anchorX: selectionSnapshot.anchorX,
    top: selectionSnapshot.top,
    bottom: selectionSnapshot.bottom,
    toolbarRect,
    boundaryRect: {
      left: 0,
      top: 0,
      width: windowApi.innerWidth,
      height: windowApi.innerHeight
    }
  });

  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
}

export function showManagedWorkspaceSelectionToolbar({
  textEditorState,
  toolbar,
  selectionSnapshot,
  positionSelectionToolbar,
  requestFrame = globalThis.requestAnimationFrame
}) {
  textEditorState.textSelection = selectionSnapshot;

  if (!toolbar) return;

  toolbar.classList.remove("hidden");
  toolbar.setAttribute("aria-hidden", "false");

  requestFrame(() => {
    if (textEditorState.textSelection === selectionSnapshot) {
      positionSelectionToolbar?.(selectionSnapshot);
    }
  });
}

export function clearManagedWorkspaceSearchHighlights({
  textEditorState
}) {
  const canvas = textEditorState.searchCanvasRef;
  const context = canvas?.getContext("2d");
  if (canvas && context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  clearSearchHighlightClasses(textEditorState.textLayerRef);
}

export function getManagedWorkspaceSearchMatchesForPage({
  searchState,
  pageIndex
}) {
  return searchState.matchesByPage.get(pageIndex) || [];
}

export function renderManagedWorkspaceSearchHighlights({
  state,
  textEditorState,
  searchState
}) {
  const pageIndex = state.pages.findIndex((page) => String(page.id) === String(textEditorState.pageId));
  const page = pageIndex >= 0 ? state.pages[pageIndex] : null;
  const pageMatches = getManagedWorkspaceSearchMatchesForPage({
    searchState,
    pageIndex
  });
  const textDivs = textEditorState.textLayer?.textDivs || [];
  renderSearchMatchCanvasHighlights({
    rootElement: textEditorState.textLayerRef,
    canvas: textEditorState.searchCanvasRef,
    textDivs,
    itemRanges: page?.previewSearchIndex?.itemRanges || [],
    pageMatches,
    activeMatch: searchState.matches[searchState.activeMatchIndex] || null
  });
}

export function renderManagedWorkspaceAnnotationLayer({
  textEditorState,
  findPageById,
  drawExistingPageData
}) {
  if (!textEditorState.annotationCanvasRef || !textEditorState.pageId) return;
  const page = findPageById?.(textEditorState.pageId);
  if (!page) return;
  drawExistingPageData?.(textEditorState.annotationCanvasRef, page, {
    coordinateSpace: "display",
    showCropFrame: false
  });
}

export function getManagedWorkspaceTextSelectionSnapshot({
  textEditorState,
  activeTool,
  previewModal
}) {
  if (
    !textEditorState.textLayerRef ||
    activeTool ||
    previewModal.classList.contains("hidden") === false
  ) {
    return null;
  }

  return getTextSelectionSnapshot({
    hostElement: textEditorState.textLayerRef,
    mapClientRect: (clientRect) =>
      mapClientRectToOriginalAnnotationRect(clientRect, textEditorState.previewRef),
    pageRef: {
      pageId: textEditorState.pageId
    }
  });
}

export function syncManagedWorkspaceTextSelectionState({
  previewModal,
  getSelectionSnapshot,
  hideSelectionToolbar,
  showSelectionToolbar
}) {
  syncManagedSelectionToolbar({
    isSuppressed: () => !previewModal.classList.contains("hidden"),
    getSnapshot: getSelectionSnapshot,
    hideToolbar: hideSelectionToolbar,
    showToolbar: showSelectionToolbar
  });
}

export function refreshManagedWorkspaceSelectionToolbar({
  textEditorState,
  getSelectionSnapshot,
  hideSelectionToolbar,
  positionSelectionToolbar
}) {
  refreshManagedSelectionToolbar({
    hasSelection: () => Boolean(textEditorState.textSelection),
    getSnapshot: getSelectionSnapshot,
    hideToolbar: hideSelectionToolbar,
    applySnapshot: (selectionSnapshot) => {
      textEditorState.textSelection = selectionSnapshot;
      positionSelectionToolbar?.(selectionSnapshot);
    }
  });
}

export function applyManagedWorkspaceTextAnnotation({
  textEditorState,
  type,
  findPageById,
  ensurePageState,
  pushVisualHistory,
  updateThumbCard,
  updateMeta,
  renderWorkspaceAnnotationLayer,
  state,
  redrawPreviewOverlay,
  previewModal,
  immersivePreviewState,
  renderImmersiveAnnotationLayer,
  updateUndoAvailability,
  setResult,
  hideSelectionToolbar
}) {
  const selectionSnapshot = textEditorState.textSelection;
  const page = selectionSnapshot ? findPageById?.(selectionSnapshot.pageId) : null;
  applyManagedTextSelectionAnnotation({
    type,
    selectionSnapshot,
    page,
    isSelectionValid: (snapshot) => snapshot.pageId === textEditorState.pageId,
    clearToolbar: hideSelectionToolbar,
    ensurePageState,
    pushVisualHistory,
    updateThumbCard,
    updateMeta,
    renderPrimaryLayer: () => {
      renderWorkspaceAnnotationLayer?.();
    },
    renderSecondaryLayer: (currentPage) => {
      if (state.previewPage === currentPage) {
        redrawPreviewOverlay?.();
      }
      if (!previewModal.classList.contains("hidden") && state.pages[immersivePreviewState.currentIndex] === currentPage) {
        renderImmersiveAnnotationLayer?.();
      }
    },
    updateUndoAvailability,
    setResult,
    buildMessage: (currentType) =>
      currentType === "text-highlight" ? "已在编辑区添加文字高亮。" : "已在编辑区添加文字下划线。"
  });
}

export async function renderManagedWorkspaceTextLayerController({
  pdfjsLib,
  page,
  stage,
  canvas,
  loadingToken,
  textEditorState,
  syncTextSelectionState,
  cancelTextLayer,
  renderSearchHighlights,
  refreshSelectionToolbar,
  requestFrame = globalThis.requestAnimationFrame
}) {
  await renderManagedTextLayer({
    pdfjsLib,
    page,
    getTextContent: getPageTextContent,
    stage,
    canvas,
    rotation: normalizePageRotation(page.rotation),
    fallbackScale: 1.5,
    isCurrent: () =>
      textEditorState.loadingToken === loadingToken &&
      textEditorState.previewRef === stage,
    className: "preview-text-layer workspace-text-layer textLayer",
    userSelect: "text",
    prepareContainer: (textLayerContainer) => {
      applyLayerFrame(textLayerContainer, stage, page.rotation || 0);
    },
    stopEvents: ["mousedown", "mouseup", "click", "dblclick", "dragstart"],
    selectionSyncEvents: ["mouseup", "keyup", "pointerup", "touchend"],
    onSelectionSync: () => {
      requestFrame(syncTextSelectionState);
    },
    assignLayer: (textLayer, textLayerContainer) => {
      textEditorState.textLayer = textLayer;
      textEditorState.textLayerRef = textLayerContainer;
      textEditorState.surfaceRef = textLayerContainer;
    },
    isAssignedLayer: (textLayer) => textEditorState.textLayer === textLayer,
    cancelAssignedLayer: cancelTextLayer,
    onReady: () => {
      renderSearchHighlights?.();
      refreshSelectionToolbar?.();
    },
    warnMessage: "Workspace text layer render failed"
  });
}

export function syncManagedWorkspaceTextEditorController({
  state,
  textEditorState,
  thumbGrid,
  activeTool,
  getWorkspaceVisualPage,
  clearTextEditor,
  requestRenderAround,
  processThumbQueue,
  renderAnnotationLayer,
  renderSearchHighlights,
  refreshSelectionToolbar,
  renderTextLayer,
  updateUndoAvailability
}) {
  const page = !activeTool ? getWorkspaceVisualPage?.() : null;
  const previousPageId = textEditorState.pageId;

  syncManagedWorkspaceTextEditor({
    page,
    previousPageId,
    textEditorState,
    thumbGrid,
    resolveMountTargets: resolveWorkspaceMountTargets,
    canMountTargets: canMountWorkspaceTargets,
    isMountCurrent: isWorkspaceMountCurrent,
    clearTextEditor,
    onMissingTargets: (currentPage) => {
      const pageIndex = state.pages.indexOf(currentPage);
      if (pageIndex >= 0) {
        requestRenderAround?.(pageIndex, true);
        processThumbQueue?.(state.renderToken);
      }
    },
    onAlreadyMounted: () => {
      renderAnnotationLayer?.();
      renderSearchHighlights?.();
      refreshSelectionToolbar?.();
    },
    prepareMount: ({ textEditorState: currentState, page: currentPage, card, surface, canvas }) =>
      prepareWorkspaceTextEditorMount({
        textEditorState: currentState,
        page: currentPage,
        card,
        surface,
        canvas,
        applyLayerFrame
      }),
    renderAnnotationLayer,
    startTextLayerRender: (currentPage, surface, canvas, loadingToken) => {
      void renderTextLayer?.(currentPage, surface, canvas, loadingToken);
    },
    updateUndoAvailability
  });
}
