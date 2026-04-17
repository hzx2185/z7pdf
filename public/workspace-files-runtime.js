import { copyTextToClipboard, requestJson } from "./common.js?v=0414b";

function splitFilenameParts(filename = "") {
  const value = String(filename || "");
  const lastDotIndex = value.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return { base: value, ext: "" };
  }
  return {
    base: value.slice(0, lastDotIndex),
    ext: value.slice(lastDotIndex)
  };
}

function buildBatchRenamePreviewName(file, index, options) {
  const { base, ext } = splitFilenameParts(file.originalName || "");
  let nextBase = base;
  if (options.findText) {
    nextBase = nextBase.split(options.findText).join(options.replaceText);
  }
  nextBase = `${options.prefix}${nextBase}${options.suffix}`.trim();
  if (options.sequenceEnabled) {
    nextBase = `${nextBase}${nextBase ? "-" : ""}${options.sequenceStart + index}`;
  }
  if (!nextBase) {
    nextBase = base || "文件";
  }
  return `${nextBase}${ext}`;
}

export function createWorkspaceFilesRuntime({
  elements,
  appState,
  setResult,
  formatBytes,
  updateWorkspaceSidePanels,
  applyWorkspaceDisplayMode,
  refreshWorkspace
}) {
  function getBatchRenameOptions() {
    return {
      prefix: String(elements.workspaceBatchPrefixInput?.value || "").trim(),
      suffix: String(elements.workspaceBatchSuffixInput?.value || "").trim(),
      findText: String(elements.workspaceBatchFindInput?.value || ""),
      replaceText: String(elements.workspaceBatchReplaceInput?.value || ""),
      folderPath: String(elements.workspaceBatchFolderInput?.value || "").trim(),
      sequenceEnabled: Boolean(elements.workspaceBatchSequenceEnabled?.checked),
      sequenceStart: Math.max(1, Number(elements.workspaceBatchSequenceStart?.value || 1))
    };
  }

  function clearBatchRenameForm() {
    if (elements.workspaceBatchPrefixInput) elements.workspaceBatchPrefixInput.value = "";
    if (elements.workspaceBatchSuffixInput) elements.workspaceBatchSuffixInput.value = "";
    if (elements.workspaceBatchFindInput) elements.workspaceBatchFindInput.value = "";
    if (elements.workspaceBatchReplaceInput) elements.workspaceBatchReplaceInput.value = "";
    if (elements.workspaceBatchFolderInput) elements.workspaceBatchFolderInput.value = "";
    if (elements.workspaceBatchSequenceEnabled) elements.workspaceBatchSequenceEnabled.checked = false;
    if (elements.workspaceBatchSequenceStart) elements.workspaceBatchSequenceStart.value = "1";
  }

  function renderBatchRenameState() {
    const selectedFiles = appState.workspace.filter((file) => appState.selectedFileIds.has(file.id));
    const selectedCount = selectedFiles.length;
    const disabled = selectedCount === 0 || appState.currentView === "trash";
    const options = getBatchRenameOptions();
    const renameTouchesNames = Boolean(
      options.prefix ||
      options.suffix ||
      options.findText ||
      options.sequenceEnabled
    );

    elements.workspaceBatchRenameToggleBtn?.classList.toggle("active", appState.batchRenameOpen);
    if (elements.workspaceBatchRenameToggleBtn) {
      elements.workspaceBatchRenameToggleBtn.disabled = appState.currentView === "trash";
    }
    elements.workspaceBatchRenamePanel?.classList.toggle("hidden", !appState.batchRenameOpen);
    if (elements.workspaceBatchRenameApplyBtn) {
      elements.workspaceBatchRenameApplyBtn.disabled = disabled || (!renameTouchesNames && !options.folderPath);
    }
    if (elements.workspaceBatchRenameResetBtn) {
      elements.workspaceBatchRenameResetBtn.disabled = disabled;
    }
    if (elements.workspaceBatchRenameHint) {
      if (appState.currentView === "trash") {
        elements.workspaceBatchRenameHint.textContent = "当前视图不可重命名。";
      } else if (!selectedCount) {
        elements.workspaceBatchRenameHint.textContent = "先勾选文件，再设置重命名规则。";
      } else {
        const previewName = renameTouchesNames
          ? buildBatchRenamePreviewName(selectedFiles[0], 0, options)
          : selectedFiles[0].originalName;
        const folderText = options.folderPath ? `，并移动到“${options.folderPath}”` : "";
        elements.workspaceBatchRenameHint.textContent = `将更新 ${selectedCount} 个文件，首个结果示例：${previewName}${folderText}`;
      }
    }
  }

  async function applyBatchRename() {
    const files = appState.workspace.filter((file) => appState.selectedFileIds.has(file.id));
    if (!files.length) {
      setResult(elements.workspaceResult, "请先选择文件。", true);
      return;
    }
    if (appState.currentView === "trash") {
      setResult(elements.workspaceResult, "回收站里的文件不能重命名。", true);
      return;
    }

    const options = getBatchRenameOptions();
    const renameTouchesNames = Boolean(
      options.prefix ||
      options.suffix ||
      options.findText ||
      options.sequenceEnabled
    );
    if (!renameTouchesNames && !options.folderPath) {
      setResult(elements.workspaceResult, "请至少填写一个规则。", true);
      return;
    }

    try {
      setResult(elements.workspaceResult, `正在更新 ${files.length} 个文件...`);
      const results = await Promise.allSettled(
        files.map((file, index) =>
          requestJson(`/api/workspace/files/${file.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              originalName: renameTouchesNames ? buildBatchRenamePreviewName(file, index, options) : file.originalName,
              folderPath: options.folderPath || file.folderPath || ""
            })
          })
        )
      );

      const failed = results.filter((item) => item.status === "rejected");
      const succeededCount = results.length - failed.length;
      await refreshWorkspace();
      renderBatchRenameState();

      if (failed.length) {
        const firstError = failed[0].reason?.message || "部分文件更新失败。";
        setResult(elements.workspaceResult, `已更新 ${succeededCount}/${results.length} 个文件。${firstError}`, true);
        return;
      }
      setResult(elements.workspaceResult, `已更新 ${succeededCount} 个文件。`);
    } catch (error) {
      setResult(elements.workspaceResult, error.message || "重命名失败", true);
    }
  }

  async function loadWorkspaceFileAsEditorFile(file) {
    const response = await fetch(file.contentUrl, { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error(`文件读取失败：${file.originalName}`);
    }
    const buffer = await response.arrayBuffer();
    const editorFile = new File([buffer], file.originalName, { type: file.mimeType || "application/pdf" });
    editorFile.workspaceSource = {
      id: Number(file.id),
      originalName: file.originalName,
      folderName: file.folderName || file.folderPath || "",
      kind: file.kind || "pdf"
    };
    return editorFile;
  }

  function renderFolderFilter() {
    const previous = elements.workspaceFolderFilter.value;
    elements.workspaceFolderFilter.innerHTML = '<option value="">全部目录</option>';
    appState.folders.forEach((folder) => {
      const option = document.createElement("option");
      option.value = folder;
      option.textContent = folder;
      elements.workspaceFolderFilter.appendChild(option);
    });
    elements.workspaceFolderFilter.value = appState.folders.includes(previous)
      ? previous
      : appState.activeFolder;
  }

  function renderFolderTreeNodes(nodes = [], level = 0) {
    return nodes.flatMap((node) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "folder-node";
      if (node.path === appState.activeFolder) {
        button.classList.add("active");
      }
      button.style.setProperty("--depth", String(level));
      button.textContent = node.name;
      button.addEventListener("click", async () => {
        appState.activeFolder = node.path;
        elements.workspaceFolderFilter.value = node.path;
        await refreshWorkspace();
      });

      return [button, ...renderFolderTreeNodes(node.children || [], level + 1)];
    });
  }

  function renderFolderTree() {
    elements.workspaceFolderTree.innerHTML = "";
    const nodes = renderFolderTreeNodes(appState.folderTree);
    nodes.forEach((node) => elements.workspaceFolderTree.appendChild(node));
  }

  async function openFilesInEditor(files) {
    const pdfFiles = files.filter((file) => file.kind === "pdf");
    if (pdfFiles.length === 0) {
      setResult(elements.workspaceResult, "当前选择里没有可编辑的 PDF。", true);
      return;
    }

    if (!window.Z7PdfEditor || typeof window.Z7PdfEditor.loadFiles !== "function") {
      setResult(elements.workspaceResult, "编辑器尚未加载完成，请刷新页面后重试。", true);
      return;
    }

    try {
      const editorFiles = [];
      for (const file of pdfFiles) {
        editorFiles.push(await loadWorkspaceFileAsEditorFile(file));
      }
      await window.Z7PdfEditor.loadFiles(editorFiles);
    } catch (error) {
      setResult(elements.workspaceResult, error.message || "文件打开失败", true);
    }
  }

  async function insertFilesInEditor(files, options = {}) {
    const pdfFiles = files.filter((file) => file.kind === "pdf");
    if (pdfFiles.length === 0) {
      setResult(elements.workspaceResult, "当前选择里没有可插入的 PDF。", true);
      return;
    }

    if (!window.Z7PdfEditor || typeof window.Z7PdfEditor.insertFiles !== "function") {
      setResult(elements.workspaceResult, "编辑器尚未加载完成，请刷新页面后重试。", true);
      return;
    }

    try {
      const editorFiles = [];
      for (const file of pdfFiles) {
        editorFiles.push(await loadWorkspaceFileAsEditorFile(file));
      }
      await window.Z7PdfEditor.insertFiles(editorFiles, options);
      setResult(elements.workspaceResult, `已向当前文档插入 ${editorFiles.length} 个 PDF。`);
    } catch (error) {
      setResult(elements.workspaceResult, error.message || "文件插入失败", true);
    }
  }

  async function insertSelectedWorkspaceFilesInEditor(options = {}) {
    const files = appState.workspace.filter((file) => appState.selectedFileIds.has(file.id));
    await insertFilesInEditor(files, options);
  }

  function updateSelectedOpenButton() {
    const selectedCount = appState.selectedFileIds.size;
    const hasSelection = selectedCount > 0;
    if (elements.workspaceOpenSelectedBtn) {
      elements.workspaceOpenSelectedBtn.disabled = !hasSelection;
    }
    if (elements.workspaceDownloadSelectedBtn) {
      elements.workspaceDownloadSelectedBtn.disabled = !hasSelection || appState.currentView === "trash";
    }
    if (elements.workspaceTrashSelectedBtn) {
      elements.workspaceTrashSelectedBtn.disabled = !hasSelection || appState.currentView === "trash";
    }
    if (elements.workspaceRestoreSelectedBtn) {
      elements.workspaceRestoreSelectedBtn.disabled = !hasSelection || appState.currentView !== "trash";
    }
    if (elements.workspacePurgeSelectedBtn) {
      elements.workspacePurgeSelectedBtn.disabled = !hasSelection || appState.currentView !== "trash";
    }
    if (elements.workspaceClearSelectionBtn) {
      elements.workspaceClearSelectionBtn.disabled = !hasSelection;
    }
    if (elements.workspaceSelectionSummary) {
      elements.workspaceSelectionSummary.textContent = hasSelection
        ? `已选择 ${selectedCount} 个文件`
        : "未选择文件";
    }
    if (elements.workspaceSelectionHint) {
      elements.workspaceSelectionHint.textContent = hasSelection
        ? (appState.currentView === "trash"
            ? "可以恢复选中文件，或执行彻底删除。"
            : "可以批量打开、下载、移入回收站，或继续调整文件信息。")
        : "勾选文件后可进行批量操作。";
    }
    elements.workspaceBatchBar?.classList.toggle("hidden", !hasSelection);
    renderBatchRenameState();
  }

  function sortFiles(files) {
    const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
    const sorted = [...files];
    sorted.sort((left, right) => {
      switch (appState.workspaceSort) {
        case "oldest":
          return new Date(left.deletedAt || left.createdAt).getTime() - new Date(right.deletedAt || right.createdAt).getTime();
        case "name-asc":
          return collator.compare(left.originalName || "", right.originalName || "");
        case "name-desc":
          return collator.compare(right.originalName || "", left.originalName || "");
        case "type": {
          const kindCompare = collator.compare(left.kind || "", right.kind || "");
          return kindCompare || collator.compare(left.originalName || "", right.originalName || "");
        }
        case "size-asc":
          return Number(left.sizeBytes || 0) - Number(right.sizeBytes || 0);
        case "size-desc":
          return Number(right.sizeBytes || 0) - Number(left.sizeBytes || 0);
        case "newest":
        default:
          return new Date(right.deletedAt || right.createdAt).getTime() - new Date(left.deletedAt || left.createdAt).getTime();
      }
    });
    return sorted;
  }

  function updateSortControls() {
    if (elements.workspaceSortSelect) {
      elements.workspaceSortSelect.value = appState.workspaceSort;
    }
    if (elements.workspaceHeadNameBtn) {
      const label = appState.workspaceSort === "name-desc" ? "名称排序 ↓" : "名称排序 ↑";
      elements.workspaceHeadNameBtn.textContent = label;
      elements.workspaceHeadNameBtn.classList.toggle("active", appState.workspaceSort === "name-asc" || appState.workspaceSort === "name-desc");
    }
    if (elements.workspaceHeadDateBtn) {
      const label = appState.workspaceSort === "oldest" ? "时间排序 ↑" : "时间排序 ↓";
      elements.workspaceHeadDateBtn.textContent = label;
      elements.workspaceHeadDateBtn.classList.toggle("active", appState.workspaceSort === "newest" || appState.workspaceSort === "oldest");
    }
  }

  function triggerFileDownload(file) {
    const link = document.createElement("a");
    link.href = file.downloadUrl;
    link.download = file.originalName || "";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function createActionButton(label, className, handler, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    if (title) button.title = title;
    button.addEventListener("click", handler);
    return button;
  }

  async function createShareForFile(file) {
    appState.sharingFile = file;
    elements.shareForm.reset();
    elements.sharePasswordRow.classList.add("hidden");
    elements.shareModal.classList.remove("hidden");
  }

  async function handleShareSubmit(event) {
    event.preventDefault();
    const file = appState.sharingFile;
    if (!file) return;

    const accessMode = elements.shareAccessMode.value;
    const password = accessMode === "password" ? elements.sharePassword.value : "";
    const destroyAfterReading = elements.shareDestroyAfterReading.checked;
    const maxDownloads = destroyAfterReading ? 0 : Number(elements.shareMaxDownloads.value || 0);
    const expiresInput = elements.shareExpiresAt.value;
    const expiresAt = expiresInput ? new Date(expiresInput).toISOString() : "";

    if (accessMode === "password" && password.length < 4) {
      setResult(elements.workspaceResult, "密码访问模式下，请输入至少 4 位访问密码。", true);
      return;
    }

    try {
      const data = await requestJson(`/api/workspace/files/${file.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessMode,
          password,
          maxDownloads,
          destroyAfterReading,
          expiresAt
        })
      });

      const fullUrl = new URL(data.share.shareUrl, window.location.origin).toString();
      const copied = await copyTextToClipboard(fullUrl);

      elements.shareModal.classList.add("hidden");
      setResult(elements.workspaceResult, copied ? "分享链接已创建并复制到剪贴板。" : `分享链接已创建：${fullUrl}`);
      await refreshWorkspace();
    } catch (error) {
      setResult(elements.workspaceResult, error.message || "分享创建失败", true);
    }
  }

  function createFileCard(file) {
    const article = document.createElement("article");
    article.className = `workspace-file${appState.workspaceDisplayMode === "card" ? " card-mode" : ""}`;

    const select = document.createElement("label");
    select.className = "workspace-select";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = appState.selectedFileIds.has(file.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        appState.selectedFileIds.add(file.id);
      } else {
        appState.selectedFileIds.delete(file.id);
      }
      updateSelectedOpenButton();
    });
    select.appendChild(checkbox);

    const meta = document.createElement("div");
    meta.className = "workspace-file-meta";
    meta.innerHTML = `
      <strong class="file-name-clickable">${file.originalName}</strong>
      <span>${file.folderPath || "根目录"} / ${file.kind === "zip" ? "ZIP 结果包" : `${file.pageCount || 0} 页 PDF`} / ${formatBytes(file.sizeBytes)}</span>
      <span>${appState.currentView === "trash" ? "删除于" : "创建于"} ${new Date(file.deletedAt || file.createdAt).toLocaleString("zh-CN")}</span>
    `;

    const nameEl = meta.querySelector(".file-name-clickable");
    if (file.kind === "pdf") {
      nameEl.style.cursor = "pointer";
      nameEl.style.color = "var(--accent-strong)";
      nameEl.addEventListener("click", () => openFilesInEditor([file]));
    }

    article.append(select, meta);
    return article;
  }

  async function runBatchAction(files, action) {
    if (files.length === 0) {
      setResult(elements.workspaceResult, "请先选择文件。", true);
      return;
    }

    try {
      if (action === "trash") {
        for (const file of files) {
          await requestJson(`/api/workspace/files/${file.id}`, { method: "DELETE" });
        }
        setResult(elements.workspaceResult, `已将 ${files.length} 个文件移入回收站。`);
      }

      if (action === "restore") {
        for (const file of files) {
          await requestJson(`/api/workspace/files/${file.id}/restore`, { method: "POST" });
        }
        setResult(elements.workspaceResult, `已恢复 ${files.length} 个文件。`);
      }

      if (action === "purge") {
        for (const file of files) {
          await requestJson(`/api/workspace/files/${file.id}?mode=purge`, { method: "DELETE" });
        }
        setResult(elements.workspaceResult, `已彻底删除 ${files.length} 个文件。`);
      }

      appState.selectedFileIds.clear();
      await refreshWorkspace();
    } catch (error) {
      setResult(elements.workspaceResult, error.message || "操作失败", true);
    }
  }

  function renderPagination() {
    if (!elements.workspacePagination) return;
    const { workspacePage, workspaceTotalPages } = appState;

    const pageSelect = elements.workspacePageSelect;
    if (pageSelect) {
      pageSelect.innerHTML = "";
      for (let index = 1; index <= workspaceTotalPages; index += 1) {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = `${index} / ${workspaceTotalPages}`;
        if (index === workspacePage) option.selected = true;
        pageSelect.appendChild(option);
      }
    }
  }

  function renderShares() {
    elements.workspaceShares.innerHTML = "";
    elements.workspaceSharesEmpty.classList.toggle("hidden", appState.shares.length > 0);
    appState.shares.forEach((share) => {
      const item = document.createElement("article");
      item.className = "share-item";
      const fullUrl = new URL(share.shareUrl, window.location.origin).toString();

      const statusParts = [];
      if (share.destroyAfterReading) statusParts.push("阅后即焚");
      if (!share.expiresAt) {
        statusParts.push("永不过期");
      } else {
        const expireDate = new Date(share.expiresAt);
        if (expireDate > new Date()) {
          const days = Math.ceil((expireDate - new Date()) / (1000 * 60 * 60 * 24));
          statusParts.push(`${days}天后到期`);
        } else {
          statusParts.push("已过期");
        }
      }
      if (!share.enabled) statusParts.push("已停用");

      const downloadInfo = `下载 ${share.downloadCount}${share.maxDownloads ? `/${share.maxDownloads}` : ""}`;
      const displayStatusParts = statusParts.filter((part) => part !== "已停用");
      const statusLine = displayStatusParts.length > 0
        ? `${displayStatusParts.join(" · ")} · ${downloadInfo}`
        : downloadInfo;

      item.innerHTML = `
        <div class="share-header">
          <strong class="share-filename" style="cursor:pointer;" title="点击打开">${share.fileName || "分享文件"}</strong>
        </div>
        <div class="share-status">${statusLine}</div>
      `;

      const filenameEl = item.querySelector(".share-filename");
      filenameEl.addEventListener("click", () => {
        window.open(fullUrl, "_blank", "noreferrer");
      });

      const actions = document.createElement("div");
      actions.className = "workspace-file-actions";

      actions.appendChild(createActionButton("📋", "ghost-button", async () => {
        try {
          await copyTextToClipboard(fullUrl);
          setResult(elements.workspaceResult, "链接已复制");
        } catch (error) {
          prompt("复制以下链接:", fullUrl);
        }
      }, "复制链接"));

      if (share.enabled) {
        actions.appendChild(createActionButton("⏸️", "ghost-button", async () => {
          try {
            await requestJson(`/api/workspace/shares/${share.id}`, { method: "DELETE" });
            setResult(elements.workspaceResult, "已停用");
            const sharesData = await requestJson("/api/workspace/shares");
            appState.shares = sharesData.shares;
            renderShares();
          } catch (error) {
            setResult(elements.workspaceResult, error.message || "操作失败", true);
          }
        }, "停用"));
      } else {
        const disabledIcon = document.createElement("span");
        disabledIcon.textContent = "⏸️";
        disabledIcon.className = "ghost-button share-disabled-icon";
        disabledIcon.title = "已停用";
        actions.appendChild(disabledIcon);
      }

      actions.appendChild(createActionButton("🗑️", "ghost-button ghost-danger", async () => {
        if (share.enabled) {
          alert("请先停用分享再删除");
          return;
        }
        if (!confirm("确定要删除这个分享吗?")) return;
        try {
          await requestJson(`/api/workspace/shares/${share.id}/permanent`, { method: "DELETE" });
          setResult(elements.workspaceResult, "已删除");
          const sharesData = await requestJson("/api/workspace/shares");
          appState.shares = sharesData.shares;
          renderShares();
        } catch (error) {
          setResult(elements.workspaceResult, error.message || "删除失败", true);
        }
      }, "删除分享"));

      item.appendChild(actions);
      elements.workspaceShares.appendChild(item);
    });
  }

  function getUsageMetrics() {
    return {
      usedBytes: Number(elements.workspaceUsage?.dataset.usedBytes || 0),
      quotaBytes: Number(elements.workspaceUsage?.dataset.quotaBytes || 0)
    };
  }

  function renderWorkspace(files = [], folders = [], folderTree = [], shares = [], usedBytes = 0, quotaBytes = 0) {
    appState.workspace = files;
    appState.folders = folders;
    appState.folderTree = folderTree;
    appState.shares = shares;
    appState.lastRenderedVisibleFiles = [];

    elements.workspaceUsage.textContent = `已用 ${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)}`;
    elements.workspaceUsage.dataset.usedBytes = String(usedBytes || 0);
    elements.workspaceUsage.dataset.quotaBytes = String(quotaBytes || 0);

    updateSortControls();
    renderFolderFilter();
    renderFolderTree();
    renderShares();
    updateWorkspaceSidePanels?.();
    elements.workspaceFiles.innerHTML = "";

    const normalizedQuery = appState.workspaceSearchQuery.trim().toLowerCase();
    const filteredFiles = normalizedQuery
      ? files.filter((file) =>
          [file.originalName, file.folderPath, file.kind]
            .map((value) => String(value || "").toLowerCase())
            .some((value) => value.includes(normalizedQuery))
        )
      : files;
    const visibleFiles = sortFiles(filteredFiles);

    appState.lastRenderedVisibleFiles = visibleFiles;
    appState.workspaceTotalPages = Math.max(1, Math.ceil(visibleFiles.length / appState.workspacePageSize));
    if (appState.workspacePage > appState.workspaceTotalPages) {
      appState.workspacePage = appState.workspaceTotalPages;
    }

    const startIndex = (appState.workspacePage - 1) * appState.workspacePageSize;
    const pagedFiles = visibleFiles.slice(startIndex, startIndex + appState.workspacePageSize);
    const selectedIds = new Set(pagedFiles.map((file) => file.id));
    appState.selectedFileIds = new Set([...appState.selectedFileIds].filter((id) => selectedIds.has(id)));
    updateSelectedOpenButton();

    if (visibleFiles.length === 0) {
      elements.workspaceFiles.classList.add("hidden");
      elements.workspaceListHead?.classList.add("hidden");
      elements.workspaceFilesEmpty.classList.remove("hidden");
      elements.workspaceFilesEmpty.textContent = normalizedQuery
        ? "没有找到符合搜索条件的文件。"
        : appState.currentView === "trash"
          ? "回收站当前是空的。"
          : "空间里还没有文件，先上传一个 PDF 开始吧。";
      elements.workspacePagination?.classList.add("hidden");
      applyWorkspaceDisplayMode?.();
      renderBatchRenameState();
      return;
    }

    pagedFiles.forEach((file) => {
      elements.workspaceFiles.appendChild(createFileCard(file));
    });

    elements.workspaceFiles.classList.remove("hidden");
    elements.workspaceFilesEmpty.classList.add("hidden");
    elements.workspacePagination?.classList.remove("hidden");
    renderPagination();
    applyWorkspaceDisplayMode?.();
    renderBatchRenameState();
  }

  function goToPage(page) {
    appState.workspacePage = page;
    const { usedBytes, quotaBytes } = getUsageMetrics();
    renderWorkspace(
      appState.workspace,
      appState.folders,
      appState.folderTree,
      appState.shares,
      usedBytes,
      quotaBytes
    );
  }

  return {
    applyBatchRename,
    clearBatchRenameForm,
    createShareForFile,
    goToPage,
    handleShareSubmit,
    insertFilesInEditor,
    insertSelectedWorkspaceFilesInEditor,
    openFilesInEditor,
    renderBatchRenameState,
    renderShares,
    renderWorkspace,
    runBatchAction,
    triggerFileDownload,
    updateSelectedOpenButton
  };
}
