import {
  activateManagedWorkspaceVisualEditor,
  applyManagedWorkspaceZoom,
  ensureManagedInPlaceEditor,
  scrollManagedPageIntoView,
  updateManagedWorkspaceNavigation
} from "./editor-workspace-runtime.js?v=0414b";
import {
  applyManagedPreviewTextAnnotationController,
  cancelManagedImmersiveTextLayer as cancelManagedImmersiveTextLayerController,
  clearManagedPreviewSearchHighlights as clearManagedPreviewSearchHighlightsController,
  closeManagedPreviewController,
  createManagedImmersivePreviewState,
  deleteManagedPreviewPageController,
  getManagedPreviewSearchMatchesForPage as getManagedPreviewSearchMatchesForPageController,
  getManagedPreviewTextSelectionSnapshot as getManagedPreviewTextSelectionSnapshotController,
  hideManagedPreviewSelectionToolbar as hideManagedPreviewSelectionToolbarController,
  navigateManagedPreviewController,
  openManagedPreviewController,
  positionManagedPreviewSelectionToolbar as positionManagedPreviewSelectionToolbarController,
  renderManagedImmersiveAnnotationLayerController,
  renderManagedImmersiveTextLayerController,
  renderManagedPreviewAtCurrentIndexController,
  renderManagedPreviewSearchHighlights as renderManagedPreviewSearchHighlightsController,
  resetManagedImmersiveZoom as resetManagedImmersiveZoomController,
  resetManagedPreviewSearchStateController,
  rotateManagedPreviewPageController,
  runManagedPreviewSearchController,
  scheduleManagedPreviewSearchController,
  setManagedActivePreviewSearchMatchController,
  showManagedPreviewSelectionToolbar as showManagedPreviewSelectionToolbarController,
  stepManagedPreviewSearchController,
  updateManagedImmersivePaginationController,
  updateManagedImmersiveTransform as updateManagedImmersiveTransformController,
  updateManagedPreviewSearchUiController
} from "./editor-immersive-runtime.js?v=0414b";
import {
  applyManagedWorkspaceTextAnnotation as applyManagedWorkspaceTextAnnotationController,
  cancelManagedWorkspaceTextLayer as cancelManagedWorkspaceTextLayerController,
  clearManagedWorkspaceSearchHighlights as clearManagedWorkspaceSearchHighlightsController,
  clearManagedWorkspaceTextEditor as clearManagedWorkspaceTextEditorController,
  createManagedWorkspaceSearchState,
  createManagedWorkspaceTextEditorState,
  createManagedWorkspaceTextEditorSyncState,
  focusManagedWorkspaceSearchMatch as focusManagedWorkspaceSearchMatchController,
  getManagedWorkspaceSearchMatchesForPage as getManagedWorkspaceSearchMatchesForPageController,
  getManagedWorkspaceTextSelectionSnapshot as getManagedWorkspaceTextSelectionSnapshotController,
  hideManagedWorkspaceSelectionToolbar as hideManagedWorkspaceSelectionToolbarController,
  positionManagedWorkspaceSelectionToolbar as positionManagedWorkspaceSelectionToolbarController,
  refreshManagedWorkspaceSelectionToolbar as refreshManagedWorkspaceSelectionToolbarController,
  renderManagedWorkspaceAnnotationLayer as renderManagedWorkspaceAnnotationLayerController,
  renderManagedWorkspaceSearchHighlights as renderManagedWorkspaceSearchHighlightsController,
  renderManagedWorkspaceTextLayerController,
  resetManagedWorkspaceSearchState as resetManagedWorkspaceSearchStateController,
  runManagedWorkspaceSearch as runManagedWorkspaceSearchController,
  scheduleManagedWorkspaceSearch as scheduleManagedWorkspaceSearchController,
  scheduleManagedWorkspaceTextEditorSync as scheduleManagedWorkspaceTextEditorSyncController,
  setManagedWorkspaceSearchActiveMatch as setManagedWorkspaceSearchActiveMatchController,
  setManagedWorkspaceSearchPanelVisible as setManagedWorkspaceSearchPanelVisibleController,
  showManagedWorkspaceSelectionToolbar as showManagedWorkspaceSelectionToolbarController,
  stepManagedWorkspaceSearch as stepManagedWorkspaceSearchController,
  syncManagedWorkspaceTextEditorController,
  syncManagedWorkspaceTextSelectionState as syncManagedWorkspaceTextSelectionStateController,
  updateManagedWorkspaceSearchUi as updateManagedWorkspaceSearchUiController
} from "./editor-workspace-text-runtime.js?v=0414b";
import {
  setupManagedAnnotationCanvasEventsController,
  getManagedPreviewToolHelper,
  mountManagedAnnotationPreviewCanvasController,
  redrawManagedAnnotationPreviewOverlayController,
  setManagedActivePreviewToolController,
  syncManagedPreviewToolButtonsController,
  updateManagedPreviewHelper
} from "./editor-annotation-runtime.js?v=0414b";
import { openManagedStandaloneVisualEditor } from "./editor-preview-runtime.js?v=0414b";
import { resolveWorkspaceMountTargets } from "./editor-preview-text-runtime.js?v=0414b";
import { normalizeSearchQuery } from "./editor-search-runtime.js?v=0414b";

export function createManagedPreviewOrchestration({
  pdfjsLib,
  state,
  controls,
  previewModal,
  previewBody,
  previewSelectionToolbar,
  workspaceSelectionToolbar,
  editorWorkspaceSearchToggleBtn,
  editorWorkspaceSearchPanel,
  editorWorkspaceSearchInput,
  editorWorkspaceSearchStatus,
  editorWorkspaceSearchPrevBtn,
  editorWorkspaceSearchNextBtn,
  previewSearchInput,
  previewSearchStatus,
  previewSearchPrevBtn,
  previewSearchNextBtn,
  thumbGrid,
  setResult,
  getActiveVisualPage,
  getWorkspaceVisualPage,
  getSelectedVisualAnnotation,
  clearSelectedVisualAnnotation,
  ensurePreviewPageState,
  pushVisualHistory,
  updateThumbCard,
  updateMeta,
  updateUndoAvailability,
  syncAnnotationStyleBar,
  invalidatePageDisplayCache,
  cloneCrop,
  clampCropToBounds,
  cropsEqual,
  isPointInCrop,
  removeCropLivePreview,
  renderCropLivePreview,
  drawExistingPageData,
  requestRenderAround,
  processThumbQueue,
  refreshSelectionCards,
  selectedIndices,
  getPrimarySelectedIndex,
  findPageById,
  ensurePageCanvas,
  renderThumbs,
  pushHistory,
  documentApi = globalThis.document,
  windowApi = globalThis.window,
  requestFrame = globalThis.requestAnimationFrame,
  consoleApi = globalThis.console
}) {
  const immersivePreviewState = createManagedImmersivePreviewState();
  const workspaceTextEditorState = createManagedWorkspaceTextEditorState();
  const workspaceTextEditorSyncState = createManagedWorkspaceTextEditorSyncState();
  const workspaceSearchState = createManagedWorkspaceSearchState();

  const yieldToBrowser = () => new Promise((resolve) => windowApi.setTimeout(resolve, 0));

  function updatePreviewHelper(message = "") {
    updateManagedPreviewHelper({
      helperElement: documentApi.querySelector("#previewHelper"),
      message,
      tool: state.activeTool
    });
  }

  function updateImmersiveTransform() {
    updateManagedImmersiveTransformController({
      previewState: immersivePreviewState,
      levelElement: documentApi.getElementById("previewZoomLevel")
    });
  }

  function resetImmersiveZoom(fitWidth = false) {
    resetManagedImmersiveZoomController({
      previewState: immersivePreviewState,
      updateTransform: updateImmersiveTransform,
      fitWidth,
      windowApi
    });
  }

  function cancelImmersiveTextLayer() {
    cancelManagedImmersiveTextLayerController({
      previewState: immersivePreviewState
    });
  }

  function updatePreviewSearchUi() {
    updateManagedPreviewSearchUiController({
      previewState: immersivePreviewState,
      statusElement: previewSearchStatus,
      prevButton: previewSearchPrevBtn,
      nextButton: previewSearchNextBtn
    });
  }

  function clearPreviewSearchHighlights() {
    clearManagedPreviewSearchHighlightsController({
      previewState: immersivePreviewState
    });
  }

  function getPreviewSearchMatchesForPage(pageIndex) {
    return getManagedPreviewSearchMatchesForPageController({
      previewState: immersivePreviewState,
      pageIndex
    });
  }

  function renderPreviewSearchHighlights() {
    renderManagedPreviewSearchHighlightsController({
      state,
      previewState: immersivePreviewState
    });
  }

  function hidePreviewSelectionToolbar({ clearSelection = false } = {}) {
    hideManagedPreviewSelectionToolbarController({
      previewState: immersivePreviewState,
      toolbar: previewSelectionToolbar,
      clearSelection
    });
  }

  function positionPreviewSelectionToolbar(selectionSnapshot) {
    positionManagedPreviewSelectionToolbarController({
      toolbar: previewSelectionToolbar,
      previewBody,
      selectionSnapshot
    });
  }

  function showPreviewSelectionToolbar(selectionSnapshot) {
    showManagedPreviewSelectionToolbarController({
      previewState: immersivePreviewState,
      toolbar: previewSelectionToolbar,
      selectionSnapshot,
      positionSelectionToolbar: positionPreviewSelectionToolbar,
      requestFrame
    });
  }

  function getPreviewTextSelectionSnapshot() {
    return getManagedPreviewTextSelectionSnapshotController({
      previewState: immersivePreviewState,
      previewModal
    });
  }

  function renderImmersiveAnnotationLayer() {
    renderManagedImmersiveAnnotationLayerController({
      state,
      previewState: immersivePreviewState,
      drawExistingPageData
    });
  }

  function applyPreviewTextAnnotation(type) {
    applyManagedPreviewTextAnnotationController({
      previewState: immersivePreviewState,
      state,
      type,
      hideSelectionToolbar: hidePreviewSelectionToolbar,
      ensurePageState: ensurePreviewPageState,
      pushVisualHistory,
      updateThumbCard,
      updateMeta,
      renderImmersiveAnnotationLayer,
      redrawPreviewOverlay,
      updateUndoAvailability,
      setResult
    });
  }

  function scheduleWorkspaceTextEditorSync() {
    scheduleManagedWorkspaceTextEditorSyncController({
      syncState: workspaceTextEditorSyncState,
      requestFrame,
      syncWorkspaceTextEditor: () => {
        syncWorkspaceTextEditor();
      }
    });
  }

  function setWorkspaceSearchPanelVisible(visible, { focus = false, select = false, clear = false } = {}) {
    setManagedWorkspaceSearchPanelVisibleController({
      panel: editorWorkspaceSearchPanel,
      toggleButton: editorWorkspaceSearchToggleBtn,
      input: editorWorkspaceSearchInput,
      visible,
      focus,
      select,
      clear,
      resetSearchState: resetWorkspaceSearchState,
      requestFrame
    });
  }

  function updateWorkspaceSearchUi() {
    updateManagedWorkspaceSearchUiController({
      searchState: workspaceSearchState,
      statusElement: editorWorkspaceSearchStatus,
      prevButton: editorWorkspaceSearchPrevBtn,
      nextButton: editorWorkspaceSearchNextBtn
    });
  }

  function resetWorkspaceSearchState({ clearInput = false } = {}) {
    resetManagedWorkspaceSearchStateController({
      searchState: workspaceSearchState,
      clearInput,
      inputElement: editorWorkspaceSearchInput,
      updateUi: updateWorkspaceSearchUi,
      clearHighlights: clearWorkspaceSearchHighlights
    });
  }

  function focusWorkspaceSearchMatch(match) {
    focusManagedWorkspaceSearchMatchController({
      state,
      match,
      hideSelectionToolbar: hideWorkspaceSelectionToolbar,
      refreshSelectionCards,
      scrollToPage: (page) => {
        scrollManagedPageIntoView({
          thumbGrid,
          page
        });
      },
      updateWorkspaceNavigation,
      scheduleTextEditorSync: scheduleWorkspaceTextEditorSync
    });
  }

  function setActiveWorkspaceSearchMatch(index) {
    setManagedWorkspaceSearchActiveMatchController({
      searchState: workspaceSearchState,
      index,
      updateUi: updateWorkspaceSearchUi,
      renderHighlights: renderWorkspaceSearchHighlights,
      onSelectMatch: focusWorkspaceSearchMatch
    });
  }

  function stepWorkspaceSearch(delta) {
    stepManagedWorkspaceSearchController({
      searchState: workspaceSearchState,
      delta,
      setActiveMatch: setActiveWorkspaceSearchMatch
    });
  }

  async function runWorkspaceSearch(query) {
    if (!normalizeSearchQuery(query)) {
      resetWorkspaceSearchState({ clearInput: true });
      return;
    }

    await runManagedWorkspaceSearchController({
      state,
      searchState: workspaceSearchState,
      query,
      setSearchPanelVisible: (nextVisible) => setWorkspaceSearchPanelVisible(nextVisible),
      updateUi: updateWorkspaceSearchUi,
      clearHighlights: clearWorkspaceSearchHighlights,
      renderHighlights: renderWorkspaceSearchHighlights,
      selectedIndices,
      setActiveMatch: setActiveWorkspaceSearchMatch,
      yieldControl: yieldToBrowser,
      consoleApi
    });
  }

  function scheduleWorkspaceSearch(query) {
    scheduleManagedWorkspaceSearchController({
      searchState: workspaceSearchState,
      query,
      runSearch: runWorkspaceSearch,
      updateUi: updateWorkspaceSearchUi,
      clearHighlights: clearWorkspaceSearchHighlights
    });
  }

  function cancelWorkspaceTextLayer() {
    cancelManagedWorkspaceTextLayerController({
      textEditorState: workspaceTextEditorState
    });
  }

  function hideWorkspaceSelectionToolbar({ clearSelection = false } = {}) {
    hideManagedWorkspaceSelectionToolbarController({
      textEditorState: workspaceTextEditorState,
      toolbar: workspaceSelectionToolbar,
      clearSelection
    });
  }

  function clearWorkspaceTextEditor({ clearSelection = false } = {}) {
    clearManagedWorkspaceTextEditorController({
      textEditorState: workspaceTextEditorState,
      hideSelectionToolbar: hideWorkspaceSelectionToolbar,
      cancelTextLayer: cancelWorkspaceTextLayer,
      clearSearchHighlights: clearWorkspaceSearchHighlights,
      clearSelection
    });
  }

  function positionWorkspaceSelectionToolbar(selectionSnapshot) {
    positionManagedWorkspaceSelectionToolbarController({
      toolbar: workspaceSelectionToolbar,
      selectionSnapshot,
      windowApi
    });
  }

  function showWorkspaceSelectionToolbar(selectionSnapshot) {
    showManagedWorkspaceSelectionToolbarController({
      textEditorState: workspaceTextEditorState,
      toolbar: workspaceSelectionToolbar,
      selectionSnapshot,
      positionSelectionToolbar: positionWorkspaceSelectionToolbar,
      requestFrame
    });
  }

  function clearWorkspaceSearchHighlights() {
    clearManagedWorkspaceSearchHighlightsController({
      textEditorState: workspaceTextEditorState
    });
  }

  function getWorkspaceSearchMatchesForPage(pageIndex) {
    return getManagedWorkspaceSearchMatchesForPageController({
      searchState: workspaceSearchState,
      pageIndex
    });
  }

  function renderWorkspaceSearchHighlights() {
    renderManagedWorkspaceSearchHighlightsController({
      state,
      textEditorState: workspaceTextEditorState,
      searchState: workspaceSearchState
    });
  }

  function renderWorkspaceAnnotationLayer() {
    renderManagedWorkspaceAnnotationLayerController({
      textEditorState: workspaceTextEditorState,
      findPageById,
      drawExistingPageData
    });
  }

  function getWorkspaceTextSelectionSnapshot() {
    return getManagedWorkspaceTextSelectionSnapshotController({
      textEditorState: workspaceTextEditorState,
      activeTool: state.activeTool,
      previewModal
    });
  }

  function syncWorkspaceTextSelectionState() {
    syncManagedWorkspaceTextSelectionStateController({
      previewModal,
      getSnapshot: getWorkspaceTextSelectionSnapshot,
      hideSelectionToolbar: hideWorkspaceSelectionToolbar,
      showSelectionToolbar: showWorkspaceSelectionToolbar
    });
  }

  function refreshWorkspaceSelectionToolbar() {
    refreshManagedWorkspaceSelectionToolbarController({
      textEditorState: workspaceTextEditorState,
      getSnapshot: getWorkspaceTextSelectionSnapshot,
      hideSelectionToolbar: hideWorkspaceSelectionToolbar,
      positionSelectionToolbar: positionWorkspaceSelectionToolbar
    });
  }

  function applyWorkspaceTextAnnotation(type) {
    applyManagedWorkspaceTextAnnotationController({
      textEditorState: workspaceTextEditorState,
      type,
      findPageById,
      ensurePageState: ensurePreviewPageState,
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
      hideSelectionToolbar: hideWorkspaceSelectionToolbar
    });
  }

  async function renderWorkspaceTextLayer(page, stage, canvas, loadingToken) {
    await renderManagedWorkspaceTextLayerController({
      pdfjsLib,
      page,
      stage,
      canvas,
      loadingToken,
      textEditorState: workspaceTextEditorState,
      syncTextSelectionState: syncWorkspaceTextSelectionState,
      cancelTextLayer: cancelWorkspaceTextLayer,
      renderSearchHighlights: renderWorkspaceSearchHighlights,
      refreshSelectionToolbar: refreshWorkspaceSelectionToolbar,
      requestFrame
    });
  }

  function syncWorkspaceTextEditor() {
    syncManagedWorkspaceTextEditorController({
      state,
      textEditorState: workspaceTextEditorState,
      thumbGrid,
      activeTool: state.activeTool,
      getWorkspaceVisualPage,
      clearTextEditor: clearWorkspaceTextEditor,
      requestRenderAround: (index, prioritize = false) => {
        requestRenderAround(index, prioritize);
      },
      processThumbQueue: (renderToken = state.renderToken) => {
        void processThumbQueue(renderToken);
      },
      renderAnnotationLayer: renderWorkspaceAnnotationLayer,
      renderSearchHighlights: renderWorkspaceSearchHighlights,
      refreshSelectionToolbar: refreshWorkspaceSelectionToolbar,
      renderTextLayer: (currentPage, stage, canvas, loadingToken) => {
        void renderWorkspaceTextLayer(currentPage, stage, canvas, loadingToken);
      },
      updateUndoAvailability
    });
  }

  function resetPreviewSearchState({ clearInput = false } = {}) {
    resetManagedPreviewSearchStateController({
      previewState: immersivePreviewState,
      clearInput,
      inputElement: previewSearchInput,
      updateUi: updatePreviewSearchUi,
      clearHighlights: clearPreviewSearchHighlights
    });
  }

  function setActivePreviewSearchMatch(index) {
    setManagedActivePreviewSearchMatchController({
      previewState: immersivePreviewState,
      index,
      updateUi: updatePreviewSearchUi,
      renderHighlights: renderPreviewSearchHighlights,
      renderPreviewAtCurrentIndex
    });
  }

  function stepPreviewSearch(delta) {
    stepManagedPreviewSearchController({
      previewState: immersivePreviewState,
      delta,
      setActivePreviewSearchMatch
    });
  }

  async function runPreviewSearch(query) {
    await runManagedPreviewSearchController({
      state,
      previewState: immersivePreviewState,
      query,
      updateUi: updatePreviewSearchUi,
      clearHighlights: clearPreviewSearchHighlights,
      renderHighlights: renderPreviewSearchHighlights,
      setActivePreviewSearchMatch,
      resetSearchState: resetPreviewSearchState,
      yieldControl: yieldToBrowser,
      consoleApi
    });
  }

  function schedulePreviewSearch(query) {
    scheduleManagedPreviewSearchController({
      previewState: immersivePreviewState,
      query,
      runSearch: runPreviewSearch,
      updateUi: updatePreviewSearchUi,
      clearHighlights: clearPreviewSearchHighlights
    });
  }

  async function renderImmersiveTextLayer(page, stage, loadingToken) {
    await renderManagedImmersiveTextLayerController({
      pdfjsLib,
      page,
      stage,
      canvas: immersivePreviewState.annotationCanvasRef,
      rotation: page.rotation || 0,
      loadingToken,
      previewState: immersivePreviewState,
      cancelTextLayer: cancelImmersiveTextLayer,
      renderSearchHighlights: renderPreviewSearchHighlights
    });
  }

  function updateImmersivePagination() {
    updateManagedImmersivePaginationController({
      previewState: immersivePreviewState,
      totalPages: state.pages.length,
      currentElement: documentApi.getElementById("previewCurrentPage"),
      totalElement: documentApi.getElementById("previewTotalPages")
    });
  }

  function navigatePreview(delta) {
    navigateManagedPreviewController({
      previewState: immersivePreviewState,
      pageCount: state.pages.length,
      delta,
      renderPreviewAtCurrentIndex
    });
  }

  async function renderPreviewAtCurrentIndex() {
    await renderManagedPreviewAtCurrentIndexController({
      pages: state.pages,
      previewState: immersivePreviewState,
      previewBody,
      previewSettings: state.pagePreviewSettings,
      updatePagination: updateImmersivePagination,
      updateSearchUi: updatePreviewSearchUi,
      getMatchesForPage: getPreviewSearchMatchesForPage,
      cancelTextLayer: cancelImmersiveTextLayer,
      hideSelectionToolbar: hidePreviewSelectionToolbar,
      ensureCanvas: (currentPage) => ensurePageCanvas(currentPage, state.renderToken),
      renderAnnotationLayer: renderImmersiveAnnotationLayer,
      startTextLayerRender: (currentPage, stage, loadingToken) => {
        void renderImmersiveTextLayer(currentPage, stage, loadingToken);
      },
      resetZoom: resetImmersiveZoom
    });
  }

  async function rotatePreviewPage(delta) {
    rotateManagedPreviewPageController({
      pages: state.pages,
      previewState: immersivePreviewState,
      delta,
      pushHistory,
      invalidatePageDisplayCache: invalidatePageDisplayCache,
      resetZoom: resetImmersiveZoom,
      renderAnnotationLayer: renderImmersiveAnnotationLayer,
      renderThumbs,
      markMetadataDirty: () => {
        state.metadataDirty = true;
      }
    });
  }

  function deletePreviewPage() {
    deleteManagedPreviewPageController({
      pages: state.pages,
      selectedPages: state.selected,
      previewState: immersivePreviewState,
      pushHistory,
      closePreview,
      renderPreviewAtCurrentIndex,
      renderThumbs,
      confirmDelete: () => confirm("确定要删除当前页面吗？")
    });
  }

  async function openPreview() {
    documentApi.body?.classList?.add("preview-open");
    await openManagedPreviewController({
      pages: state.pages,
      selectedPages: state.selected,
      previewState: immersivePreviewState,
      setResult,
      hideWorkspaceSelectionToolbar,
      resetPreviewSearchState,
      previewModal,
      renderPreviewAtCurrentIndex
    });
  }

  async function openVisualEditorForPage(page) {
    activateManagedWorkspaceVisualEditor({
      state,
      page,
      ensurePreviewPageState,
      getSelectedVisualAnnotation,
      clearSelectedVisualAnnotation,
      hideWorkspaceSelectionToolbar,
      syncPreviewToolButtons,
      updateUndoAvailability,
      syncAnnotationStyleBar,
      ensureInPlaceEditor,
      updateWorkspaceNavigation
    });
  }

  function ensureInPlaceEditor(page) {
    ensureManagedInPlaceEditor({
      thumbGrid,
      page,
      activeTool: state.activeTool,
      clearWorkspaceTextEditor,
      removeCropLivePreview,
      resolveMountTargets: resolveWorkspaceMountTargets,
      initPreviewCanvas,
      renderCropLivePreview
    });
  }

  function updateWorkspaceNavigation() {
    updateManagedWorkspaceNavigation({
      pages: state.pages,
      selectedIndex: getPrimarySelectedIndex()
    });
  }

  function applyWorkspaceZoom() {
    applyManagedWorkspaceZoom({
      zoom: state.workspaceZoom,
      grid: thumbGrid,
      rootElement: documentApi.documentElement,
      zoomSelect: controls.workspaceZoomSelect,
      scheduleTextEditorSync: scheduleWorkspaceTextEditorSync
    });
  }

  function syncPreviewToolButtons() {
    syncManagedPreviewToolButtonsController({
      state,
      controls
    });
  }

  function setActivePreviewTool(tool) {
    setManagedActivePreviewToolController({
      state,
      tool,
      updateThumbCard,
      removeCropLivePreview,
      clearWorkspaceTextEditor,
      getSelectedIndex: getPrimarySelectedIndex,
      openVisualEditorForPage,
      renderCropLivePreview,
      updateMeta,
      ensureInPlaceEditor,
      scheduleWorkspaceTextEditorSync,
      updateUndoAvailability,
      updatePreviewHelper,
      syncAnnotationStyleBar,
      controls
    });
  }

  function redrawPreviewOverlay() {
    redrawManagedAnnotationPreviewOverlayController({
      state,
      documentApi,
      drawExistingPageData
    });
  }

  function initPreviewCanvas(targetElement, page) {
    mountManagedAnnotationPreviewCanvasController({
      state,
      targetElement,
      page,
      drawExistingPageData,
      setupCanvasEvents,
      documentApi,
      requestFrame
    });
  }

  function setupCanvasEvents(overlay, page, displayWidth, displayHeight) {
    void displayWidth;
    void displayHeight;
    setupManagedAnnotationCanvasEventsController({
      state,
      overlay,
      page,
      previewModal,
      previewState: immersivePreviewState,
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
      openPreview: () => {
        if (previewModal.classList.contains("hidden")) {
          void openPreview();
        }
      }
    });
  }

  function closePreview() {
    documentApi.body?.classList?.remove("preview-open");
    closeManagedPreviewController({
      state,
      previewState: immersivePreviewState,
      previewBody,
      previewModal,
      removeCropLivePreview,
      clearSelectedVisualAnnotation,
      cancelTextLayer: cancelImmersiveTextLayer,
      hidePreviewSelectionToolbar,
      hideWorkspaceSelectionToolbar,
      resetPreviewSearchState,
      syncPreviewToolButtons,
      updateUndoAvailability,
      resetPreviewHelper: () => updatePreviewHelper(),
      syncAnnotationStyleBar,
      renderThumbs,
      hasWorkspaceSearchQuery: () => Boolean(workspaceSearchState.normalizedQuery),
      scheduleWorkspaceTextEditorSync
    });
  }

  windowApi.openVisualEditor = async (file) => {
    await openManagedStandaloneVisualEditor({
      file,
      pdfjsLib,
      previewModal,
      previewBody,
      state,
      updateUndoAvailability,
      updatePreviewHelper,
      getPreviewToolHelper: getManagedPreviewToolHelper,
      initPreviewCanvas,
      documentApi,
      consoleApi
    });
  };

  return {
    immersivePreviewState,
    workspaceTextEditorState,
    workspaceSearchState,
    updateImmersiveTransform,
    resetImmersiveZoom,
    cancelImmersiveTextLayer,
    updatePreviewSearchUi,
    clearPreviewSearchHighlights,
    getPreviewSearchMatchesForPage,
    renderPreviewSearchHighlights,
    hidePreviewSelectionToolbar,
    positionPreviewSelectionToolbar,
    showPreviewSelectionToolbar,
    getPreviewTextSelectionSnapshot,
    renderImmersiveAnnotationLayer,
    applyPreviewTextAnnotation,
    scheduleWorkspaceTextEditorSync,
    setWorkspaceSearchPanelVisible,
    updateWorkspaceSearchUi,
    resetWorkspaceSearchState,
    focusWorkspaceSearchMatch,
    setActiveWorkspaceSearchMatch,
    stepWorkspaceSearch,
    runWorkspaceSearch,
    scheduleWorkspaceSearch,
    cancelWorkspaceTextLayer,
    hideWorkspaceSelectionToolbar,
    clearWorkspaceTextEditor,
    positionWorkspaceSelectionToolbar,
    showWorkspaceSelectionToolbar,
    clearWorkspaceSearchHighlights,
    getWorkspaceSearchMatchesForPage,
    renderWorkspaceSearchHighlights,
    renderWorkspaceAnnotationLayer,
    getWorkspaceTextSelectionSnapshot,
    syncWorkspaceTextSelectionState,
    refreshWorkspaceSelectionToolbar,
    applyWorkspaceTextAnnotation,
    renderWorkspaceTextLayer,
    syncWorkspaceTextEditor,
    resetPreviewSearchState,
    setActivePreviewSearchMatch,
    stepPreviewSearch,
    runPreviewSearch,
    schedulePreviewSearch,
    renderImmersiveTextLayer,
    updateImmersivePagination,
    navigatePreview,
    renderPreviewAtCurrentIndex,
    rotatePreviewPage,
    deletePreviewPage,
    openPreview,
    openVisualEditorForPage,
    ensureInPlaceEditor,
    updateWorkspaceNavigation,
    applyWorkspaceZoom,
    syncPreviewToolButtons,
    setActivePreviewTool,
    redrawPreviewOverlay,
    initPreviewCanvas,
    closePreview,
    updatePreviewHelper
  };
}
