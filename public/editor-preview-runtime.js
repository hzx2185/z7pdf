export function findEquivalentMatchIndex(matches, targetMatch) {
  if (!targetMatch) return -1;
  return matches.findIndex(
    (match) =>
      match.pageIndex === targetMatch.pageIndex &&
      match.start === targetMatch.start &&
      match.end === targetMatch.end
  );
}

export function reconcilePreviewSearchMatchForPage({
  searchPending,
  normalizedQuery,
  currentIndex,
  searchMatches,
  activeMatchIndex,
  getMatchesForPage
}) {
  if (searchPending || !normalizedQuery) {
    return activeMatchIndex;
  }

  const activeMatch = searchMatches[activeMatchIndex] || null;
  if (activeMatch?.pageIndex === currentIndex) {
    return activeMatchIndex;
  }

  const firstPageMatch = getMatchesForPage(currentIndex)[0];
  if (!firstPageMatch) {
    return activeMatchIndex;
  }

  const matchIndex = findEquivalentMatchIndex(searchMatches, firstPageMatch);
  return matchIndex >= 0 ? matchIndex : activeMatchIndex;
}

const MANAGED_PAGE_SIZE_MAP = {
  A3: { width: 841.89, height: 1190.55 },
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 420.94, height: 595.28 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 }
};

function computeManagedPreviewContainSize(srcWidth, srcHeight, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / srcWidth, targetHeight / srcHeight);
  return {
    width: Math.max(1, srcWidth * scale),
    height: Math.max(1, srcHeight * scale)
  };
}

function computeManagedPreviewKeepSize(srcWidth, srcHeight, targetWidth, targetHeight) {
  const scale = Math.min(1, targetWidth / srcWidth, targetHeight / srcHeight);
  return {
    width: Math.max(1, srcWidth * scale),
    height: Math.max(1, srcHeight * scale)
  };
}

function normalizeManagedRotation(rotation = 0) {
  return ((Number(rotation || 0) % 360) + 360) % 360;
}

function createManagedRotatedPreviewCanvas(canvas, rotation, documentApi = globalThis.document) {
  const normalizedRotation = normalizeManagedRotation(rotation);
  if (normalizedRotation === 0) {
    return canvas;
  }

  const rotatedCanvas = documentApi.createElement("canvas");
  if (normalizedRotation === 90 || normalizedRotation === 270) {
    rotatedCanvas.width = canvas.height;
    rotatedCanvas.height = canvas.width;
  } else {
    rotatedCanvas.width = canvas.width;
    rotatedCanvas.height = canvas.height;
  }

  const context = rotatedCanvas.getContext("2d");
  if (!context) return canvas;

  context.save();
  if (normalizedRotation === 90) {
    context.translate(rotatedCanvas.width, 0);
    context.rotate(Math.PI / 2);
  } else if (normalizedRotation === 180) {
    context.translate(rotatedCanvas.width, rotatedCanvas.height);
    context.rotate(Math.PI);
  } else if (normalizedRotation === 270) {
    context.translate(0, rotatedCanvas.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(canvas, 0, 0);
  context.restore();
  return rotatedCanvas;
}

function resolveManagedPreviewPageLayout(canvas, previewSettings = {}) {
  const pageSizeConfig = MANAGED_PAGE_SIZE_MAP[previewSettings.pageSize] || null;
  const enabled = Boolean(previewSettings.enabled && pageSizeConfig);
  const canvasWidth = Math.max(1, canvas.width);
  const canvasHeight = Math.max(1, canvas.height);

  if (!enabled) {
    return {
      enabled: false,
      stageWidth: canvasWidth,
      stageHeight: canvasHeight,
      surfaceLeft: 0,
      surfaceTop: 0,
      surfaceWidth: canvasWidth,
      surfaceHeight: canvasHeight,
      backgroundColor: ""
    };
  }

  const resolvedOrientation =
    previewSettings.orientation === "landscape" || previewSettings.orientation === "portrait"
      ? previewSettings.orientation
      : canvasWidth > canvasHeight
        ? "landscape"
        : "portrait";
  const targetWidth =
    resolvedOrientation === "landscape"
      ? Math.max(pageSizeConfig.width, pageSizeConfig.height)
      : Math.min(pageSizeConfig.width, pageSizeConfig.height);
  const targetHeight =
    resolvedOrientation === "landscape"
      ? Math.min(pageSizeConfig.width, pageSizeConfig.height)
      : Math.max(pageSizeConfig.width, pageSizeConfig.height);
  const margin = Math.max(0, Number(previewSettings.margin || 0));
  const availableWidth = Math.max(1, targetWidth - margin * 2);
  const availableHeight = Math.max(1, targetHeight - margin * 2);
  let surfaceWidth = availableWidth;
  let surfaceHeight = availableHeight;

  if (previewSettings.fitMode !== "stretch") {
    const fitted = previewSettings.fitMode === "keep"
      ? computeManagedPreviewKeepSize(
        canvasWidth,
        canvasHeight,
        availableWidth,
        availableHeight
      )
      : computeManagedPreviewContainSize(
        canvasWidth,
        canvasHeight,
        availableWidth,
        availableHeight
      );
    surfaceWidth = fitted.width;
    surfaceHeight = fitted.height;
  }

  return {
    enabled: true,
    stageWidth: targetWidth,
    stageHeight: targetHeight,
    surfaceLeft: (targetWidth - surfaceWidth) / 2,
    surfaceTop: (targetHeight - surfaceHeight) / 2,
    surfaceWidth,
    surfaceHeight,
    backgroundColor: String(previewSettings.backgroundColor || "#ffffff")
  };
}

function createManagedPreviewCompositeCanvas({
  canvas,
  rotation = 0,
  previewSettings = null,
  documentApi = globalThis.document
}) {
  const displayCanvas = createManagedRotatedPreviewCanvas(canvas, rotation, documentApi);
  const layout = resolveManagedPreviewPageLayout(displayCanvas, previewSettings);
  if (!layout.enabled) {
    return {
      canvas: displayCanvas,
      textLayerEnabled: true
    };
  }

  const scaleFactor = Math.max(
    displayCanvas.width / Math.max(1, layout.surfaceWidth),
    displayCanvas.height / Math.max(1, layout.surfaceHeight)
  );
  const compositeCanvas = documentApi.createElement("canvas");
  compositeCanvas.width = Math.max(1, Math.round(layout.stageWidth * scaleFactor));
  compositeCanvas.height = Math.max(1, Math.round(layout.stageHeight * scaleFactor));

  const context = compositeCanvas.getContext("2d");
  if (!context) {
    return {
      canvas: displayCanvas,
      textLayerEnabled: true
    };
  }

  context.fillStyle = layout.backgroundColor || "#ffffff";
  context.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
  context.drawImage(
    displayCanvas,
    Math.round(layout.surfaceLeft * scaleFactor),
    Math.round(layout.surfaceTop * scaleFactor),
    Math.round(layout.surfaceWidth * scaleFactor),
    Math.round(layout.surfaceHeight * scaleFactor)
  );

  return {
    canvas: compositeCanvas,
    textLayerEnabled: false
  };
}

export function createImmersivePreviewStage(canvas, pageIndex, options = {}) {
  const {
    rotation = 0,
    previewSettings = null,
    documentApi = globalThis.document
  } = options;
  const previewComposite = createManagedPreviewCompositeCanvas({
    canvas,
    rotation,
    previewSettings,
    documentApi
  });
  const previewCanvas = previewComposite.canvas;
  const stage = document.createElement("div");
  stage.className = "preview-immersive-stage";
  stage.dataset.rotation = "0";
  stage.style.width = `${previewCanvas.width}px`;
  stage.style.height = `${previewCanvas.height}px`;
  stage.style.background = "";

  const surface = documentApi.createElement("div");
  surface.className = "preview-page-surface";
  surface.style.left = "0";
  surface.style.top = "0";
  surface.style.width = "100%";
  surface.style.height = "100%";

  const img = document.createElement("img");
  img.className = "full-preview-image";
  img.draggable = false;
  img.decoding = "async";
  img.alt = `第 ${pageIndex + 1} 页预览`;

  const annotationCanvas = document.createElement("canvas");
  annotationCanvas.className = "preview-annotation-canvas";
  annotationCanvas.width = previewCanvas.width;
  annotationCanvas.height = previewCanvas.height;

  const imageLoaded = new Promise((resolve, reject) => {
    img.addEventListener("load", resolve, { once: true });
    img.addEventListener("error", reject, { once: true });
  });

  img.src = previewCanvas.toDataURL("image/jpeg", 0.95);

  return {
    stage,
    surface,
    img,
    annotationCanvas,
    imageLoaded,
    textLayerEnabled: previewComposite.textLayerEnabled
  };
}

export async function renderManagedImmersivePreviewPage({
  page,
  pageIndex,
  previewState,
  previewSettings,
  updatePagination,
  reconcileActiveMatchIndex,
  updateSearchUi,
  beginRender,
  ensureCanvas,
  createStage,
  mountView,
  renderAnnotationLayer,
  startTextLayerRender,
  clearView,
  requestFrame = globalThis.requestAnimationFrame
}) {
  if (!page) return;

  updatePagination?.();

  const nextActiveMatchIndex = reconcileActiveMatchIndex?.(pageIndex);
  if (
    Number.isInteger(nextActiveMatchIndex) &&
    nextActiveMatchIndex !== previewState.activeSearchMatchIndex
  ) {
    previewState.activeSearchMatchIndex = nextActiveMatchIndex;
    updateSearchUi?.();
  }

  const loadingToken = Symbol("preview-load");
  previewState.loadingToken = loadingToken;
  beginRender?.(loadingToken);

  try {
    const canvas = await ensureCanvas(page);
    if (previewState.loadingToken !== loadingToken || !canvas) return;

    const {
      stage,
      surface,
      img,
      annotationCanvas,
      imageLoaded,
      textLayerEnabled
    } = createStage(canvas, pageIndex, {
      rotation: page.rotation || 0,
      previewSettings
    });

    await imageLoaded;
    if (previewState.loadingToken !== loadingToken) return;

    surface.appendChild(img);
    surface.appendChild(annotationCanvas);
    stage.appendChild(surface);

    mountView?.({
      stage,
      img,
      annotationCanvas
    });

    renderAnnotationLayer?.();

    requestFrame?.(() => {
      if (previewState.loadingToken !== loadingToken) return;
      img.classList.add("is-visible");
    });

    if (!page.isBlank && textLayerEnabled) {
      startTextLayerRender?.(page, surface, annotationCanvas, loadingToken);
    }
  } catch (error) {
    clearView?.(error);
  }
}

export async function openManagedStandaloneVisualEditor({
  file,
  pdfjsLib,
  previewModal,
  previewBody,
  state,
  updateUndoAvailability,
  updatePreviewHelper,
  getPreviewToolHelper,
  initPreviewCanvas,
  documentApi = globalThis.document,
  consoleApi = globalThis.console
}) {
  previewModal.classList.remove("hidden");
  previewBody.innerHTML = "<div class='loading-spinner'>正在加载 PDF 预览...</div>";

  try {
    const pdfUrl = `/api/workspace/files/${file.id}/download`;
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    const pdfPage = await pdf.getPage(1);

    const viewport = pdfPage.getViewport({ scale: 1.5 });
    const canvas = documentApi.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await pdfPage.render({
      canvasContext: context,
      viewport
    }).promise;

    const image = documentApi.createElement("img");
    image.src = canvas.toDataURL("image/png");
    image.className = "preview-canvas";
    image.id = "previewImage";
    previewBody.innerHTML = "";
    previewBody.appendChild(image);

    const virtualPage = {
      id: `file-${file.id}`,
      fileName: file.originalName,
      fileId: file.id,
      sourceIndex: 0,
      rotation: 0,
      visualMetadata: [],
      annotations: [],
      crop: null,
      visualHistory: []
    };

    state.previewPage = virtualPage;
    updateUndoAvailability?.();
    updatePreviewHelper?.(getPreviewToolHelper?.("pencil"));
    initPreviewCanvas?.(image, virtualPage);
    return virtualPage;
  } catch (error) {
    consoleApi.error("Visual editor load error:", error);
    previewBody.innerHTML = `<div class='error'>加载失败: ${error.message}</div>`;
    return null;
  }
}

export function mountImmersivePreviewView({
  previewState,
  previewBody,
  stage,
  img,
  annotationCanvas,
  resetZoom
}) {
  previewState.stageRef = stage;
  previewState.imgRef = img;
  previewState.annotationCanvasRef = annotationCanvas;
  previewBody.classList.remove("is-dragging");
  previewBody.innerHTML = "";
  previewBody.appendChild(stage);
  resetZoom(false);
}

export function clearImmersivePreviewView({
  previewState,
  previewBody,
  message = "预览失败"
}) {
  previewState.stageRef = null;
  previewState.imgRef = null;
  previewState.annotationCanvasRef = null;
  previewBody.classList.remove("is-dragging");
  previewBody.innerHTML = message;
}

export function updateManagedPreviewPagination({
  previewState,
  totalPages,
  currentElement,
  totalElement
}) {
  if (currentElement) {
    currentElement.textContent = previewState.currentIndex + 1;
  }
  if (totalElement) {
    totalElement.textContent = totalPages;
  }
}

export function navigateManagedPreview({
  previewState,
  pageCount,
  delta,
  renderCurrent
}) {
  if (pageCount === 0) return false;

  let newIndex = previewState.currentIndex + delta;
  if (newIndex < 0) newIndex = 0;
  if (newIndex >= pageCount) newIndex = pageCount - 1;
  if (newIndex === previewState.currentIndex) return false;

  previewState.currentIndex = newIndex;
  void renderCurrent?.();
  return true;
}

export async function renderManagedPreviewAtCurrentIndex({
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
  startTextLayerRender,
  resetZoom
}) {
  const index = previewState.currentIndex;
  const page = pages[index];

  await renderManagedImmersivePreviewPage({
    page,
    pageIndex: index,
    previewState,
    previewSettings,
    updatePagination,
    reconcileActiveMatchIndex: (currentIndex) =>
      reconcilePreviewSearchMatchForPage({
        searchPending: previewState.searchPending,
        normalizedQuery: previewState.normalizedSearchQuery,
        currentIndex,
        searchMatches: previewState.searchMatches,
        activeMatchIndex: previewState.activeSearchMatchIndex,
        getMatchesForPage
      }),
    updateSearchUi,
    beginRender: () => {
      cancelTextLayer?.();
      hideSelectionToolbar?.({ clearSelection: true });
    },
    ensureCanvas,
    createStage: createImmersivePreviewStage,
    mountView: ({ stage, img, annotationCanvas }) => {
      mountImmersivePreviewView({
        previewState,
        previewBody,
        stage,
        img,
        annotationCanvas,
        resetZoom
      });
    },
    renderAnnotationLayer,
    startTextLayerRender,
    clearView: () => {
      clearImmersivePreviewView({
        previewState,
        previewBody
      });
    }
  });
}

export function rotateManagedPreviewPage({
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
  pushHistory?.();

  const index = previewState.currentIndex;
  const page = pages[index];
  if (!page) return false;

  let currentRotation = Number.parseInt(page.rotation || "0", 10);
  currentRotation = (currentRotation + delta + 360) % 360;
  page.rotation = currentRotation;
  invalidatePageDisplayCache?.(page);

  if (previewState.stageRef) {
    previewState.stageRef.dataset.rotation = String(currentRotation);
    resetZoom?.(false);
    renderAnnotationLayer?.();
  }

  markMetadataDirty?.();
  renderThumbs?.();
  return true;
}

export function deleteManagedPreviewPage({
  pages,
  selectedPages,
  previewState,
  pushHistory,
  confirmDelete,
  closePreview,
  renderCurrent,
  renderThumbs
}) {
  pushHistory?.();

  const index = previewState.currentIndex;
  const page = pages[index];
  if (!page || pages.length <= 0) return false;

  if (!confirmDelete?.()) return false;

  pages.splice(index, 1);
  selectedPages?.clear?.();

  if (pages.length === 0) {
    closePreview?.();
  } else {
    if (previewState.currentIndex >= pages.length) {
      previewState.currentIndex = pages.length - 1;
    }
    void renderCurrent?.();
  }

  renderThumbs?.();
  return true;
}

export function openManagedPreview({
  pages,
  selectedPages,
  previewState,
  setResult,
  hideWorkspaceSelectionToolbar,
  resetPreviewSearchState,
  previewModal,
  renderCurrent
}) {
  const indices = Array.from(selectedPages || []).sort((left, right) => left - right);
  const index = indices.length > 0 ? indices[0] : 0;

  if (pages.length === 0) {
    setResult?.("列表为空。");
    return false;
  }

  hideWorkspaceSelectionToolbar?.({ clearSelection: true });
  resetPreviewSearchState?.({ clearInput: true });
  previewState.currentIndex = index;
  previewModal?.classList.remove("hidden");
  void renderCurrent?.();
  return true;
}

export function closeManagedPreview({
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
  removeCropLivePreview?.();
  state.previewPage = null;
  clearSelectedVisualAnnotation?.();
  state.isDrawing = false;
  state.currentLine = null;
  state.previewCropOrigin = null;
  state.previewInteraction = null;
  state.activeTool = null;
  previewState.stageRef = null;
  previewState.imgRef = null;
  previewState.annotationCanvasRef = null;
  previewState.isDragging = false;
  previewState.loadingToken = null;
  previewBody?.classList.remove("is-dragging");
  cancelTextLayer?.();
  hidePreviewSelectionToolbar?.({ clearSelection: true });
  hideWorkspaceSelectionToolbar?.({ clearSelection: true });
  resetPreviewSearchState?.({ clearInput: true });
  syncPreviewToolButtons?.();
  updateUndoAvailability?.();
  resetPreviewHelper?.();
  syncAnnotationStyleBar?.();
  previewModal?.classList.add("hidden");
  if (previewBody) {
    previewBody.innerHTML = "";
  }
  renderThumbs?.();
  if (hasWorkspaceSearchQuery?.()) {
    scheduleWorkspaceTextEditorSync?.();
  }
}

export function syncManagedPreviewToolButtons({
  activeTool,
  controls
}) {
  controls.toolPencil?.classList.toggle("active", activeTool === "pencil");
  controls.toolCrop?.classList.toggle("active", activeTool === "crop");
  controls.drawBtn?.classList.toggle("active", activeTool === "pencil");
  controls.rectBtn?.classList.toggle("active", activeTool === "rect");
  controls.arrowBtn?.classList.toggle("active", activeTool === "arrow");
  controls.textBoxBtn?.classList.toggle("active", activeTool === "textbox");
  controls.cropBtn?.classList.toggle("active", activeTool === "crop");
}

export function setManagedPreviewTool({
  state,
  tool,
  clearSelectedVisualAnnotation,
  syncToolButtons,
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
}) {
  const previousTool = state.activeTool;
  const previousPage = state.previewPage;

  clearSelectedVisualAnnotation?.();
  state.activeTool = state.activeTool === tool ? null : tool;
  state.isDrawing = false;
  state.currentLine = null;
  state.previewInteraction = null;
  syncToolButtons?.(state.activeTool);

  if (previousTool === "crop" && previousPage) {
    updateThumbCard?.(previousPage);
  }

  if (state.activeTool !== "crop") {
    removeCropLivePreview?.();
  }

  if (state.activeTool) {
    clearWorkspaceTextEditor?.({ clearSelection: true });
    const selectedIndex = getSelectedIndex?.() ?? 0;
    const selectedPage = state.pages[selectedIndex];
    if (selectedPage) {
      if (state.activeTool === "crop") {
        state.previewPage = selectedPage;
      }
      updateThumbCard?.(selectedPage);
      openVisualEditorForPage?.(selectedPage);
      if (state.activeTool === "crop") {
        renderCropLivePreview?.(selectedPage);
      }
    }
  } else {
    if (previousPage) {
      updateThumbCard?.(previousPage);
      updateMeta?.();
    }
    state.previewPage = null;
    ensureInPlaceEditor?.(null);
    scheduleWorkspaceTextEditorSync?.();
  }

  updateUndoAvailability?.();
  updatePreviewHelper?.();
  syncAnnotationStyleBar?.();
  return state.activeTool;
}
