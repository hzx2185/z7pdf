import { requestJson } from "./common.js?v=0414b";
import { attachManagedAssetImageInputs } from "./editor-metadata-runtime.js?v=0414b";
import {
  activateManagedSearch,
  attachManagedPreviewSearchEvents,
  attachManagedWorkspaceSearchEvents,
  MANAGED_PREVIEW_SEARCH_STATE_KEYS,
  normalizeSearchQuery
} from "./editor-search-runtime.js?v=0414b";
import {
  applyManagedPageSelectionCommand,
  attachManagedEditorShortcuts,
  attachManagedHistoryControls,
  attachManagedSelectionControls,
  attachManagedUploadTargets
} from "./editor-workspace-runtime.js?v=0414b";
import {
  activateManagedWorkspaceSearch as activateManagedWorkspaceSearchController
} from "./editor-workspace-text-runtime.js?v=0414b";

const TOOLBAR_TOGGLE_TO_CONTROL = {
  grayscale: "grayscaleEnabled",
  invert: "invertEnabled",
  scan: "scanEffectEnabled",
  ocr: "ocrEnabled",
  pdfa: "pdfaEnabled",
  security: "securityEnabled",
  metadata: "metadataEnabled",
  bookmarks: "bookmarksEnabled",
  headerfooter: "headerFooterEnabled"
};

const MANAGED_EDITOR_PRESET_STORAGE_KEY = "z7pdf.editor.presets.v1";
const MANAGED_EDITOR_PRESET_RECENT_STORAGE_KEY = "z7pdf.editor.presets.recent.v1";
const MANAGED_BUILTIN_PRESETS = [
  {
    code: "print",
    name: "打印版",
    config: {
      resizeEnabled: true,
      resizePageSize: "A4",
      resizeOrientation: "auto",
      resizeMargin: "0",
      resizeBackgroundColor: "#ffffff",
      resizeFitMode: "contain",
      compressionEnabled: true,
      compressionLevel: "low",
      grayscaleEnabled: false,
      invertEnabled: false,
      scanEffectEnabled: false,
      scanEffectLevel: "medium",
      ocrEnabled: false,
      ocrLanguage: "chi_sim+eng",
      pdfaEnabled: false,
      pdfaLevel: "2b",
      toImagesEnabled: false,
      toImagesFormat: "jpg",
      toImagesDpi: "200",
      toImagesQuality: "85"
    }
  },
  {
    code: "archive",
    name: "归档版",
    config: {
      resizeEnabled: true,
      resizePageSize: "A4",
      resizeOrientation: "auto",
      resizeMargin: "0",
      resizeBackgroundColor: "#ffffff",
      resizeFitMode: "contain",
      compressionEnabled: true,
      compressionLevel: "medium",
      grayscaleEnabled: true,
      invertEnabled: false,
      scanEffectEnabled: false,
      scanEffectLevel: "medium",
      ocrEnabled: false,
      ocrLanguage: "chi_sim+eng",
      pdfaEnabled: true,
      pdfaLevel: "2b",
      toImagesEnabled: false,
      toImagesFormat: "jpg",
      toImagesDpi: "200",
      toImagesQuality: "85"
    }
  },
  {
    code: "share",
    name: "分享版",
    config: {
      resizeEnabled: true,
      resizePageSize: "A4",
      resizeOrientation: "auto",
      resizeMargin: "0",
      resizeBackgroundColor: "#ffffff",
      resizeFitMode: "contain",
      compressionEnabled: true,
      compressionLevel: "high",
      grayscaleEnabled: false,
      invertEnabled: false,
      scanEffectEnabled: true,
      scanEffectLevel: "medium",
      ocrEnabled: false,
      ocrLanguage: "chi_sim+eng",
      pdfaEnabled: false,
      pdfaLevel: "2b",
      toImagesEnabled: false,
      toImagesFormat: "jpg",
      toImagesDpi: "150",
      toImagesQuality: "75"
    }
  }
];

function bindManagedSelectionToolbarMouseDown(buttons) {
  buttons.filter(Boolean).forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
  });
}

function isManagedEditableTarget(target) {
  return target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable);
}

function collectManagedClipboardPdfFiles(clipboardData) {
  return Array.from(clipboardData?.items || [])
    .filter((item) => item.kind === "file")
    .map((item, index) => {
      const file = item.getAsFile?.();
      if (!(file instanceof File)) return null;
      const type = String(file.type || "").toLowerCase();
      const name = String(file.name || `clipboard-${index + 1}.pdf`);
      if (type !== "application/pdf" && !/\.pdf$/i.test(name)) {
        return null;
      }
      return new File([file], name, { type: "application/pdf" });
    })
    .filter(Boolean);
}

function pickManagedInsertFiles(documentApi = globalThis.document) {
  return new Promise((resolve) => {
    const input = documentApi.createElement("input");
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
    documentApi.body.appendChild(input);
    input.click();
  });
}

function loadManagedEditorCustomPresets(windowApi = globalThis.window) {
  try {
    const raw = windowApi.localStorage?.getItem(MANAGED_EDITOR_PRESET_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.name === "string" && item.config) : [];
  } catch (_error) {
    return [];
  }
}

function saveManagedEditorCustomPresets(presets, windowApi = globalThis.window) {
  windowApi.localStorage?.setItem(MANAGED_EDITOR_PRESET_STORAGE_KEY, JSON.stringify(presets));
}

function loadManagedRecentPresetKeys(windowApi = globalThis.window) {
  try {
    const raw = windowApi.localStorage?.getItem(MANAGED_EDITOR_PRESET_RECENT_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim()) : [];
  } catch (_error) {
    return [];
  }
}

function saveManagedRecentPresetKeys(keys, windowApi = globalThis.window) {
  windowApi.localStorage?.setItem(MANAGED_EDITOR_PRESET_RECENT_STORAGE_KEY, JSON.stringify(keys.slice(0, 6)));
}

async function loadManagedEditorCloudPresets() {
  const data = await requestJson("/api/workspace/editor-presets");
  return Array.isArray(data?.presets) ? data.presets : [];
}

async function saveManagedEditorCloudPreset({ name, config }) {
  const data = await requestJson("/api/workspace/editor-presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, config })
  });
  return Array.isArray(data?.presets) ? data.presets : [];
}

async function deleteManagedEditorCloudPreset(name) {
  const data = await requestJson(`/api/workspace/editor-presets/${encodeURIComponent(name)}`, {
    method: "DELETE"
  });
  return Array.isArray(data?.presets) ? data.presets : [];
}

function collectManagedPresetConfig(controls) {
  return {
    resizeEnabled: Boolean(controls.resizeEnabled?.checked),
    resizePageSize: controls.resizePageSize?.value || "keep",
    resizeOrientation: controls.resizeOrientation?.value || "auto",
    resizeMargin: controls.resizeMargin?.value || "0",
    resizeBackgroundColor: controls.resizeBackgroundColor?.value || "#ffffff",
    resizeFitMode: controls.resizeFitMode?.value || "keep",
    compressionEnabled: Boolean(controls.compressionEnabled?.checked),
    compressionLevel: controls.compressionLevel?.value || "medium",
    grayscaleEnabled: Boolean(controls.grayscaleEnabled?.checked),
    invertEnabled: Boolean(controls.invertEnabled?.checked),
    scanEffectEnabled: Boolean(controls.scanEffectEnabled?.checked),
    scanEffectLevel: controls.scanEffectLevel?.value || "medium",
    ocrEnabled: Boolean(controls.ocrEnabled?.checked),
    ocrLanguage: controls.ocrLanguage?.value || "chi_sim+eng",
    pdfaEnabled: Boolean(controls.pdfaEnabled?.checked),
    pdfaLevel: controls.pdfaLevel?.value || "2b",
    toImagesEnabled: Boolean(controls.toImagesEnabled?.checked),
    toImagesFormat: controls.toImagesFormat?.value || "jpg",
    toImagesDpi: controls.toImagesDpi?.value || "200",
    toImagesQuality: controls.toImagesQuality?.value || "85"
  };
}

function applyManagedPresetConfig(config, controls) {
  Object.entries(config || {}).forEach(([key, value]) => {
    const control = controls[key];
    if (!control) return;
    if ("checked" in control && typeof value === "boolean") {
      control.checked = value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if ("value" in control && value !== undefined && value !== null) {
      control.value = String(value);
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
  });
}

function renderManagedPresetOptions(controls, presets) {
  if (!controls.presetSelect) return;
  controls.presetSelect.innerHTML = '<option value="">选择已保存预设</option>';
  presets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.name;
    option.textContent = preset.name;
    controls.presetSelect.appendChild(option);
  });
  if (controls.deletePresetBtn) {
    controls.deletePresetBtn.disabled = presets.length === 0;
  }
  if (controls.applyPresetBtn) {
    controls.applyPresetBtn.disabled = presets.length === 0;
  }
}

function renderManagedRecentPresetList({
  controls,
  recentKeys,
  customPresets,
  documentApi = globalThis.document,
  onApply
}) {
  if (!controls.presetRecentList) return;
  controls.presetRecentList.innerHTML = "";
  const presetMap = new Map();
  MANAGED_BUILTIN_PRESETS.forEach((preset) => presetMap.set(`builtin:${preset.code}`, preset));
  customPresets.forEach((preset) => presetMap.set(`custom:${preset.name}`, preset));
  const recentPresets = recentKeys
    .map((key) => ({ key, preset: presetMap.get(key) }))
    .filter((item) => item.preset);

  if (recentPresets.length === 0) {
    const empty = documentApi.createElement("span");
    empty.className = "preset-recent-empty";
    empty.textContent = "还没有最近使用的预设";
    controls.presetRecentList.appendChild(empty);
    return;
  }

  recentPresets.forEach(({ key, preset }) => {
    const button = documentApi.createElement("button");
    button.type = "button";
    button.className = "btn btn-xs preset-chip";
    button.textContent = preset.name;
    button.dataset.recentPresetKey = key;
    button.addEventListener("click", () => onApply?.(key));
    controls.presetRecentList.appendChild(button);
  });
}

function bindManagedPreviewWindowEvents({
  documentApi = globalThis.document,
  windowApi = globalThis.window,
  elements,
  previewState,
  actions
}) {
  const {
    previewBody,
    previewCloseBtn,
    previewModal
  } = elements;

  previewCloseBtn?.addEventListener("click", actions.closePreview);
  previewModal?.addEventListener("click", (event) => {
    if (event.target === previewModal || event.target === previewBody) {
      actions.closePreview();
    }
  });

  documentApi.getElementById("previewZoomIn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!previewState.imgRef) return;
    previewState.scale = Math.min(5, previewState.scale * 1.25);
    actions.updateImmersiveTransform();
  });

  documentApi.getElementById("previewZoomOut")?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!previewState.imgRef) return;
    previewState.scale = Math.max(0.1, previewState.scale / 1.25);
    actions.updateImmersiveTransform();
  });

  documentApi.getElementById("previewZoomFit")?.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.resetImmersiveZoom(true);
  });

  documentApi.getElementById("previewPrev")?.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.navigatePreview(-1);
  });

  documentApi.getElementById("previewNext")?.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.navigatePreview(1);
  });

  documentApi.getElementById("previewRotateLeft")?.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.rotatePreviewPage(-90);
  });

  documentApi.getElementById("previewRotateRight")?.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.rotatePreviewPage(90);
  });

  documentApi.getElementById("previewDeletePage")?.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.deletePreviewPage();
  });

  previewBody?.addEventListener("mousedown", (event) => {
    if (!previewState.imgRef || event.button !== 0 || event.target !== previewState.imgRef) return;
    event.preventDefault();
    actions.hidePreviewSelectionToolbar({ clearSelection: true });
    previewState.isDragging = true;
    previewBody.classList.add("is-dragging");
    previewState.startX = event.clientX - previewState.translateX;
    previewState.startY = event.clientY - previewState.translateY;
  });

  windowApi.addEventListener("mousemove", (event) => {
    if (!previewState.isDragging || !previewState.imgRef) return;
    previewState.translateX = event.clientX - previewState.startX;
    previewState.translateY = event.clientY - previewState.startY;
    actions.updateImmersiveTransform();
  });

  windowApi.addEventListener("mouseup", () => {
    previewState.isDragging = false;
    previewBody?.classList.remove("is-dragging");
  });

  previewBody?.addEventListener("wheel", (event) => {
    if (!previewState.imgRef || previewModal.classList.contains("hidden")) return;
    event.preventDefault();
    actions.hidePreviewSelectionToolbar({ clearSelection: true });

    if (event.ctrlKey || event.metaKey) {
      const zoomFactor = event.deltaY < 0 ? 1.05 : 0.95;
      const oldScale = previewState.scale;
      const newScale = Math.max(0.1, Math.min(8, oldScale * zoomFactor));
      const rect = previewBody.getBoundingClientRect();
      const mouseX = event.clientX - rect.left - rect.width / 2;
      const mouseY = event.clientY - rect.top - rect.height / 2;

      previewState.translateX =
        mouseX - (mouseX - previewState.translateX) * (newScale / oldScale);
      previewState.translateY =
        mouseY - (mouseY - previewState.translateY) * (newScale / oldScale);
      previewState.scale = newScale;
    } else {
      previewState.translateX -= event.deltaX;
      previewState.translateY -= event.deltaY;
    }

    actions.updateImmersiveTransform();
  }, { passive: false });
}

function bindManagedGlobalEditorEvents({
  documentApi = globalThis.document,
  windowApi = globalThis.window,
  elements,
  controls,
  state,
  actions
}) {
  void state;

  documentApi.addEventListener("selectionchange", () => {
    actions.hidePreviewSelectionToolbar();
    actions.syncWorkspaceTextSelectionState();
  });

  windowApi.addEventListener("resize", () => {
    actions.scheduleWorkspaceTextEditorSync();
    actions.refreshWorkspaceSelectionToolbar();
  });

  windowApi.addEventListener("scroll", () => {
    actions.refreshWorkspaceSelectionToolbar();
  }, true);

  documentApi.addEventListener("keydown", (event) => {
    const target = event.target;
    const isEditableTarget = isManagedEditableTarget(target);
    const isFind = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f";
    const isDeleteSelectedAnnotation =
      !isEditableTarget &&
      (event.key === "Delete" || event.key === "Backspace");

    if (isDeleteSelectedAnnotation && actions.deleteSelectedVisualAnnotation()) {
      event.preventDefault();
      return;
    }

    if (elements.previewModal.classList.contains("hidden")) {
      if (isFind) {
        event.preventDefault();
        actions.setWorkspaceSearchPanelVisible(true, { focus: true, select: true });
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      actions.closePreview();
      return;
    }

    if (isEditableTarget) return;

    if (event.key === "ArrowRight") {
      actions.navigatePreview(1);
    } else if (event.key === "ArrowLeft") {
      actions.navigatePreview(-1);
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      actions.undoPreviewEdit();
    }
  });

  documentApi.querySelectorAll(".dropdown").forEach((dropdown) => {
    dropdown.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });

  documentApi.querySelectorAll(".toolbar-btn-toggle").forEach((button) => {
    const toggleId = button.dataset.toggle;
    const enabledControl = TOOLBAR_TOGGLE_TO_CONTROL[toggleId];

    button.addEventListener("click", () => {
      if (enabledControl && controls[enabledControl]) {
        controls[enabledControl].checked = !controls[enabledControl].checked;
        button.classList.toggle("active", controls[enabledControl].checked);
      }
    });

    if (enabledControl && controls[enabledControl]) {
      controls[enabledControl].addEventListener("change", () => {
        button.classList.toggle("active", controls[enabledControl].checked);
      });
    }
  });
}

function bindManagedPageActionEvents({
  controls,
  state,
  elements,
  previewState,
  actions
}) {
  controls.rotateLeftBtn?.addEventListener("click", () => {
    const selectedCount = Array.from(state.selected || []).filter((index) => {
      const page = state.pages[index];
      return page && !page.deleted;
    }).length;
    actions.pushHistory();
    actions.forSelectedPages((page) => {
      page.rotation = (page.rotation + 270) % 360;
      actions.invalidatePageDisplayCache(page);
    });
    if (selectedCount > 0) {
      actions.setEditorResult(`已将 ${selectedCount} 页左转 90°。`);
    }
  });

  controls.rotateRightBtn?.addEventListener("click", () => {
    const selectedCount = Array.from(state.selected || []).filter((index) => {
      const page = state.pages[index];
      return page && !page.deleted;
    }).length;
    actions.pushHistory();
    actions.forSelectedPages((page) => {
      page.rotation = (page.rotation + 90) % 360;
      actions.invalidatePageDisplayCache(page);
    });
    if (selectedCount > 0) {
      actions.setEditorResult(`已将 ${selectedCount} 页右转 90°。`);
    }
  });

  controls.deleteBtn?.addEventListener("click", () => {
    actions.deleteSelectedPages();
  });

  controls.moveUpBtn?.addEventListener("click", () => {
    actions.moveSelection("up");
  });

  controls.moveDownBtn?.addEventListener("click", () => {
    actions.moveSelection("down");
  });

  controls.toolUndo?.addEventListener("click", () => {
    if (actions.getActiveVisualPage()) {
      actions.undoPreviewEdit();
      actions.redrawPreviewOverlay();
    }
  });

  controls.toolClear?.addEventListener("click", () => {
    const activePage = actions.getActiveVisualPage();
    if (!activePage) return;

    actions.hideWorkspaceSelectionToolbar({ clearSelection: true });
    actions.ensurePreviewPageState(activePage);
    if (!activePage.annotations.length && !activePage.crop) {
      actions.setEditorResult("当前页面没有可清除的编辑。");
      return;
    }

    actions.pushVisualHistory(activePage, {
      type: "clear-all",
      previousAnnotations: activePage.annotations.map(actions.cloneAnnotation),
      previousCrop: actions.cloneCrop(activePage.crop)
    });
    activePage.annotations = [];
    activePage.crop = null;
    actions.clearSelectedVisualAnnotation({ pageId: activePage.id });

    if (state.previewPage === activePage) {
      actions.redrawPreviewOverlay();
    }

    actions.renderWorkspaceAnnotationLayer();
    if (
      !elements.previewModal.classList.contains("hidden") &&
      state.pages[previewState.currentIndex] === activePage
    ) {
      actions.renderImmersiveAnnotationLayer();
    }

    actions.updateThumbCard(activePage);
    actions.updateUndoAvailability();
    actions.syncAnnotationStyleBar();
    actions.setEditorResult("已清除当前页面的编辑内容。");
  });
}

function bindManagedEditorControlEvents({
  controls,
  state,
  documentApi = globalThis.document,
  windowApi = globalThis.window,
  actions
}) {
  let customPresets = loadManagedEditorCustomPresets(windowApi);
  let recentPresetKeys = loadManagedRecentPresetKeys(windowApi);
  let presetStorageMode = state.currentUser ? "cloud" : "local";

  const getPresetByKey = (key) => {
    if (String(key || "").startsWith("builtin:")) {
      const code = key.slice("builtin:".length);
      return MANAGED_BUILTIN_PRESETS.find((item) => item.code === code) || null;
    }
    if (String(key || "").startsWith("custom:")) {
      const name = key.slice("custom:".length);
      return customPresets.find((item) => item.name === name) || null;
    }
    return null;
  };

  const markPresetAsRecent = (key) => {
    recentPresetKeys = [key, ...recentPresetKeys.filter((item) => item !== key)].slice(0, 6);
    saveManagedRecentPresetKeys(recentPresetKeys, windowApi);
  };

  const applyPresetByKey = (key) => {
    const preset = getPresetByKey(key);
    if (!preset) {
      setPresetStatus("预设不存在或已被删除。", true);
      return false;
    }
    applyManagedPresetConfig(preset.config, controls);
    markPresetAsRecent(key);
    refreshPresetUi();
    setPresetStatus(`已套用预设：${preset.name}`);
    return true;
  };

  const setPresetStatus = (message = "", isError = false) => {
    if (controls.presetStatus) {
      controls.presetStatus.textContent = message || "支持保存页面尺寸、扫描、压缩、灰度、OCR、归档等常用参数。";
      controls.presetStatus.classList.toggle("error", Boolean(isError));
    }
    if (message) {
      actions.setEditorResult(message, isError);
    }
  };

  const refreshPresetUi = () => {
    renderManagedPresetOptions(controls, customPresets);
    renderManagedRecentPresetList({
      controls,
      recentKeys: recentPresetKeys,
      customPresets,
      documentApi,
      onApply: applyPresetByKey
    });
  };

  const syncPresetStorageMode = async () => {
    presetStorageMode = state.currentUser ? "cloud" : "local";
    try {
      customPresets = state.currentUser
        ? await loadManagedEditorCloudPresets()
        : loadManagedEditorCustomPresets(windowApi);
      refreshPresetUi();
      if (controls.presetStatus) {
        controls.presetStatus.classList.remove("error");
        controls.presetStatus.textContent = state.currentUser
          ? "当前预设已同步到会员账号。"
          : "当前为本地预设，登录后可同步到会员账号。";
      }
    } catch (error) {
      refreshPresetUi();
      setPresetStatus(error.message || "预设同步失败。", true);
    }
  };

  const refreshInsertMenuState = () => {
    const selectedWorkspacePdfCount =
      typeof windowApi.getSelectedWorkspacePdfCount === "function"
        ? Number(windowApi.getSelectedWorkspacePdfCount() || 0)
        : 0;
    if (controls.insertWorkspaceSelectedBtn) {
      controls.insertWorkspaceSelectedBtn.disabled = selectedWorkspacePdfCount < 1;
      controls.insertWorkspaceSelectedBtn.textContent =
        selectedWorkspacePdfCount > 0
          ? `插入左侧已选 PDF (${selectedWorkspacePdfCount})`
          : "插入左侧已选 PDF";
    }
  };

  const rerenderImmersivePreviewIfOpen = () => {
    if (documentApi.getElementById("previewModal")?.classList.contains("hidden")) {
      return;
    }
    void actions.renderPreviewAtCurrentIndex?.();
  };

  controls.insertBlankBtn?.addEventListener("click", refreshInsertMenuState);
  controls.insertBlankBtn?.addEventListener("mouseenter", refreshInsertMenuState);
  refreshInsertMenuState();

  controls.insertLocalPdfBtn?.addEventListener("click", async () => {
    const files = await pickManagedInsertFiles(documentApi);
    if (files.length === 0) return;

    try {
      await actions.insertEditorFiles(files);
    } catch (error) {
      actions.setEditorResult(error.message || "PDF 插入失败", true);
    }
  });
  controls.insertBlankPageBtn?.addEventListener("click", actions.insertBlankPage);
  controls.insertWorkspaceSelectedBtn?.addEventListener("click", async () => {
    try {
      if (typeof windowApi.insertSelectedWorkspaceFilesInEditor === "function") {
        await windowApi.insertSelectedWorkspaceFilesInEditor({ mode: "insert" });
        return;
      }
      actions.setEditorResult("左侧空间尚未准备好，暂时无法插入已选文件。", true);
    } catch (error) {
      actions.setEditorResult(error.message || "空间文件插入失败", true);
    }
  });
  controls.duplicatePageBtn?.addEventListener("click", actions.duplicateSelectedPages);
  controls.exportSelectedPagesBtn?.addEventListener("click", actions.exportSelectedPages);
  controls.restoreSelectedPagesBtn?.addEventListener("click", actions.restoreSelectedDeletedPages);
  controls.toggleDeletedFilterBtn?.addEventListener("click", actions.toggleDeletedOnlyFilter);
  controls.purgeDeletedPagesBtn?.addEventListener("click", actions.purgeDeletedPages);
  controls.drawBtn?.addEventListener("click", () => {
    actions.setActivePreviewTool("pencil");
  });
  controls.rectBtn?.addEventListener("click", () => {
    actions.setActivePreviewTool("rect");
  });
  controls.arrowBtn?.addEventListener("click", () => {
    actions.setActivePreviewTool("arrow");
  });
  controls.textBoxBtn?.addEventListener("click", () => {
    actions.setActivePreviewTool("textbox");
  });
  controls.cropBtn?.addEventListener("click", () => {
    actions.setActivePreviewTool("crop");
  });

  controls.previewBtn?.addEventListener("click", actions.openPreview);
  controls.printBtn?.addEventListener("click", actions.printDocument);
  controls.applySplitBtn?.addEventListener("click", actions.applySplit);
  controls.exportMode?.addEventListener("change", actions.updateSplitFieldState);
  controls.exportBtn?.addEventListener("click", actions.exportEditedPdf);
  controls.exportBtn2?.addEventListener("click", actions.exportEditedPdf);
  controls.saveOnlineBtn?.addEventListener("click", actions.saveEditedPdfOnline);
  controls.saveOnlineBtn2?.addEventListener("click", actions.saveEditedPdfOnline);

  documentApi.querySelectorAll("[data-preset-code]").forEach((button) => {
    button.addEventListener("click", () => {
      applyPresetByKey(`builtin:${button.dataset.presetCode}`);
    });
  });

  controls.applyPresetBtn?.addEventListener("click", () => {
    const name = String(controls.presetSelect?.value || "").trim();
    if (!name) {
      setPresetStatus("请先选择一个已保存预设。", true);
      return;
    }
    applyPresetByKey(`custom:${name}`);
  });

  controls.savePresetBtn?.addEventListener("click", () => {
    void (async () => {
    const name = String(controls.presetNameInput?.value || "").trim();
    if (!name) {
      setPresetStatus("请先输入预设名称。", true);
      controls.presetNameInput?.focus();
      return;
    }
    const config = collectManagedPresetConfig(controls);
    if (presetStorageMode === "cloud") {
      customPresets = await saveManagedEditorCloudPreset({ name, config });
    } else {
      const existingIndex = customPresets.findIndex((item) => item.name === name);
      const nextPreset = { name, config };
      if (existingIndex >= 0) {
        customPresets.splice(existingIndex, 1, nextPreset);
      } else {
        customPresets.push(nextPreset);
      }
      customPresets.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
      saveManagedEditorCustomPresets(customPresets, windowApi);
    }
    markPresetAsRecent(`custom:${name}`);
    refreshPresetUi();
    if (controls.presetSelect) {
      controls.presetSelect.value = name;
    }
    if (controls.presetNameInput) {
      controls.presetNameInput.value = "";
    }
    setPresetStatus(`已保存预设：${name}`);
    })().catch((error) => {
      setPresetStatus(error.message || "保存预设失败。", true);
    });
  });

  controls.deletePresetBtn?.addEventListener("click", () => {
    void (async () => {
    const name = String(controls.presetSelect?.value || "").trim();
    if (!name) {
      setPresetStatus("请先选择要删除的预设。", true);
      return;
    }
    customPresets = presetStorageMode === "cloud"
      ? await deleteManagedEditorCloudPreset(name)
      : customPresets.filter((item) => item.name !== name);
    recentPresetKeys = recentPresetKeys.filter((item) => item !== `custom:${name}`);
    if (presetStorageMode === "local") {
      saveManagedEditorCustomPresets(customPresets, windowApi);
    }
    saveManagedRecentPresetKeys(recentPresetKeys, windowApi);
    refreshPresetUi();
    setPresetStatus(`已删除预设：${name}`);
    })().catch((error) => {
      setPresetStatus(error.message || "删除预设失败。", true);
    });
  });

  controls.toImagesEnabled?.addEventListener("change", () => {
    const enabled = controls.toImagesEnabled?.checked || false;
    if (enabled) {
      controls.toImagesOptions?.classList.remove("hidden");
    } else {
      controls.toImagesOptions?.classList.add("hidden");
    }
  });

  controls.resizeEnabled?.addEventListener("change", () => {
    const enabled = controls.resizeEnabled?.checked || false;
    [
      controls.resizePageSize,
      controls.resizeOrientation,
      controls.resizeMargin,
      controls.resizeBackgroundColor,
      controls.resizeFitMode
    ].filter(Boolean).forEach((control) => {
      control.disabled = !enabled;
    });
    actions.syncPagePreviewSettings?.();
    actions.renderThumbs?.();
    rerenderImmersivePreviewIfOpen();
  });

  [
    controls.resizePageSize,
    controls.resizeOrientation,
    controls.resizeMargin,
    controls.resizeBackgroundColor,
    controls.resizeFitMode
  ].filter(Boolean).forEach((control) => {
    control.addEventListener("change", () => {
      actions.syncPagePreviewSettings?.();
      actions.renderThumbs?.();
      rerenderImmersivePreviewIfOpen();
    });
  });

  const resizeEnabled = controls.resizeEnabled?.checked || false;
  [
    controls.resizePageSize,
    controls.resizeOrientation,
    controls.resizeMargin,
    controls.resizeBackgroundColor,
    controls.resizeFitMode
  ].filter(Boolean).forEach((control) => {
    control.disabled = !resizeEnabled;
  });

  controls.toImagesFormat?.addEventListener("change", () => {
    const format = controls.toImagesFormat?.value || "jpg";
    if (format === "png") {
      controls.toImagesQualityField?.classList.add("hidden");
    } else {
      controls.toImagesQualityField?.classList.remove("hidden");
    }
  });

  controls.workspaceZoomSelect?.addEventListener("change", (event) => {
    state.workspaceZoom = event.target.value;
    actions.applyWorkspaceZoom();
  });

  [
    controls.annotationStrokeColor,
    controls.annotationFillColor,
    controls.annotationTextColor,
    controls.annotationLineWidth
  ]
    .filter(Boolean)
    .forEach((control) => {
      control.addEventListener("change", actions.applyAnnotationStyleControls);
    });

  windowApi.addEventListener("resize", () => {
    if (state.workspaceZoom === "fit-all" || state.workspaceZoom === "fit-width") {
      actions.applyWorkspaceZoom();
    }
  });

  windowApi.addEventListener("editor:user-changed", () => {
    void syncPresetStorageMode();
  });

  void syncPresetStorageMode();
  refreshPresetUi();
}

function bindManagedMetadataEvents({
  controls,
  state,
  actions
}) {
  controls.metadataEnabled?.addEventListener("change", actions.markMetadataDirty);
  controls.metadataClearExisting?.addEventListener("change", actions.markMetadataDirty);
  controls.metadataTitle?.addEventListener("input", actions.markMetadataDirty);
  controls.metadataAuthor?.addEventListener("input", actions.markMetadataDirty);
  controls.metadataSubject?.addEventListener("input", actions.markMetadataDirty);
  controls.metadataKeywords?.addEventListener("input", actions.markMetadataDirty);
  controls.bookmarkAddBtn?.addEventListener("click", () => {
    actions.addBookmark();
  });

  controls.bookmarksList?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const row = target.closest(".bookmark-row");
    if (!row) return;

    const index = Number(row.dataset.index);
    if (!Number.isInteger(index) || !state.bookmarks[index]) return;

    const field = target.dataset.bookmarkField;
    if (field === "title") {
      state.bookmarks[index].title = target.value;
      actions.markBookmarksDirty();
      return;
    }

    if (field === "pageNumber") {
      state.bookmarks[index].pageNumber = Math.max(1, Number(target.value || 1));
      actions.markBookmarksDirty();
    }
  });

  controls.bookmarksList?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.bookmarkAction !== "remove") return;

    const row = target.closest(".bookmark-row");
    if (!row) return;

    const index = Number(row.dataset.index);
    if (!Number.isInteger(index)) return;
    actions.removeBookmark(index);
  });
}

function exposeManagedEditorApi({
  windowApi = globalThis.window,
  consoleApi = globalThis.console,
  state,
  actions
}) {
  windowApi.Z7PdfEditor = {
    loadFiles: actions.loadEditor,
    insertFiles: (files, options = {}) => actions.insertEditorFiles(files, options),
    hasDocument: () => Array.isArray(state?.pages) && state.pages.length > 0,
    hasUnsavedChanges: actions.hasUnsavedChanges,
    setCurrentUser: actions.setCurrentUser,
    saveOnline: actions.saveEditedPdfOnline,
    setMessage: actions.setEditorResult
  };
}

export function setupManagedEditorBindings({
  controls,
  state,
  immersivePreviewState,
  workspaceSearchState,
  elements,
  actions,
  documentApi = globalThis.document,
  windowApi = globalThis.window,
  platform = globalThis.navigator?.platform,
  consoleApi = globalThis.console
}) {
  const activatePreviewSearch = async (delta) => {
    const query = elements.previewSearchInput
      ? elements.previewSearchInput.value
      : immersivePreviewState.searchQuery;
    await activateManagedSearch({
      searchState: immersivePreviewState,
      query,
      normalizeQuery: normalizeSearchQuery,
      runSearch: actions.runPreviewSearch,
      stepSearch: () => actions.stepPreviewSearch(delta),
      keyMap: MANAGED_PREVIEW_SEARCH_STATE_KEYS
    });
  };

  const activateWorkspaceSearch = async (delta) => {
    const query = elements.editorWorkspaceSearchInput
      ? elements.editorWorkspaceSearchInput.value
      : workspaceSearchState.query;
    await activateManagedWorkspaceSearchController({
      searchState: workspaceSearchState,
      query,
      runSearch: actions.runWorkspaceSearch,
      stepSearch: () => actions.stepWorkspaceSearch(delta)
    });
  };

  elements.editorFileInput?.addEventListener("change", async (event) => {
    const input = event.target;
    const files = Array.from(input?.files || []);
    if (input instanceof HTMLInputElement) {
      input.value = "";
    }
    if (files.length === 0) return;

    try {
      await actions.loadEditor(files);
    } catch (error) {
      actions.setEditorResult(error.message || "PDF 加载失败", true);
    }
  });

  attachManagedUploadTargets({
    editorEmpty: elements.editorEmpty,
    editorDropZone: elements.editorDropZone,
    editorDropOverlay: elements.editorDropOverlay,
    editorFileInput: elements.editorFileInput,
    state,
    loadEditor: actions.loadEditor,
    setResult: actions.setEditorResult,
    windowApi
  });

  documentApi.addEventListener("paste", async (event) => {
    if (isManagedEditableTarget(event.target)) return;

    const files = collectManagedClipboardPdfFiles(event.clipboardData);
    if (files.length === 0) return;

    event.preventDefault();
    try {
      if (state.pages.length > 0) {
        await actions.insertEditorFiles(files);
      } else {
        await actions.loadEditor(files);
      }
    } catch (error) {
      actions.setEditorResult(error.message || "剪贴板 PDF 处理失败", true);
    }
  });

  const focusManagedEditorSurface = () => {
    const target = !elements.editorShell?.classList.contains("hidden")
      ? elements.editorDropZone
      : elements.editorEmpty;
    if (!(target instanceof HTMLElement)) return;
    if (!target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
    }
    windowApi.requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
    });
  };

  documentApi.addEventListener("page:shown", (event) => {
    if (event?.detail?.pageName !== "workbench") return;
    focusManagedEditorSurface();
  });

  windowApi.addEventListener("beforeunload", (event) => {
    if (!actions.hasUnsavedChanges?.()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  attachManagedSelectionControls({
    controls,
    state,
    refreshSelectionCards: actions.refreshSelectionCards
  });

  attachManagedHistoryControls({
    documentApi,
    state,
    previewModal: elements.previewModal,
    undoPreviewEdit: actions.undoPreviewEdit,
    globalUndo: actions.globalUndo,
    globalRedo: actions.globalRedo
  });

  bindManagedPreviewWindowEvents({
    documentApi,
    windowApi,
    elements,
    previewState: immersivePreviewState,
    actions
  });

  attachManagedPreviewSearchEvents({
    previewSearchInput: elements.previewSearchInput,
    previewSearchPrevBtn: elements.previewSearchPrevBtn,
    previewSearchNextBtn: elements.previewSearchNextBtn,
    schedulePreviewSearch: actions.schedulePreviewSearch,
    activatePreviewSearch
  });

  bindManagedSelectionToolbarMouseDown([
    elements.previewTextHighlightBtn,
    elements.previewTextUnderlineBtn,
    elements.previewTextSelectionCloseBtn
  ]);

  elements.previewTextHighlightBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.applyPreviewTextAnnotation("text-highlight");
  });

  elements.previewTextUnderlineBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.applyPreviewTextAnnotation("text-underline");
  });

  elements.previewTextSelectionCloseBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.hidePreviewSelectionToolbar({ clearSelection: true });
  });

  bindManagedSelectionToolbarMouseDown([
    elements.workspaceTextHighlightBtn,
    elements.workspaceTextUnderlineBtn,
    elements.workspaceTextSelectionCloseBtn
  ]);

  elements.workspaceTextHighlightBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.applyWorkspaceTextAnnotation("text-highlight");
  });

  elements.workspaceTextUnderlineBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.applyWorkspaceTextAnnotation("text-underline");
  });

  elements.workspaceTextSelectionCloseBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    actions.hideWorkspaceSelectionToolbar({ clearSelection: true });
  });

  attachManagedWorkspaceSearchEvents({
    editorWorkspaceSearchToggleBtn: elements.editorWorkspaceSearchToggleBtn,
    editorWorkspaceSearchPanel: elements.editorWorkspaceSearchPanel,
    editorWorkspaceSearchInput: elements.editorWorkspaceSearchInput,
    editorWorkspaceSearchPrevBtn: elements.editorWorkspaceSearchPrevBtn,
    editorWorkspaceSearchNextBtn: elements.editorWorkspaceSearchNextBtn,
    workspaceSearchState,
    setWorkspaceSearchPanelVisible: actions.setWorkspaceSearchPanelVisible,
    scheduleWorkspaceSearch: actions.scheduleWorkspaceSearch,
    activateWorkspaceSearch
  });

  actions.updatePreviewSearchUi();
  actions.updateWorkspaceSearchUi();

  bindManagedGlobalEditorEvents({
    documentApi,
    windowApi,
    elements,
    controls,
    state,
    actions
  });

  bindManagedPageActionEvents({
    controls,
    state,
    elements,
    previewState: immersivePreviewState,
    actions
  });

  bindManagedEditorControlEvents({
    controls,
    state,
    documentApi,
    windowApi,
    actions
  });

  attachManagedAssetImageInputs({
    controls,
    state,
    updateWatermarkLabel: actions.updateWatermarkImageLabel,
    updateStampLabel: actions.updateStampImageLabel,
    setResult: actions.setEditorResult
  });

  bindManagedMetadataEvents({
    controls,
    state,
    actions
  });

  actions.updateSplitFieldState();
  actions.updateWatermarkImageLabel();
  actions.updateStampImageLabel();
  actions.renderBookmarksList();
  void actions.loadEditorCapabilities();
  actions.updateUndoRedoUI();
  actions.syncAnnotationStyleBar();

  exposeManagedEditorApi({
    windowApi,
    consoleApi,
    state,
    actions
  });

  attachManagedEditorShortcuts({
    windowApi,
    documentApi,
    platform,
    onSelectAll: () => {
      applyManagedPageSelectionCommand({
        state,
        mode: "selectAll",
        refreshSelectionCards: actions.refreshSelectionCards
      });
    },
    onClearSelection: () => {
      applyManagedPageSelectionCommand({
        state,
        mode: "clear",
        refreshSelectionCards: actions.refreshSelectionCards
      });
    },
    onInvertSelection: () => {
      applyManagedPageSelectionCommand({
        state,
        mode: "invert",
        refreshSelectionCards: actions.refreshSelectionCards
      });
    },
    onUndo: () => {
      if (state.previewPage || !elements.previewModal.classList.contains("hidden")) {
        actions.undoPreviewEdit();
      } else {
        actions.globalUndo();
      }
    },
    onRedo: () => {
      if (state.previewPage) return;
      actions.globalRedo();
    }
  });
}
