import {
  attachManagedThumbCardEvents,
  createManagedThumbCard,
  isManagedFileDragEvent,
  renderManagedThumbCards
} from "./editor-workspace-runtime.js?v=0414b";

function normalizeManagedRotation(rotation) {
  return ((Number(rotation || 0) % 360) + 360) % 360;
}

export function getManagedPageTotalRotation(page) {
  return normalizeManagedRotation(
    Number(page?.sourceRotation || 0) + Number(page?.rotation || 0)
  );
}

export function hasManagedPageEdits(page) {
  return Boolean(page?.crop || page?.annotations?.length > 0 || getManagedPageTotalRotation(page));
}

function createManagedThumbPlaceholder(documentApi = globalThis.document) {
  const placeholder = documentApi.createElement("div");
  placeholder.className = "thumb-placeholder";
  placeholder.innerHTML = "<span>滚动到这里后生成缩略图</span>";
  return placeholder;
}

function createManagedThumbPageStage({
  page,
  getPageDisplayCanvas,
  applyPageStageViewport,
  documentApi = globalThis.document
}) {
  const stage = documentApi.createElement("div");
  stage.className = "thumb-page-stage";

  const surface = documentApi.createElement("div");
  surface.className = "thumb-page-surface";

  const displayCanvas = getPageDisplayCanvas?.(page);
  if (displayCanvas) {
    displayCanvas.draggable = false;
    surface.appendChild(displayCanvas);
  }

  stage.appendChild(surface);
  applyPageStageViewport?.(stage, surface, page, displayCanvas);
  return stage;
}

function fillManagedThumbPreview({
  preview,
  page,
  getPageDisplayCanvas,
  applyPageStageViewport,
  documentApi = globalThis.document
}) {
  preview.innerHTML = "";
  if (page.canvas) {
    preview.appendChild(
      createManagedThumbPageStage({
        page,
        getPageDisplayCanvas,
        applyPageStageViewport,
        documentApi
      })
    );
  } else {
    preview.appendChild(createManagedThumbPlaceholder(documentApi));
  }
}

function buildManagedThumbMetaHtml(page, index) {
  const totalRotation = getManagedPageTotalRotation(page);
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
    <span>${page.deleted ? "已标记删除" : "保留"} / 旋转 ${totalRotation}°${editLabel}</span>
  `;
}

function buildManagedThumbBadgesHtml(page) {
  const badges = [];
  const totalRotation = getManagedPageTotalRotation(page);
  if (page.isBlank) badges.push('<span class="thumb-badge">空白</span>');
  if (page.deleted) badges.push('<span class="thumb-badge thumb-badge-danger">可恢复</span>');
  if (totalRotation) badges.push(`<span class="thumb-badge">旋转 ${totalRotation}°</span>`);
  if (page.crop) badges.push('<span class="thumb-badge">已裁剪</span>');
  if (page.annotations?.length > 0) {
    badges.push(`<span class="thumb-badge">标注 ${page.annotations.length}</span>`);
  }
  return badges.join("");
}

function getManagedSelectedIndices(state) {
  return Array.from(state.selected).sort((a, b) => a - b);
}

function findManagedPageIndexById(state, pageId) {
  return state.pages.findIndex((page) => String(page.id) === String(pageId));
}

function findManagedPageById(state, pageId) {
  const index = findManagedPageIndexById(state, pageId);
  return index >= 0 ? state.pages[index] : null;
}

async function renderManagedPdfPage({
  pdf,
  pageNumber,
  renderScale = 1.5,
  documentApi = globalThis.document
}) {
  const page = await pdf.getPage(pageNumber);
  const sourceViewport = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: renderScale });
  const canvas = documentApi.createElement("canvas");
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

function renderManagedBlankPage({
  page,
  documentApi = globalThis.document
}) {
  const baseWidth = Math.max(120, Math.round((page.width || 595) * 0.34));
  const baseHeight = Math.max(160, Math.round((page.height || 842) * 0.34));
  const canvas = documentApi.createElement("canvas");
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

function yieldManagedToBrowser(timerApi = globalThis.window || globalThis) {
  return new Promise((resolve) => timerApi.setTimeout(resolve, 0));
}

function tagManagedSelectionKeys(state) {
  const keys = new Set();
  getManagedSelectedIndices(state).forEach((index) => {
    const key = `${state.pages[index].fileIndex}:${state.pages[index].sourceIndex}:${index}:${Date.now()}`;
    state.pages[index].__selectionKey = key;
    keys.add(key);
  });
  return keys;
}

function renumberManagedSelection(state, nextSelectedSourceIndices) {
  state.selected = new Set();
  state.pages.forEach((page, index) => {
    if (nextSelectedSourceIndices.has(page.__selectionKey)) {
      state.selected.add(index);
    }
    delete page.__selectionKey;
  });
}

function getManagedInsertionTemplatePage(state) {
  const selectedIndex = getManagedSelectedIndices(state).at(-1);
  if (selectedIndex !== undefined) {
    return state.pages[selectedIndex];
  }

  return state.pages.find((page) => !page.deleted) || state.pages[0] || null;
}

export function disconnectManagedThumbObservers({ state }) {
  if (state.thumbObserver) {
    state.thumbObserver.disconnect();
    state.thumbObserver = null;
  }
  if (state.recycleObserver) {
    state.recycleObserver.disconnect();
    state.recycleObserver = null;
  }
}

export function resetManagedThumbQueue({ state }) {
  state.renderQueue = [];
  state.queuedPageIds.clear();
  state.renderingPageIds.clear();
  state.queueRunning = false;
}

export function updateManagedThumbCard({
  page,
  state,
  thumbGrid,
  getPageDisplayCanvas,
  applyPageStageViewport,
  restoreWorkspaceEditingUi,
  documentApi = globalThis.document
}) {
  const index = state.pages.indexOf(page);
  if (index === -1) return;

  const card = thumbGrid.querySelector(`[data-page-id="${page.id}"]`);
  if (!card) return;

  card.classList.toggle("selected", state.selected.has(index));
  card.classList.toggle("deleted", page.deleted);
  card.classList.toggle("has-edit", hasManagedPageEdits(page));

  const preview = card.querySelector(".thumb-preview");
  const badges = card.querySelector(".thumb-badges");
  const meta = card.querySelector(".thumb-meta");
  if (!preview || !meta) return;

  fillManagedThumbPreview({
    preview,
    page,
    getPageDisplayCanvas,
    applyPageStageViewport,
    documentApi
  });

  if (badges) {
    badges.innerHTML = buildManagedThumbBadgesHtml(page);
  }
  meta.innerHTML = buildManagedThumbMetaHtml(page, index);
  card.querySelectorAll(".thumb-quick-btn").forEach((button) => {
    button.disabled = !!page.deleted;
  });
  restoreWorkspaceEditingUi?.();
}

export function recycleManagedPageCanvas({
  page,
  state,
  invalidatePageDisplayCache,
  updateThumbCard,
  updateMeta
}) {
  if (!page || !page.canvas || state.renderingPageIds.has(page.id)) {
    return;
  }

  invalidatePageDisplayCache?.(page);
  page.canvas.width = 0;
  page.canvas.height = 0;
  page.canvas = null;
  page.rendered = false;
  updateThumbCard?.(page);
  updateMeta?.();
}

export async function ensureManagedPageCanvas({
  page,
  state,
  renderToken,
  renderScale = 1.5,
  invalidatePageDisplayCache,
  updateThumbCard,
  updateMeta,
  documentApi = globalThis.document
}) {
  if (page.canvas) {
    return page.canvas;
  }

  if (!page.isBlank && !page.pdf) {
    throw new Error(`页面源文件不可用，无法渲染第 ${page.sourceIndex + 1} 页。`);
  }

  const rendered = page.isBlank
    ? {
      canvas: renderManagedBlankPage({ page, documentApi }),
      width: page.width,
      height: page.height
    }
    : await renderManagedPdfPage({
      pdf: page.pdf,
      pageNumber: page.sourceIndex + 1,
      renderScale,
      documentApi
    });

  if (state.renderToken !== renderToken) {
    return null;
  }

  page.canvas = rendered.canvas;
  invalidatePageDisplayCache?.(page);
  if (rendered.width > 0) {
    page.width = rendered.width;
  }
  if (rendered.height > 0) {
    page.height = rendered.height;
  }
  page.rendered = true;
  updateThumbCard?.(page);
  updateMeta?.();
  return rendered.canvas;
}

export function queueManagedPageRender({
  state,
  pageId,
  prioritize = false
}) {
  const page = findManagedPageById(state, pageId);
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

export async function processManagedThumbQueue({
  state,
  renderToken,
  ensurePageCanvas,
  renderedPages,
  setResult,
  timerApi = globalThis.window || globalThis
}) {
  if (state.queueRunning) return;
  state.queueRunning = true;

  while (state.renderQueue.length > 0) {
    if (state.renderToken !== renderToken) break;

    const pageId = state.renderQueue.shift();
    state.queuedPageIds.delete(pageId);
    state.renderingPageIds.add(pageId);

    const page = findManagedPageById(state, pageId);
    if (page && !page.canvas) {
      await ensurePageCanvas?.(page, renderToken);
      await yieldManagedToBrowser(timerApi);
    }

    state.renderingPageIds.delete(pageId);
  }

  state.queueRunning = false;

  if (state.renderToken === renderToken && renderedPages?.() === state.pages.length) {
    setResult?.("缩略图已按需生成完成，可以继续编辑、合并、拆分或导出。");
  }
}

export function requestManagedRenderAround({
  state,
  index,
  prioritize = false,
  queuePageRender,
  processThumbQueue
}) {
  for (let offset = -2; offset <= 2; offset += 1) {
    const page = state.pages[index + offset];
    if (page) {
      queuePageRender?.(page.id, prioritize && offset === 0);
    }
  }
  processThumbQueue?.(state.renderToken);
}

export function setupManagedThumbObservers({
  state,
  thumbGrid,
  requestRenderAround,
  recyclePageCanvas
}) {
  disconnectManagedThumbObservers({ state });

  state.thumbObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const pageId = entry.target.dataset.pageId;
        const index = findManagedPageIndexById(state, pageId);
        if (index >= 0) {
          requestRenderAround?.(index);
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
        const page = findManagedPageById(state, entry.target.dataset.pageId);
        recyclePageCanvas?.(page);
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

export function moveManagedPage({
  state,
  fromIndex,
  toIndex,
  pushHistory,
  renderThumbs
}) {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;
  if (fromIndex < 0 || toIndex < 0) return;
  if (fromIndex >= state.pages.length || toIndex >= state.pages.length) return;
  if (fromIndex === toIndex) return;

  pushHistory?.();
  const [item] = state.pages.splice(fromIndex, 1);
  state.pages.splice(toIndex, 0, item);
  state.selected.clear();
  state.selected.add(toIndex);
  renderThumbs?.();
}

export function renderManagedPageThumbnails({
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
  insertLocalPdf,
  insertWorkspaceSelectedPdf,
  exportCurrentPage,
  exportSelectedPages,
  restoreDeletedPage,
  updateMeta,
  setupThumbObserver,
  requestRenderAround,
  restoreWorkspaceEditingUi,
  filterMode = "all",
  documentApi = globalThis.document,
  platform = globalThis.navigator?.platform
}) {
  disconnectManagedThumbObservers({ state });
  resetManagedThumbQueue({ state });
  thumbGrid.innerHTML = "";

  renderManagedThumbCards({
    thumbGrid,
    pages: state.pages
      .map((page, index) => ({ page, index, isSelected: state.selected.has(index) }))
      .filter(({ page }) => {
        if (filterMode === "deleted") return page.deleted;
        if (filterMode === "active") return !page.deleted;
        if (filterMode === "edited") return !page.deleted && hasManagedPageEdits(page);
        return true;
      }),
    createCard: (page, index, isSelected) =>
      createManagedThumbCard({
        documentApi,
        page,
        index,
        isSelected,
        fillPreview: (preview, currentPage) => {
          fillManagedThumbPreview({
            preview,
            page: currentPage,
            getPageDisplayCanvas,
            applyPageStageViewport,
            documentApi
          });
        },
        buildBadgesHtml: buildManagedThumbBadgesHtml,
        buildMetaHtml: buildManagedThumbMetaHtml,
        bindEvents: (card, currentPage, currentIndex) => {
          attachManagedThumbCardEvents({
            card,
            page: currentPage,
            index: currentIndex,
            state,
            isWorkspaceTextLayerTarget,
            openVisualEditorForPage,
            renderThumbs,
            refreshSelectionCards,
            updateWorkspaceNavigation,
            openPreview,
            isFileDragEvent: isManagedFileDragEvent,
            movePage,
            duplicateSelectedPages,
            deleteSelectedPages,
            insertBlankPage,
            insertLocalPdf,
            insertWorkspaceSelectedPdf,
            exportCurrentPage,
            exportSelectedPages,
            restoreDeletedPage,
            documentApi,
            platform
          });
        }
      })
  });

  updateMeta?.();
  setupThumbObserver?.();
  requestRenderAround?.(0, true);
  restoreWorkspaceEditingUi?.();
}

export function refreshManagedSelectionCards({
  state,
  previousSelection = new Set(),
  updateThumbCard,
  updateMeta,
  restoreWorkspaceEditingUi
}) {
  const affected = new Set([...previousSelection, ...state.selected]);
  affected.forEach((index) => {
    const page = state.pages[index];
    if (page) {
      updateThumbCard?.(page);
    }
  });
  updateMeta?.();
  restoreWorkspaceEditingUi?.();
}

export function updateManagedSplitFieldState({ controls }) {
  const enabled = controls.exportMode.value === "splitEvery";
  controls.splitEvery.disabled = !enabled;
}

export function moveManagedSelection({
  state,
  direction,
  setResult,
  renderThumbs
}) {
  const indexes = getManagedSelectedIndices(state);
  if (indexes.length === 0) {
    setResult?.("请先选中要移动的页面。", true);
    return;
  }

  const selectionKeys = tagManagedSelectionKeys(state);

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

  renumberManagedSelection(state, selectionKeys);
  renderThumbs?.();
}

export function forManagedSelectedPages({
  state,
  action,
  setResult,
  renderThumbs
}) {
  const indexes = getManagedSelectedIndices(state);
  if (indexes.length === 0) {
    setResult?.("请先选中页面。", true);
    return;
  }

  indexes.forEach((index) => action?.(state.pages[index]));
  renderThumbs?.();
}

export function insertManagedBlankPage({
  state,
  pushHistory,
  setResult,
  renderThumbs,
  options = {}
}) {
  pushHistory?.();
  if (state.pages.length === 0) {
    setResult?.("请先上传至少一个 PDF 后再插入空白页。", true);
    return;
  }

  const template = getManagedInsertionTemplatePage(state);
  const selectedIndices = getManagedSelectedIndices(state);
  const fallbackIndex = selectedIndices.at(-1) ?? state.pages.length - 1;
  const requestedReferenceIndex = Number(options.referenceIndex);
  const hasReferenceIndex =
    Number.isInteger(requestedReferenceIndex) &&
    requestedReferenceIndex >= 0 &&
    requestedReferenceIndex < state.pages.length;
  const insertBefore = options.position === "before";
  const anchorIndex = hasReferenceIndex ? requestedReferenceIndex : fallbackIndex;
  const insertAfterIndex = insertBefore ? anchorIndex - 1 : anchorIndex;
  const blankPage = {
    id: state.nextPageId,
    fileIndex: -1,
    fileName: "空白页",
    sourceIndex: -1,
    width: template?.width || 595,
    height: template?.height || 842,
    isBlank: true,
    sourceRotation: 0,
    rotation: 0,
    deleted: false,
    canvas: null,
    rendered: false,
    pdf: null
  };

  state.nextPageId += 1;
  state.pages.splice(insertAfterIndex + 1, 0, blankPage);
  state.selected = new Set([insertAfterIndex + 1]);
  state.lastSelectedIndex = insertAfterIndex + 1;
  renderThumbs?.();
  options.afterInsert?.(blankPage);
  setResult?.("已插入一页空白页，可继续拖动排序或直接导出。");
}

export function duplicateManagedSelectedPages({
  state,
  pushHistory,
  cloneAnnotation,
  cloneCrop,
  setResult,
  renderThumbs
}) {
  const selectedIndices = getManagedSelectedIndices(state);
  if (selectedIndices.length === 0) {
    setResult?.("请先选中要复制的页面。", true);
    return false;
  }

  pushHistory?.();

  const nextSelected = [];
  selectedIndices
    .slice()
    .sort((a, b) => a - b)
    .forEach((index, offset) => {
      const sourcePage = state.pages[index + offset];
      if (!sourcePage) return;

      const duplicatedPage = {
        ...sourcePage,
        id: state.nextPageId,
        annotations: Array.isArray(sourcePage.annotations)
          ? sourcePage.annotations.map((annotation) => cloneAnnotation?.(annotation) ?? annotation)
          : [],
        crop: cloneCrop?.(sourcePage.crop) ?? null,
        canvas: null,
        displayCanvas: null,
        displayCanvasSource: null,
        displayCanvasRotation: null,
        rendered: false,
        visualHistory: [],
        pdf: sourcePage.pdf || null
      };

      state.nextPageId += 1;
      const insertIndex = index + offset + 1;
      state.pages.splice(insertIndex, 0, duplicatedPage);
      nextSelected.push(insertIndex);
    });

  state.selected = new Set(nextSelected);
  state.lastSelectedIndex = nextSelected.at(-1) ?? null;
  renderThumbs?.();
  setResult?.(`已复制 ${nextSelected.length} 个页面。`);
  return true;
}

export function applyManagedPageSplit({
  state,
  controls,
  cloneAnnotation,
  setResult,
  renderThumbs
}) {
  if (state.selected.size === 0) {
    setResult?.("请先选中要分割的页面。", true);
    return;
  }

  const direction = controls.splitDirection?.value || "horizontal";
  const count = parseInt(controls.splitCount?.value || "2", 10);
  const applyAll = controls.splitAllPages?.checked ?? false;

  if (count < 2 || count > 10) {
    setResult?.("分割份数必须在 2-10 之间。", true);
    return;
  }

  const selectedIndices = getManagedSelectedIndices(state);
  const indices = applyAll ? selectedIndices.reverse() : [selectedIndices[0]];
  if (indices.length === 0 || indices[0] === undefined) {
    setResult?.("请先选中页面。", true);
    return;
  }

  let added = 0;
  for (const idx of indices) {
    const page = state.pages[idx];
    if (!page || page.isBlank) continue;

    const splitParts = [];
    for (let i = 0; i < count; i += 1) {
      const newPage = {
        ...page,
        id: `${page.id}_split_${i}_${Date.now()}`,
        sourceIndex: page.sourceIndex,
        rotation: page.rotation,
        scale: page.scale,
        size: page.size,
        visualMetadata: [...(page.visualMetadata || [])],
        annotations: Array.isArray(page.annotations)
          ? page.annotations.map(cloneAnnotation)
          : [],
        visualHistory: [],
        canvas: null,
        rendered: false,
        displayCanvas: null,
        displayCanvasSource: null,
        displayCanvasRotation: null
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
    added += 1;
  }

  state.selected.clear();
  renderThumbs?.();
  setResult?.(`已将 ${added} 个页面各分割为 ${count} 部分。`);
}

export async function printManagedPages({
  state,
  ensurePageCanvas,
  setResult,
  documentApi = globalThis.document,
  windowApi = globalThis.window,
  consoleApi = globalThis.console
}) {
  const activePages = state.pages.filter((page) => !page.deleted);
  if (activePages.length === 0) {
    setResult?.("没有可打印的页面。", true);
    return false;
  }

  setResult?.("正在准备打印预览...");

  let printContainer = documentApi.getElementById("print-container");
  if (!printContainer) {
    printContainer = documentApi.createElement("div");
    printContainer.id = "print-container";
    documentApi.body.appendChild(printContainer);
  }
  printContainer.innerHTML = "";

  try {
    for (const page of activePages) {
      const canvas = await ensurePageCanvas?.(page);
      if (!canvas) continue;

      const pageElement = documentApi.createElement("div");
      pageElement.className = "print-page";

      const image = documentApi.createElement("img");
      image.src = canvas.toDataURL("image/jpeg", 0.95);

      if (page.rotation) {
        image.style.transform = `rotate(${page.rotation}deg)`;
      }

      pageElement.appendChild(image);
      printContainer.appendChild(pageElement);
    }

    windowApi.setTimeout(() => {
      windowApi.print();
    }, 500);
    return true;
  } catch (error) {
    consoleApi.error("Print error:", error);
    setResult?.(`打印准备失败：${error.message}`, true);
    return false;
  }
}
