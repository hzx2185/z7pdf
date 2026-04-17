import { getFilenameFromDisposition, triggerBlobDownload } from "./common.js?v=0414b";
import { normalizeManagedMetadataFieldValue } from "./editor-metadata-runtime.js?v=0414b";

function isManagedControlChecked(control) {
  return Boolean(control?.checked);
}

function getManagedControlValue(control, fallback = "") {
  return control ? control.value : fallback;
}

function normalizeManagedPageRotation(rotation) {
  return ((Number(rotation || 0) % 360) + 360) % 360;
}

function resetManagedControlChecked(control) {
  if (!control || !("checked" in control)) return;
  control.checked = false;
  control.dispatchEvent?.(new Event("change", { bubbles: true }));
}

function resetManagedControlValue(control, value) {
  if (!control || !("value" in control)) return;
  control.value = value;
  control.dispatchEvent?.(new Event("change", { bubbles: true }));
}

function resetManagedEditorExportControls(controls) {
  [
    controls.resizeEnabled,
    controls.watermarkEnabled,
    controls.stampEnabled,
    controls.pageNumbersEnabled,
    controls.batesEnabled,
    controls.compressionEnabled,
    controls.grayscaleEnabled,
    controls.invertEnabled,
    controls.scanEffectEnabled,
    controls.ocrEnabled,
    controls.pdfaEnabled,
    controls.securityEnabled,
    controls.metadataEnabled,
    controls.metadataClearExisting,
    controls.bookmarksEnabled,
    controls.headerFooterEnabled,
    controls.toImagesEnabled
  ].forEach(resetManagedControlChecked);

  resetManagedControlValue(controls.headerText, "");
  resetManagedControlValue(controls.footerText, "");
  resetManagedControlValue(controls.securityPassword, "");
}

function formatManagedPageMm(points) {
  return `${Math.round((Number(points || 0) * 25.4) / 72)}mm`;
}

function formatManagedPagePt(points) {
  return `${Math.round(Number(points || 0))}pt`;
}

async function describeManagedExportedPdf(blob, PDFLibApi = globalThis.PDFLib) {
  if (!blob || !PDFLibApi?.PDFDocument) return "";

  try {
    const buffer = await blob.arrayBuffer();
    const pdf = await PDFLibApi.PDFDocument.load(buffer);
    const pages = pdf.getPages();
    if (pages.length === 0) return "";

    const summaries = pages.map((page) => {
      const width = page.getWidth();
      const height = page.getHeight();
      return {
        width,
        height,
        key: `${Math.round(width)}x${Math.round(height)}`
      };
    });

    const groups = new Map();
    summaries.forEach((item) => {
      const current = groups.get(item.key) || { ...item, count: 0 };
      current.count += 1;
      groups.set(item.key, current);
    });

    const orderedGroups = Array.from(groups.values()).sort((left, right) => right.count - left.count);
    const primary = orderedGroups[0];
    const primaryLabel =
      `${formatManagedPageMm(primary.width)} × ${formatManagedPageMm(primary.height)}`
      + ` (${formatManagedPagePt(primary.width)} × ${formatManagedPagePt(primary.height)})`;

    if (orderedGroups.length === 1) {
      return `真实页面尺寸：${primaryLabel}`;
    }

    return `真实页面尺寸：主尺寸 ${primaryLabel}，共 ${orderedGroups.length} 种页面规格`;
  } catch (_error) {
    return "";
  }
}

export function setManagedOcrAvailability({
  controls,
  available
}) {
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

export async function loadManagedEditorCapabilities({
  fetchApi = globalThis.fetch,
  applyOcrAvailability
}) {
  try {
    const response = await fetchApi("/api/public-config");
    if (!response.ok) return;
    const config = await response.json().catch(() => null);
    applyOcrAvailability?.(config?.ocrAvailable !== false);
  } catch (_error) {
    applyOcrAvailability?.(false);
  }
}

export function setManagedCurrentUser({
  state,
  user
}) {
  state.currentUser = user || null;
}

export function normalizeManagedWorkspaceSource(source) {
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

export function getManagedOverwriteTarget({
  state,
  controls
}) {
  if (state.files.length !== 1) return null;
  if (getManagedControlValue(controls.exportMode, "single") !== "single") return null;
  if (!state.workspaceSource) return null;
  if (state.workspaceSource.kind !== "pdf") return null;
  return state.workspaceSource;
}

async function resolveManagedOutlinePageNumber(pdf, rawDest) {
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

export async function readManagedPdfBookmarks(pdf) {
  const outline = await pdf.getOutline().catch(() => []);
  const topLevelItems = Array.isArray(outline) ? outline : [];
  const bookmarks = [];

  for (const item of topLevelItems) {
    const title = String(item?.title || "").trim();
    const pageNumber = await resolveManagedOutlinePageNumber(pdf, item?.dest);
    if (!title || !pageNumber) continue;
    bookmarks.push({ title, pageNumber });
  }

  return bookmarks;
}

export async function readManagedPdfMetadata(pdf) {
  const metadata = await pdf.getMetadata().catch(() => null);
  const info = metadata?.info || {};
  return {
    title: info.Title || "",
    author: info.Author || "",
    subject: info.Subject || "",
    keywords: info.Keywords || ""
  };
}

async function buildManagedEditorImportPayload({
  files,
  pdfjsLib,
  state,
  windowApi = globalThis.window,
  consoleApi = globalThis.console,
  readPdfMetadata = readManagedPdfMetadata,
  readPdfBookmarks = readManagedPdfBookmarks,
  includeLeadDocumentDetails = false,
  fileIndexOffset = 0
}) {
  const nextPages = [];
  const nextFiles = [];
  let loadedMetadata = null;
  let loadedBookmarks = [];

  for (const [fileIndex, file] of files.entries()) {
    let buffer = await file.arrayBuffer();

    if (file.type.startsWith("image/")) {
      try {
        const { PDFDocument } = windowApi.PDFLib;
        const pdfDoc = await PDFDocument.create();
        const image = file.type === "image/png"
          ? await pdfDoc.embedPng(buffer)
          : await pdfDoc.embedJpg(buffer);
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        buffer = await pdfDoc.save();
      } catch (error) {
        consoleApi.error("图片转换失败", error);
        throw new Error(`无法处理图片文件 ${file.name}，请确保它是有效的 PNG 或 JPG。`);
      }
    }

    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    nextFiles.push({ file, name: file.name, pdf });

    if (includeLeadDocumentDetails && fileIndex === 0) {
      [loadedMetadata, loadedBookmarks] = await Promise.all([
        readPdfMetadata(pdf),
        readPdfBookmarks(pdf)
      ]);
    }

    for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
      const sourcePage = await pdf.getPage(pageIndex + 1);
      const sourceViewport = sourcePage.getViewport({ scale: 1 });
      nextPages.push({
        id: state.nextPageId,
        fileIndex: fileIndexOffset + fileIndex,
        fileName: file.name,
        sourceIndex: pageIndex,
        width: sourceViewport.width,
        height: sourceViewport.height,
        isBlank: false,
        sourceRotation: normalizeManagedPageRotation(sourcePage.rotate),
        rotation: 0,
        deleted: false,
        canvas: null,
        rendered: false,
        pdf
      });
      state.nextPageId += 1;
    }
  }

  return {
    nextFiles,
    nextPages,
    loadedMetadata,
    loadedBookmarks
  };
}

export async function loadManagedEditor({
  files,
  pdfjsLib,
  state,
  controls,
  setResult,
  clearSelectedVisualAnnotation,
  resetPreviewSearchState,
  resetWorkspaceSearchState,
  setWorkspaceSearchPanelVisible,
  disconnectThumbObserver,
  resetThumbQueue,
  setMetadataFields,
  setBookmarks,
  editorEmpty,
  editorShell,
  renderThumbs,
  syncAnnotationStyleBar,
  windowApi = globalThis.window,
  consoleApi = globalThis.console,
  normalizeWorkspaceSource = normalizeManagedWorkspaceSource,
  readPdfMetadata = readManagedPdfMetadata,
  readPdfBookmarks = readManagedPdfBookmarks
}) {
  setResult?.("正在读取 PDF，编辑台会先打开，缩略图将按可视区域懒加载...");
  state.renderToken = Date.now();
  state.workspaceSource = null;
  clearSelectedVisualAnnotation?.();
  state.metadataDirty = false;
  state.bookmarksDirty = false;
  state.bookmarks = [];
  state.historyStack = [];
  state.redoStack = [];
  resetPreviewSearchState?.({ clearInput: true });
  resetWorkspaceSearchState?.({ clearInput: true });
  setWorkspaceSearchPanelVisible?.(false);
  disconnectThumbObserver?.();
  resetThumbQueue?.();
  resetManagedEditorExportControls(controls);

  const {
    nextFiles,
    nextPages,
    loadedMetadata,
    loadedBookmarks
  } = await buildManagedEditorImportPayload({
    files,
    pdfjsLib,
    state,
    windowApi,
    consoleApi,
    readPdfMetadata,
    readPdfBookmarks,
    includeLeadDocumentDetails: true
  });

  state.workspaceSource =
    files.length === 1 ? normalizeWorkspaceSource(files[0]?.workspaceSource) : null;
  state.files = nextFiles;
  state.pages = nextPages;
  state.selected.clear();

  if (controls.saveName) {
    controls.saveName.value = state.workspaceSource?.originalName || "";
  }
  if (controls.saveFolderName) {
    controls.saveFolderName.value = state.workspaceSource?.folderName || "";
  }

  setMetadataFields?.(loadedMetadata || {}, { markDirty: false });
  setBookmarks?.(loadedBookmarks, { autoEnable: true });
  controls.metadataEnabled.checked = false;
  controls.metadataClearExisting.checked = false;

  editorEmpty?.classList.add("hidden");
  editorShell?.classList.remove("hidden");
  renderThumbs?.();
  syncAnnotationStyleBar?.();

  if (loadedMetadata) {
    const summary = [
      loadedMetadata.title ? `标题：${loadedMetadata.title}` : "",
      loadedMetadata.author ? `作者：${loadedMetadata.author}` : "",
      loadedMetadata.subject ? `主题：${loadedMetadata.subject}` : "",
      loadedMetadata.keywords
        ? `关键词：${normalizeManagedMetadataFieldValue(loadedMetadata.keywords)}`
        : ""
    ].filter(Boolean);

    if (summary.length > 0) {
      setResult?.(`已读取首个 PDF 元数据，可直接修改后导出。${summary.join(" / ")}`);
      return;
    }
  }

  if (loadedBookmarks.length > 0) {
    setResult?.(
      `已读取首个 PDF 的 ${loadedBookmarks.length} 条一级书签，可直接调整标题和页码后导出。`
    );
  }
}

export async function insertManagedEditorFiles({
  files,
  pdfjsLib,
  state,
  controls,
  setResult,
  pushHistory,
  renderThumbs,
  updateMeta,
  loadEditor,
  options = {},
  windowApi = globalThis.window,
  consoleApi = globalThis.console
}) {
  if (!Array.isArray(files) || files.length === 0) return false;

  if (state.pages.length === 0) {
    await loadEditor?.(files);
    return true;
  }

  setResult?.(`正在插入 ${files.length} 个文件...`);

  const selectedIndices = Array.from(state.selected.values()).sort((a, b) => a - b);
  const fallbackIndex = selectedIndices.at(-1) ?? state.pages.length - 1;
  const requestedReferenceIndex = Number(options.referenceIndex);
  const hasReferenceIndex =
    Number.isInteger(requestedReferenceIndex) &&
    requestedReferenceIndex >= 0 &&
    requestedReferenceIndex < state.pages.length;
  const insertBefore = options.position === "before";
  const anchorIndex = hasReferenceIndex ? requestedReferenceIndex : fallbackIndex;
  const insertAfterIndex = insertBefore ? anchorIndex - 1 : anchorIndex;
  const fileIndexOffset = state.files.length;
  const {
    nextFiles,
    nextPages
  } = await buildManagedEditorImportPayload({
    files,
    pdfjsLib,
    state,
    windowApi,
    consoleApi,
    fileIndexOffset
  });

  if (nextPages.length === 0) {
    setResult?.("未读取到可插入的页面。", true);
    return false;
  }

  pushHistory?.();
  state.workspaceSource = null;
  state.files = [...state.files, ...nextFiles];
  state.pages.splice(insertAfterIndex + 1, 0, ...nextPages);
  state.selected = new Set(
    nextPages.map((_, index) => insertAfterIndex + 1 + index)
  );
  state.lastSelectedIndex = insertAfterIndex + nextPages.length;

  if (controls.saveName && state.files.length > 1 && !String(controls.saveName.value || "").trim()) {
    controls.saveName.value = "已合并文档.pdf";
  }

  updateMeta?.();
  renderThumbs?.();
  options.afterInsert?.(nextPages[0] || null, nextPages);
  setResult?.(`已插入 ${files.length} 个文件，共 ${nextPages.length} 页。`);
  return true;
}

export function buildManagedEditorRecipe({
  state,
  controls,
  visiblePages
}) {
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
      enabled: isManagedControlChecked(controls.resizeEnabled),
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
      enabled: isManagedControlChecked(controls.compressionEnabled),
      level: getManagedControlValue(controls.compressionLevel, "medium")
    },
    grayscale: {
      enabled: isManagedControlChecked(controls.grayscaleEnabled)
    },
    invertColors: {
      enabled: isManagedControlChecked(controls.invertEnabled)
    },
    scanEffect: {
      enabled: isManagedControlChecked(controls.scanEffectEnabled),
      level: getManagedControlValue(controls.scanEffectLevel, "medium")
    },
    ocr: {
      enabled: isManagedControlChecked(controls.ocrEnabled),
      language: getManagedControlValue(controls.ocrLanguage, "chi_sim+eng")
    },
    pdfa: {
      enabled: isManagedControlChecked(controls.pdfaEnabled),
      level: getManagedControlValue(controls.pdfaLevel, "2b")
    },
    security: {
      enabled:
        isManagedControlChecked(controls.securityEnabled) &&
        String(getManagedControlValue(controls.securityPassword) || "").trim().length > 0,
      action: "encrypt",
      password: getManagedControlValue(controls.securityPassword)
    },
    metadata: {
      enabled:
        isManagedControlChecked(controls.metadataEnabled) ||
        isManagedControlChecked(controls.metadataClearExisting) ||
        state.metadataDirty,
      clearExisting: isManagedControlChecked(controls.metadataClearExisting),
      title: getManagedControlValue(controls.metadataTitle),
      author: getManagedControlValue(controls.metadataAuthor),
      subject: getManagedControlValue(controls.metadataSubject),
      keywords: getManagedControlValue(controls.metadataKeywords)
    },
    bookmarks: {
      enabled: isManagedControlChecked(controls.bookmarksEnabled),
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
        isManagedControlChecked(controls.headerFooterEnabled) ||
        String(getManagedControlValue(controls.headerText) || "").trim().length > 0 ||
        String(getManagedControlValue(controls.footerText) || "").trim().length > 0,
      headerText: getManagedControlValue(controls.headerText),
      footerText: getManagedControlValue(controls.footerText),
      align: getManagedControlValue(controls.headerFooterAlign, "center"),
      color: getManagedControlValue(controls.headerFooterColor, "slate"),
      fontSize: Number(getManagedControlValue(controls.headerFooterFontSize, 10) || 10),
      margin: Number(getManagedControlValue(controls.headerFooterMargin, 24) || 24),
      opacity: Number(getManagedControlValue(controls.headerFooterOpacity, 0.85) || 0.85)
    },
    toImages: {
      enabled: isManagedControlChecked(controls.toImagesEnabled),
      options: isManagedControlChecked(controls.toImagesEnabled)
        ? {
          format: getManagedControlValue(controls.toImagesFormat, "jpg"),
          dpi: Number(getManagedControlValue(controls.toImagesDpi, 200)),
          quality: Number(getManagedControlValue(controls.toImagesQuality, 85))
        }
        : {}
    },
    _debug_toImagesEnabled: isManagedControlChecked(controls.toImagesEnabled),
    visualMetadata: state.pages.map((page) => ({
      crop: page.crop || null,
      annotations: page.annotations || []
    }))
  };

  if (getManagedControlValue(controls.exportMode, "single") === "splitEvery") {
    recipe.split = {
      enabled: true,
      mode: "every",
      every: Number(getManagedControlValue(controls.splitEvery, 1) || 1)
    };
  }

  return recipe;
}

export function buildManagedEditorFormData({
  state,
  buildRecipe,
  formDataFactory = () => new FormData()
}) {
  const formData = formDataFactory();
  state.files.forEach(({ file }) => formData.append("files", file));
  const recipe = buildRecipe();
  formData.append("recipe", JSON.stringify(recipe));
  return formData;
}

export function suggestManagedSaveName({
  state,
  controls
}) {
  const trimmed = String(controls.saveName?.value || "").trim();
  if (trimmed) return trimmed;
  if (state.files.length === 1) {
    return state.files[0].name;
  }
  return getManagedControlValue(controls.exportMode, "single") === "splitEvery"
    ? "workspace_split_result.zip"
    : "workspace_result.pdf";
}

function getManagedSubmissionError({
  state,
  controls,
  visiblePages,
  actionVerb
}) {
  if (state.files.length === 0) {
    return "请先上传至少一个 PDF。";
  }

  if (!visiblePages()) {
    return `至少保留一页才能${actionVerb}。`;
  }

  if (
    isManagedControlChecked(controls.securityEnabled) &&
    !String(getManagedControlValue(controls.securityPassword) || "").trim()
  ) {
    return "开启加密后，请填写打开密码。";
  }

  if (
    isManagedControlChecked(controls.pdfaEnabled) &&
    isManagedControlChecked(controls.securityEnabled)
  ) {
    return "PDF/A 与加密不能同时启用。";
  }

  if (
    isManagedControlChecked(controls.bookmarksEnabled) &&
    getManagedControlValue(controls.exportMode, "single") === "splitEvery"
  ) {
    return "书签编辑暂不支持拆分导出，请先切回单文件导出。";
  }

  if (
    getManagedControlValue(controls.exportMode, "single") === "splitEvery" &&
    Number(getManagedControlValue(controls.splitEvery, 0) || 0) < 1
  ) {
    return "拆分页数必须大于等于 1。";
  }

  if (
    isManagedControlChecked(controls.watermarkEnabled) &&
    getManagedControlValue(controls.watermarkKind, "text") !== "image" &&
    !String(getManagedControlValue(controls.watermarkText) || "").trim()
  ) {
    return "文字水印模式下，请先填写水印文字。";
  }

  if (
    isManagedControlChecked(controls.watermarkEnabled) &&
    getManagedControlValue(controls.watermarkKind) === "image" &&
    !state.watermarkImageDataUrl
  ) {
    return "图片水印模式下，请先选择一张 PNG 或 JPG 图片。";
  }

  if (isManagedControlChecked(controls.stampEnabled) && !state.stampImageDataUrl) {
    return "启用图片印章后，请先选择一张 PNG 或 JPG 图片。";
  }

  return "";
}

function describeManagedResizeSettings(controls) {
  const enabled = Boolean(controls.resizeEnabled?.checked);
  const pageSize = String(controls.resizePageSize?.value || "keep").trim();
  const orientation = String(controls.resizeOrientation?.value || "auto").trim();
  const fitMode = String(controls.resizeFitMode?.value || "keep").trim();
  const margin = Number(controls.resizeMargin?.value || 0);

  const labels = {
    keep: "保持原尺寸",
    A3: "A3",
    A4: "A4",
    A5: "A5",
    Letter: "Letter",
    Legal: "Legal",
    auto: "自动识别",
    portrait: "纵向",
    landscape: "横向",
    contain: "按比例适配",
    stretch: "拉伸填满"
  };

  if (!enabled) {
    return "页面设置：未启用";
  }

  return `页面设置：${labels[pageSize] || pageSize} / ${labels[orientation] || orientation} / ${labels[fitMode] || fitMode} / 边距 ${margin}`;
}

function describeManagedPreviewExpectation(controls) {
  if (!Boolean(controls.resizeEnabled?.checked)) {
    return "";
  }
  return "工作台预览仍显示原始页面比例，最终以导出后的真实页面尺寸为准";
}

export async function exportManagedEditedPdf({
  state,
  controls,
  visiblePages,
  setResult,
  buildEditorFormData,
  suggestedSaveName,
  fetchApi = globalThis.fetch,
  documentApi = globalThis.document,
  PDFLibApi = globalThis.PDFLib
}) {
  const validationError = getManagedSubmissionError({
    state,
    controls,
    visiblePages,
    actionVerb: "导出"
  });
  if (validationError) {
    setResult?.(validationError, true);
    return;
  }

  setResult?.("正在导出编辑结果...");
  const formData = buildEditorFormData();
  formData.append("saveName", suggestedSaveName());

  try {
    const response = await fetchApi("/api/visual-workbench", {
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
    const resizeDescription = describeManagedResizeSettings(controls);
    const previewExpectation = describeManagedPreviewExpectation(controls);
    const exportedPdfDescription =
      String(filename || "").toLowerCase().endsWith(".pdf")
        ? await describeManagedExportedPdf(blob, PDFLibApi)
        : "";
    triggerBlobDownload(blob, filename);
    setResult?.(
      exportedPdfDescription
        ? `导出完成，已开始下载：${filename}。${resizeDescription}。${exportedPdfDescription}${previewExpectation ? `。${previewExpectation}` : ""}`
        : `导出完成，已开始下载：${filename}。${resizeDescription}${previewExpectation ? `。${previewExpectation}` : ""}`
    );
    documentApi?.dispatchEvent?.(new CustomEvent("editor:exported"));
  } catch (error) {
    setResult?.(error.message || "导出失败", true);
  }
}

export async function saveManagedEditedPdfOnline({
  state,
  controls,
  visiblePages,
  setResult,
  buildEditorFormData,
  suggestedSaveName,
  closePreview,
  loadEditor,
  fetchApi = globalThis.fetch,
  documentApi = globalThis.document,
  normalizeWorkspaceSource = normalizeManagedWorkspaceSource,
  getOverwriteTarget = getManagedOverwriteTarget,
  FileCtor = globalThis.File
}) {
  if (!state.currentUser) {
    setResult?.("请先登录会员账号后再在线保存。", true);
    return null;
  }

  const validationError = getManagedSubmissionError({
    state,
    controls,
    visiblePages,
    actionVerb: "保存"
  });
  if (validationError) {
    setResult?.(validationError, true);
    return null;
  }

  setResult?.("正在把编辑结果保存到你的会员空间...");
  const formData = buildEditorFormData();
  formData.append("saveName", suggestedSaveName());
  formData.append("folderName", String(controls.saveFolderName?.value || "").trim());

  const overwriteTarget = getOverwriteTarget({ state, controls });
  if (overwriteTarget) {
    formData.append("overwriteFileId", String(overwriteTarget.id));
  }

  try {
    const response = await fetchApi("/api/workspace/visual-save", {
      method: "POST",
      body: formData
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "在线保存失败");
    }

    const name = data.file?.originalName || suggestedSaveName();
    const savedWorkspaceSource =
      data.file && String(data.file.kind || "pdf").trim() === "pdf"
        ? normalizeWorkspaceSource({
          id: data.file.id || overwriteTarget?.id,
          originalName: data.file.originalName || name,
          folderName:
            data.file.folderName || String(controls.saveFolderName?.value || "").trim(),
          kind: data.file.kind || "pdf"
        })
        : null;

    setResult?.(
      overwriteTarget
        ? `已覆盖保存并重新加载：${name}`
        : savedWorkspaceSource
          ? `已保存并绑定到工作区文件：${name}`
          : `已保存：${name}`
    );

    if (savedWorkspaceSource) {
      state.workspaceSource = savedWorkspaceSource;
      const contentUrl = `/api/workspace/files/${savedWorkspaceSource.id}/content`;
      const fileResponse = await fetchApi(contentUrl, {
        credentials: "same-origin"
      });
      if (fileResponse.ok) {
        const buffer = await fileResponse.arrayBuffer();
        const file = new FileCtor([buffer], savedWorkspaceSource.originalName, {
          type: "application/pdf"
        });
        file.workspaceSource = savedWorkspaceSource;
        closePreview?.();
        await loadEditor?.([file], { force: true });
      }
    }

    documentApi?.dispatchEvent?.(
      new CustomEvent("workspace:file-saved", { detail: data.file || null })
    );
    return data.file || null;
  } catch (error) {
    setResult?.(error.message || "在线保存失败", true);
    return null;
  }
}
