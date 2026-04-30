import { escapeHtml } from "./common.js?v=0414b";

export function normalizeManagedMetadataFieldValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(", ");
  }

  return String(value || "").trim();
}

export function setManagedMetadataFields({
  controls,
  state,
  values,
  markDirty = false
}) {
  controls.metadataTitle.value = normalizeManagedMetadataFieldValue(values.title);
  controls.metadataAuthor.value = normalizeManagedMetadataFieldValue(values.author);
  controls.metadataSubject.value = normalizeManagedMetadataFieldValue(values.subject);
  controls.metadataKeywords.value = normalizeManagedMetadataFieldValue(values.keywords);
  state.metadataDirty = markDirty;
}

export function markManagedMetadataDirty(state) {
  state.metadataDirty = true;
  return true;
}

function normalizeManagedBookmarkItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      title: String(item?.title || "").trim(),
      pageNumber: Math.max(1, Number(item?.pageNumber || index + 1))
    }))
    .filter((item) => item.title);
}

export function setManagedBookmarks({
  state,
  controls,
  items,
  autoEnable = false,
  renderBookmarksList
}) {
  state.bookmarks = normalizeManagedBookmarkItems(items);
  state.bookmarksDirty = false;
  if (controls.bookmarksEnabled) {
    controls.bookmarksEnabled.checked = autoEnable && state.bookmarks.length > 0;
  }
  renderBookmarksList?.();
}

export function markManagedBookmarksDirty({
  state,
  controls
}) {
  state.bookmarksDirty = true;
  if (controls.bookmarksEnabled) {
    controls.bookmarksEnabled.checked = true;
  }
}

export function addManagedBookmark({
  state,
  initial = {},
  visiblePages,
  markBookmarksDirty,
  renderBookmarksList
}) {
  state.bookmarks.push({
    title: String(initial.title || "").trim(),
    pageNumber: Math.max(1, Number(initial.pageNumber || visiblePages?.() || 1))
  });
  markBookmarksDirty?.();
  renderBookmarksList?.();
}

export function removeManagedBookmark({
  state,
  index,
  markBookmarksDirty,
  renderBookmarksList
}) {
  state.bookmarks.splice(index, 1);
  markBookmarksDirty?.();
  renderBookmarksList?.();
}

export function renderManagedBookmarksList({
  bookmarksList,
  bookmarks
}) {
  if (!bookmarksList) return false;

  if (bookmarks.length === 0) {
    bookmarksList.innerHTML =
      '<p class="dropdown-hint bookmark-empty">还没有书签，可点击下方按钮新增。</p>';
    return true;
  }

  bookmarksList.innerHTML = bookmarks
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
  return true;
}

export function showManagedEditorResult({
  windowApi = globalThis.window,
  resultElement,
  message,
  isError = false,
  hideDelayMs = 5000
}) {
  windowApi.clearTimeout(windowApi._editorResultTimer);

  if (resultElement) {
    resultElement.textContent = message;
    resultElement.classList.remove("hidden");
    resultElement.classList.toggle("error", isError);
    resultElement.classList.toggle("success", !isError && message.length > 0);
    resultElement.classList.add("is-visible");
  }

  windowApi._editorResultTimer = windowApi.setTimeout(() => {
    if (resultElement) {
      resultElement.classList.remove("is-visible");
      resultElement.classList.add("hidden");
    }
  }, hideDelayMs);
}

export function updateManagedImageLabel({
  labelElement,
  fileName,
  selectedPrefix,
  emptyText
}) {
  if (!labelElement) return false;

  labelElement.textContent = fileName
    ? `${selectedPrefix}${fileName}`
    : emptyText;
  return true;
}

function readManagedFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

export function attachManagedAssetImageInputs({
  controls,
  state,
  updateWatermarkLabel,
  updateStampLabel,
  setResult
}) {
  controls.watermarkImageInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      state.watermarkImageDataUrl = "";
      state.watermarkImageName = "";
      updateWatermarkLabel?.();
      return;
    }

    try {
      state.watermarkImageDataUrl = await readManagedFileAsDataUrl(file);
      state.watermarkImageName = file.name;
      updateWatermarkLabel?.();
    } catch (error) {
      state.watermarkImageDataUrl = "";
      state.watermarkImageName = "";
      updateWatermarkLabel?.();
      setResult?.(error.message || "读取图片水印失败。", true);
    }
  });

  controls.stampImageInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      state.stampImageDataUrl = "";
      state.stampImageName = "";
      updateStampLabel?.();
      return;
    }

    try {
      state.stampImageDataUrl = await readManagedFileAsDataUrl(file);
      state.stampImageName = file.name;
      updateStampLabel?.();
    } catch (error) {
      state.stampImageDataUrl = "";
      state.stampImageName = "";
      updateStampLabel?.();
      setResult?.(error.message || "读取图片印章失败。", true);
    }
  });
}
