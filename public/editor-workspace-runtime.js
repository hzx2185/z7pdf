export function isManagedFileDragEvent(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function isManagedPdfUploadFile(file) {
  if (!(file instanceof File)) return false;
  if (file.type === "application/pdf") return true;
  return /\.pdf$/i.test(file.name || "");
}

function collectManagedDroppedPdfFiles(fileList) {
  return Array.from(fileList || []).filter(isManagedPdfUploadFile);
}

export function setManagedEditorDropActive({
  dropZone,
  dropOverlay,
  active
}) {
  if (!dropZone || !dropOverlay) return false;

  dropZone.classList.toggle("is-dragover", active);
  dropOverlay.classList.toggle("hidden", !active);
  dropOverlay.setAttribute("aria-hidden", String(!active));
  return true;
}

export function resetManagedEditorDropState({
  state,
  dropZone,
  dropOverlay
}) {
  state.editorDragDepth = 0;
  setManagedEditorDropActive({
    dropZone,
    dropOverlay,
    active: false
  });
}

export function openManagedEditorFilePicker(fileInput) {
  fileInput?.click?.();
}

export async function importManagedDroppedPdfFiles({
  fileList,
  loadEditor,
  setResult
}) {
  const files = collectManagedDroppedPdfFiles(fileList);
  if (files.length === 0) {
    setResult?.("拖拽上传仅支持 PDF 文件。", true);
    return false;
  }

  try {
    await loadEditor?.(files);
    return true;
  } catch (error) {
    setResult?.(error.message || "PDF 加载失败", true);
    return false;
  }
}

export function attachManagedUploadTargets({
  editorEmpty,
  editorDropZone,
  editorDropOverlay,
  editorFileInput,
  state,
  loadEditor,
  setResult,
  windowApi = globalThis.window
}) {
  const resetDropState = () =>
    resetManagedEditorDropState({
      state,
      dropZone: editorDropZone,
      dropOverlay: editorDropOverlay
    });

  editorEmpty?.addEventListener("click", () => {
    if (editorEmpty.classList.contains("hidden")) return;
    openManagedEditorFilePicker(editorFileInput);
  });

  editorEmpty?.addEventListener("keydown", (event) => {
    if (editorEmpty.classList.contains("hidden")) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    openManagedEditorFilePicker(editorFileInput);
  });

  editorDropZone?.addEventListener("dragenter", (event) => {
    if (!isManagedFileDragEvent(event)) return;

    event.preventDefault();
    state.editorDragDepth += 1;
    setManagedEditorDropActive({
      dropZone: editorDropZone,
      dropOverlay: editorDropOverlay,
      active: true
    });
  });

  editorDropZone?.addEventListener("dragover", (event) => {
    if (!isManagedFileDragEvent(event)) return;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    setManagedEditorDropActive({
      dropZone: editorDropZone,
      dropOverlay: editorDropOverlay,
      active: true
    });
  });

  editorDropZone?.addEventListener("dragleave", (event) => {
    if (!isManagedFileDragEvent(event)) return;

    event.preventDefault();
    state.editorDragDepth = Math.max(0, state.editorDragDepth - 1);
    if (state.editorDragDepth === 0) {
      setManagedEditorDropActive({
        dropZone: editorDropZone,
        dropOverlay: editorDropOverlay,
        active: false
      });
    }
  });

  editorDropZone?.addEventListener("drop", async (event) => {
    if (!isManagedFileDragEvent(event)) return;

    event.preventDefault();
    const droppedFiles = event.dataTransfer?.files;
    resetDropState();
    await importManagedDroppedPdfFiles({
      fileList: droppedFiles,
      loadEditor,
      setResult
    });
  });

  windowApi?.addEventListener?.("dragend", resetDropState);
  windowApi?.addEventListener?.("blur", resetDropState);
}

function isManagedMacPlatform(platformValue = globalThis.navigator?.platform || "") {
  return String(platformValue).toUpperCase().indexOf("MAC") >= 0;
}

export function applyManagedPageSelectionCommand({
  state,
  mode,
  refreshSelectionCards
}) {
  const previousSelection = new Set(state.selected);

  if (mode === "selectAll") {
    state.selected = new Set(state.pages.map((_, index) => index));
  } else if (mode === "clear") {
    state.selected.clear();
    state.lastSelectedIndex = null;
  } else if (mode === "invert") {
    const nextSelection = new Set();
    state.pages.forEach((_, index) => {
      if (!state.selected.has(index)) {
        nextSelection.add(index);
      }
    });
    state.selected = nextSelection;
  } else {
    return false;
  }

  refreshSelectionCards?.(previousSelection);
  return true;
}

export function attachManagedSelectionControls({
  controls,
  state,
  refreshSelectionCards
}) {
  controls.selectAllBtn?.addEventListener("click", () => {
    applyManagedPageSelectionCommand({
      state,
      mode: "selectAll",
      refreshSelectionCards
    });
  });

  controls.clearSelectionBtn?.addEventListener("click", () => {
    applyManagedPageSelectionCommand({
      state,
      mode: "clear",
      refreshSelectionCards
    });
  });

  controls.invertSelectionBtn?.addEventListener("click", () => {
    applyManagedPageSelectionCommand({
      state,
      mode: "invert",
      refreshSelectionCards
    });
  });
}

export function attachManagedHistoryControls({
  documentApi = globalThis.document,
  state,
  previewModal,
  undoPreviewEdit,
  globalUndo,
  globalRedo
}) {
  documentApi.getElementById("globalUndoBtn")?.addEventListener("click", () => {
    if (state.previewPage || !previewModal.classList.contains("hidden")) {
      undoPreviewEdit?.();
    } else {
      globalUndo?.();
    }
  });

  documentApi.getElementById("globalRedoBtn")?.addEventListener("click", () => {
    if (state.previewPage) {
      return;
    }
    globalRedo?.();
  });
}

export function attachManagedEditorShortcuts({
  windowApi = globalThis.window,
  documentApi = globalThis.document,
  platform,
  onSelectAll,
  onClearSelection,
  onInvertSelection,
  onUndo,
  onRedo
}) {
  windowApi?.addEventListener?.("keydown", (event) => {
    const cmdOrCtrl = isManagedMacPlatform(platform) ? event.metaKey : event.ctrlKey;
    if (!cmdOrCtrl) return;

    if (["INPUT", "TEXTAREA"].includes(documentApi?.activeElement?.tagName)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "a") {
      event.preventDefault();
      onSelectAll?.();
    } else if (key === "d") {
      event.preventDefault();
      onClearSelection?.();
    } else if (key === "i") {
      event.preventDefault();
      onInvertSelection?.();
    } else if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        onRedo?.();
      } else {
        onUndo?.();
      }
    } else if (key === "y") {
      event.preventDefault();
      onRedo?.();
    }
  });
}

export function getManagedWorkspaceNavigation({ pages, selectedIndex = 0 }) {
  const activePages = pages.filter((page) => !page.deleted);
  if (activePages.length === 0) {
    return {
      activePages,
      selectedIndex,
      currentRelativeIndex: -1,
      total: 0
    };
  }

  return {
    activePages,
    selectedIndex,
    currentRelativeIndex: activePages.findIndex(
      (page) => pages.indexOf(page) === selectedIndex
    ),
    total: activePages.length
  };
}

export function updateManagedWorkspaceNavigation({
  pages,
  selectedIndex = 0,
  onUpdate
}) {
  const navigation = getManagedWorkspaceNavigation({
    pages,
    selectedIndex
  });

  if (navigation.total <= 0) {
    return navigation;
  }

  onUpdate?.(navigation);
  return navigation;
}

export function scrollManagedPageIntoView({
  thumbGrid,
  page,
  behavior = "smooth",
  block = "center"
}) {
  const card = thumbGrid?.querySelector?.(`[data-page-id="${page.id}"]`);
  if (!card) return false;
  card.scrollIntoView({ behavior, block });
  return true;
}

export function activateManagedWorkspaceVisualEditor({
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
}) {
  ensurePreviewPageState?.(page);

  if (getSelectedVisualAnnotation?.()?.pageId !== page?.id) {
    clearSelectedVisualAnnotation?.();
  }

  hideWorkspaceSelectionToolbar?.({ clearSelection: true });
  state.previewPage = page;
  state.isDrawing = false;
  state.currentLine = null;
  state.previewCropOrigin = null;

  syncPreviewToolButtons?.();
  updateUndoAvailability?.();
  syncAnnotationStyleBar?.();
  ensureInPlaceEditor?.(page);
  updateWorkspaceNavigation?.();
  return true;
}

export function ensureManagedInPlaceEditor({
  thumbGrid,
  page,
  activeTool,
  clearWorkspaceTextEditor,
  removeCropLivePreview,
  resolveMountTargets,
  initPreviewCanvas,
  renderCropLivePreview,
  activeEditingClass = "active-editing",
  workspaceEditingClass = "workspace-text-editing",
  overlayId = "editorCanvasOverlay"
}) {
  thumbGrid?.querySelectorAll?.(".thumb-card")?.forEach((card) => {
    card.classList.remove(activeEditingClass);
    if (!card.classList.contains(workspaceEditingClass)) {
      card.draggable = true;
    }
  });

  const oldOverlay = globalThis.document?.getElementById?.(overlayId);
  if (oldOverlay) {
    oldOverlay.remove();
  }

  if (activeTool !== "crop") {
    removeCropLivePreview?.();
  }

  if (!activeTool || !page) {
    return null;
  }

  clearWorkspaceTextEditor?.({ clearSelection: false });

  const { card, preview, surface, canvas } = resolveMountTargets?.(thumbGrid, page.id) || {};
  if (!card || !preview) {
    return null;
  }

  const resolvedCanvas =
    (page.canvas && preview.contains(page.canvas) ? page.canvas : null) ||
    surface?.querySelector?.("canvas") ||
    preview.querySelector?.(".thumb-page-stage > canvas") ||
    preview.querySelector?.("canvas") ||
    canvas ||
    null;

  if (!resolvedCanvas) {
    return null;
  }

  card.classList.add(activeEditingClass);
  card.draggable = false;
  initPreviewCanvas?.(resolvedCanvas, page);

  if (activeTool === "crop") {
    renderCropLivePreview?.(page);
  }

  return {
    card,
    preview,
    surface,
    canvas: resolvedCanvas
  };
}

export function navigateManagedWorkspacePage({
  pages,
  selectedIndex = 0,
  delta,
  setSelection,
  scrollToPage,
  renderThumbs,
  updateNavigation
}) {
  const navigation = getManagedWorkspaceNavigation({
    pages,
    selectedIndex
  });
  const nextRelativeIndex = navigation.currentRelativeIndex + delta;

  if (
    navigation.total <= 0 ||
    navigation.currentRelativeIndex < 0 ||
    nextRelativeIndex < 0 ||
    nextRelativeIndex >= navigation.activePages.length
  ) {
    return false;
  }

  const nextPage = navigation.activePages[nextRelativeIndex];
  const nextIndex = pages.indexOf(nextPage);
  if (nextIndex < 0) return false;

  setSelection?.(nextIndex);
  scrollToPage?.(nextPage);
  renderThumbs?.();
  updateNavigation?.();
  return true;
}

export function applyManagedWorkspaceZoom({
  zoom,
  grid,
  rootElement = globalThis.document?.documentElement || null,
  zoomSelect,
  scheduleTextEditorSync
}) {
  if (!grid) return false;

  grid.classList.remove("fit-width-mode");

  if (zoom === "fit-all") {
    rootElement?.style?.setProperty("--thumb-scale", "0.6");
  } else if (zoom === "fit-width") {
    grid.classList.add("fit-width-mode");
    rootElement?.style?.setProperty("--thumb-scale", "2.5");
  } else {
    rootElement?.style?.setProperty("--thumb-scale", zoom);
  }

  if (zoomSelect) {
    zoomSelect.value = zoom;
  }

  scheduleTextEditorSync?.();
  return true;
}

export function stepManagedWorkspaceZoom({
  currentZoom,
  direction,
  levels = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
}) {
  let current = Number.parseFloat(currentZoom);
  if (Number.isNaN(current)) current = 1;

  if (direction > 0) {
    return String(levels.find((level) => level > current) || levels[levels.length - 1]);
  }

  return String([...levels].reverse().find((level) => level < current) || levels[0]);
}

export function attachManagedThumbCardEvents({
  card,
  page,
  index,
  state,
  isWorkspaceTextLayerTarget,
  openVisualEditorForPage,
  renderThumbs,
  refreshSelectionCards,
  updateWorkspaceNavigation,
  openPreview,
  isFileDragEvent,
  movePage,
  duplicateSelectedPages,
  deleteSelectedPages,
  insertBlankPage,
  insertLocalPdf,
  insertWorkspaceSelectedPdf,
  exportCurrentPage,
  exportSelectedPages,
  restoreDeletedPage,
  documentApi = globalThis.document,
  platform
}) {
  const closeContextMenu = () => {
    documentApi.getElementById("editorThumbContextMenu")?.remove();
  };

  const confirmDeleteSelection = () => {
    const selectedCount = Array.from(state.selected || []).filter((selectedIndex) => {
      const selectedPage = state.pages[selectedIndex];
      return selectedPage && !selectedPage.deleted;
    }).length;
    return globalThis.window?.confirm?.(
      `确认删除选中的 ${selectedCount || 1} 页吗？你仍可通过 Ctrl/Cmd+Z 撤销。`
    ) !== false;
  };

  const selectCurrentPage = () => {
    const previousSelection = new Set(state.selected);
    state.selected = new Set([index]);
    state.lastSelectedIndex = index;
    refreshSelectionCards?.(previousSelection);
    updateWorkspaceNavigation?.();
  };

  const openContextMenu = (event) => {
    event.preventDefault();
    if (isWorkspaceTextLayerTarget?.(event.target)) return;

    selectCurrentPage();
    closeContextMenu();

    const menu = documentApi.createElement("div");
    menu.id = "editorThumbContextMenu";
    menu.className = "thumb-context-menu";
    const selectedWorkspacePdfCount =
      typeof globalThis.window?.getSelectedWorkspacePdfCount === "function"
        ? Number(globalThis.window.getSelectedWorkspacePdfCount() || 0)
        : 0;
    const activeSelectedCount = Array.from(state.selected || []).filter((selectedIndex) => {
      const selectedPage = state.pages[selectedIndex];
      return selectedPage && !selectedPage.deleted;
    }).length;

    const items = [
      {
        label: "预览",
        disabled: !!page?.deleted,
        action: () => openPreview?.()
      },
      {
        label: "复制",
        disabled: !!page?.deleted,
        action: () => duplicateSelectedPages?.()
      },
      {
        label: "前移",
        disabled: !!page?.deleted || index <= 0,
        action: () => movePage?.(index, index - 1)
      },
      {
        label: "后移",
        disabled: !!page?.deleted || index >= state.pages.length - 1,
        action: () => movePage?.(index, index + 1)
      },
      {
        separator: true
      },
      {
        label: "在前插入本地 PDF",
        action: () => insertLocalPdf?.({ position: "before", referenceIndex: index })
      },
      {
        label: "在后插入本地 PDF",
        action: () => insertLocalPdf?.({ position: "after", referenceIndex: index })
      },
      {
        label: "在前插入左侧已选 PDF",
        disabled: selectedWorkspacePdfCount < 1,
        action: () => insertWorkspaceSelectedPdf?.({ position: "before", referenceIndex: index })
      },
      {
        label: "在后插入左侧已选 PDF",
        disabled: selectedWorkspacePdfCount < 1,
        action: () => insertWorkspaceSelectedPdf?.({ position: "after", referenceIndex: index })
      },
      {
        label: "在前插入空白页",
        action: () => insertBlankPage?.({ position: "before", referenceIndex: index })
      },
      {
        label: "在后插入空白页",
        action: () => insertBlankPage?.({ position: "after", referenceIndex: index })
      },
      {
        separator: true
      },
      {
        label: "导出当前页",
        disabled: !!page?.deleted,
        action: () => exportCurrentPage?.(index)
      },
      {
        label: "导出选中页",
        disabled: activeSelectedCount < 1,
        action: () => exportSelectedPages?.()
      },
      {
        separator: true
      },
      {
        label: "删除",
        disabled: !!page?.deleted,
        danger: true,
        action: () => {
          if (!confirmDeleteSelection()) return;
          deleteSelectedPages?.();
        }
      }
    ];

    items.forEach(({ label, action, disabled = false, danger = false, separator = false }) => {
      if (separator) {
        const divider = documentApi.createElement("div");
        divider.className = "thumb-context-menu-separator";
        divider.setAttribute("aria-hidden", "true");
        menu.appendChild(divider);
        return;
      }
      const button = documentApi.createElement("button");
      button.type = "button";
      button.className = `thumb-context-menu-item${danger ? " danger" : ""}`;
      button.textContent = label;
      button.disabled = disabled;
      button.addEventListener("click", (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        closeContextMenu();
        action?.();
      });
      menu.appendChild(button);
    });

    documentApi.body.appendChild(menu);
    const windowApi = documentApi.defaultView || globalThis.window;
    const viewportWidth = windowApi?.innerWidth || 0;
    const viewportHeight = windowApi?.innerHeight || 0;
    const viewportPadding = 12;
    const maxMenuHeight = Math.max(180, viewportHeight - viewportPadding * 2);
    menu.style.maxHeight = `${maxMenuHeight}px`;
    menu.style.overflowY = "auto";

    const rect = menu.getBoundingClientRect();
    const requestedX = Number(event.clientX);
    const requestedY = Number(event.clientY);
    const anchorLeft = Number.isFinite(requestedX) ? requestedX : viewportPadding;
    const anchorTop = Number.isFinite(requestedY) ? requestedY : viewportPadding;
    const left = Math.min(anchorLeft, viewportWidth - rect.width - viewportPadding);
    const top = Math.min(anchorTop, viewportHeight - rect.height - viewportPadding);
    menu.style.left = `${Math.max(viewportPadding, left)}px`;
    menu.style.top = `${Math.max(viewportPadding, top)}px`;

    const handlePointerDown = (nextEvent) => {
      if (menu.contains(nextEvent.target)) return;
      closeContextMenu();
      documentApi.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("blur", handleClose);
      documentApi.removeEventListener("keydown", handleKeydown, true);
    };
    const handleClose = () => {
      closeContextMenu();
      documentApi.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("blur", handleClose);
      documentApi.removeEventListener("keydown", handleKeydown, true);
    };
    const handleKeydown = (keydownEvent) => {
      if (keydownEvent.key === "Escape") {
        handleClose();
      }
    };

    setTimeout(() => {
      documentApi.addEventListener("mousedown", handlePointerDown, true);
      window.addEventListener("blur", handleClose, { once: true });
      documentApi.addEventListener("keydown", handleKeydown, true);
    }, 0);
  };

  card.addEventListener("click", (event) => {
    closeContextMenu();
    if (event.target instanceof HTMLElement && event.target.closest(".thumb-quick-actions")) return;
    if (isWorkspaceTextLayerTarget?.(event.target)) return;

    const previousSelection = new Set(state.selected);

    if (state.activeTool) {
      const isSameActivePage =
        state.previewPage?.id === page.id && card.classList.contains("active-editing");
      state.selected = new Set([index]);
      state.lastSelectedIndex = index;
      if (!isSameActivePage) {
        openVisualEditorForPage?.(page);
        renderThumbs?.();
      }
      return;
    }

    const cmdOrCtrl = isManagedMacPlatform(platform) ? event.metaKey : event.ctrlKey;

    if (event.shiftKey && state.lastSelectedIndex !== null) {
      const start = Math.min(state.lastSelectedIndex, index);
      const end = Math.max(state.lastSelectedIndex, index);

      if (!cmdOrCtrl) {
        state.selected.clear();
      }

      for (let currentIndex = start; currentIndex <= end; currentIndex += 1) {
        state.selected.add(currentIndex);
      }
    } else if (cmdOrCtrl) {
      if (state.selected.has(index)) {
        state.selected.delete(index);
        if (state.lastSelectedIndex === index) {
          state.lastSelectedIndex = null;
        }
      } else {
        state.selected.add(index);
        state.lastSelectedIndex = index;
      }
    } else {
      state.selected = new Set([index]);
      state.lastSelectedIndex = index;
    }

    refreshSelectionCards?.(previousSelection);
    updateWorkspaceNavigation?.();
  });

  card.addEventListener("dblclick", (event) => {
    closeContextMenu();
    if (isWorkspaceTextLayerTarget?.(event.target)) return;
    state.selected = new Set([index]);
    state.lastSelectedIndex = index;
    openPreview?.();
  });

  card.addEventListener("contextmenu", openContextMenu);

  card.addEventListener("dragstart", (event) => {
    if (card.classList.contains("workspace-text-editing") || isWorkspaceTextLayerTarget?.(event.target)) {
      event.preventDefault();
      return;
    }

    state.draggingIndex = index;
    card.classList.add("dragging");
  });

  card.addEventListener("dragend", () => {
    state.draggingIndex = null;
    card.classList.remove("dragging");
  });

  card.addEventListener("dragover", (event) => {
    if (card.classList.contains("workspace-text-editing")) return;
    if (isFileDragEvent?.(event) || state.draggingIndex === null) return;

    event.preventDefault();
    card.classList.add("drop-target");
  });

  card.addEventListener("dragleave", () => {
    card.classList.remove("drop-target");
  });

  card.addEventListener("drop", (event) => {
    if (card.classList.contains("workspace-text-editing")) return;
    if (isFileDragEvent?.(event) || state.draggingIndex === null) return;

    event.preventDefault();
    card.classList.remove("drop-target");
    movePage?.(state.draggingIndex, index);
  });

  card.addEventListener("keydown", (event) => {
    if (isWorkspaceTextLayerTarget?.(event.target)) return;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      openContextMenu({
        ...event,
        preventDefault: () => {},
        target: event.target,
        clientX: card.getBoundingClientRect().left + 24,
        clientY: card.getBoundingClientRect().top + 24
      });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      card.click();
    }
  });

  const quickPreviewBtn = card.querySelector('[data-thumb-action="preview"]');
  quickPreviewBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (page?.deleted) return;
    selectCurrentPage();
    openPreview?.();
  });

  const quickDuplicateBtn = card.querySelector('[data-thumb-action="duplicate"]');
  quickDuplicateBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (page?.deleted) return;
    selectCurrentPage();
    duplicateSelectedPages?.();
  });

  const quickDeleteBtn = card.querySelector('[data-thumb-action="delete"]');
  quickDeleteBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (page?.deleted) return;
    selectCurrentPage();
    if (!confirmDeleteSelection()) return;
    deleteSelectedPages?.();
  });

  const quickRestoreBtn = card.querySelector('[data-thumb-action="restore"]');
  quickRestoreBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!page?.deleted) return;
    restoreDeletedPage?.(index);
  });
}

export function createManagedThumbCard({
  documentApi = globalThis.document,
  page,
  index,
  isSelected = false,
  fillPreview,
  buildBadgesHtml,
  buildMetaHtml,
  bindEvents
}) {
  const card = documentApi.createElement("div");
  card.className = "thumb-card";
  card.dataset.pageId = String(page.id);
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.draggable = true;

  if (isSelected) {
    card.classList.add("selected");
  }
  if (page.deleted) {
    card.classList.add("deleted");
  }
  if (page.crop || page.annotations?.length > 0 || page.rotation || page.sourceRotation) {
    card.classList.add("has-edit");
  }

  const preview = documentApi.createElement("div");
  preview.className = "thumb-preview";
  fillPreview?.(preview, page);

  const badges = documentApi.createElement("div");
  badges.className = "thumb-badges";
  badges.innerHTML = buildBadgesHtml?.(page, index) || "";

  const quickActions = documentApi.createElement("div");
  quickActions.className = "thumb-quick-actions";
  quickActions.setAttribute("aria-label", "页面快捷操作");
  quickActions.innerHTML = `
    <button type="button" class="thumb-quick-btn" data-thumb-action="preview" title="预览页面" aria-label="预览页面">◉</button>
    <button type="button" class="thumb-quick-btn" data-thumb-action="duplicate" title="复制页面" aria-label="复制页面">⧉</button>
    <button type="button" class="thumb-quick-btn thumb-quick-btn-danger" data-thumb-action="delete" title="删除页面" aria-label="删除页面">✕</button>
    <button type="button" class="thumb-quick-btn thumb-quick-btn-restore" data-thumb-action="restore" title="恢复页面" aria-label="恢复页面">↺</button>
  `;
  const previewButton = quickActions.querySelector('[data-thumb-action="preview"]');
  const duplicateButton = quickActions.querySelector('[data-thumb-action="duplicate"]');
  const deleteButton = quickActions.querySelector('[data-thumb-action="delete"]');
  const restoreButton = quickActions.querySelector('[data-thumb-action="restore"]');
  if (page.deleted) {
    if (previewButton) previewButton.disabled = true;
    if (duplicateButton) duplicateButton.disabled = true;
    if (deleteButton) deleteButton.disabled = true;
    if (restoreButton) restoreButton.hidden = false;
  } else if (restoreButton) {
    restoreButton.hidden = true;
  }

  const meta = documentApi.createElement("div");
  meta.className = "thumb-meta";
  meta.innerHTML = buildMetaHtml?.(page, index) || "";

  card.append(preview, badges, quickActions, meta);
  bindEvents?.(card, page, index);
  return card;
}

export function renderManagedThumbCards({
  thumbGrid,
  pages,
  createCard
}) {
  pages.forEach(({ page, index, isSelected }) => {
    const card = createCard?.(page, index, isSelected);
    if (card) {
      thumbGrid?.appendChild?.(card);
    }
  });
}
