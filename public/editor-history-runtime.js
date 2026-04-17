export function captureManagedStateSnapshot(pages) {
  return pages.map((page) => ({
    id: page.id,
    fileIndex: page.fileIndex,
    fileName: page.fileName,
    sourceIndex: page.sourceIndex,
    width: page.width,
    height: page.height,
    isBlank: Boolean(page.isBlank),
    sourceRotation: page.sourceRotation || 0,
    rotation: page.rotation,
    deleted: Boolean(page.deleted),
    annotations: page.annotations ? JSON.parse(JSON.stringify(page.annotations)) : [],
    crop: page.crop ? { ...page.crop } : null
  }));
}

function buildManagedRestoredPage({ snapshotPage, originalPage, files }) {
  if (originalPage) {
    return {
      ...originalPage,
      ...snapshotPage
    };
  }

  const restoredPdf =
    snapshotPage.isBlank || snapshotPage.fileIndex == null || snapshotPage.fileIndex < 0
      ? null
      : files[snapshotPage.fileIndex]?.pdf || null;

  return {
    id: snapshotPage.id,
    fileIndex: snapshotPage.fileIndex,
    fileName: snapshotPage.fileName || files[snapshotPage.fileIndex]?.name || "未命名文件",
    sourceIndex: snapshotPage.sourceIndex,
    width: snapshotPage.width || 595,
    height: snapshotPage.height || 842,
    isBlank: Boolean(snapshotPage.isBlank),
    sourceRotation: snapshotPage.sourceRotation || 0,
    rotation: snapshotPage.rotation || 0,
    deleted: Boolean(snapshotPage.deleted),
    annotations: snapshotPage.annotations ? JSON.parse(JSON.stringify(snapshotPage.annotations)) : [],
    crop: snapshotPage.crop ? { ...snapshotPage.crop } : null,
    canvas: null,
    rendered: false,
    pdf: restoredPdf
  };
}

export function updateManagedUndoRedoUi({
  documentApi = globalThis.document,
  historyLength,
  redoLength
}) {
  const undoButton = documentApi.getElementById("globalUndoBtn");
  const redoButton = documentApi.getElementById("globalRedoBtn");

  if (undoButton) {
    undoButton.disabled = historyLength === 0;
  }
  if (redoButton) {
    redoButton.disabled = redoLength === 0;
  }
}

export function pushManagedHistory({
  state,
  captureSnapshot,
  updateUndoRedoUi,
  maxDepth = 50
}) {
  const snapshot = captureSnapshot(state.pages);

  if (state.historyStack.length > 0) {
    const last = JSON.stringify(state.historyStack[state.historyStack.length - 1]);
    if (last === JSON.stringify(snapshot)) {
      return false;
    }
  }

  state.historyStack.push(snapshot);
  if (state.historyStack.length > maxDepth) {
    state.historyStack.shift();
  }
  state.redoStack = [];
  updateUndoRedoUi?.();
  return true;
}

export function applyManagedSnapshot({
  state,
  snapshot,
  renderThumbs,
  updateUndoRedoUi,
  syncAnnotationStyleBar
}) {
  if (!snapshot) {
    return false;
  }

  const nextPages = snapshot.map((snapshotPage) =>
    buildManagedRestoredPage({
      snapshotPage,
      originalPage: state.pages.find((page) => page.id === snapshotPage.id),
      files: state.files
    })
  );

  state.pages = nextPages;
  state.selected.clear();
  renderThumbs?.();
  updateUndoRedoUi?.();
  syncAnnotationStyleBar?.();
  return true;
}

export function globalManagedUndo({
  state,
  captureSnapshot,
  applySnapshot,
  maxDepth = 50
}) {
  if (state.historyStack.length === 0) {
    return false;
  }

  state.redoStack.push(captureSnapshot(state.pages));
  if (state.redoStack.length > maxDepth) {
    state.redoStack.shift();
  }

  const previous = state.historyStack.pop();
  applySnapshot(previous);
  return true;
}

export function globalManagedRedo({
  state,
  captureSnapshot,
  applySnapshot
}) {
  if (state.redoStack.length === 0) {
    return false;
  }

  state.historyStack.push(captureSnapshot(state.pages));
  const next = state.redoStack.pop();
  applySnapshot(next);
  return true;
}

export function deleteManagedVisualAnnotation({
  page,
  selected,
  clearSelectedAnnotation,
  pushVisualHistory,
  cloneAnnotation,
  refreshVisuals,
  setResult
}) {
  if (!page || !selected) {
    return false;
  }

  const annotation = page.annotations?.[selected.index];
  if (!annotation) {
    clearSelectedAnnotation?.({ pageId: page.id });
    return false;
  }

  pushVisualHistory?.(page, {
    type: "annotation-delete",
    index: selected.index,
    annotation: cloneAnnotation?.(annotation)
  });
  page.annotations.splice(selected.index, 1);
  clearSelectedAnnotation?.({ pageId: page.id });
  refreshVisuals?.(page);
  setResult?.("已删除所选标注。");
  return true;
}

export function updateManagedVisualUndoAvailability({
  activePage,
  undoButton
}) {
  const count = Array.isArray(activePage?.visualHistory) ? activePage.visualHistory.length : 0;
  if (!undoButton) {
    return count;
  }

  undoButton.disabled = count === 0;
  undoButton.classList.toggle("disabled", count === 0);
  return count;
}

export function restoreManagedWorkspaceEditingUi({
  state,
  requestFrame = globalThis.requestAnimationFrame,
  ensureInPlaceEditor,
  scheduleWorkspaceTextEditorSync
}) {
  if (state.activeTool && state.previewPage) {
    const activePage = state.previewPage;
    requestFrame?.(() => {
      if (!state.activeTool || state.previewPage !== activePage) return;
      ensureInPlaceEditor?.(activePage);
    });
    return true;
  }

  scheduleWorkspaceTextEditorSync?.();
  return false;
}

export function undoManagedPreviewEdit({
  page,
  state,
  previewState,
  previewModal,
  cloneAnnotation,
  cloneCrop,
  clearSelectedAnnotation,
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
  if (!page || !Array.isArray(page.visualHistory) || page.visualHistory.length === 0) {
    setResult?.("当前页面没有可撤销的操作。");
    return false;
  }

  const last = page.visualHistory.pop();
  if (last?.type === "annotation-add") {
    page.annotations.splice(last.index, 1);
  } else if (last?.type === "annotation-delete") {
    page.annotations.splice(last.index, 0, cloneAnnotation?.(last.annotation));
  } else if (last?.type === "annotation-update") {
    page.annotations[last.index] = cloneAnnotation?.(last.previousAnnotation);
  } else if (last?.type === "crop-change") {
    page.crop = cloneCrop?.(last.previousCrop);
  } else if (last?.type === "clear-all") {
    page.annotations = last.previousAnnotations.map((annotation) => cloneAnnotation?.(annotation));
    page.crop = cloneCrop?.(last.previousCrop);
  }

  clearSelectedAnnotation?.({ pageId: page.id });

  if (state.previewPage === page) {
    redrawPreviewOverlay?.();
  }
  if (!previewModal.classList.contains("hidden") && state.pages[previewState.currentIndex] === page) {
    renderImmersiveAnnotationLayer?.();
    hidePreviewSelectionToolbar?.({ clearSelection: true });
  }
  if (getWorkspaceVisualPage?.() === page) {
    hideWorkspaceSelectionToolbar?.({ clearSelection: true });
  }

  updateThumbCard?.(page);
  updateMeta?.();
  updateUndoAvailability?.();
  syncAnnotationStyleBar?.();
  updatePreviewHelper?.("已撤销上一步编辑。");
  setResult?.("已撤销当前页面的上一步编辑。");
  return true;
}
