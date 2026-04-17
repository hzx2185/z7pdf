import { requestJson, requestJsonWithProgress } from "./common.js?v=0414b";

function getWorkspaceUsageMetrics(elements) {
  return {
    usedBytes: Number(elements.workspaceUsage?.dataset.usedBytes || 0),
    quotaBytes: Number(elements.workspaceUsage?.dataset.quotaBytes || 0)
  };
}

function showAuthSubsection({ appState, openPasswordAuth, syncAuthAutocompleteFields }, sectionName) {
  const authPanel = document.getElementById("authPanel");
  const authPanelTitle = document.getElementById("authPanelTitle");
  const sections = {
    login: document.getElementById("authLoginSection"),
    forgot: document.getElementById("authForgotSection"),
    changePassword: document.getElementById("authChangePasswordSection"),
    changeEmail: document.getElementById("authChangeEmailSection"),
    redeem: document.getElementById("authRedeemSection")
  };
  Object.entries(sections).forEach(([name, section]) => {
    section?.classList.toggle("hidden", name !== sectionName);
  });

  if (sectionName === "changeEmail") {
    const currentEmailDisplay = document.getElementById("currentEmailDisplay");
    if (currentEmailDisplay && appState.user) {
      currentEmailDisplay.textContent = appState.user.email;
    }
    syncAuthAutocompleteFields?.();
  }

  if (sectionName === "redeem") {
    const redeemResult = document.getElementById("redeemResult");
    redeemResult.textContent = "";
    window.setTimeout(() => document.getElementById("redeemCodeInput")?.focus(), 120);
  }

  if (authPanelTitle) {
    const titles = {
      login: "登录或注册",
      forgot: "忘记密码",
      changePassword: "修改密码",
      changeEmail: "修改邮箱",
      redeem: "兑换会员"
    };
    authPanelTitle.textContent = titles[sectionName] || "登录或注册";
  }

  if (sectionName === "redeem" && !appState.user) {
    openPasswordAuth("请先登录会员账号，再使用兑换码兑换会员。");
    return;
  }

  appState.authPanelVisible = true;
  authPanel?.classList.remove("hidden");
}

export function setupWorkspaceBindings({
  elements,
  appState,
  setResult,
  syncAuthAutocompleteFields,
  showPage,
  initSectionSpy,
  refreshWorkspace,
  syncSession,
  loadAccount,
  detectAuthEmailState,
  updateAuthEmailStatus,
  updateAuthModeHint,
  updateAuthPanels,
  isValidEmail,
  resetCodeFlowState,
  openPasswordAuth,
  openRegisterAuth,
  setAuthView,
  toggleAuthPanel,
  revealAuthPanel,
  updateSignedInLayout,
  logoutAndReset,
  setTopbarMenuOpen,
  switchToFilesTab,
  updateWorkspaceSidebarLayout,
  renderWorkspace,
  updateWorkspaceSidePanels,
  openFilesInEditor,
  runBatchAction,
  renderBatchRenameState,
  clearBatchRenameForm,
  applyBatchRename,
  createShareForFile,
  triggerFileDownload,
  handleShareSubmit
}) {
  const rerenderWorkspace = () => {
    const { usedBytes, quotaBytes } = getWorkspaceUsageMetrics(elements);
    renderWorkspace(
      appState.workspace,
      appState.folders,
      appState.folderTree,
      appState.shares,
      usedBytes,
      quotaBytes
    );
  };

  const startCountdown = (button, seconds = 60, idleLabel = "发送验证码") => {
    if (!button) return;
    button.disabled = true;
    let countdown = seconds;
    const interval = window.setInterval(() => {
      countdown -= 1;
      if (button) {
        button.textContent = `${countdown}秒后重试`;
      }
      if (countdown <= 0) {
        window.clearInterval(interval);
        if (button) {
          button.disabled = false;
          button.textContent = idleLabel;
        }
      }
    }, 1000);
  };

  window.showChangePasswordForm = function showChangePasswordForm() {
    showAuthSubsection({ appState, openPasswordAuth, syncAuthAutocompleteFields }, "changePassword");
  };

  window.showChangeEmailForm = function showChangeEmailForm() {
    showAuthSubsection({ appState, openPasswordAuth, syncAuthAutocompleteFields }, "changeEmail");
  };

  window.showRedeemForm = function showRedeemForm(message = "") {
    if (message && !appState.user) {
      openPasswordAuth(message);
      return;
    }
    showAuthSubsection({ appState, openPasswordAuth, syncAuthAutocompleteFields }, "redeem");
  };

  document.addEventListener("click", async (event) => {
    const target = event.target instanceof Element
      ? event.target.closest(".plan-redeem-btn")
      : null;
    if (!target) return;
    event.preventDefault();
    window.showRedeemForm?.("请先登录会员账号，再使用兑换码兑换会员。");
  });

  elements.authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const email = String(elements.authEmail?.value || "").trim();
      const code = String(elements.authCode?.value || "").trim();
      const password = String(elements.authRegisterPassword?.value || "");
      if (!isValidEmail(email)) {
        updateAuthEmailStatus("请输入正确的邮箱格式。", true);
        setResult(elements.authResult, "请输入正确的邮箱地址。", true);
        elements.authEmail?.focus();
        return;
      }
      if (!/^\d{6}$/.test(code)) {
        setResult(elements.authResult, "请输入 6 位验证码。", true);
        elements.authCode?.focus();
        return;
      }
      if (appState.codeFlowExistingUser === null) {
        await detectAuthEmailState();
      }
      if (appState.codeFlowExistingUser === false && password.length < 6) {
        setResult(elements.authResult, "新邮箱注册需要填写至少 6 位注册密码。", true);
        elements.authRegisterPassword?.focus();
        return;
      }
      const data = await requestJson("/api/auth/email-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password })
      });
      appState.user = data.user;
      appState.authPanelVisible = false;
      setResult(elements.authResult, data.created ? "注册成功，已进入你的会员空间。" : "登录成功，已进入你的会员空间。");
      await syncSession();
    } catch (error) {
      setResult(elements.authResult, error.message || "登录失败", true);
    }
  });

  elements.sendCodeBtn?.addEventListener("click", async () => {
    try {
      const email = String(elements.authEmail?.value || "").trim();
      if (!email) {
        setResult(elements.authResult, "请先输入邮箱地址。", true);
        elements.authEmail?.focus();
        return;
      }
      if (!isValidEmail(email)) {
        updateAuthEmailStatus("请输入正确的邮箱格式。", true);
        setResult(elements.authResult, "请输入正确的邮箱地址。", true);
        elements.authEmail?.focus();
        return;
      }
      if (appState.codeFlowExistingUser === null) {
        await detectAuthEmailState();
      }
      elements.sendCodeBtn.disabled = true;
      const data = await requestJson("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      appState.codeFlowExistingUser = Boolean(data.existingUser);
      updateAuthModeHint();
      updateAuthPanels();
      updateAuthEmailStatus(data.existingUser ? "登录验证码已发送，请查看邮箱。" : "注册验证码已发送，验证时请填写注册密码。");
      setResult(
        elements.authResult,
        data.existingUser ? "验证码已发送到邮箱，请尽快填写 6 位验证码完成登录。" : "注册验证码已发送到邮箱，请填写验证码并设置注册密码完成注册。"
      );
      elements.authCode?.focus();
    } catch (error) {
      setResult(elements.authResult, error.message || "验证码发送失败", true);
    } finally {
      window.setTimeout(() => {
        if (elements.sendCodeBtn) {
          elements.sendCodeBtn.disabled = false;
        }
      }, 1200);
    }
  });

  elements.passwordLoginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await requestJson("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: elements.loginEmail.value,
          password: elements.loginPassword.value
        })
      });
      appState.user = data.user;
      appState.authPanelVisible = false;
      setResult(elements.authResult, "登录成功，已进入你的会员空间。");
      await syncSession();
    } catch (error) {
      setResult(elements.authResult, error.message || "登录失败", true);
    }
  });

  elements.logoutBtn?.addEventListener("click", async () => {
    await logoutAndReset();
    setResult(elements.workspaceResult, "");
  });

  elements.showLoginBtn?.addEventListener("click", () => openPasswordAuth());
  elements.showLoginBtn2?.addEventListener("click", () => openPasswordAuth());
  elements.showRegisterBtn?.addEventListener("click", openRegisterAuth);
  elements.showRegisterBtn2?.addEventListener("click", openRegisterAuth);

  elements.showPasswordLoginBtn?.addEventListener("click", () => {
    setAuthView("password");
    setResult(elements.authResult, "");
  });

  elements.showCodeLoginBtn?.addEventListener("click", () => {
    if (!appState.smtpConfigured) {
      setResult(elements.authResult, "后台尚未配置邮箱发信参数，请先使用密码登录。", true);
      return;
    }
    setAuthView("code");
    setResult(elements.authResult, "");
  });

  elements.authEmail?.addEventListener("input", () => {
    resetCodeFlowState();
  });

  elements.authEmail?.addEventListener("blur", async () => {
    if (appState.authView !== "code") return;
    await detectAuthEmailState();
  });

  elements.authRegisterPassword?.addEventListener("input", () => {
    if (!elements.authRegisterPasswordField) return;
    const isStrongEnough = String(elements.authRegisterPassword.value || "").length >= 6;
    elements.authRegisterPasswordField.classList.toggle(
      "field-strong",
      appState.codeFlowExistingUser === false && appState.allowRegistration && !isStrongEnough
    );
  });

  elements.loginEmail?.addEventListener("input", () => {
    if (!elements.loginEmail.value) {
      setResult(elements.authResult, "");
    }
  });

  elements.loginPassword?.addEventListener("input", () => {
    if (!elements.loginPassword.value && elements.loginEmail?.value) {
      setResult(elements.authResult, "");
    }
  });

  elements.authCloseBtn?.addEventListener("click", () => {
    toggleAuthPanel(false);
  });

  elements.authPanel?.addEventListener("click", (event) => {
    if (event.target === elements.authPanel) {
      toggleAuthPanel(false);
    }
  });

  elements.navMenuBtn?.addEventListener("click", () => {
    const shouldOpen = !elements.topbarInner?.classList.contains("menu-open");
    setTopbarMenuOpen(shouldOpen);
  });

  elements.memberCenterNav?.addEventListener("click", (event) => {
    if (appState.user) return;
    event.preventDefault();
    showPage?.("workbench");
    history.pushState(null, "", "#workbench");
    document.querySelectorAll(".workspace-tabs .tab-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.workspaceTab === "member");
    });
    document.querySelectorAll(".workspace-panel").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.panel !== "member");
    });
    appState.workspaceSideTab = "plan";
    updateSignedInLayout();
    window.renderPlans?.();
    setResult(elements.authResult, "");
    setTopbarMenuOpen(false);
  });

  elements.guestEditUploadTrigger2?.addEventListener("click", () => elements.editorFileInput?.click());
  elements.memberWorkspaceUploadTrigger2?.addEventListener("click", () => elements.workspaceUploadInput?.click());
  elements.workspaceUploadInput?.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const uploadButton = elements.memberWorkspaceUploadTrigger2 || elements.memberWorkspaceUploadTrigger;

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.append("folderPath", String(elements.workspaceFolderInput?.value || "").trim());
      if (uploadButton) uploadButton.disabled = true;
      setResult(elements.workspaceResult, `准备上传 ${files.length} 个文件...`);
      await requestJsonWithProgress("/api/workspace/upload", {
        method: "POST",
        body: formData
      }, ({ percent, loaded, total }) => {
        const loadedMb = (loaded / 1024 / 1024).toFixed(1);
        const totalMb = (total / 1024 / 1024).toFixed(1);
        setResult(
          elements.workspaceResult,
          `正在上传 ${files.length} 个文件... ${percent}% (${loadedMb} / ${totalMb} MB)`
        );
      });
      setResult(elements.workspaceResult, `已上传 ${files.length} 个文件到会员空间。`);
      event.target.value = "";
      await refreshWorkspace();
      switchToFilesTab();
    } catch (error) {
      setResult(elements.workspaceResult, error.message || "文件上传失败", true);
    } finally {
      if (uploadButton) uploadButton.disabled = false;
    }
  });

  elements.workspaceFolderFilter?.addEventListener("change", async () => {
    appState.activeFolder = elements.workspaceFolderFilter.value;
    await refreshWorkspace();
  });

  elements.workspaceTreeScope?.addEventListener("change", async () => {
    appState.includeChildren = elements.workspaceTreeScope.checked;
    await refreshWorkspace();
  });

  elements.workspaceRootBtn?.addEventListener("click", async () => {
    appState.activeFolder = "";
    elements.workspaceFolderFilter.value = "";
    await refreshWorkspace();
  });

  elements.workspaceViewActiveBtn?.addEventListener("click", async () => {
    appState.currentView = "active";
    appState.selectedFileIds.clear();
    appState.workspacePage = 1;
    await refreshWorkspace();
  });

  elements.workspaceViewTrashBtn?.addEventListener("click", async () => {
    appState.currentView = "trash";
    appState.selectedFileIds.clear();
    appState.workspacePage = 1;
    await refreshWorkspace();
  });

  elements.workspacePageSelect?.addEventListener("change", (event) => {
    const page = parseInt(event.target.value, 10);
    if (page >= 1 && page <= appState.workspaceTotalPages) {
      appState.workspacePage = page;
      rerenderWorkspace();
    }
  });

  elements.workspaceToggleSidebarBtn?.addEventListener("click", () => {
    appState.workspaceSidebarCollapsed = !appState.workspaceSidebarCollapsed;
    updateWorkspaceSidebarLayout();
  });

  elements.workspaceSearchInput?.addEventListener("input", () => {
    appState.workspaceSearchQuery = String(elements.workspaceSearchInput.value || "");
    appState.workspacePage = 1;
    rerenderWorkspace();
  });

  elements.workspaceSortSelect?.addEventListener("change", () => {
    appState.workspaceSort = String(elements.workspaceSortSelect.value || "newest");
    rerenderWorkspace();
  });

  elements.workspaceTableModeBtn?.addEventListener("click", () => {
    appState.workspaceDisplayMode = "table";
    rerenderWorkspace();
  });

  elements.workspaceCardModeBtn?.addEventListener("click", () => {
    appState.workspaceDisplayMode = "card";
    rerenderWorkspace();
  });

  elements.workspaceHeadNameBtn?.addEventListener("click", () => {
    appState.workspaceSort = appState.workspaceSort === "name-asc" ? "name-desc" : "name-asc";
    rerenderWorkspace();
  });

  elements.workspaceHeadDateBtn?.addEventListener("click", () => {
    appState.workspaceSort = appState.workspaceSort === "newest" ? "oldest" : "newest";
    rerenderWorkspace();
  });

  elements.workspaceTabOverviewBtn?.addEventListener("click", () => {
    appState.workspaceSideTab = "overview";
    updateWorkspaceSidePanels();
  });

  elements.workspaceTabSharesBtn?.addEventListener("click", () => {
    appState.workspaceSideTab = "shares";
    updateWorkspaceSidePanels();
  });

  elements.workspaceTabPlanBtn?.addEventListener("click", () => {
    appState.workspaceSideTab = "plan";
    updateWorkspaceSidePanels();
  });

  elements.workspaceEmptyTrashBtn?.addEventListener("click", async () => {
    if (!window.confirm("确认清空回收站吗？此操作不可恢复。")) return;
    try {
      await requestJson("/api/workspace/trash", { method: "DELETE" });
      setResult(elements.workspaceResult, "回收站已清空。");
      await refreshWorkspace();
    } catch (error) {
      setResult(elements.workspaceResult, error.message || "回收站清空失败", true);
    }
  });

  elements.workspaceOpenSelectedBtn?.addEventListener("click", async () => {
    const files = appState.workspace.filter((file) => appState.selectedFileIds.has(file.id));
    await openFilesInEditor(files);
  });

  elements.workspaceMergeSelectedBtn?.addEventListener("click", async () => {
    const files = appState.workspace.filter((file) => appState.selectedFileIds.has(file.id) && file.kind === "pdf");
    if (files.length < 2) {
      setResult(elements.workspaceResult, "请至少选择2个PDF文件进行合并。", true);
      return;
    }

    try {
      setResult(elements.workspaceResult, `正在合并 ${files.length} 个文件...`);
      const fileBuffers = [];
      for (const file of files) {
        const response = await fetch(file.downloadUrl);
        if (!response.ok) throw new Error(`下载文件 ${file.name} 失败`);
        const buffer = await response.arrayBuffer();
        fileBuffers.push({
          buffer: new Uint8Array(buffer),
          name: file.name
        });
      }

      const formData = new FormData();
      fileBuffers.forEach((file) => {
        const blob = new Blob([file.buffer], { type: "application/pdf" });
        formData.append("files", blob, file.name);
      });

      const response = await fetch("/api/merge", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "合并失败");
      }

      const blob = await response.blob();
      const mergedName = `merged_${files.length}_files.pdf`;
      const mergedFile = new File([blob], mergedName, { type: "application/pdf" });

      if (!window.Z7PdfEditor || typeof window.Z7PdfEditor.loadFiles !== "function") {
        throw new Error("编辑器尚未加载完成，请刷新页面后重试。");
      }

      await window.Z7PdfEditor.loadFiles([mergedFile]);
      setResult(elements.workspaceResult, `成功合并 ${files.length} 个文件并在编辑器中打开`);
    } catch (error) {
      setResult(elements.workspaceResult, error.message || "合并失败", true);
    }
  });

  elements.workspaceDownloadSelectedBtn?.addEventListener("click", () => {
    const files = appState.workspace.filter((file) => appState.selectedFileIds.has(file.id) && file.downloadUrl);
    if (!files.length) {
      setResult(elements.workspaceResult, "当前没有可下载的选中文件。", true);
      return;
    }
    files.forEach((file, index) => {
      window.setTimeout(() => triggerFileDownload(file), index * 180);
    });
    setResult(elements.workspaceResult, `已开始下载 ${files.length} 个文件。`);
  });

  elements.workspaceShareSelectedBtn?.addEventListener("click", async () => {
    const files = appState.workspace.filter((file) => appState.selectedFileIds.has(file.id) && file.kind === "pdf");
    if (!files.length) {
      setResult(elements.workspaceResult, "请选择要分享的 PDF 文件。", true);
      return;
    }
    for (const file of files) {
      try {
        await createShareForFile(file);
      } catch (error) {
        setResult(elements.workspaceResult, error.message || "分享创建失败", true);
      }
    }
  });

  elements.workspaceSelectAllVisibleBtn?.addEventListener("click", () => {
    appState.lastRenderedVisibleFiles.forEach((file) => appState.selectedFileIds.add(file.id));
    rerenderWorkspace();
  });

  elements.workspaceClearSelectionBtn?.addEventListener("click", () => {
    appState.selectedFileIds.clear();
    rerenderWorkspace();
  });

  elements.workspaceTrashSelectedBtn?.addEventListener("click", async () => {
    const files = appState.workspace.filter((file) => appState.selectedFileIds.has(file.id));
    if (!files.length) {
      setResult(elements.workspaceResult, "请先选择文件。", true);
      return;
    }
    if (!window.confirm(`确认把选中的 ${files.length} 个文件移到回收站吗？`)) return;
    await runBatchAction(files, "trash");
  });

  elements.workspaceBatchRenameToggleBtn?.addEventListener("click", () => {
    if (appState.currentView === "trash") {
      setResult(elements.workspaceResult, "回收站里的文件不能批量重命名。", true);
      return;
    }
    appState.batchRenameOpen = !appState.batchRenameOpen;
    renderBatchRenameState();
  });

  elements.workspaceBatchRenameResetBtn?.addEventListener("click", () => {
    clearBatchRenameForm();
    renderBatchRenameState();
  });

  elements.workspaceBatchRenameApplyBtn?.addEventListener("click", async () => {
    await applyBatchRename();
  });

  [
    elements.workspaceBatchPrefixInput,
    elements.workspaceBatchSuffixInput,
    elements.workspaceBatchFindInput,
    elements.workspaceBatchReplaceInput,
    elements.workspaceBatchFolderInput,
    elements.workspaceBatchSequenceEnabled,
    elements.workspaceBatchSequenceStart
  ].forEach((element) => {
    element?.addEventListener("input", renderBatchRenameState);
    element?.addEventListener("change", renderBatchRenameState);
  });

  elements.workspaceRestoreSelectedBtn?.addEventListener("click", async () => {
    const files = appState.workspace.filter((file) => appState.selectedFileIds.has(file.id));
    if (!files.length) {
      setResult(elements.workspaceResult, "请先选择文件。", true);
      return;
    }
    await runBatchAction(files, "restore");
  });

  elements.workspacePurgeSelectedBtn?.addEventListener("click", async () => {
    const files = appState.workspace.filter((file) => appState.selectedFileIds.has(file.id));
    if (!files.length) {
      setResult(elements.workspaceResult, "请先选择文件。", true);
      return;
    }
    if (!window.confirm(`确认彻底删除选中的 ${files.length} 个文件吗？此操作不可恢复。`)) return;
    await runBatchAction(files, "purge");
  });

  document.addEventListener("workspace:file-saved", async () => {
    await refreshWorkspace();
  });

  document.addEventListener("editor:exported", async () => {
    await syncSession();
  });

  elements.showForgotPassword?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showAuthSubsection({ appState, openPasswordAuth, syncAuthAutocompleteFields }, "forgot");
  });

  elements.backToLogin?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showAuthSubsection({ appState, openPasswordAuth, syncAuthAutocompleteFields }, "login");
  });

  elements.forgotSendCodeBtn?.addEventListener("click", async () => {
    const email = elements.forgotEmail?.value?.trim();
    if (!email) {
      setResult(elements.authResult, "请输入邮箱地址", true);
      return;
    }
    try {
      await requestJson("/api/auth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "password-reset" })
      });
      setResult(elements.authResult, "验证码已发送到您的邮箱");
      startCountdown(elements.forgotSendCodeBtn, 60, "发送验证码");
    } catch (error) {
      setResult(elements.authResult, error.message || "发送失败", true);
    }
  });

  elements.forgotPasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = elements.forgotEmail?.value?.trim();
    const code = elements.forgotCode?.value?.trim();
    const newPassword = elements.forgotNewPassword?.value;
    const confirmPassword = elements.forgotConfirmPassword?.value;

    if (!email || !code || !newPassword) {
      setResult(elements.authResult, "请填写完整信息", true);
      return;
    }
    if (newPassword !== confirmPassword) {
      setResult(elements.authResult, "两次输入的密码不一致", true);
      return;
    }
    if (newPassword.length < 6) {
      setResult(elements.authResult, "密码至少6位", true);
      return;
    }

    try {
      await requestJson("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword })
      });
      setResult(elements.authResult, "密码重置成功，请使用新密码登录");
      showAuthSubsection({ appState, openPasswordAuth, syncAuthAutocompleteFields }, "login");
      if (elements.loginPassword) {
        elements.loginPassword.value = "";
      }
    } catch (error) {
      setResult(elements.authResult, error.message || "重置失败", true);
    }
  });

  elements.changeEmailSendCodeBtn?.addEventListener("click", async () => {
    const newEmail = elements.newEmail?.value?.trim();
    if (!newEmail) {
      setResult(elements.authResult, "请输入新邮箱地址", true);
      return;
    }
    try {
      await requestJson("/api/auth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, type: "email-change" })
      });
      setResult(elements.authResult, "验证码已发送到您的新邮箱");
      startCountdown(elements.changeEmailSendCodeBtn, 60, "发送验证码");
    } catch (error) {
      setResult(elements.authResult, error.message || "发送失败", true);
    }
  });

  elements.changeEmailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!appState.user) {
      setResult(elements.authResult, "请先登录", true);
      return;
    }
    const newEmail = elements.newEmail?.value?.trim();
    const code = elements.changeEmailCode?.value?.trim();

    if (!newEmail || !code) {
      setResult(elements.authResult, "请填写完整信息", true);
      return;
    }

    try {
      await requestJson("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, code })
      });
      setResult(elements.authResult, "邮箱修改成功");
      elements.changeEmailForm?.reset();
      await syncSession();
    } catch (error) {
      setResult(elements.authResult, error.message || "修改失败", true);
    }
  });

  elements.changePasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!appState.user) {
      setResult(elements.authResult, "请先登录", true);
      return;
    }
    const currentPassword = elements.currentPassword?.value;
    const newPassword = elements.newPassword?.value;
    const confirmPassword = elements.confirmNewPassword?.value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setResult(elements.authResult, "请填写完整信息", true);
      return;
    }
    if (newPassword !== confirmPassword) {
      setResult(elements.authResult, "两次输入的密码不一致", true);
      return;
    }
    if (newPassword.length < 6) {
      setResult(elements.authResult, "密码至少6位", true);
      return;
    }

    try {
      await requestJson("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setResult(elements.authResult, "密码修改成功");
      elements.changePasswordForm?.reset();
    } catch (error) {
      setResult(elements.authResult, error.message || "修改失败", true);
    }
  });

  document.getElementById("showChangePasswordBtn")?.addEventListener("click", () => {
    window.showChangePasswordForm?.();
  });

  document.getElementById("showChangeEmailBtn")?.addEventListener("click", () => {
    window.showChangeEmailForm?.();
  });

  document.getElementById("showRedeemBtn")?.addEventListener("click", () => {
    window.showRedeemForm?.();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && appState.authPanelVisible) {
      toggleAuthPanel(false);
    }
  });

  elements.shareForm?.addEventListener("submit", handleShareSubmit);
  elements.shareCloseBtn?.addEventListener("click", () => elements.shareModal?.classList.add("hidden"));
  elements.shareModal?.addEventListener("click", (event) => {
    if (event.target === elements.shareModal) elements.shareModal.classList.add("hidden");
  });
  elements.shareAccessMode?.addEventListener("change", (event) => {
    elements.sharePasswordRow?.classList.toggle("hidden", event.target.value !== "password");
  });
  elements.shareDestroyAfterReading?.addEventListener("change", (event) => {
    const isChecked = event.target.checked;
    if (elements.shareMaxDownloads) {
      elements.shareMaxDownloads.disabled = isChecked;
      if (isChecked) {
        elements.shareMaxDownloads.value = "";
        elements.shareMaxDownloads.title = "阅后即焚模式下,下载次数限制无效";
      } else {
        elements.shareMaxDownloads.title = "";
      }
    }
  });

  let hasInitializedWorkspacePage = false;
  const initializeWorkspacePage = async () => {
    if (hasInitializedWorkspacePage) {
      return;
    }
    hasInitializedWorkspacePage = true;
    window.appState = appState;
    window.revealAuthPanel = revealAuthPanel;
    window.toggleAuthPanel = toggleAuthPanel;
    window.updateSignedInLayout = updateSignedInLayout;
    window.showPage = showPage;

    initSectionSpy();
    await syncSession();

    elements.redeemBtn?.addEventListener("click", () => {
      window.showRedeemForm?.();
    });

    document.getElementById("redeemForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const codeInput = document.getElementById("redeemCodeInput");
      const resultEl = document.getElementById("redeemResult");
      const code = codeInput?.value?.trim().toUpperCase();
      if (!code) {
        setResult(resultEl, "请输入兑换码", true);
        return;
      }
      try {
        const result = await requestJson("/api/workspace/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        });
        setResult(resultEl, result.message || "兑换成功！");
        codeInput.value = "";
        await loadAccount();
        window.setTimeout(() => {
          appState.authPanelVisible = false;
          document.getElementById("authPanel")?.classList.add("hidden");
        }, 1500);
      } catch (error) {
        setResult(resultEl, error.message || "兑换失败", true);
      }
    });
  };

  if (document.readyState === "complete") {
    void initializeWorkspacePage();
  } else {
    window.addEventListener("load", () => {
      void initializeWorkspacePage();
    }, { once: true });
  }
}
