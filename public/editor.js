import * as pdfjsLib from "/vendor/pdfjs/pdf.mjs";
import {
  cloneAnnotation,
} from "./editor-annotation-utils.js?v=0414b";
import {
  applyManagedSnapshot,
  captureManagedStateSnapshot,
  globalManagedRedo,
  globalManagedUndo,
  pushManagedHistory,
  restoreManagedWorkspaceEditingUi,
  updateManagedUndoRedoUi
} from "./editor-history-runtime.js?v=0414b";
import {
  showManagedEditorResult,
  updateManagedImageLabel,
  addManagedBookmark,
  markManagedBookmarksDirty,
  markManagedMetadataDirty,
  removeManagedBookmark,
  renderManagedBookmarksList,
  setManagedBookmarks,
  setManagedMetadataFields
} from "./editor-metadata-runtime.js?v=0414b";
import {
  buildManagedEditorFormData,
  buildManagedEditorRecipe,
  exportManagedEditedPdf,
  insertManagedEditorFiles,
  loadManagedEditor,
  loadManagedEditorCapabilities,
  saveManagedEditedPdfOnline,
  setManagedCurrentUser,
  setManagedOcrAvailability,
  suggestManagedSaveName
} from "./editor-file-runtime.js?v=0414b";
import {
  applyManagedPageStageViewport,
  areManagedCropsEqual,
  clampManagedCropToBounds,
  cloneManagedCrop,
  getManagedDisplayCropRect,
  getManagedPageDisplayCanvas,
  invalidateManagedPageDisplayCache,
  isManagedPointInCrop,
  removeManagedCropLivePreview,
  renderManagedCropLivePreview
} from "./editor-crop-runtime.js?v=0414b";
import {
  applyManagedAnnotationStyleControls,
  clearManagedSelectedVisualAnnotation,
  deleteManagedSelectedVisualAnnotationController,
  drawManagedExistingPageDataController,
  ensureManagedPreviewPageState,
  getManagedActiveVisualPage,
  getManagedAnnotationDefaultStyle,
  getManagedSelectedVisualAnnotation,
  getManagedWorkspaceVisualPage,
  pushManagedVisualHistory,
  refreshManagedActiveAnnotationVisuals,
  setManagedSelectedVisualAnnotation,
  syncManagedAnnotationStyleBar,
  undoManagedAnnotationEditController,
  updateManagedAnnotationUndoAvailabilityController,
  updateManagedPreviewHelper
} from "./editor-annotation-runtime.js?v=0414b";
import {
  applyManagedPageSplit,
  disconnectManagedThumbObservers,
  duplicateManagedSelectedPages,
  ensureManagedPageCanvas,
  forManagedSelectedPages,
  hasManagedPageEdits,
  insertManagedBlankPage,
  moveManagedPage,
  moveManagedSelection,
  processManagedThumbQueue,
  printManagedPages,
  queueManagedPageRender,
  recycleManagedPageCanvas,
  refreshManagedSelectionCards,
  renderManagedPageThumbnails,
  requestManagedRenderAround,
  resetManagedThumbQueue,
  setupManagedThumbObservers,
  updateManagedSplitFieldState,
  updateManagedThumbCard
} from "./editor-pages-runtime.js?v=0414b";
import {
  createManagedEditorState,
  queryManagedEditorDom,
} from "./editor-bootstrap-runtime.js?v=0414b";
import {
  setupManagedEditorBindings,
} from "./editor-bindings-runtime.js?v=0414b";
import {
  createManagedPreviewOrchestration,
} from "./editor-preview-orchestration-runtime.js?v=0414b";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.mjs";

const PREVIEW_RENDER_SCALE = 1.5;

const {
  editorFileInput,
  editorEmpty,
  editorShell,
  editorDropZone,
  editorDropOverlay,
  thumbGrid,
  editorFilename,
  editorMeta,
  editorResult,
  previewModal,
  previewBody,
  previewCloseBtn,
  previewSelectionToolbar,
  previewTextHighlightBtn,
  previewTextUnderlineBtn,
  previewTextSelectionCloseBtn,
  workspaceSelectionToolbar,
  workspaceTextHighlightBtn,
  workspaceTextUnderlineBtn,
  workspaceTextSelectionCloseBtn,
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
  controls
} = queryManagedEditorDom(document);

const state = createManagedEditorState();
state.pageFilterMode = "all";

// --- History & Undo/Redo ---

function captureStateSnapshot() {
  return captureManagedStateSnapshot(state.pages);
}

function pushHistory() {
  pushManagedHistory({
    state,
    captureSnapshot: captureManagedStateSnapshot,
    updateUndoRedoUi: updateUndoRedoUI
  });
}

function applySnapshot(snapshot) {
  applyManagedSnapshot({
    state,
    snapshot,
    renderThumbs,
    updateUndoRedoUi: updateUndoRedoUI,
    syncAnnotationStyleBar
  });
}

function globalUndo() {
  globalManagedUndo({
    state,
    captureSnapshot: captureManagedStateSnapshot,
    applySnapshot
  });
}

function globalRedo() {
  globalManagedRedo({
    state,
    captureSnapshot: captureManagedStateSnapshot,
    applySnapshot
  });
}

function updateUndoRedoUI() {
  updateManagedUndoRedoUi({
    documentApi: document,
    historyLength: state.historyStack.length,
    redoLength: state.redoStack.length
  });
}

function getPageDisplayCanvas(page) {
  return getManagedPageDisplayCanvas({
    page,
    documentApi: document
  });
}

function getDisplayCropRect(page, options = {}) {
  return getManagedDisplayCropRect({
    state,
    page,
    ignoreEditingState: options.ignoreEditingState === true
  });
}

function applyPageStageViewport(stage, surface, page, displayCanvas) {
  applyManagedPageStageViewport({
    state,
    stage,
    surface,
    page,
    displayCanvas
  });
}

function removeCropLivePreview() {
  removeManagedCropLivePreview({
    documentApi: document
  });
}

function renderCropLivePreview(page) {
  renderManagedCropLivePreview({
    state,
    thumbGrid,
    page,
    getPageDisplayCanvas,
    documentApi: document
  });
}

function isPointInCrop(coords, crop) {
  return isManagedPointInCrop(coords, crop);
}

function updatePreviewHelper(message = "") {
  updateManagedPreviewHelper({
    helperElement: document.querySelector("#previewHelper"),
    message,
    tool: state.activeTool
  });
}

function pushVisualHistory(page, entry) {
  pushManagedVisualHistory(page, entry);
}

function getSelectedVisualAnnotation(page = null) {
  return getManagedSelectedVisualAnnotation({
    state,
    page
  });
}

function setSelectedVisualAnnotation(page, index) {
  setManagedSelectedVisualAnnotation({
    state,
    page,
    index
  });
}

function clearSelectedVisualAnnotation({ pageId = null } = {}) {
  clearManagedSelectedVisualAnnotation({
    state,
    pageId
  });
}

function getAnnotationDefaultStyle(tool) {
  return getManagedAnnotationDefaultStyle({
    state,
    tool
  });
}

function syncAnnotationStyleBar() {
  syncManagedAnnotationStyleBar({
    state,
    controls,
    getActiveVisualPage
  });
}

function refreshActiveAnnotationVisuals(page) {
  refreshManagedActiveAnnotationVisuals({
    state,
    previewModal,
    previewState: immersivePreviewState,
    workspaceTextEditorState,
    page,
    redrawPreviewOverlay,
    renderImmersiveAnnotationLayer,
    renderWorkspaceAnnotationLayer,
    updateThumbCard,
    updateMeta,
    updateUndoAvailability,
    syncAnnotationStyleBar
  });
}

function applyAnnotationStyleControls() {
  applyManagedAnnotationStyleControls({
    state,
    controls,
    getActiveVisualPage,
    refreshVisuals: refreshActiveAnnotationVisuals,
    setResult: setEditorResult
  });
}

function getWorkspaceVisualPage() {
  return getManagedWorkspaceVisualPage({
    state,
    previewModal,
    selectedIndices
  });
}

function getActiveVisualPage() {
  return getManagedActiveVisualPage({
    state,
    previewModal,
    previewState: immersivePreviewState,
    getWorkspaceVisualPage
  });
}

function deleteSelectedVisualAnnotation() {
  return deleteManagedSelectedVisualAnnotationController({
    state,
    getActiveVisualPage,
    refreshVisuals: refreshActiveAnnotationVisuals,
    setResult: setEditorResult
  });
}

function updateUndoAvailability() {
  updateManagedAnnotationUndoAvailabilityController({
    activePage: getActiveVisualPage(),
    undoButton: controls.toolUndo
  });
}

function restoreActiveWorkspaceEditingUi() {
  restoreManagedWorkspaceEditingUi({
    state,
    requestFrame: requestAnimationFrame,
    ensureInPlaceEditor,
    scheduleWorkspaceTextEditorSync
  });
}

function undoPreviewEdit() {
  undoManagedAnnotationEditController({
    state,
    previewState: immersivePreviewState,
    previewModal,
    page: getActiveVisualPage(),
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
    setResult: setEditorResult
  });
}

function setEditorResult(message, isError = false) {
  showManagedEditorResult({
    windowApi: window,
    resultElement: editorResult,
    message,
    isError
  });
}

function updateWatermarkImageLabel() {
  updateManagedImageLabel({
    labelElement: controls.watermarkImageName,
    fileName: state.watermarkImageName,
    selectedPrefix: "已选择图片水印：",
    emptyText: "未选择图片水印。支持 PNG、JPG。"
  });
}

function updateStampImageLabel() {
  updateManagedImageLabel({
    labelElement: controls.stampImageName,
    fileName: state.stampImageName,
    selectedPrefix: "已选择印章图片：",
    emptyText: "未选择印章图片。支持 PNG、JPG。"
  });
}

function setOcrAvailability(available) {
  setManagedOcrAvailability({
    controls,
    available
  });
}

async function loadEditorCapabilities() {
  await loadManagedEditorCapabilities({
    fetchApi: fetch,
    applyOcrAvailability: setOcrAvailability
  });
}

function hasUnsavedChanges() {
  if (!Array.isArray(state.pages) || state.pages.length === 0) {
    return false;
  }

  return (
    JSON.stringify(captureStateSnapshot()) !== JSON.stringify(state.cleanPagesSnapshot || []) ||
    buildMetadataSignature() !== String(state.cleanMetadataSignature || "") ||
    buildBookmarksSignature() !== String(state.cleanBookmarksSignature || "")
  );
}

function confirmDiscardUnsavedChanges(message = "当前有未保存修改，继续后将丢失这些更改。是否继续？") {
  if (!hasUnsavedChanges()) {
    return true;
  }
  return window.confirm(message);
}

function buildMetadataSignature() {
  return JSON.stringify({
    enabled: Boolean(controls.metadataEnabled?.checked),
    clearExisting: Boolean(controls.metadataClearExisting?.checked),
    title: String(controls.metadataTitle?.value || ""),
    author: String(controls.metadataAuthor?.value || ""),
    subject: String(controls.metadataSubject?.value || ""),
    keywords: String(controls.metadataKeywords?.value || "")
  });
}

function buildBookmarksSignature() {
  return JSON.stringify({
    enabled: Boolean(controls.bookmarksEnabled?.checked),
    items: state.bookmarks
  });
}

function markEditorSavedState() {
  state.cleanPagesSnapshot = captureStateSnapshot();
  state.cleanMetadataSignature = buildMetadataSignature();
  state.cleanBookmarksSignature = buildBookmarksSignature();
}

function setMetadataFields(values, options = {}) {
  setManagedMetadataFields({
    controls,
    state,
    values,
    markDirty: options.markDirty === true
  });
}

function setBookmarks(items, options = {}) {
  setManagedBookmarks({
    state,
    controls,
    items,
    autoEnable: options.autoEnable === true,
    renderBookmarksList
  });
}

function addBookmark(initial = {}) {
  addManagedBookmark({
    state,
    initial,
    visiblePages,
    markBookmarksDirty,
    renderBookmarksList
  });
}

function removeBookmark(index) {
  removeManagedBookmark({
    state,
    index,
    markBookmarksDirty,
    renderBookmarksList
  });
}

function renderBookmarksList() {
  renderManagedBookmarksList({
    bookmarksList: controls.bookmarksList,
    bookmarks: state.bookmarks
  });
}

function markBookmarksDirty() {
  markManagedBookmarksDirty({
    state,
    controls
  });
}

function markMetadataDirty() {
  markManagedMetadataDirty(state);
}

function setCurrentUser(user) {
  setManagedCurrentUser({
    state,
    user
  });
  window.dispatchEvent(new CustomEvent("editor:user-changed", {
    detail: { user: user || null }
  }));
}

function syncPagePreviewSettings() {
  state.pagePreviewSettings = {
    enabled: Boolean(controls.resizeEnabled?.checked),
    pageSize: String(controls.resizePageSize?.value || "keep"),
    orientation: String(controls.resizeOrientation?.value || "auto"),
    margin: Number(controls.resizeMargin?.value || 0),
    backgroundColor: String(controls.resizeBackgroundColor?.value || "#ffffff"),
    fitMode: String(controls.resizeFitMode?.value || "keep")
  };
}

function updateSplitFieldState() {
  updateManagedSplitFieldState({ controls });
}

function visiblePages() {
  return state.pages.filter((page) => !page.deleted).length;
}

function deletedPages() {
  return state.pages.filter((page) => page.deleted).length;
}

function editedPages() {
  return state.pages.filter(
    (page) => !page.deleted && hasManagedPageEdits(page)
  ).length;
}

function renderedPages() {
  return state.pages.filter((page) => page.rendered).length;
}

function updateMeta() {
  const activeSelectionCount = selectedIndices().filter((index) => {
    const page = state.pages[index];
    return page && !page.deleted;
  }).length;
  const selectionHint =
    activeSelectionCount > 1
      ? ` | 可批量复制 / 导出 / 删除 ${activeSelectionCount} 页`
      : activeSelectionCount === 1
        ? " | 可直接预览、复制或删除当前页"
        : "";
  editorFilename.textContent =
    state.files.length === 0
      ? "未加载文件"
      : state.files.length === 1
        ? state.files[0].name
        : `${state.files.length} 个文件已载入`;
  editorMeta.textContent =
    `已选${state.selected.size}/${visiblePages()} | 保留 ${visiblePages()}/${state.pages.length} | 已删 ${deletedPages()} | 已编辑 ${editedPages()} | 渲染 ${renderedPages()}/${state.pages.length}${state.pageFilterMode !== "all" ? ` | 筛选 ${getPageFilterLabel(state.pageFilterMode)}` : ""}${selectionHint}`;
  syncToolbarActionAvailability();
}

function selectedIndices() {
  return Array.from(state.selected).sort((a, b) => a - b);
}

function getPrimarySelectedIndex() {
  return selectedIndices()[0] ?? 0;
}

function syncToolbarActionAvailability() {
  const activeSelection = selectedIndices().filter((index) => {
    const page = state.pages[index];
    return page && !page.deleted;
  });
  const activeSelectionCount = activeSelection.length;
  const visiblePageCount = visiblePages();
  const firstSelectedIndex = activeSelection[0] ?? -1;
  const lastSelectedIndex = activeSelection.at(-1) ?? -1;
  const hasDocument = state.pages.length > 0;
  const deletedSelectionCount = selectedIndices().filter((index) => {
    const page = state.pages[index];
    return page && page.deleted;
  }).length;
  const canMoveUp = activeSelectionCount > 0 && firstSelectedIndex > 0;
  const canMoveDown = activeSelectionCount > 0 && lastSelectedIndex >= 0 && lastSelectedIndex < state.pages.length - 1;

  if (controls.clearSelectionBtn) {
    controls.clearSelectionBtn.disabled = activeSelectionCount < 1;
  }
  if (controls.duplicatePageBtn) {
    controls.duplicatePageBtn.disabled = activeSelectionCount < 1;
  }
  if (controls.exportSelectedPagesBtn) {
    controls.exportSelectedPagesBtn.disabled = activeSelectionCount < 1;
  }
  if (controls.restoreSelectedPagesBtn) {
    controls.restoreSelectedPagesBtn.disabled = deletedSelectionCount < 1;
  }
  if (controls.moveUpBtn) {
    controls.moveUpBtn.disabled = !canMoveUp;
  }
  if (controls.moveDownBtn) {
    controls.moveDownBtn.disabled = !canMoveDown;
  }
  if (controls.rotateLeftBtn) {
    controls.rotateLeftBtn.disabled = activeSelectionCount < 1;
  }
  if (controls.rotateRightBtn) {
    controls.rotateRightBtn.disabled = activeSelectionCount < 1;
  }
  if (controls.deleteBtn) {
    controls.deleteBtn.disabled = activeSelectionCount < 1;
  }
  if (controls.previewBtn) {
    controls.previewBtn.disabled = visiblePageCount < 1;
  }
  if (controls.printBtn) {
    controls.printBtn.disabled = visiblePageCount < 1;
  }
  if (controls.insertBlankBtn) {
    controls.insertBlankBtn.disabled = !hasDocument;
  }
  if (controls.toggleDeletedFilterBtn) {
    controls.toggleDeletedFilterBtn.disabled = !hasDocument;
    controls.toggleDeletedFilterBtn.classList.toggle("active", state.pageFilterMode !== "all");
    controls.toggleDeletedFilterBtn.textContent = `筛选: ${getPageFilterLabel(state.pageFilterMode)}`;
  }
  if (controls.purgeDeletedPagesBtn) {
    controls.purgeDeletedPagesBtn.disabled = deletedPages() < 1;
  }
}

function getPageFilterLabel(mode) {
  if (mode === "active") return "正常";
  if (mode === "deleted") return "已删除";
  if (mode === "edited") return "有编辑";
  return "全部";
}

function findPageById(pageId) {
  return state.pages.find((page) => String(page.id) === String(pageId)) || null;
}

function isWorkspaceTextLayerTarget(target) {
  return target instanceof Element && Boolean(target.closest(".workspace-text-layer"));
}

function updateThumbCard(page) {
  updateManagedThumbCard({
    page,
    state,
    thumbGrid,
    getPageDisplayCanvas,
    applyPageStageViewport,
    restoreWorkspaceEditingUi: restoreActiveWorkspaceEditingUi,
    documentApi: document
  });
}

function recyclePageCanvas(page) {
  recycleManagedPageCanvas({
    page,
    state,
    invalidatePageDisplayCache: invalidateManagedPageDisplayCache,
    updateThumbCard,
    updateMeta
  });
}

async function ensurePageCanvas(page, renderToken) {
  return ensureManagedPageCanvas({
    page,
    state,
    renderToken,
    renderScale: PREVIEW_RENDER_SCALE,
    invalidatePageDisplayCache: invalidateManagedPageDisplayCache,
    updateThumbCard,
    updateMeta,
    documentApi: document
  });
}

function queuePageRender(pageId, prioritize = false) {
  queueManagedPageRender({
    state,
    pageId,
    prioritize
  });
}

async function processThumbQueue(renderToken) {
  await processManagedThumbQueue({
    state,
    renderToken,
    ensurePageCanvas,
    renderedPages,
    setResult: setEditorResult,
    timerApi: window
  });
}

function requestRenderAround(index, prioritize = false) {
  requestManagedRenderAround({
    state,
    index,
    prioritize,
    queuePageRender: (pageId, shouldPrioritize) => {
      queuePageRender(pageId, shouldPrioritize);
    },
    processThumbQueue: (nextRenderToken) => {
      void processThumbQueue(nextRenderToken);
    }
  });
}

async function printDocument() {
  await printManagedPages({
    state,
    ensurePageCanvas: (page) => ensurePageCanvas(page, state.renderToken),
    setResult: setEditorResult,
    documentApi: document,
    windowApi: window,
    consoleApi: console
  });
}

function applySplit() {
  applyManagedPageSplit({
    state,
    controls,
    cloneAnnotation,
    setResult: setEditorResult,
    renderThumbs
  });
}

function drawExistingPageData(overlay, page, options = {}) {
  drawManagedExistingPageDataController({
    state,
    overlay,
    page,
    options
  });
}

const {
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
  closePreview
} = createManagedPreviewOrchestration({
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
  setResult: setEditorResult,
  getActiveVisualPage,
  getWorkspaceVisualPage,
  getSelectedVisualAnnotation,
  clearSelectedVisualAnnotation,
  ensurePreviewPageState: ensureManagedPreviewPageState,
  pushVisualHistory,
  updateThumbCard,
  updateMeta,
  updateUndoAvailability,
  syncAnnotationStyleBar,
  invalidatePageDisplayCache: invalidateManagedPageDisplayCache,
  cloneCrop: cloneManagedCrop,
  clampCropToBounds: clampManagedCropToBounds,
  cropsEqual: areManagedCropsEqual,
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
  documentApi: document,
  windowApi: window,
  requestFrame: requestAnimationFrame,
  consoleApi: console
});

function renderThumbs() {
  renderManagedPageThumbnails({
    thumbGrid,
    state,
    getPageDisplayCanvas,
    applyPageStageViewport,
    isWorkspaceTextLayerTarget,
    openVisualEditorForPage,
    renderThumbs,
    refreshSelectionCards,
    updateWorkspaceNavigation,
    openPreview,
    movePage,
    duplicateSelectedPages,
    deleteSelectedPages,
    insertBlankPage,
    insertLocalPdfAtSelection,
    insertWorkspaceSelectedPdf,
    exportCurrentPage,
    exportSelectedPages,
    restoreDeletedPage,
    updateMeta,
    setupThumbObserver: () => {
      setupManagedThumbObservers({
        state,
        thumbGrid,
        requestRenderAround,
        recyclePageCanvas
      });
    },
    requestRenderAround,
    restoreWorkspaceEditingUi: restoreActiveWorkspaceEditingUi,
    filterMode: state.pageFilterMode,
    documentApi: document,
    platform: navigator.platform
  });
}

function refreshSelectionCards(previousSelection = new Set()) {
  refreshManagedSelectionCards({
    state,
    previousSelection,
    updateThumbCard,
    updateMeta,
    restoreWorkspaceEditingUi: restoreActiveWorkspaceEditingUi
  });
}

function moveSelection(direction) {
  moveManagedSelection({
    state,
    direction,
    setResult: setEditorResult,
    renderThumbs
  });
}

function movePage(fromIndex, toIndex) {
  moveManagedPage({
    state,
    fromIndex,
    toIndex,
    pushHistory,
    renderThumbs
  });
}

function duplicateSelectedPages() {
  duplicateManagedSelectedPages({
    state,
    pushHistory,
    cloneAnnotation,
    cloneCrop: cloneManagedCrop,
    setResult: setEditorResult,
    renderThumbs
  });
}

function deleteSelectedPages() {
  const deletedCount = selectedIndices().filter((index) => {
    const page = state.pages[index];
    return page && !page.deleted;
  }).length;
  if (deletedCount < 1) {
    setEditorResult("请先选中要删除的页面。", true);
    return;
  }
  pushHistory();
  forSelectedPages((page) => {
    page.deleted = true;
  });
  const undoHint = /mac/i.test(navigator.platform || "") ? "Cmd+Z" : "Ctrl+Z";
  setEditorResult(`已移入回收区 ${deletedCount} 页，可按 ${undoHint} 撤销。`);
}

function restoreDeletedPage(index) {
  const page = state.pages[index];
  if (!page || !page.deleted) {
    setEditorResult("当前页面无需恢复。", true);
    return false;
  }
  pushHistory();
  page.deleted = false;
  state.selected = new Set([index]);
  state.lastSelectedIndex = index;
  renderThumbs();
  setEditorResult(`已恢复第 ${index + 1} 页。`);
  return true;
}

function restoreSelectedDeletedPages() {
  const indexes = selectedIndices().filter((index) => {
    const page = state.pages[index];
    return page && page.deleted;
  });
  if (indexes.length < 1) {
    setEditorResult("请先选中要恢复的已删除页面。", true);
    return false;
  }
  pushHistory();
  indexes.forEach((index) => {
    state.pages[index].deleted = false;
  });
  renderThumbs();
  setEditorResult(`已恢复 ${indexes.length} 页。`);
  return true;
}

function toggleDeletedOnlyFilter() {
  const order = ["all", "active", "deleted", "edited"];
  const currentIndex = order.indexOf(state.pageFilterMode);
  state.pageFilterMode = order[(currentIndex + 1) % order.length];
  renderThumbs();
  setEditorResult(`当前筛选：${getPageFilterLabel(state.pageFilterMode)}。`);
  return true;
}

function purgeDeletedPages() {
  const count = deletedPages();
  if (count < 1) {
    setEditorResult("当前没有可清理的已删除页面。", true);
    return false;
  }
  const confirmed = window.confirm(`确认永久清理 ${count} 页已删除页面吗？此操作不能通过恢复按钮找回。`);
  if (!confirmed) return false;
  pushHistory();
  const previousSelectedPageIds = new Set(
    selectedIndices()
      .map((index) => state.pages[index]?.id)
      .filter(Boolean)
  );
  state.pages = state.pages.filter((page) => !page.deleted);
  state.selected = new Set(
    state.pages
      .map((page, index) => (previousSelectedPageIds.has(page.id) ? index : -1))
      .filter((index) => index >= 0)
  );
  state.lastSelectedIndex = Array.from(state.selected).at(-1) ?? null;
  state.pageFilterMode = "all";
  renderThumbs();
  setEditorResult(`已永久清理 ${count} 页。`);
  return true;
}

function forSelectedPages(action) {
  forManagedSelectedPages({
    state,
    action,
    setResult: setEditorResult,
    renderThumbs
  });
}

function insertBlankPage(options = {}) {
  insertManagedBlankPage({
    state,
    pushHistory,
    setResult: setEditorResult,
    renderThumbs,
    options: {
      ...options,
      afterInsert: (page) => {
        if (!page) return;
        const card = thumbGrid?.querySelector?.(`[data-page-id="${page.id}"]`);
        card?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      }
    }
  });
}

function pickInsertPdfFiles() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.multiple = true;
    input.className = "hidden";
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      input.remove();
      resolve(files);
    }, { once: true });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve([]);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

async function insertLocalPdfAtSelection(options = {}) {
  const files = await pickInsertPdfFiles();
  if (files.length === 0) return false;
  return insertEditorFiles(files, options);
}

async function insertWorkspaceSelectedPdf(options = {}) {
  if (typeof window.insertSelectedWorkspaceFilesInEditor !== "function") {
    setEditorResult("左侧空间尚未准备好，暂时无法插入已选文件。", true);
    return false;
  }
  await window.insertSelectedWorkspaceFilesInEditor(options);
  return true;
}

async function loadEditor(files, options = {}) {
  if (!options.force && !confirmDiscardUnsavedChanges()) {
    return false;
  }

  state.pageFilterMode = "all";

  await loadManagedEditor({
    files,
    pdfjsLib,
    state,
    controls,
    setResult: setEditorResult,
    clearSelectedVisualAnnotation,
    resetPreviewSearchState,
    resetWorkspaceSearchState,
    setWorkspaceSearchPanelVisible,
    disconnectThumbObserver: () => disconnectManagedThumbObservers({ state }),
    resetThumbQueue: () => resetManagedThumbQueue({ state }),
    setMetadataFields,
    setBookmarks,
    editorEmpty,
    editorShell,
    renderThumbs,
    syncAnnotationStyleBar,
    windowApi: window,
    consoleApi: console
  });
  markEditorSavedState();
  return true;
}

async function insertEditorFiles(files, options = {}) {
  return insertManagedEditorFiles({
    files,
    pdfjsLib,
    state,
    controls,
    setResult: setEditorResult,
    pushHistory,
    renderThumbs,
    updateMeta,
    loadEditor,
    options: {
      ...options,
      afterInsert: (page) => {
        if (!page) return;
        const card = thumbGrid?.querySelector?.(`[data-page-id="${page.id}"]`);
        card?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      }
    },
    windowApi: window,
    consoleApi: console
  });
}

function buildRecipe() {
  return buildManagedEditorRecipe({
    state,
    controls,
    visiblePages
  });
}

function buildEditorFormData() {
  return buildManagedEditorFormData({
    state,
    buildRecipe
  });
}

function suggestedSaveName() {
  return suggestManagedSaveName({
    state,
    controls
  });
}

function buildSubsetExportName(activeIndexes) {
  const baseName = String(suggestedSaveName() || "workspace_result.pdf").trim() || "workspace_result.pdf";
  const normalized = /\.pdf$/i.test(baseName) ? baseName : `${baseName}.pdf`;
  const dotIndex = normalized.lastIndexOf(".");
  const stem = dotIndex > 0 ? normalized.slice(0, dotIndex) : normalized;
  const extension = dotIndex > 0 ? normalized.slice(dotIndex) : ".pdf";
  if (activeIndexes.length <= 1) {
    const pageIndex = activeIndexes[0] ?? 0;
    return `${stem}-page-${pageIndex + 1}${extension}`;
  }
  return `${stem}-selected-${activeIndexes.length}p${extension}`;
}

async function exportSubsetPages(indices) {
  const activeIndexes = Array.from(new Set(indices))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < state.pages.length)
    .filter((index) => state.pages[index] && !state.pages[index].deleted)
    .sort((a, b) => a - b);

  if (activeIndexes.length === 0) {
    setEditorResult("没有可导出的页面。", true);
    return false;
  }

  const previousDeletedFlags = state.pages.map((page) => !!page.deleted);
  const previousExportMode = controls.exportMode?.value || "single";
  const previousSaveName = controls.saveName?.value || "";
  const activeSet = new Set(activeIndexes);

  try {
    state.pages.forEach((page, index) => {
      page.deleted = !activeSet.has(index);
    });
    if (controls.exportMode) {
      controls.exportMode.value = "single";
    }
    if (controls.saveName) {
      controls.saveName.value = buildSubsetExportName(activeIndexes);
    }
    updateSplitFieldState();
    updateMeta();

    await exportManagedEditedPdf({
      state,
      controls,
      visiblePages: () => activeIndexes.length,
      setResult: setEditorResult,
      buildEditorFormData,
      suggestedSaveName,
      fetchApi: fetch,
      documentApi: document
    });
    return true;
  } finally {
    state.pages.forEach((page, index) => {
      page.deleted = previousDeletedFlags[index];
    });
    if (controls.exportMode) {
      controls.exportMode.value = previousExportMode;
    }
    if (controls.saveName) {
      controls.saveName.value = previousSaveName;
    }
    updateSplitFieldState();
    updateMeta();
  }
}

async function exportCurrentPage(index) {
  return exportSubsetPages([index]);
}

async function exportSelectedPages() {
  return exportSubsetPages(selectedIndices());
}

async function exportEditedPdf() {
  await exportManagedEditedPdf({
    state,
    controls,
    visiblePages,
    setResult: setEditorResult,
    buildEditorFormData,
    suggestedSaveName,
    fetchApi: fetch,
    documentApi: document
  });
}

async function saveEditedPdfOnline() {
  return saveManagedEditedPdfOnline({
    state,
    controls,
    visiblePages,
    setResult: setEditorResult,
    buildEditorFormData,
    suggestedSaveName,
    closePreview,
    loadEditor,
    fetchApi: fetch,
    documentApi: document
  });
}

const bindingElements = {
  editorFileInput,
  editorEmpty,
  editorDropZone,
  editorDropOverlay,
  previewModal,
  previewBody,
  previewCloseBtn,
  previewTextHighlightBtn,
  previewTextUnderlineBtn,
  previewTextSelectionCloseBtn,
  workspaceTextHighlightBtn,
  workspaceTextUnderlineBtn,
  workspaceTextSelectionCloseBtn,
  editorWorkspaceSearchToggleBtn,
  editorWorkspaceSearchPanel,
  editorWorkspaceSearchInput,
  editorWorkspaceSearchPrevBtn,
  editorWorkspaceSearchNextBtn,
  previewSearchInput,
  previewSearchPrevBtn,
  previewSearchNextBtn
};

const bindingActions = {
  addBookmark,
  applyAnnotationStyleControls,
  applyPreviewTextAnnotation,
  applySplit,
  applyWorkspaceTextAnnotation,
  applyWorkspaceZoom,
  clearSelectedVisualAnnotation,
  cloneAnnotation,
  cloneCrop: cloneManagedCrop,
  closePreview,
  deletePreviewPage,
  deleteSelectedVisualAnnotation,
  deleteSelectedPages,
  duplicateSelectedPages,
  ensurePreviewPageState: ensureManagedPreviewPageState,
  exportEditedPdf,
  exportSelectedPages,
  forSelectedPages,
  getActiveVisualPage,
  hasUnsavedChanges,
  globalRedo,
  globalUndo,
  hidePreviewSelectionToolbar,
  hideWorkspaceSelectionToolbar,
  insertBlankPage,
  insertEditorFiles,
  invalidatePageDisplayCache: invalidateManagedPageDisplayCache,
  loadEditor,
  loadEditorCapabilities,
  markBookmarksDirty,
  markMetadataDirty,
  moveSelection,
  navigatePreview,
  openPreview,
  printDocument,
  pushHistory,
  pushVisualHistory,
  redrawPreviewOverlay,
  refreshSelectionCards,
  refreshWorkspaceSelectionToolbar,
  renderBookmarksList,
  renderImmersiveAnnotationLayer,
  renderPreviewAtCurrentIndex,
  renderThumbs,
  renderWorkspaceAnnotationLayer,
  resetImmersiveZoom,
  restoreDeletedPage,
  restoreSelectedDeletedPages,
  rotatePreviewPage,
  runPreviewSearch,
  runWorkspaceSearch,
  saveEditedPdfOnline,
  schedulePreviewSearch,
  scheduleWorkspaceSearch,
  scheduleWorkspaceTextEditorSync,
  setActivePreviewTool,
  setCurrentUser,
  setEditorResult,
  setWorkspaceSearchPanelVisible,
  stepPreviewSearch,
  stepWorkspaceSearch,
  syncAnnotationStyleBar,
  syncPagePreviewSettings,
  syncWorkspaceTextSelectionState,
  undoPreviewEdit,
  updateImmersiveTransform,
  updatePreviewSearchUi,
  updateSplitFieldState,
  updateStampImageLabel,
  updateThumbCard,
  updateUndoAvailability,
  updateUndoRedoUI,
  updateWatermarkImageLabel,
  updateWorkspaceSearchUi,
  toggleDeletedOnlyFilter,
  purgeDeletedPages
};

setupManagedEditorBindings({
  controls,
  state,
  immersivePreviewState,
  workspaceSearchState,
  elements: bindingElements,
  actions: bindingActions,
  documentApi: document,
  windowApi: window,
  platform: navigator.platform,
  consoleApi: console
});

syncPagePreviewSettings();
updateMeta();
