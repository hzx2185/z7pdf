import * as pdfjsLib from "/vendor/pdfjs/pdf.mjs";
import { escapeHtml, getFilenameFromDisposition, triggerBlobDownload, showToast } from "./common.js";

console.log("[Editor] Script starting...");
pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.mjs";

const editorFileInput = document.querySelector("#editorFileInput");
const editorEmpty = document.querySelector("#editorEmpty");
const editorShell = document.querySelector("#editorShell");
const editorDropZone = document.querySelector("#editorDropZone");
const editorDropOverlay = document.querySelector("#editorDropOverlay");
const thumbGrid = document.querySelector("#thumbGrid");
const editorFilename = document.querySelector("#editorFilename");
const editorMeta = document.querySelector("#editorMeta");
const editorResult = document.querySelector("#editorResult");
const previewModal = document.querySelector("#previewModal");
const previewBody = document.querySelector("#previewBody");
const previewCloseBtn = document.querySelector("#previewCloseBtn");

const state = {
  files: [],
  pages: [],
  selected: new Set(),
  currentUser: null,
  workspaceSource: null,
  metadataDirty: false,
  previewCropOrigin: null,
  bookmarks: [],
  watermarkImageDataUrl: "",
  watermarkImageName: "",
  stampImageDataUrl: "",
  stampImageName: "",
  renderToken: 0,
  draggingIndex: null,
  nextPageId: 1,
  thumbObserver: null,
  recycleObserver: null,
  renderQueue: [],
  queuedPageIds: new Set(),
  renderingPageIds: new Set(),
  queueRunning: false,
  editorDragDepth: 0,
  activeTool: null, // 'pencil' or 'crop'
  previewPage: null,
  isDrawing: false,
  currentLine: null,
  cropRect: null, // { x, y, w, h } relative to preview canvas
  previewInteraction: null,
  workspaceZoom: "1",
  lastSelectedIndex: null,
  historyStack: [],
  redoStack: []
};

// --- History & Undo/Redo ---

function captureStateSnapshot() {
  return state.pages.map(p => ({
    id: p.id,
    fileIndex: p.fileIndex,
    fileName: p.fileName,
    sourceIndex: p.sourceIndex,
    width: p.width,
    height: p.height,
    isBlank: !!p.isBlank,
    rotation: p.rotation,
    deleted: !!p.deleted,
    annotations: p.annotations ? JSON.parse(JSON.stringify(p.annotations)) : [],
    crop: p.crop ? { ...p.crop } : null
  }));
}

function pushHistory() {
  const snapshot = captureStateSnapshot();
  // Don't push if it's identical to last one
  if (state.historyStack.length > 0) {
    const last = JSON.stringify(state.historyStack[state.historyStack.length - 1]);
    if (last === JSON.stringify(snapshot)) return;
  }

  state.historyStack.push(snapshot);
  if (state.historyStack.length > 50) state.historyStack.shift();
  state.redoStack = [];
  updateUndoRedoUI();
}

function applySnapshot(snapshot) {
  if (!snapshot) return;

  // Reconstruct state.pages based on snapshot
  // We must preserve the actual underlying canvas/file references if possible for performance
  const newPages = snapshot.map(snapPage => {
    // Find original page object if possible to keep heavy assets
    const original = state.pages.find(p => p.id === snapPage.id);
    if (original) {
      return {
        ...original,
        ...snapPage
      };
    }

    const restoredPdf =
      snapPage.isBlank || snapPage.fileIndex == null || snapPage.fileIndex < 0
        ? null
        : state.files[snapPage.fileIndex]?.pdf || null;

    return {
      id: snapPage.id,
      fileIndex: snapPage.fileIndex,
      fileName: snapPage.fileName || state.files[snapPage.fileIndex]?.name || "未命名文件",
      sourceIndex: snapPage.sourceIndex,
      width: snapPage.width || 595,
      height: snapPage.height || 842,
      isBlank: !!snapPage.isBlank,
      rotation: snapPage.rotation || 0,
      deleted: !!snapPage.deleted,
      annotations: snapPage.annotations ? JSON.parse(JSON.stringify(snapPage.annotations)) : [],
      crop: snapPage.crop ? { ...snapPage.crop } : null,
      canvas: null,
      rendered: false,
      pdf: restoredPdf
    };
  });

  state.pages = newPages;
  state.selected.clear();
  renderThumbs();
  updateUndoRedoUI();
}

function globalUndo() {
  if (state.historyStack.length === 0) return;

  // Push current state to redo
  state.redoStack.push(captureStateSnapshot());
  if (state.redoStack.length > 50) state.redoStack.shift();

  const previous = state.historyStack.pop();
  applySnapshot(previous);
}

function globalRedo() {
  if (state.redoStack.length === 0) return;

  state.historyStack.push(captureStateSnapshot());
  const next = state.redoStack.pop();
  applySnapshot(next);
}

function updateUndoRedoUI() {
  const undoBtn = document.getElementById("globalUndoBtn");
  const redoBtn = document.getElementById("globalRedoBtn");
  if (undoBtn) undoBtn.disabled = state.historyStack.length === 0;
  if (redoBtn) redoBtn.disabled = state.redoStack.length === 0;
}

function isFileDragEvent(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function isPdfUploadFile(file) {
  if (!(file instanceof File)) return false;
  if (file.type === "application/pdf") return true;
  return /\.pdf$/i.test(file.name || "");
}

function collectDroppedPdfFiles(fileList) {
  return Array.from(fileList || []).filter(isPdfUploadFile);
}

function setEditorDropActive(active) {
  if (!editorDropZone || !editorDropOverlay) return;
  editorDropZone.classList.toggle("is-dragover", active);
  editorDropOverlay.classList.toggle("hidden", !active);
  editorDropOverlay.setAttribute("aria-hidden", String(!active));
}

function resetEditorDropState() {
  state.editorDragDepth = 0;
  setEditorDropActive(false);
}

function openEditorFilePicker() {
  editorFileInput?.click();
}

async function importDroppedPdfFiles(fileList) {
  const files = collectDroppedPdfFiles(fileList);
  if (files.length === 0) {
    setEditorResult("拖拽上传仅支持 PDF 文件。", true);
    return;
  }

  try {
    await loadEditor(files);
  } catch (error) {
    setEditorResult(error.message || "PDF 加载失败", true);
  }
}


const controls = {
  selectAllBtn: document.querySelector("#selectAllBtn"),
  clearSelectionBtn: document.querySelector("#clearSelectionBtn"),
  invertSelectionBtn: document.querySelector("#invertSelectionBtn"),
  previewBtn: document.querySelector("#previewBtn"),
  printBtn: document.querySelector("#printBtn"),
  insertBlankBtn: document.querySelector("#insertBlankBtn"),
  rotateLeftBtn: document.querySelector("#rotateLeftBtn"),
  rotateRightBtn: document.querySelector("#rotateRightBtn"),
  deleteBtn: document.querySelector("#deleteBtn"),
  restoreBtn: document.querySelector("#restoreBtn"),
  moveUpBtn: document.querySelector("#moveUpBtn"),
  moveDownBtn: document.querySelector("#moveDownBtn"),
  reverseBtn: document.querySelector("#reverseBtn"),
  exportBtn: document.querySelector("#exportEditorBtn"),
  saveOnlineBtn: document.querySelector("#saveOnlineBtn"),
  exportBtn2: document.querySelector("#exportEditorBtn2"),
  saveOnlineBtn2: document.querySelector("#saveOnlineBtn2"),
  drawBtn: document.querySelector("#drawBtn"),
  cropBtn: document.querySelector("#cropBtn"),
  splitDirection: document.querySelector("#splitDirection"),
  splitCount: document.querySelector("#splitCount"),
  splitAllPages: document.querySelector("#splitAllPages"),
  applySplitBtn: document.querySelector("#applySplitBtn"),
  workspaceZoomSelect: document.querySelector("#workspaceZoomSelect"),
  saveName: document.querySelector("#saveName"),
  saveFolderName: document.querySelector("#saveFolderName"),
  exportMode: document.querySelector("#exportMode"),
  splitEvery: document.querySelector("#splitEvery"),
  resizePageSize: document.querySelector("#resizePageSize"),
  resizeOrientation: document.querySelector("#resizeOrientation"),
  resizeMargin: document.querySelector("#resizeMargin"),
  resizeBackgroundColor: document.querySelector("#resizeBackgroundColor"),
  resizeFitMode: document.querySelector("#resizeFitMode"),
  watermarkEnabled: document.querySelector("#watermarkEnabled"),
  watermarkKind: document.querySelector("#watermarkKind"),
  watermarkText: document.querySelector("#watermarkText"),
  watermarkImageInput: document.querySelector("#watermarkImageInput"),
  watermarkImageName: document.querySelector("#watermarkImageName"),
  watermarkPosition: document.querySelector("#watermarkPosition"),
  watermarkColor: document.querySelector("#watermarkColor"),
  watermarkOpacity: document.querySelector("#watermarkOpacity"),
  watermarkFontSize: document.querySelector("#watermarkFontSize"),
  watermarkImageScale: document.querySelector("#watermarkImageScale"),
  watermarkRotate: document.querySelector("#watermarkRotate"),
  stampEnabled: document.querySelector("#stampEnabled"),
  stampImageInput: document.querySelector("#stampImageInput"),
  stampImageName: document.querySelector("#stampImageName"),
  stampPosition: document.querySelector("#stampPosition"),
  stampOpacity: document.querySelector("#stampOpacity"),
  stampScale: document.querySelector("#stampScale"),
  stampMargin: document.querySelector("#stampMargin"),
  stampRotate: document.querySelector("#stampRotate"),
  pageNumbersEnabled: document.querySelector("#pageNumbersEnabled"),
  pageNumbersAlign: document.querySelector("#pageNumbersAlign"),
  pageNumbersVertical: document.querySelector("#pageNumbersVertical"),
  pageNumbersFontSize: document.querySelector("#pageNumbersFontSize"),
  pageNumbersMargin: document.querySelector("#pageNumbersMargin"),
  batesEnabled: document.querySelector("#batesEnabled"),
  batesPrefix: document.querySelector("#batesPrefix"),
  batesStart: document.querySelector("#batesStart"),
  batesDigits: document.querySelector("#batesDigits"),
  batesAlign: document.querySelector("#batesAlign"),
  batesVertical: document.querySelector("#batesVertical"),
  batesFontSize: document.querySelector("#batesFontSize"),
  batesMargin: document.querySelector("#batesMargin"),
  compressionEnabled: document.querySelector("#compressionEnabled"),
  compressionLevel: document.querySelector("#compressionLevel"),
  grayscaleEnabled: document.querySelector("#grayscaleEnabled"),
  invertEnabled: document.querySelector("#invertEnabled"),
  scanEffectEnabled: document.querySelector("#scanEffectEnabled"),
  scanEffectLevel: document.querySelector("#scanEffectLevel"),
  ocrEnabled: document.querySelector("#ocrEnabled"),
  ocrLanguage: document.querySelector("#ocrLanguage"),
  ocrToggleBtn: document.querySelector("#ocrToggleBtn"),
  pdfaEnabled: document.querySelector("#pdfaEnabled"),
  pdfaLevel: document.querySelector("#pdfaLevel"),
  securityEnabled: document.querySelector("#securityEnabled"),
  securityPassword: document.querySelector("#securityPassword"),
  metadataEnabled: document.querySelector("#metadataEnabled"),
  metadataClearExisting: document.querySelector("#metadataClearExisting"),
  metadataTitle: document.querySelector("#metadataTitle"),
  metadataAuthor: document.querySelector("#metadataAuthor"),
  metadataSubject: document.querySelector("#metadataSubject"),
  metadataKeywords: document.querySelector("#metadataKeywords"),
  bookmarksEnabled: document.querySelector("#bookmarksEnabled"),
  bookmarksList: document.querySelector("#bookmarksList"),
  bookmarkAddBtn: document.querySelector("#bookmarkAddBtn"),
  headerFooterEnabled: document.querySelector("#headerFooterEnabled"),
  headerText: document.querySelector("#headerText"),
  footerText: document.querySelector("#footerText"),
  headerFooterAlign: document.querySelector("#headerFooterAlign"),
  headerFooterColor: document.querySelector("#headerFooterColor"),
  headerFooterFontSize: document.querySelector("#headerFooterFontSize"),
  headerFooterMargin: document.querySelector("#headerFooterMargin"),
  headerFooterOpacity: document.querySelector("#headerFooterOpacity"),
  toImagesEnabled: document.querySelector("#toImagesEnabled"),
  toImagesOptions: document.querySelector("#toImagesOptions"),
  toImagesFormat: document.querySelector("#toImagesFormat"),
  toImagesDpi: document.querySelector("#toImagesDpi"),
  toImagesQuality: document.querySelector("#toImagesQuality"),
  toImagesQualityField: document.querySelector("#toImagesQualityField"),
  toolPencil: document.querySelector("#toolPencil"),
  toolCrop: document.querySelector("#toolCrop"),
  toolUndo: document.querySelector("#toolUndo"),
  toolClear: document.querySelector("#toolClear")
};

function cloneAnnotationLine(line) {
  return {
    ...line,
    points: Array.isArray(line?.points) ? line.points.map((point) => [point[0], point[1]]) : []
  };
}

function cloneCrop(crop) {
  if (!crop) return null;
  return {
    x: Number(crop.x || 0),
    y: Number(crop.y || 0),
    w: Number(crop.w || 0),
    h: Number(crop.h || 0)
  };
}

function cropsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) < 0.0001 &&
    Math.abs(a.y - b.y) < 0.0001 &&
    Math.abs(a.w - b.w) < 0.0001 &&
    Math.abs(a.h - b.h) < 0.0001
  );
}

function clampCropToBounds(crop) {
  if (!crop) return null;
  const width = Math.min(1, Math.max(0.005, Number(crop.w || 0)));
  const height = Math.min(1, Math.max(0.005, Number(crop.h || 0)));
  return {
    x: Math.min(1 - width, Math.max(0, Number(crop.x || 0))),
    y: Math.min(1 - height, Math.max(0, Number(crop.y || 0))),
    w: width,
    h: height
  };
}

function isPointInCrop(coords, crop) {
  if (!coords || !crop) return false;
  return (
    coords.x >= crop.x &&
    coords.x <= crop.x + crop.w &&
    coords.y >= crop.y &&
    coords.y <= crop.y + crop.h
  );
}

function ensurePreviewPageState(page) {
  if (!page) return;
  if (!Array.isArray(page.annotations)) {
    page.annotations = [];
  }
  if (!Array.isArray(page.visualHistory)) {
    page.visualHistory = [];
  }
}

function updatePreviewHelper(message = "") {
  const helper = document.querySelector("#previewHelper");
  if (!helper) return;
  helper.textContent =
    message ||
    "先选中一个页面，再用“标注”或“裁剪”进行编辑。支持 Ctrl/Cmd+Z 撤销，按 Esc 关闭。";
}

function pushVisualHistory(page, entry) {
  ensurePreviewPageState(page);
  page.visualHistory.push(entry);
}

function updateUndoAvailability() {
  const count = Array.isArray(state.previewPage?.visualHistory) ? state.previewPage.visualHistory.length : 0;
  if (controls.toolUndo) {
    controls.toolUndo.disabled = count === 0;
    controls.toolUndo.classList.toggle("disabled", count === 0);
  }
}

function undoPreviewEdit() {
  const page = state.previewPage;
  if (!page || !Array.isArray(page.visualHistory) || page.visualHistory.length === 0) {
    setEditorResult("当前页面没有可撤销的操作。");
    return;
  }

  const last = page.visualHistory.pop();
  if (last?.type === "annotation-add") {
    page.annotations.splice(last.index, 1);
  } else if (last?.type === "crop-change") {
    page.crop = cloneCrop(last.previousCrop);
  } else if (last?.type === "clear-all") {
    page.annotations = last.previousAnnotations.map(cloneAnnotationLine);
    page.crop = cloneCrop(last.previousCrop);
  }

  redrawPreviewOverlay();
  updateUndoAvailability();
  updatePreviewHelper("已撤销上一步编辑。");
  setEditorResult("已撤销当前页面的上一步编辑。");
}

function setEditorResult(message, isError = false) {
  clearTimeout(window._editorResultTimer);

  if (editorResult) {
    editorResult.textContent = message;
    editorResult.classList.remove("hidden");
    editorResult.classList.toggle("error", isError);
    editorResult.classList.toggle("success", !isError && message.length > 0);
    editorResult.classList.add("is-visible");
  }

  window._editorResultTimer = setTimeout(() => {
    if (editorResult) {
      editorResult.classList.remove("is-visible");
      editorResult.classList.add("hidden");
    }
  }, 5000);
}

function updateWatermarkImageLabel() {
  if (!controls.watermarkImageName) return;
  controls.watermarkImageName.textContent = state.watermarkImageName
    ? `已选择图片水印：${state.watermarkImageName}`
    : "未选择图片水印。支持 PNG、JPG。";
}

function updateStampImageLabel() {
  if (!controls.stampImageName) return;
  controls.stampImageName.textContent = state.stampImageName
    ? `已选择印章图片：${state.stampImageName}`
    : "未选择印章图片。支持 PNG、JPG。";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片水印失败。"));
    reader.readAsDataURL(file);
  });
}

function isChecked(control) {
  return Boolean(control?.checked);
}

function controlValue(control, fallback = "") {
  return control ? control.value : fallback;
}

function setOcrAvailability(available) {
  const enabled = available !== false;
  if (controls.ocrToggleBtn) {
    controls.ocrToggleBtn.disabled = !enabled;
    controls.ocrToggleBtn.title = enabled
      ? "扫描件文字识别"
      : "当前环境未安装 OCR 依赖";
  }
  if (!enabled && controls.ocrEnabled) {
    controls.ocrEnabled.checked = false;
    controls.ocrToggleBtn?.classList.remove("active");
  }
}

async function loadEditorCapabilities() {
  try {
    const response = await fetch("/api/public-config");
    if (!response.ok) return;
    const config = await response.json().catch(() => null);
    setOcrAvailability(config?.ocrAvailable !== false);
  } catch (_error) {
    setOcrAvailability(false);
  }
}

function setCurrentUser(user) {
  state.currentUser = user || null;
}

function normalizeWorkspaceSource(source) {
  if (!source || !Number.isInteger(Number(source.id)) || Number(source.id) < 1) {
    return null;
  }
  return {
    id: Number(source.id),
    originalName: String(source.originalName || "").trim(),
    folderName: String(source.folderName || "").trim(),
    kind: String(source.kind || "pdf").trim() || "pdf"
  };
}

function getOverwriteTarget() {
  if (state.files.length !== 1) return null;
  if (controlValue(controls.exportMode, "single") !== "single") return null;
  if (!state.workspaceSource) return null;
  if (state.workspaceSource.kind !== "pdf") return null;
  return state.workspaceSource;
}

function normalizeMetadataFieldValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(", ");
  }
  return String(value || "").trim();
}

function setMetadataFields(values, options = {}) {
  const { markDirty = false } = options;
  controls.metadataTitle.value = normalizeMetadataFieldValue(values.title);
  controls.metadataAuthor.value = normalizeMetadataFieldValue(values.author);
  controls.metadataSubject.value = normalizeMetadataFieldValue(values.subject);
  controls.metadataKeywords.value = normalizeMetadataFieldValue(values.keywords);
  state.metadataDirty = markDirty;
}

function markMetadataDirty() {
  state.metadataDirty = true;
}

function normalizeBookmarkItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      title: String(item?.title || "").trim(),
      pageNumber: Math.max(1, Number(item?.pageNumber || index + 1))
    }))
    .filter((item) => item.title);
}

function setBookmarks(items, options = {}) {
  const { autoEnable = false } = options;
  state.bookmarks = normalizeBookmarkItems(items);
  if (controls.bookmarksEnabled) {
    controls.bookmarksEnabled.checked = autoEnable && state.bookmarks.length > 0;
  }
  renderBookmarksList();
}

function markBookmarksDirty() {
  if (controls.bookmarksEnabled) {
    controls.bookmarksEnabled.checked = true;
  }
}

function addBookmark(initial = {}) {
  state.bookmarks.push({
    title: String(initial.title || "").trim(),
    pageNumber: Math.max(1, Number(initial.pageNumber || visiblePages() || 1))
  });
  markBookmarksDirty();
  renderBookmarksList();
}

function removeBookmark(index) {
  state.bookmarks.splice(index, 1);
  renderBookmarksList();
}

function renderBookmarksList() {
  if (!controls.bookmarksList) return;

  if (state.bookmarks.length === 0) {
    controls.bookmarksList.innerHTML =
      '<p class="dropdown-hint bookmark-empty">还没有书签，可点击下方按钮新增。</p>';
    return;
  }

  controls.bookmarksList.innerHTML = state.bookmarks
    .map(
      (item, index) => `
        <div class="bookmark-row" data-index="${index}">
          <label class="field">
            <span>标题</span>
            <input type="text" data-bookmark-field="title" value="${escapeHtml(item.title)}" placeholder="例如：第一章 / 合同正文" />
          </label>
          <label class="field">
            <span>页码</span>
            <input type="number" min="1" data-bookmark-field="pageNumber" value="${item.pageNumber}" />
          </label>
          <button type="button" class="btn btn-xs btn-danger" data-bookmark-action="remove" aria-label="删除书签">删</button>
        </div>
      `
    )
    .join("");
}

async function readPdfBookmarks(pdf) {
  const outline = await pdf.getOutline().catch(() => []);
  const topLevelItems = Array.isArray(outline) ? outline : [];
  const bookmarks = [];

  for (const item of topLevelItems) {
    const title = String(item?.title || "").trim();
    const pageNumber = await resolveOutlinePageNumber(pdf, item?.dest);
    if (!title || !pageNumber) continue;
    bookmarks.push({ title, pageNumber });
  }

  return bookmarks;
}

async function resolveOutlinePageNumber(pdf, rawDest) {
  let dest = rawDest;
  if (!dest) return null;
  if (typeof dest === "string") {
    dest = await pdf.getDestination(dest).catch(() => null);
  }
  if (!Array.isArray(dest) || !dest[0]) return null;
  try {
    const index = await pdf.getPageIndex(dest[0]);
    return index + 1;
  } catch (_error) {
    return null;
  }
}

async function readPdfMetadata(pdf) {
  const metadata = await pdf.getMetadata().catch(() => null);
  const info = metadata?.info || {};
  return {
    title: info.Title || "",
    author: info.Author || "",
    subject: info.Subject || "",
    keywords: info.Keywords || ""
  };
}

function visiblePages() {
  return state.pages.filter((page) => !page.deleted).length;
}

function renderedPages() {
  return state.pages.filter((page) => page.rendered).length;
}

function updateMeta() {
  editorFilename.textContent =
    state.files.length === 0
      ? "未加载文件"
      : state.files.length === 1
        ? state.files[0].name
        : `${state.files.length} 个文件已载入`;
  editorMeta.textContent =
    `已选${state.selected.size}/${visiblePages()} | 保留 ${visiblePages()}/${state.pages.length} | 渲染 ${renderedPages()}/${state.pages.length}`;
}

function selectedIndices() {
  return Array.from(state.selected).sort((a, b) => a - b);
}

function createPlaceholder() {
  const placeholder = document.createElement("div");
  placeholder.className = "thumb-placeholder";
  placeholder.innerHTML = "<span>滚动到这里后生成缩略图</span>";
  return placeholder;
}

function findPageById(pageId) {
  return state.pages.find((page) => page.id === Number(pageId)) || null;
}

function disconnectThumbObserver() {
  if (state.thumbObserver) {
    state.thumbObserver.disconnect();
    state.thumbObserver = null;
  }
  if (state.recycleObserver) {
    state.recycleObserver.disconnect();
    state.recycleObserver = null;
  }
}

function resetThumbQueue() {
  state.renderQueue = [];
  state.queuedPageIds.clear();
  state.renderingPageIds.clear();
  state.queueRunning = false;
}

function buildMetaHtml(page, index) {
  const sourceLabel = page.isBlank
    ? `空白页 / ${Math.round(page.width || 0)} × ${Math.round(page.height || 0)} pt`
    : `${page.fileName} / 原页 ${page.sourceIndex + 1}`;
  const editFlags = [];
  if (page.crop) editFlags.push("裁剪");
  if (page.annotations?.length > 0) editFlags.push(`标注(${page.annotations.length})`);
  const editLabel = editFlags.length > 0 ? ` / ${editFlags.join(", ")}` : "";
  return `
    <strong>第 ${index + 1} 页</strong>
    <span>${sourceLabel}</span>
    <span>${page.deleted ? "已标记删除" : "保留"} / 旋转 ${page.rotation}°${editLabel}</span>
  `;
}

function updateThumbCard(page) {
  const index = state.pages.indexOf(page);
  if (index === -1) return;

  const card = thumbGrid.querySelector(`[data-page-id="${page.id}"]`);
  if (!card) return;

  card.classList.toggle("selected", state.selected.has(index));
  card.classList.toggle("deleted", page.deleted);
  card.classList.toggle("has-edit", Boolean(page.crop || page.annotations?.length > 0));

  const preview = card.querySelector(".thumb-preview");
  const meta = card.querySelector(".thumb-meta");
  if (!preview || !meta) return;

  preview.innerHTML = "";
  if (page.canvas) {
    page.canvas.style.transform = `rotate(${page.rotation}deg)`;
    preview.appendChild(page.canvas);
  } else {
    preview.appendChild(createPlaceholder());
  }

  meta.innerHTML = buildMetaHtml(page, index);
}

function recyclePageCanvas(page) {
  if (!page || !page.canvas || state.renderingPageIds.has(page.id)) {
    return;
  }

  page.canvas.width = 0;
  page.canvas.height = 0;
  page.canvas = null;
  page.rendered = false;
  updateThumbCard(page);
  updateMeta();
}

async function ensurePageCanvas(page, renderToken) {
  if (page.canvas) {
    return page.canvas;
  }

  if (!page.isBlank && !page.pdf) {
    throw new Error(`页面源文件不可用，无法渲染第 ${page.sourceIndex + 1} 页。`);
  }

  const rendered = page.isBlank
    ? { canvas: renderBlankPage(page), width: page.width, height: page.height }
    : await renderPage(page.pdf, page.sourceIndex + 1);
  if (state.renderToken !== renderToken) {
    return null;
  }

  page.canvas = rendered.canvas;
  if (rendered.width > 0) {
    page.width = rendered.width;
  }
  if (rendered.height > 0) {
    page.height = rendered.height;
  }
  page.rendered = true;
  updateThumbCard(page);
  updateMeta();
  return rendered.canvas;
}

function queuePageRender(pageId, prioritize = false) {
  const page = findPageById(pageId);
  if (!page || page.canvas || state.queuedPageIds.has(page.id) || state.renderingPageIds.has(page.id)) {
    return;
  }

  if (prioritize) {
    state.renderQueue.unshift(page.id);
  } else {
    state.renderQueue.push(page.id);
  }
  state.queuedPageIds.add(page.id);
}

async function processThumbQueue(renderToken) {
  if (state.queueRunning) return;
  state.queueRunning = true;

  while (state.renderQueue.length > 0) {
    if (state.renderToken !== renderToken) break;

    const pageId = state.renderQueue.shift();
    state.queuedPageIds.delete(pageId);
    state.renderingPageIds.add(pageId);

    const page = findPageById(pageId);
    if (page && !page.canvas) {
      await ensurePageCanvas(page, renderToken);
      await yieldToBrowser();
    }

    state.renderingPageIds.delete(pageId);
  }

  state.queueRunning = false;

  if (state.renderToken === renderToken && renderedPages() === state.pages.length) {
    setEditorResult("缩略图已按需生成完成，可以继续编辑、合并、拆分或导出。");
  }
}

function requestRenderAround(index, prioritize = false) {
  for (let offset = -2; offset <= 2; offset += 1) {
    const page = state.pages[index + offset];
    if (page) {
      queuePageRender(page.id, prioritize && offset === 0);
    }
  }
  processThumbQueue(state.renderToken);
}

function setupThumbObserver() {
  disconnectThumbObserver();

  state.thumbObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const pageId = Number(entry.target.dataset.pageId);
        const index = state.pages.findIndex((page) => page.id === pageId);
        if (index >= 0) {
          requestRenderAround(index);
        }
      });
    },
    {
      root: null,
      rootMargin: "500px 0px",
      threshold: 0.01
    }
  );

  thumbGrid.querySelectorAll(".thumb-card").forEach((card) => {
    state.thumbObserver.observe(card);
  });

  state.recycleObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) return;
        const page = findPageById(entry.target.dataset.pageId);
        recyclePageCanvas(page);
      });
    },
    {
      root: null,
      rootMargin: "1800px 0px",
      threshold: 0
    }
  );

  thumbGrid.querySelectorAll(".thumb-card").forEach((card) => {
    state.recycleObserver.observe(card);
  });
}

let immersivePreviewState = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  imgRef: null,
  currentIndex: -1
};

function updateImmersiveTransform() {
  if (!immersivePreviewState.imgRef) return;
  const { scale, translateX, translateY } = immersivePreviewState;
  const img = immersivePreviewState.imgRef;
  const rotation = img.dataset.rotation || '0';
  img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotation}deg)`;

  const levelEl = document.getElementById("previewZoomLevel");
  if (levelEl) levelEl.textContent = Math.round(scale * 100) + "%";
}

function resetImmersiveZoom(fitWidth = false) {
  if (!immersivePreviewState.imgRef) return;
  immersivePreviewState.translateX = 0;
  immersivePreviewState.translateY = 0;

  const container = document.getElementById("previewBody");
  const img = immersivePreviewState.imgRef;

  // Use window dimensions directly for the immersive modal as it's full-screen
  // This avoids layout timing bugs where container.clientWidth might be 0 or small initially
  const cx = window.innerWidth;
  const cy = window.innerHeight;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  if (!iw || !ih) {
    immersivePreviewState.scale = 1;
    updateImmersiveTransform();
    return;
  }

  const rotation = parseInt(img.dataset.rotation || '0', 10);
  const isRotated = rotation % 180 !== 0;
  const boundW = isRotated ? ih : iw;
  const boundH = isRotated ? iw : ih;

  // Padding: Use smaller padding for a more "filled" view
  const paddingX = 40;
  const paddingY = 80; // Allow more vertical space for the floating toolbar

  const scaleX = (cx - paddingX) / boundW;
  const scaleY = (cy - paddingY) / boundH;

  if (fitWidth) {
    // Fit to width: at least 30%, no upper cap to allow clear reading on large monitors
    immersivePreviewState.scale = Math.max(0.3, scaleX);
  } else {
    // Best fit (Letterbox): at least 25%, up to 1.25x for small images
    const bestFit = Math.min(scaleX, scaleY);
    immersivePreviewState.scale = Math.max(0.25, Math.min(bestFit, 1.25));

    // IF the image is tall (vertical), maybe fit-to-width is better for readability?
    // Let's stick to best-fit for default but make it more generous.
  }

  updateImmersiveTransform();
}

function updateImmersivePagination() {
  const currentEl = document.getElementById("previewCurrentPage");
  const totalEl = document.getElementById("previewTotalPages");
  if (currentEl) currentEl.textContent = (immersivePreviewState.currentIndex + 1);
  if (totalEl) totalEl.textContent = state.pages.length;
}

function navigatePreview(delta) {
  if (state.pages.length === 0) return;
  let newIndex = immersivePreviewState.currentIndex + delta;

  // Wrap around or clamp? In PDF edtors, people usually expect clamping for prev/next
  if (newIndex < 0) newIndex = 0;
  if (newIndex >= state.pages.length) newIndex = state.pages.length - 1;

  if (newIndex === immersivePreviewState.currentIndex) return;

  immersivePreviewState.currentIndex = newIndex;
  renderPreviewAtCurrentIndex();
}

async function renderPreviewAtCurrentIndex() {
  const index = immersivePreviewState.currentIndex;
  const page = state.pages[index];
  if (!page) return;

  updateImmersivePagination();

  // Create a loading token to discard old requests if user clicks fast
  const loadingToken = Symbol('preview-load');
  immersivePreviewState.loadingToken = loadingToken;

  try {
    const canvas = await ensurePageCanvas(page, state.renderToken);
    if (immersivePreviewState.loadingToken !== loadingToken) return;
    if (!canvas) return;

    const newImg = document.createElement("img");
    newImg.src = canvas.toDataURL("image/jpeg", 0.95);
    newImg.dataset.rotation = page.rotation || '0';
    newImg.className = "full-preview-image";
    newImg.draggable = false;

    newImg.onload = () => {
      if (immersivePreviewState.loadingToken !== loadingToken) return;

      // Calculate and render in the NEXT frame to ensure layout is ready
      requestAnimationFrame(() => {
        if (immersivePreviewState.loadingToken !== loadingToken) return;

        // 1. Calculate zoom silently
        immersivePreviewState.imgRef = newImg;
        resetImmersiveZoom(false); // This uses the robust window dimensions now

        // 2. ONLY NOW empty the body and insert new image
        previewBody.innerHTML = "";
        previewBody.appendChild(newImg);

        // 3. Trigger fade-in after it's in the DOM
        requestAnimationFrame(() => {
          newImg.classList.add("is-visible");
        });
      });
    };
  } catch (e) {
    previewBody.innerHTML = "预览失败";
  }
}
async function rotatePreviewPage(delta) {
  pushHistory();
  const index = immersivePreviewState.currentIndex;
  const page = state.pages[index];
  if (!page) return;

  // Update state
  let currentRotation = parseInt(page.rotation || '0', 10);
  currentRotation = (currentRotation + delta + 360) % 360;
  page.rotation = currentRotation;

  // Instant visual feedback for the image
  if (immersivePreviewState.imgRef) {
    immersivePreviewState.imgRef.dataset.rotation = currentRotation;
    // We must re-calculate zoom because a 90/270 rotation swaps width/height
    resetImmersiveZoom(false);
  }

  // Mark as dirty and update workspace in background
  state.metadataDirty = true;
  renderThumbs();
}

function deletePreviewPage() {
  pushHistory();
  const index = immersivePreviewState.currentIndex;
  const page = state.pages[index];
  if (!page || state.pages.length <= 0) return;

  if (!confirm("确定要删除当前页面吗？")) return;

  // Remove page
  state.pages.splice(index, 1);
  state.selected.clear();

  if (state.pages.length === 0) {
    closePreview();
  } else {
    // Navigate to next page, or previous if this was the last one
    if (immersivePreviewState.currentIndex >= state.pages.length) {
      immersivePreviewState.currentIndex = state.pages.length - 1;
    }
    renderPreviewAtCurrentIndex();
  }

  renderThumbs();
}

async function openPreview() {
  const indices = Array.from(state.selected).sort();
  const index = indices.length > 0 ? indices[0] : 0;

  if (state.pages.length === 0) {
    setEditorResult("列表为空。");
    return;
  }

  immersivePreviewState.currentIndex = index;
  previewModal.classList.remove("hidden");
  renderPreviewAtCurrentIndex();
}

async function printDocument() {
  const activePages = state.pages.filter((p) => !p.deleted);
  if (activePages.length === 0) {
    setEditorResult("没有可打印的页面。", true);
    return;
  }

  setEditorResult("正在准备打印预览...");

  let printContainer = document.getElementById("print-container");
  if (!printContainer) {
    printContainer = document.createElement("div");
    printContainer.id = "print-container";
    document.body.appendChild(printContainer);
  }
  printContainer.innerHTML = "";

  try {
    for (const page of activePages) {
      const canvas = await ensurePageCanvas(page, state.renderToken);
      if (!canvas) continue;

      const pageDiv = document.createElement("div");
      pageDiv.className = "print-page";

      const img = document.createElement("img");
      img.src = canvas.toDataURL("image/jpeg", 0.95);
      
      // 保持基础旋转样式，由 CSS 控制显示
      if (page.rotation) {
        img.style.transform = `rotate(${page.rotation}deg)`;
      }

      pageDiv.appendChild(img);
      printContainer.appendChild(pageDiv);
    }

    setTimeout(() => {
      window.print();
    }, 500);
  } catch (error) {
    console.error("Print error:", error);
    setEditorResult("打印准备失败：" + error.message, true);
  }
}

function applySplit() {
  if (state.selected.size === 0) {
    setEditorResult("请先选中要分割的页面。", true);
    return;
  }

  const direction = controls.splitDirection?.value || "horizontal";
  const count = parseInt(controls.splitCount?.value || "2", 10);
  const applyAll = controls.splitAllPages?.checked ?? false;

  if (count < 2 || count > 10) {
    setEditorResult("分割份数必须在 2-10 之间。", true);
    return;
  }

  const indices = applyAll ? selectedIndices().reverse() : [selectedIndices()[0]];
  if (indices.length === 0 || indices[0] === undefined) {
    setEditorResult("请先选中页面。", true);
    return;
  }

  let added = 0;
  for (const idx of indices) {
    const page = state.pages[idx];
    if (!page || page.isBlank) continue;

    const splitParts = [];
    for (let i = 0; i < count; i++) {
      const newPage = {
        ...page,
        id: `${page.id}_split_${i}_${Date.now()}`,
        sourceIndex: page.sourceIndex,
        rotation: page.rotation,
        scale: page.scale,
        size: page.size,
        visualMetadata: [...(page.visualMetadata || [])]
      };
      if (direction === "horizontal") {
        newPage.crop = { x: 0, y: i / count, w: 1, h: 1 / count };
      } else {
        newPage.crop = { x: i / count, y: 0, w: 1 / count, h: 1 };
      }
      splitParts.push(newPage);
    }

    page.deleted = true;
    state.pages.splice(idx + 1, 0, ...splitParts);
    added++;
  }

  state.selected.clear();
  renderThumbs();
  setEditorResult(`已将 ${added} 个页面各分割为 ${count} 部分。`);
}

// 暴露给全局，供工作台 (workspace.js) 调用
window.openVisualEditor = async (file) => {
  // 注意：如果是工作台导出的文件，需要先加载它的第一页预览
  // 这里简化处理：直接弹窗并提示加载中
  previewModal.classList.remove("hidden");
  previewBody.innerHTML = "<div class='loading-spinner'>正在加载 PDF 预览...</div>";

  try {
    const pdfUrl = `/api/workspace/files/${file.id}/download`;
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const image = document.createElement("img");
    image.src = canvas.toDataURL("image/png");
    image.className = "preview-canvas";
    image.id = "previewImage";
    previewBody.innerHTML = "";
    previewBody.appendChild(image);

    // 构造一个虚拟的 page 对象供裁剪逻辑使用
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
    updateUndoAvailability();
    updatePreviewHelper("拖动画线即可标注，或切换到裁剪模式框出保留区域。");
    initPreviewCanvas(image, virtualPage);
  } catch (error) {
    console.error("Visual editor load error:", error);
    previewBody.innerHTML = `<div class='error'>加载失败: ${error.message}</div>`;
  }
};

async function openVisualEditorForPage(page) {
  // 现在的逻辑是原地编辑，不再打开弹窗
  // 但我们保留这个函数名以便于处理“激活编辑”的逻辑
  ensurePreviewPageState(page);
  state.previewPage = page;
  state.isDrawing = false;
  state.currentLine = null;
  state.previewCropOrigin = null;

  syncPreviewToolButtons();
  updateUndoAvailability();

  // 确保在网格中显示编辑层
  ensureInPlaceEditor(page);
  updateWorkspaceNavigation();
}

function ensureInPlaceEditor(page) {
  // 清除旧的编辑状态
  const cards = thumbGrid.querySelectorAll(".thumb-card");
  cards.forEach(c => c.classList.remove("active-editing"));
  const oldOverlay = document.getElementById("editorCanvasOverlay");
  if (oldOverlay) oldOverlay.remove();

  if (!state.activeTool || !page) return;

  const card = thumbGrid.querySelector(`[data-page-id="${page.id}"]`);
  if (!card) return;

  card.classList.add("active-editing");
  const previewContainer = card.querySelector(".thumb-preview");
  const canvas = previewContainer.querySelector("canvas");
  if (!canvas) return;

  initPreviewCanvas(canvas, page);
}

function updateWorkspaceNavigation() {
  const activePages = state.pages.filter(p => !p.deleted);
  if (activePages.length === 0) return;

  const selectedIdx = selectedIndices()[0] ?? 0;
  const currentRelIndex = activePages.findIndex(p => state.pages.indexOf(p) === selectedIdx);
  const total = activePages.length;
}

function goToPrevWorkspacePage() {
  const activePages = state.pages.filter(p => !p.deleted);
  const selectedIdx = selectedIndices()[0] ?? 0;
  const relIdx = activePages.findIndex(p => state.pages.indexOf(p) === selectedIdx);
  if (relIdx > 0) {
    const prevPage = activePages[relIdx - 1];
    const prevIdx = state.pages.indexOf(prevPage);
    state.selected = new Set([prevIdx]);
    scrollToPage(prevPage);
    renderThumbs();
    updateWorkspaceNavigation();
  }
}

function goToNextWorkspacePage() {
  const activePages = state.pages.filter(p => !p.deleted);
  const selectedIdx = selectedIndices()[0] ?? 0;
  const relIdx = activePages.findIndex(p => state.pages.indexOf(p) === selectedIdx);
  if (relIdx >= 0 && relIdx < activePages.length - 1) {
    const nextPage = activePages[relIdx + 1];
    const nextIdx = state.pages.indexOf(nextPage);
    state.selected = new Set([nextIdx]);
    scrollToPage(nextPage);
    renderThumbs();
    updateWorkspaceNavigation();
  }
}

function scrollToPage(page) {
  const card = thumbGrid.querySelector(`[data-page-id="${page.id}"]`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function applyWorkspaceZoom() {
  const zoom = state.workspaceZoom;
  const grid = document.getElementById("thumbGrid");
  if (!grid) return;

  // 移除之前的特殊模式类
  grid.classList.remove("fit-width-mode");

  if (zoom === "fit-all") {
    document.documentElement.style.setProperty("--thumb-scale", "0.6");
  } else if (zoom === "fit-width") {
    // 开启单列模式
    grid.classList.add("fit-width-mode");
    document.documentElement.style.setProperty("--thumb-scale", "2.5");
  } else {
    document.documentElement.style.setProperty("--thumb-scale", zoom);
  }

  if (controls.workspaceZoomSelect) {
    controls.workspaceZoomSelect.value = state.workspaceZoom;
  }
}

function handleWorkspaceZoomIn() {
  const levels = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  let current = parseFloat(state.workspaceZoom);
  if (isNaN(current)) current = 1;
  const next = levels.find(l => l > current) || levels[levels.length - 1];
  state.workspaceZoom = next.toString();
  applyWorkspaceZoom();
}

function handleWorkspaceZoomOut() {
  const levels = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  let current = parseFloat(state.workspaceZoom);
  if (isNaN(current)) current = 1;
  const next = [...levels].reverse().find(l => l < current) || levels[0];
  state.workspaceZoom = next.toString();
  applyWorkspaceZoom();
}

function syncPreviewToolButtons() {
  controls.toolPencil?.classList.toggle("active", state.activeTool === "pencil");
  controls.toolCrop?.classList.toggle("active", state.activeTool === "crop");
}

function setActivePreviewTool(tool) {
  state.activeTool = state.activeTool === tool ? null : tool;
  state.isDrawing = false;
  state.currentLine = null;
  state.previewInteraction = null;
  syncPreviewToolButtons();
  updateUndoAvailability();

  // 如果开启了工具，自动为第一个选中的页面开启编辑
  if (state.activeTool) {
    const selIdx = selectedIndices()[0] ?? 0;
    if (state.pages[selIdx]) {
      openVisualEditorForPage(state.pages[selIdx]);
    }
  } else {
    // 关闭工具时清除编辑层
    ensureInPlaceEditor(null);
  }
}

function redrawPreviewOverlay() {
  const overlay = document.getElementById("editorCanvasOverlay");
  if (overlay && state.previewPage) {
    drawExistingPageData(overlay, state.previewPage);
  }
}

function initPreviewCanvas(targetElement, page) {
  const existingOverlay = document.getElementById("editorCanvasOverlay");
  if (existingOverlay) existingOverlay.remove();

  const container = targetElement.closest(".thumb-preview");
  if (!container) return;

  const overlay = document.createElement("canvas");
  overlay.id = "editorCanvasOverlay";
  overlay.className = "edit-overlay-container";

  const mountOverlay = () => {
    // 我们使用 targetElement (即页面 canvas) 的原始尺寸作为坐标基准
    overlay.width = targetElement.width;
    overlay.height = targetElement.height;

    const rect = targetElement.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    overlay.style.position = "absolute";
    overlay.style.left = `${targetElement.offsetLeft}px`;
    overlay.style.top = `${targetElement.offsetTop}px`;
    overlay.style.width = `${targetElement.offsetWidth}px`;
    overlay.style.height = `${targetElement.offsetHeight}px`;
    overlay.style.pointerEvents = "auto";

    container.appendChild(overlay);

    drawExistingPageData(overlay, page);
    // 关键：setupCanvasEvents 的 displayWidth/Height 现在应该是 offsetWidth/Height
    setupCanvasEvents(overlay, page, targetElement.width, targetElement.height);
  };

  // 缩略图 canvas 已经是渲染好的，直接挂载
  requestAnimationFrame(mountOverlay);
}

function drawExistingPageData(overlay, page) {
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  // 画笔标注
  if (page.annotations && page.annotations.length > 0) {
    ctx.strokeStyle = "rgba(220, 38, 38, 0.8)"; // 红色
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    page.annotations.forEach(line => {
      if (line.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(line.points[0][0] * overlay.width, line.points[0][1] * overlay.height);
      for (let i = 1; i < line.points.length; i++) {
        ctx.lineTo(line.points[i][0] * overlay.width, line.points[i][1] * overlay.height);
      }
      ctx.stroke();
    });
  }

  // 裁剪区域
  if (page.crop) {
    const cropX = page.crop.x * overlay.width;
    const cropY = page.crop.y * overlay.height;
    const cropW = page.crop.w * overlay.width;
    const cropH = page.crop.h * overlay.height;

    ctx.save();
    ctx.fillStyle = "rgba(37, 99, 235, 0.14)";
    ctx.fillRect(0, 0, overlay.width, cropY);
    ctx.fillRect(0, cropY, cropX, cropH);
    ctx.fillRect(cropX + cropW, cropY, overlay.width - cropX - cropW, cropH);
    ctx.fillRect(0, cropY + cropH, overlay.width, overlay.height - cropY - cropH);
    ctx.restore();

    ctx.strokeStyle = "#2563eb"; // 蓝色
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropW, cropH);
    ctx.setLineDash([]);
  }
}

function setupCanvasEvents(overlay, page, displayWidth, displayHeight) {
  void displayWidth;
  void displayHeight;

  const getCoords = (e) => {
    const rect = overlay.getBoundingClientRect();
    const scaleX = overlay.width / rect.width;
    const scaleY = overlay.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX / overlay.width,
      y: (e.clientY - rect.top) * scaleY / overlay.height
    };
  };

  const updateCropCursor = (coords) => {
    if (state.activeTool === "crop" && page.crop && isPointInCrop(coords, page.crop)) {
      overlay.style.cursor = "move";
      return;
    }
    overlay.style.cursor = state.activeTool ? "crosshair" : "default";
  };

  overlay.onmousedown = (e) => {
    if (!state.activeTool) return;
    e.preventDefault();
    state.isDrawing = true;
    const coords = getCoords(e);
    ensurePreviewPageState(page);

    if (state.activeTool === "pencil") {
      state.currentLine = { type: "pencil", points: [[coords.x, coords.y]] };
      page.annotations.push(state.currentLine);
    } else if (state.activeTool === "crop") {
      state.previewCropOrigin = cloneCrop(page.crop);
      if (page.crop && isPointInCrop(coords, page.crop)) {
        state.previewInteraction = {
          type: "move-crop",
          start: coords,
          crop: cloneCrop(page.crop)
        };
      } else {
        state.previewInteraction = {
          type: "draw-crop"
        };
        page.crop = { x: coords.x, y: coords.y, w: 0.001, h: 0.001 };
        drawExistingPageData(overlay, page);
      }
    }
  };

  overlay.onmousemove = (e) => {
    const coords = getCoords(e);
    updateCropCursor(coords);
    if (!state.isDrawing) return;

    if (state.activeTool === "pencil" && state.currentLine) {
      state.currentLine.points.push([coords.x, coords.y]);
      drawExistingPageData(overlay, page);
    } else if (state.activeTool === "crop" && page.crop) {
      if (state.previewInteraction?.type === "move-crop" && state.previewInteraction.crop) {
        const dx = coords.x - state.previewInteraction.start.x;
        const dy = coords.y - state.previewInteraction.start.y;
        page.crop = clampCropToBounds({
          x: state.previewInteraction.crop.x + dx,
          y: state.previewInteraction.crop.y + dy,
          w: state.previewInteraction.crop.w,
          h: state.previewInteraction.crop.h
        });
      } else {
        page.crop.w = coords.x - page.crop.x;
        page.crop.h = coords.y - page.crop.y;
      }
      drawExistingPageData(overlay, page);
    }
  };

  overlay.onmouseup = (e) => {
    state.isDrawing = false;
    if (state.activeTool === "pencil" && state.currentLine) {
      if (state.currentLine.points.length < 2) {
        page.annotations = page.annotations.filter((line) => line !== state.currentLine);
      } else {
        pushVisualHistory(page, {
          type: "annotation-add",
          index: page.annotations.length - 1
        });
      }
      state.currentLine = null;
      updateUndoAvailability();
      drawExistingPageData(overlay, page);
      return;
    }

    state.currentLine = null;
    if (state.activeTool === "crop" && page.crop) {
      if (state.previewInteraction?.type !== "move-crop") {
        if (page.crop.w < 0) { page.crop.x += page.crop.w; page.crop.w = Math.abs(page.crop.w); }
        if (page.crop.h < 0) { page.crop.y += page.crop.h; page.crop.h = Math.abs(page.crop.h); }
        if (page.crop.w < 0.005 || page.crop.h < 0.005) {
          page.crop = null;
        } else {
          page.crop = clampCropToBounds(page.crop);
        }
      }
      const nextCrop = cloneCrop(page.crop);
      const previousCrop = cloneCrop(state.previewCropOrigin);
      if (!cropsEqual(nextCrop, previousCrop)) {
        pushVisualHistory(page, {
          type: "crop-change",
          previousCrop
        });
        updateUndoAvailability();
      }
      state.previewCropOrigin = null;
      state.previewInteraction = null;
      drawExistingPageData(overlay, page);
      if (e?.clientX != null && e?.clientY != null) {
        updateCropCursor(getCoords(e));
      } else {
        overlay.style.cursor = state.activeTool ? "crosshair" : "default";
      }
    }
  };

  overlay.onmouseleave = () => {
    if (!state.isDrawing) return;
    if (state.activeTool === "pencil" && state.currentLine) {
      state.isDrawing = false;
      state.currentLine = null;
      return;
    }
    if (state.activeTool === "crop" && page.crop) {
      overlay.onmouseup();
    }
  };

  overlay.onmouseenter = (e) => {
    updateCropCursor(getCoords(e));
  };
}

function closePreview() {
  state.previewPage = null;
  state.isDrawing = false;
  state.currentLine = null;
  state.previewCropOrigin = null;
  state.previewInteraction = null;
  state.activeTool = null;
  immersivePreviewState.imgRef = null;
  syncPreviewToolButtons();
  updateUndoAvailability();
  updatePreviewHelper();
  previewModal.classList.add("hidden");
  previewBody.innerHTML = "";
  renderThumbs();
}

function movePage(fromIndex, toIndex) {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;
  if (fromIndex < 0 || toIndex < 0) return;
  if (fromIndex >= state.pages.length || toIndex >= state.pages.length) return;
  if (fromIndex === toIndex) return;
  pushHistory();
  const [item] = state.pages.splice(fromIndex, 1);
  state.pages.splice(toIndex, 0, item);
  state.selected.clear();
  state.selected.add(toIndex);
  renderThumbs();
}

function renderThumbs() {
  disconnectThumbObserver();
  resetThumbQueue();
  thumbGrid.innerHTML = "";

  state.pages.forEach((page, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "thumb-card";
    card.dataset.pageId = String(page.id);
    card.draggable = true;
    if (state.selected.has(index)) card.classList.add("selected");
    if (page.deleted) card.classList.add("deleted");

    const preview = document.createElement("div");
    preview.className = "thumb-preview";

    if (page.canvas) {
      page.canvas.style.transform = `rotate(${page.rotation}deg)`;
      preview.appendChild(page.canvas);
    } else {
      preview.appendChild(createPlaceholder());
    }

    const meta = document.createElement("div");
    meta.className = "thumb-meta";
    meta.innerHTML = buildMetaHtml(page, index);

    card.append(preview, meta);

    card.addEventListener("click", (e) => {
      const previousSelection = new Set(state.selected);

      // 如果工具激活，点击变为“聚焦编辑”
      if (state.activeTool) {
        state.selected = new Set([index]);
        state.lastSelectedIndex = index;
        openVisualEditorForPage(page);
        renderThumbs();
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (e.shiftKey && state.lastSelectedIndex !== null) {
        // Shift 多选区间
        const start = Math.min(state.lastSelectedIndex, index);
        const end = Math.max(state.lastSelectedIndex, index);

        if (!cmdOrCtrl) {
          state.selected.clear();
        }
        for (let i = start; i <= end; i++) {
          state.selected.add(i);
        }
      } else if (cmdOrCtrl) {
        // Ctrl/Cmd 切换单个
        if (state.selected.has(index)) {
          state.selected.delete(index);
          // 如果取消的是当前的锚点，则清除锚点
          if (state.lastSelectedIndex === index) state.lastSelectedIndex = null;
        } else {
          state.selected.add(index);
          state.lastSelectedIndex = index;
        }
      } else {
        // 普通点击单选
        state.selected = new Set([index]);
        state.lastSelectedIndex = index;
      }

      refreshSelectionCards(previousSelection);
      updateWorkspaceNavigation();
    });

    card.addEventListener("dblclick", openPreview);
    card.addEventListener("dragstart", () => {
      state.draggingIndex = index;
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      state.draggingIndex = null;
      card.classList.remove("dragging");
    });
    card.addEventListener("dragover", (event) => {
      if (isFileDragEvent(event) || state.draggingIndex === null) return;
      event.preventDefault();
      card.classList.add("drop-target");
    });
    card.addEventListener("dragleave", () => {
      card.classList.remove("drop-target");
    });
    card.addEventListener("drop", (event) => {
      if (isFileDragEvent(event) || state.draggingIndex === null) return;
      event.preventDefault();
      card.classList.remove("drop-target");
      movePage(state.draggingIndex, index);
    });

    thumbGrid.appendChild(card);
  });

  updateMeta();
  setupThumbObserver();
  requestRenderAround(0, true);
}

function refreshSelectionCards(previousSelection = new Set()) {
  const affected = new Set([...previousSelection, ...state.selected]);
  affected.forEach((index) => {
    const page = state.pages[index];
    if (page) {
      updateThumbCard(page);
    }
  });
  updateMeta();
}

function updateSplitFieldState() {
  const enabled = controls.exportMode.value === "splitEvery";
  controls.splitEvery.disabled = !enabled;
}

function renumberSelection(nextSelectedSourceIndices) {
  state.selected = new Set();
  state.pages.forEach((page, index) => {
    if (nextSelectedSourceIndices.has(page.__selectionKey)) {
      state.selected.add(index);
    }
    delete page.__selectionKey;
  });
}

function tagSelectionKeys() {
  const keys = new Set();
  selectedIndices().forEach((index) => {
    const key = `${state.pages[index].fileIndex}:${state.pages[index].sourceIndex}:${index}:${Date.now()}`;
    state.pages[index].__selectionKey = key;
    keys.add(key);
  });
  return keys;
}

function moveSelection(direction) {
  const indexes = selectedIndices();
  if (indexes.length === 0) {
    setEditorResult("请先选中要移动的页面。", true);
    return;
  }

  const selectionKeys = tagSelectionKeys();

  if (direction === "up") {
    for (const index of indexes) {
      if (index === 0 || state.selected.has(index - 1)) continue;
      [state.pages[index - 1], state.pages[index]] = [state.pages[index], state.pages[index - 1]];
    }
  } else {
    for (const index of [...indexes].reverse()) {
      if (index === state.pages.length - 1 || state.selected.has(index + 1)) continue;
      [state.pages[index + 1], state.pages[index]] = [state.pages[index], state.pages[index + 1]];
    }
  }

  renumberSelection(selectionKeys);
  renderThumbs();
}

function forSelectedPages(action) {
  const indexes = selectedIndices();
  if (indexes.length === 0) {
    setEditorResult("请先选中页面。", true);
    return;
  }

  indexes.forEach((index) => action(state.pages[index]));
  renderThumbs();
}

async function renderPage(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const sourceViewport = page.getViewport({ scale: 1 });
  // 提升基础渲染倍率至 1.5，解决放大模糊问题
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({
    canvasContext: context,
    viewport
  }).promise;

  return {
    canvas,
    width: sourceViewport.width,
    height: sourceViewport.height
  };
}

function renderBlankPage(page) {
  const baseWidth = Math.max(120, Math.round((page.width || 595) * 0.34));
  const baseHeight = Math.max(160, Math.round((page.height || 842) * 0.34));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = baseWidth;
  canvas.height = baseHeight;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, baseWidth, baseHeight);
  context.strokeStyle = "#cbd5e1";
  context.lineWidth = 2;
  context.strokeRect(1, 1, baseWidth - 2, baseHeight - 2);
  context.fillStyle = "#64748b";
  context.font = "600 14px sans-serif";
  context.textAlign = "center";
  context.fillText("空白页", baseWidth / 2, baseHeight / 2 - 6);
  context.font = "12px sans-serif";
  context.fillText(
    `${Math.round(page.width || 595)} × ${Math.round(page.height || 842)} pt`,
    baseWidth / 2,
    baseHeight / 2 + 18
  );

  return canvas;
}

function yieldToBrowser() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function getInsertionTemplatePage() {
  const selectedIndex = selectedIndices().at(-1);
  if (selectedIndex !== undefined) {
    return state.pages[selectedIndex];
  }

  return state.pages.find((page) => !page.deleted) || state.pages[0] || null;
}

function insertBlankPage() {
  pushHistory();
  if (state.pages.length === 0) {
    setEditorResult("请先上传至少一个 PDF 后再插入空白页。", true);
    return;
  }

  const template = getInsertionTemplatePage();
  const insertAfterIndex = selectedIndices().at(-1) ?? state.pages.length - 1;
  const blankPage = {
    id: state.nextPageId,
    fileIndex: -1,
    fileName: "空白页",
    sourceIndex: -1,
    width: template?.width || 595,
    height: template?.height || 842,
    isBlank: true,
    rotation: 0,
    deleted: false,
    canvas: null,
    rendered: false,
    pdf: null
  };

  state.nextPageId += 1;
  state.pages.splice(insertAfterIndex + 1, 0, blankPage);
  state.selected = new Set([insertAfterIndex + 1]);
  renderThumbs();
  setEditorResult("已插入一页空白页，可继续拖动排序或直接导出。");
}

async function loadEditor(files) {
  setEditorResult("正在读取 PDF，编辑台会先打开，缩略图将按可视区域懒加载...");
  state.renderToken = Date.now();
  state.workspaceSource = null;
  state.metadataDirty = false;
  state.bookmarks = [];
  disconnectThumbObserver();
  resetThumbQueue();
  const nextPages = [];
  const nextFiles = [];
  let loadedMetadata = null;
  let loadedBookmarks = [];

  for (const [fileIndex, file] of files.entries()) {
    let buffer = await file.arrayBuffer();

    // 如果是图片，先转换为 PDF
    if (file.type.startsWith("image/")) {
      try {
        const { PDFDocument } = window.PDFLib;
        const pdfDoc = await PDFDocument.create();
        const image = file.type === "image/png"
          ? await pdfDoc.embedPng(buffer)
          : await pdfDoc.embedJpg(buffer);
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        buffer = await pdfDoc.save();
      } catch (err) {
        console.error("图片转换失败", err);
        throw new Error(`无法处理图片文件 ${file.name}，请确保它是有效的 PNG 或 JPG。`);
      }
    }

    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    nextFiles.push({ file, name: file.name, pdf });
    if (fileIndex === 0) {
      [loadedMetadata, loadedBookmarks] = await Promise.all([
        readPdfMetadata(pdf),
        readPdfBookmarks(pdf)
      ]);
    }

    for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
      nextPages.push({
        id: state.nextPageId,
        fileIndex,
        fileName: file.name,
        sourceIndex: pageIndex,
        width: 595,
        height: 842,
        isBlank: false,
        rotation: 0,
        deleted: false,
        canvas: null,
        rendered: false,
        pdf
      });
      state.nextPageId += 1;
    }
  }

  state.workspaceSource = files.length === 1 ? normalizeWorkspaceSource(files[0]?.workspaceSource) : null;
  state.files = nextFiles;
  state.pages = nextPages;
  state.selected.clear();
  if (controls.saveName) {
    controls.saveName.value = state.workspaceSource?.originalName || "";
  }
  if (controls.saveFolderName) {
    controls.saveFolderName.value = state.workspaceSource?.folderName || "";
  }
  setMetadataFields(loadedMetadata || {}, { markDirty: false });
  setBookmarks(loadedBookmarks, { autoEnable: true });
  controls.metadataEnabled.checked = false;
  controls.metadataClearExisting.checked = false;

  editorEmpty.classList.add("hidden");
  editorShell.classList.remove("hidden");
  renderThumbs();
  if (loadedMetadata) {
    const summary = [
      loadedMetadata.title ? `标题：${loadedMetadata.title}` : "",
      loadedMetadata.author ? `作者：${loadedMetadata.author}` : "",
      loadedMetadata.subject ? `主题：${loadedMetadata.subject}` : "",
      loadedMetadata.keywords ? `关键词：${normalizeMetadataFieldValue(loadedMetadata.keywords)}` : ""
    ].filter(Boolean);
    if (summary.length > 0) {
      setEditorResult(`已读取首个 PDF 元数据，可直接修改后导出。${summary.join(" / ")}`);
      return;
    }
  }
  if (loadedBookmarks.length > 0) {
    setEditorResult(`已读取首个 PDF 的 ${loadedBookmarks.length} 条一级书签，可直接调整标题和页码后导出。`);
  }
}

function buildRecipe() {
  const keptPageCount = Math.max(1, visiblePages());
  const recipe = {
    pages: state.pages.map((page) => ({
      kind: page.isBlank ? "blank" : "source",
      fileIndex: page.fileIndex,
      sourceIndex: page.sourceIndex,
      width: page.width,
      height: page.height,
      rotation: page.rotation,
      deleted: page.deleted
    })),
    resize: {
      enabled: true,
      pageSize: controls.resizePageSize.value,
      orientation: controls.resizeOrientation.value,
      margin: Number(controls.resizeMargin.value || 0),
      backgroundColor: controls.resizeBackgroundColor.value,
      fitMode: controls.resizeFitMode.value
    },
    watermark: {
      enabled: controls.watermarkEnabled.checked,
      kind: controls.watermarkKind.value,
      text: controls.watermarkText.value,
      imageDataUrl: state.watermarkImageDataUrl,
      imageName: state.watermarkImageName,
      position: controls.watermarkPosition.value,
      color: controls.watermarkColor.value,
      opacity: Number(controls.watermarkOpacity.value || 0.18),
      fontSize: Number(controls.watermarkFontSize.value || 36),
      imageScale: Number(controls.watermarkImageScale.value || 24),
      rotate: Number(controls.watermarkRotate.value || -30)
    },
    stamp: {
      enabled: controls.stampEnabled.checked,
      imageDataUrl: state.stampImageDataUrl,
      imageName: state.stampImageName,
      position: controls.stampPosition.value,
      opacity: Number(controls.stampOpacity.value || 0.92),
      scale: Number(controls.stampScale.value || 18),
      margin: Number(controls.stampMargin.value || 24),
      rotate: Number(controls.stampRotate.value || -8)
    },
    pageNumbers: {
      enabled: controls.pageNumbersEnabled.checked,
      align: controls.pageNumbersAlign.value,
      vertical: controls.pageNumbersVertical.value,
      fontSize: Number(controls.pageNumbersFontSize.value || 12),
      margin: controls.pageNumbersMargin.value || 24
    },
    bates: {
      enabled: controls.batesEnabled.checked,
      prefix: controls.batesPrefix.value,
      start: Number(controls.batesStart.value || 1),
      digits: Number(controls.batesDigits.value || 6),
      align: controls.batesAlign.value,
      vertical: controls.batesVertical.value,
      fontSize: Number(controls.batesFontSize.value || 12),
      margin: controls.batesMargin.value || 24
    },
    compression: {
      enabled: isChecked(controls.compressionEnabled),
      level: controlValue(controls.compressionLevel, "medium")
    },
    grayscale: {
      enabled: isChecked(controls.grayscaleEnabled)
    },
    invertColors: {
      enabled: isChecked(controls.invertEnabled)
    },
    scanEffect: {
      enabled: isChecked(controls.scanEffectEnabled),
      level: controlValue(controls.scanEffectLevel, "medium")
    },
    ocr: {
      enabled: isChecked(controls.ocrEnabled),
      language: controlValue(controls.ocrLanguage, "chi_sim+eng")
    },
    pdfa: {
      enabled: isChecked(controls.pdfaEnabled),
      level: controlValue(controls.pdfaLevel, "2b")
    },
    security: {
      enabled:
        isChecked(controls.securityEnabled) &&
        String(controlValue(controls.securityPassword) || "").trim().length > 0,
      action: "encrypt",
      password: controlValue(controls.securityPassword)
    },
    metadata: {
      enabled:
        isChecked(controls.metadataEnabled) ||
        isChecked(controls.metadataClearExisting) ||
        state.metadataDirty,
      clearExisting: isChecked(controls.metadataClearExisting),
      title: controlValue(controls.metadataTitle),
      author: controlValue(controls.metadataAuthor),
      subject: controlValue(controls.metadataSubject),
      keywords: controlValue(controls.metadataKeywords)
    },
    bookmarks: {
      enabled: isChecked(controls.bookmarksEnabled),
      items: state.bookmarks
        .map((item, index) => ({
          title: String(item.title || "").trim(),
          pageNumber: Math.min(
            keptPageCount,
            Math.max(1, Number(item.pageNumber || index + 1))
          )
        }))
        .filter((item) => item.title)
    },
    headerFooter: {
      enabled:
        isChecked(controls.headerFooterEnabled) ||
        String(controlValue(controls.headerText) || "").trim().length > 0 ||
        String(controlValue(controls.footerText) || "").trim().length > 0,
      headerText: controlValue(controls.headerText),
      footerText: controlValue(controls.footerText),
      align: controlValue(controls.headerFooterAlign, "center"),
      color: controlValue(controls.headerFooterColor, "slate"),
      fontSize: Number(controlValue(controls.headerFooterFontSize, 10) || 10),
      margin: Number(controlValue(controls.headerFooterMargin, 24) || 24),
      opacity: Number(controlValue(controls.headerFooterOpacity, 0.85) || 0.85)
    },
    toImages: {
      enabled: isChecked(controls.toImagesEnabled),
      options: isChecked(controls.toImagesEnabled) ? {
        format: controlValue(controls.toImagesFormat, 'jpg'),
        dpi: Number(controlValue(controls.toImagesDpi, 200)),
        quality: Number(controlValue(controls.toImagesQuality, 85))
      } : {}
    },
    _debug_toImagesEnabled: isChecked(controls.toImagesEnabled), // 调试用
    visualMetadata: state.pages.map(p => ({
      crop: p.crop || null,
      annotations: p.annotations || []
    }))
  };

  if (controlValue(controls.exportMode, "single") === "splitEvery") {
    recipe.split = {
      enabled: true,
      mode: "every",
      every: Number(controlValue(controls.splitEvery, 1) || 1)
    };
  }

  return recipe;
}

function buildEditorFormData() {
  const formData = new FormData();
  state.files.forEach(({ file }) => formData.append("files", file));
  const recipe = buildRecipe();
  console.log('[DEBUG] Building form data with recipe:', JSON.stringify(recipe, null, 2));
  console.log('[DEBUG] toImages in buildRecipe:', recipe.toImages);
  formData.append("recipe", JSON.stringify(recipe));
  return formData;
}

function suggestedSaveName() {
  const trimmed = String(controls.saveName?.value || "").trim();
  if (trimmed) return trimmed;
  if (state.files.length === 1) {
    return state.files[0].name;
  }
  return controlValue(controls.exportMode, "single") === "splitEvery" ? "workspace_split_result.zip" : "workspace_result.pdf";
}

async function exportEditedPdf() {
  if (state.files.length === 0) {
    setEditorResult("请先上传至少一个 PDF。", true);
    return;
  }

  if (!visiblePages()) {
    setEditorResult("至少保留一页才能导出。", true);
    return;
  }

  if (isChecked(controls.securityEnabled) && !String(controlValue(controls.securityPassword) || "").trim()) {
    setEditorResult("开启加密后，请填写打开密码。", true);
    return;
  }

  if (isChecked(controls.pdfaEnabled) && isChecked(controls.securityEnabled)) {
    setEditorResult("PDF/A 与加密不能同时启用。", true);
    return;
  }

  if (isChecked(controls.bookmarksEnabled) && controlValue(controls.exportMode, "single") === "splitEvery") {
    setEditorResult("书签编辑暂不支持拆分导出，请先切回单文件导出。", true);
    return;
  }

  if (controlValue(controls.exportMode, "single") === "splitEvery" && Number(controlValue(controls.splitEvery, 0) || 0) < 1) {
    setEditorResult("拆分页数必须大于等于 1。", true);
    return;
  }

  if (
    isChecked(controls.watermarkEnabled) &&
    controlValue(controls.watermarkKind) === "image" &&
    !state.watermarkImageDataUrl
  ) {
    setEditorResult("图片水印模式下，请先选择一张 PNG 或 JPG 图片。", true);
    return;
  }

  if (isChecked(controls.stampEnabled) && !state.stampImageDataUrl) {
    setEditorResult("启用图片印章后，请先选择一张 PNG 或 JPG 图片。", true);
    return;
  }

  setEditorResult("正在导出编辑结果...");
  const formData = buildEditorFormData();
  formData.append("saveName", suggestedSaveName());

  try {
    const response = await fetch("/api/visual-workbench", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "导出失败");
    }

    const blob = await response.blob();
    const filename = getFilenameFromDisposition(
      response.headers.get("Content-Disposition")
    );
    triggerBlobDownload(blob, filename);
    setEditorResult(`导出完成，已开始下载：${filename}`);
    document.dispatchEvent(new CustomEvent("editor:exported"));
  } catch (error) {
    setEditorResult(error.message || "导出失败", true);
  }
}

async function saveEditedPdfOnline() {
  if (!state.currentUser) {
    setEditorResult("请先登录会员账号后再在线保存。", true);
    return null;
  }

  if (state.files.length === 0) {
    setEditorResult("请先上传至少一个 PDF。", true);
    return null;
  }

  if (!visiblePages()) {
    setEditorResult("至少保留一页才能保存。", true);
    return null;
  }

  if (isChecked(controls.securityEnabled) && !String(controlValue(controls.securityPassword) || "").trim()) {
    setEditorResult("开启加密后，请填写打开密码。", true);
    return null;
  }

  if (isChecked(controls.pdfaEnabled) && isChecked(controls.securityEnabled)) {
    setEditorResult("PDF/A 与加密不能同时启用。", true);
    return null;
  }

  if (isChecked(controls.bookmarksEnabled) && controlValue(controls.exportMode, "single") === "splitEvery") {
    setEditorResult("书签编辑暂不支持拆分导出，请先切回单文件导出。", true);
    return null;
  }

  if (controlValue(controls.exportMode, "single") === "splitEvery" && Number(controlValue(controls.splitEvery, 0) || 0) < 1) {
    setEditorResult("拆分页数必须大于等于 1。", true);
    return null;
  }

  if (
    isChecked(controls.watermarkEnabled) &&
    controlValue(controls.watermarkKind) === "image" &&
    !state.watermarkImageDataUrl
  ) {
    setEditorResult("图片水印模式下，请先选择一张 PNG 或 JPG 图片。", true);
    return null;
  }

  if (isChecked(controls.stampEnabled) && !state.stampImageDataUrl) {
    setEditorResult("启用图片印章后，请先选择一张 PNG 或 JPG 图片。", true);
    return null;
  }

  setEditorResult("正在把编辑结果保存到你的会员空间...");
  const formData = buildEditorFormData();
  formData.append("saveName", suggestedSaveName());
  formData.append("folderName", String(controls.saveFolderName?.value || "").trim());
  const overwriteTarget = getOverwriteTarget();
  if (overwriteTarget) {
    formData.append("overwriteFileId", String(overwriteTarget.id));
  }

  try {
    const response = await fetch("/api/workspace/visual-save", {
      method: "POST",
      body: formData
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "在线保存失败");
    }

    const name = data.file?.originalName || suggestedSaveName();
    const newWorkspaceSource = overwriteTarget
      ? normalizeWorkspaceSource({
        id: data.file?.id || overwriteTarget.id,
        originalName: data.file?.originalName || name,
        folderName: data.file?.folderName || String(controls.saveFolderName?.value || "").trim(),
        kind: data.file?.kind || "pdf"
      })
      : null;

    setEditorResult(`已保存并重新加载：${name}`);

    if (newWorkspaceSource) {
      state.workspaceSource = newWorkspaceSource;
      const contentUrl = `/api/workspace/files/${newWorkspaceSource.id}/content`;
      const fileResponse = await fetch(contentUrl, { credentials: "same-origin" });
      if (fileResponse.ok) {
        const buffer = await fileResponse.arrayBuffer();
        const file = new File([buffer], newWorkspaceSource.originalName, { type: "application/pdf" });
        file.workspaceSource = newWorkspaceSource;
        closePreview();
        await loadEditor([file]);
      }
    }

    document.dispatchEvent(new CustomEvent("workspace:file-saved", { detail: data.file || null }));
    return data.file || null;
  } catch (error) {
    setEditorResult(error.message || "在线保存失败", true);
    return null;
  }
}

editorFileInput.addEventListener("change", async (event) => {
  const input = event.target;
  const files = Array.from(input?.files || []);
  if (input instanceof HTMLInputElement) {
    input.value = "";
  }
  if (files.length === 0) return;

  try {
    await loadEditor(files);
  } catch (error) {
    setEditorResult(error.message || "PDF 加载失败", true);
  }
});

editorEmpty?.addEventListener("click", () => {
  if (editorEmpty.classList.contains("hidden")) return;
  openEditorFilePicker();
});

editorEmpty?.addEventListener("keydown", (event) => {
  if (editorEmpty.classList.contains("hidden")) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openEditorFilePicker();
});

editorDropZone?.addEventListener("dragenter", (event) => {
  if (!isFileDragEvent(event)) return;
  event.preventDefault();
  state.editorDragDepth += 1;
  setEditorDropActive(true);
});

editorDropZone?.addEventListener("dragover", (event) => {
  if (!isFileDragEvent(event)) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
  setEditorDropActive(true);
});

editorDropZone?.addEventListener("dragleave", (event) => {
  if (!isFileDragEvent(event)) return;
  event.preventDefault();
  state.editorDragDepth = Math.max(0, state.editorDragDepth - 1);
  if (state.editorDragDepth === 0) {
    setEditorDropActive(false);
  }
});

editorDropZone?.addEventListener("drop", async (event) => {
  if (!isFileDragEvent(event)) return;
  event.preventDefault();
  const droppedFiles = event.dataTransfer?.files;
  resetEditorDropState();
  await importDroppedPdfFiles(droppedFiles);
});

window.addEventListener("dragend", resetEditorDropState);
window.addEventListener("blur", resetEditorDropState);

controls.selectAllBtn.addEventListener("click", () => {
  const previousSelection = new Set(state.selected);
  state.selected = new Set(state.pages.map((_, index) => index));
  refreshSelectionCards(previousSelection);
});
controls.clearSelectionBtn.addEventListener("click", () => {
  const previousSelection = new Set(state.selected);
  state.selected.clear();
  state.lastSelectedIndex = null;
  refreshSelectionCards(previousSelection);
});

controls.invertSelectionBtn?.addEventListener("click", () => {
  const previousSelection = new Set(state.selected);
  const nextSelection = new Set();
  state.pages.forEach((_, index) => {
    if (!state.selected.has(index)) {
      nextSelection.add(index);
    }
  });
  state.selected = nextSelection;
  refreshSelectionCards(previousSelection);
});

document.getElementById("globalUndoBtn")?.addEventListener("click", () => {
  if (state.previewPage) {
    undoPreviewEdit();
  } else {
    globalUndo();
  }
});

document.getElementById("globalRedoBtn")?.addEventListener("click", () => {
  if (state.previewPage) {
    // Redo not implemented for visual editor, but could be added later
  } else {
    globalRedo();
  }
});
// 已移除重复的旧绑逻辑
controls.insertBlankBtn?.addEventListener("click", insertBlankPage);
previewCloseBtn.addEventListener("click", closePreview);
previewModal.addEventListener("click", (event) => {
  if (event.target === previewModal || event.target === previewBody) closePreview();
});

// Immersive Preview Events
document.getElementById("previewZoomIn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!immersivePreviewState.imgRef) return;
  immersivePreviewState.scale = Math.min(5, immersivePreviewState.scale * 1.25);
  updateImmersiveTransform();
});
document.getElementById("previewZoomOut")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!immersivePreviewState.imgRef) return;
  immersivePreviewState.scale = Math.max(0.1, immersivePreviewState.scale / 1.25);
  updateImmersiveTransform();
});
document.getElementById("previewZoomFit")?.addEventListener("click", (e) => {
  e.stopPropagation();
  resetImmersiveZoom(false);
});

document.getElementById("previewPrev")?.addEventListener("click", (e) => {
  e.stopPropagation();
  navigatePreview(-1);
});

document.getElementById("previewNext")?.addEventListener("click", (e) => {
  e.stopPropagation();
  navigatePreview(1);
});

document.getElementById("previewRotateLeft")?.addEventListener("click", (e) => {
  e.stopPropagation();
  rotatePreviewPage(-90);
});
document.getElementById("previewRotateRight")?.addEventListener("click", (e) => {
  e.stopPropagation();
  rotatePreviewPage(90);
});
document.getElementById("previewDeletePage")?.addEventListener("click", (e) => {
  e.stopPropagation();
  deletePreviewPage();
});

previewBody.addEventListener("mousedown", (e) => {
  if (!immersivePreviewState.imgRef || e.button !== 0 || e.target !== immersivePreviewState.imgRef) return;
  e.preventDefault();
  immersivePreviewState.isDragging = true;
  immersivePreviewState.startX = e.clientX - immersivePreviewState.translateX;
  immersivePreviewState.startY = e.clientY - immersivePreviewState.translateY;
});
window.addEventListener("mousemove", (e) => {
  if (!immersivePreviewState.isDragging || !immersivePreviewState.imgRef) return;
  immersivePreviewState.translateX = e.clientX - immersivePreviewState.startX;
  immersivePreviewState.translateY = e.clientY - immersivePreviewState.startY;
  updateImmersiveTransform();
});
window.addEventListener("mouseup", () => {
  immersivePreviewState.isDragging = false;
});
previewBody.addEventListener("wheel", (e) => {
  if (!immersivePreviewState.imgRef || previewModal.classList.contains("hidden")) return;
  e.preventDefault();

  if (e.ctrlKey || e.metaKey) {
    // Zoom
    const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
    const oldScale = immersivePreviewState.scale;
    let newScale = Math.max(0.1, Math.min(8, oldScale * zoomFactor));

    // Zoom towards mouse pointer
    const rect = previewBody.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;

    immersivePreviewState.translateX = mouseX - (mouseX - immersivePreviewState.translateX) * (newScale / oldScale);
    immersivePreviewState.translateY = mouseY - (mouseY - immersivePreviewState.translateY) * (newScale / oldScale);
    immersivePreviewState.scale = newScale;

  } else {
    // Pan
    immersivePreviewState.translateX -= e.deltaX;
    immersivePreviewState.translateY -= e.deltaY;
  }
  updateImmersiveTransform();
}, { passive: false });

controls.rotateLeftBtn.addEventListener("click", () => {
  pushHistory();
  forSelectedPages((page) => {
    page.rotation = (page.rotation + 270) % 360;
  });
});
controls.rotateRightBtn.addEventListener("click", () => {
  pushHistory();
  forSelectedPages((page) => {
    page.rotation = (page.rotation + 90) % 360;
  });
});
controls.deleteBtn.addEventListener("click", () => {
  pushHistory();
  forSelectedPages((page) => {
    page.deleted = true;
  });
});

controls.moveUpBtn.addEventListener("click", () => moveSelection("up"));
controls.moveDownBtn.addEventListener("click", () => moveSelection("down"));
controls.reverseBtn?.addEventListener("click", () => {
  pushHistory();
  const selectionKeys = tagSelectionKeys();
  state.pages.reverse();
  renumberSelection(selectionKeys);
  renderThumbs();
});
// 旧逻辑工具按钮清理

controls.toolUndo?.addEventListener("click", () => {
  if (state.previewPage) {
    undoPreviewEdit();
    redrawPreviewOverlay();
  }
});

controls.toolClear?.addEventListener("click", () => {
  if (state.previewPage) {
    ensurePreviewPageState(state.previewPage);
    if (!state.previewPage.annotations.length && !state.previewPage.crop) {
      setEditorResult("当前页面没有可清除的编辑。");
      return;
    }
    pushVisualHistory(state.previewPage, {
      type: "clear-all",
      previousAnnotations: state.previewPage.annotations.map(cloneAnnotationLine),
      previousCrop: cloneCrop(state.previewPage.crop)
    });
    state.previewPage.annotations = [];
    state.previewPage.crop = null;
    redrawPreviewOverlay();
    updateUndoAvailability();
    setEditorResult("已清除当前页面的编辑内容。");
  }
});

document.addEventListener("keydown", (event) => {
  if (previewModal.classList.contains("hidden")) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closePreview();
    return;
  }

  if (event.key === "ArrowRight") {
    navigatePreview(1);
  } else if (event.key === "ArrowLeft") {
    navigatePreview(-1);
  }

  const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z";
  if (isUndo) {
    event.preventDefault();
    undoPreviewEdit();
  }
});

document.querySelectorAll(".dropdown").forEach((dropdown) => {
  dropdown.addEventListener("click", (event) => {
    event.stopPropagation();
  });
});

// 工具栏切换按钮
document.querySelectorAll('.toolbar-btn-toggle').forEach(btn => {
  const toggleId = btn.dataset.toggle;
  const enabledControl = {
    grayscale: 'grayscaleEnabled',
    invert: 'invertEnabled',
    scan: 'scanEffectEnabled',
    ocr: 'ocrEnabled',
    pdfa: 'pdfaEnabled',
    security: 'securityEnabled',
    metadata: 'metadataEnabled',
    bookmarks: 'bookmarksEnabled',
    headerfooter: 'headerFooterEnabled'
  }[toggleId];

  btn.addEventListener('click', () => {
    if (enabledControl && controls[enabledControl]) {
      controls[enabledControl].checked = !controls[enabledControl].checked;
      btn.classList.toggle('active', controls[enabledControl].checked);
    }
  });

  if (enabledControl && controls[enabledControl]) {
    controls[enabledControl].addEventListener('change', () => {
      btn.classList.toggle('active', controls[enabledControl].checked);
    });
  }
});

// 统一的主工作区控件绑定
controls.drawBtn?.addEventListener("click", () => {
  setActivePreviewTool("pencil");
});
controls.cropBtn?.addEventListener("click", () => {
  setActivePreviewTool("crop");
});
controls.previewBtn?.addEventListener("click", openPreview);
controls.printBtn?.addEventListener("click", printDocument);
controls.applySplitBtn?.addEventListener("click", applySplit);

controls.exportMode.addEventListener("change", updateSplitFieldState);

// 导出为图片选项显示/隐藏
controls.toImagesEnabled?.addEventListener("change", () => {
  const enabled = controls.toImagesEnabled?.checked || false;
  if (enabled) {
    controls.toImagesOptions?.classList.remove("hidden");
  } else {
    controls.toImagesOptions?.classList.add("hidden");
  }
});

// 图片格式改变时，PNG不需要质量选项
controls.toImagesFormat?.addEventListener("change", () => {
  const format = controls.toImagesFormat?.value || 'jpg';
  if (format === 'png') {
    controls.toImagesQualityField?.classList.add("hidden");
  } else {
    controls.toImagesQualityField?.classList.remove("hidden");
  }
});

controls.exportBtn.addEventListener("click", exportEditedPdf);
controls.exportBtn2?.addEventListener("click", exportEditedPdf);
controls.saveOnlineBtn?.addEventListener("click", saveEditedPdfOnline);
controls.saveOnlineBtn2?.addEventListener("click", saveEditedPdfOnline);

controls.workspaceZoomSelect?.addEventListener("change", (e) => {
  state.workspaceZoom = e.target.value;
  applyWorkspaceZoom();
});

window.addEventListener("resize", () => {
  if (state.workspaceZoom === "fit-all" || state.workspaceZoom === "fit-width") {
    applyWorkspaceZoom();
  }
});

controls.watermarkImageInput?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0] || null;
  if (!file) {
    state.watermarkImageDataUrl = "";
    state.watermarkImageName = "";
    updateWatermarkImageLabel();
    return;
  }

  try {
    state.watermarkImageDataUrl = await readFileAsDataUrl(file);
    state.watermarkImageName = file.name;
    updateWatermarkImageLabel();
  } catch (error) {
    state.watermarkImageDataUrl = "";
    state.watermarkImageName = "";
    updateWatermarkImageLabel();
    setEditorResult(error.message || "读取图片水印失败。", true);
  }
});
controls.stampImageInput?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0] || null;
  if (!file) {
    state.stampImageDataUrl = "";
    state.stampImageName = "";
    updateStampImageLabel();
    return;
  }

  try {
    state.stampImageDataUrl = await readFileAsDataUrl(file);
    state.stampImageName = file.name;
    updateStampImageLabel();
  } catch (error) {
    state.stampImageDataUrl = "";
    state.stampImageName = "";
    updateStampImageLabel();
    setEditorResult(error.message || "读取图片印章失败。", true);
  }
});
controls.metadataEnabled?.addEventListener("change", markMetadataDirty);
controls.metadataClearExisting?.addEventListener("change", markMetadataDirty);
controls.metadataTitle?.addEventListener("input", markMetadataDirty);
controls.metadataAuthor?.addEventListener("input", markMetadataDirty);
controls.metadataSubject?.addEventListener("input", markMetadataDirty);
controls.metadataKeywords?.addEventListener("input", markMetadataDirty);
controls.bookmarkAddBtn?.addEventListener("click", () => addBookmark());
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
    markBookmarksDirty();
    return;
  }
  if (field === "pageNumber") {
    state.bookmarks[index].pageNumber = Math.max(1, Number(target.value || 1));
    markBookmarksDirty();
  }
});
controls.bookmarksList?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.bookmarkAction;
  if (action !== "remove") return;
  const row = target.closest(".bookmark-row");
  if (!row) return;
  const index = Number(row.dataset.index);
  if (!Number.isInteger(index)) return;
  removeBookmark(index);
});

updateSplitFieldState();
updateWatermarkImageLabel();
updateStampImageLabel();
renderBookmarksList();
loadEditorCapabilities();
updateUndoRedoUI();

window.Z7PdfEditor = {
  loadFiles: loadEditor,
  setCurrentUser,
  saveOnline: saveEditedPdfOnline,
  setMessage: setEditorResult
};

console.log("[Editor] Z7PdfEditor initialized:", !!window.Z7PdfEditor, typeof window.Z7PdfEditor?.loadFiles);

window.addEventListener("keydown", (e) => {
  // Global Keyboard Shortcuts
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

  // Only capture shorthand if not typing in an input
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;

  if (cmdOrCtrl) {
    const key = e.key.toLowerCase();
    if (key === 'a') {
      e.preventDefault();
      controls.selectAllBtn.click();
    } else if (key === 'd') {
      e.preventDefault();
      controls.clearSelectionBtn.click();
    } else if (key === 'i') {
      e.preventDefault();
      controls.invertSelectionBtn?.click();
    } else if (key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        // Redo (Cmd+Shift+Z)
        document.getElementById("globalRedoBtn")?.click();
      } else {
        // Undo (Cmd+Z)
        document.getElementById("globalUndoBtn")?.click();
      }
    } else if (key === 'y') {
      // Redo (Cmd+Y)
      e.preventDefault();
      document.getElementById("globalRedoBtn")?.click();
    }
  }
});
