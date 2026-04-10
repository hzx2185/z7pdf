import { requestJson, setResult as setElementResult, copyTextToClipboard, showToast } from "./common.js";

const elements = {
  appTitle: document.querySelector("#appTitle") || document.querySelector(".brand"),
  currentUserLabel: document.querySelector("#currentUserLabel"),
  accountHint: document.querySelector("#accountHint"),
  navMenuBtn: document.querySelector("#navMenuBtn"),
  topbarInner: document.querySelector(".topbar-inner"),
  topbarNavLinks: Array.from(document.querySelectorAll(".topbar-link")),
  memberCenterNav: document.querySelector("#memberCenterNav"),
  showLoginBtn: document.querySelector("#showLoginBtn"),
  showRegisterBtn: document.querySelector("#showRegisterBtn"),
  showLoginBtn2: document.querySelector("#showLoginBtn2"),
  showRegisterBtn2: document.querySelector("#showRegisterBtn2"),
  guestPolicyTitle: document.querySelector("#guestPolicyTitle"),
  guestPolicyHint: document.querySelector("#guestPolicyHint"),
  publicPlans: document.querySelector("#publicPlans"),
  authPanel: document.querySelector("#authPanel"),
  authPanelTitle: document.querySelector("#authPanelTitle"),
  workspacePanel: document.querySelector("#workspacePanel"),
  authResult: document.querySelector("#authResult"),
  workspaceResult: document.querySelector("#workspaceResult"),
  authForm: document.querySelector("#authForm"),
  passwordLoginForm: document.querySelector("#passwordLoginForm"),
  showPasswordLoginBtn: document.querySelector('[data-form="password"]'),
  showCodeLoginBtn: document.querySelector('[data-form="code"]'),
  authEmail: document.querySelector("#authEmail"),
  authCode: document.querySelector("#authCode"),
  authRegisterPassword: document.querySelector("#authRegisterPassword"),
  authRegisterPasswordField: document.querySelector("#authRegisterPasswordField"),
  sendCodeBtn: document.querySelector("#sendCodeBtn"),
  authSubmitBtn: document.querySelector("#authSubmitBtn"),
  authModeHint: document.querySelector("#authModeHint"),
  authEmailStatus: document.querySelector("#authEmailStatus"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  registerDisabledHint: document.querySelector("#registerDisabledHint"),
  authCloseBtn: document.querySelector("#authCloseBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  adminLink: document.querySelector("#adminLink"),
  // 忘记密码
  showForgotPassword: document.querySelector("#showForgotPassword"),
  forgotPasswordForm: document.querySelector("#forgotPasswordForm"),
  forgotEmail: document.querySelector("#forgotEmail"),
  forgotCode: document.querySelector("#forgotCode"),
  forgotNewPassword: document.querySelector("#forgotNewPassword"),
  forgotConfirmPassword: document.querySelector("#forgotConfirmPassword"),
  forgotSendCodeBtn: document.querySelector("#forgotSendCodeBtn"),
  backToLogin: document.querySelector("#backToLogin"),
  // 修改密码（已登录）
  changePasswordForm: document.querySelector("#changePasswordForm"),
  changePasswordUsername: document.querySelector("#changePasswordUsername"),
  currentPassword: document.querySelector("#currentPassword"),
  newPassword: document.querySelector("#newPassword"),
  confirmNewPassword: document.querySelector("#confirmNewPassword"),
  // 修改邮箱（已登录）
  changeEmailForm: document.querySelector("#changeEmailForm"),
  currentEmailDisplay: document.querySelector("#currentEmailDisplay"),
  newEmail: document.querySelector("#newEmail"),
  changeEmailCode: document.querySelector("#changeEmailCode"),
  changeEmailSendCodeBtn: document.querySelector("#changeEmailSendCodeBtn"),
  workspaceUploadInput: document.querySelector("#workspaceUploadInput"),
  workspaceFolderInput: document.querySelector("#workspaceFolderInput"),
  editorFileInput: document.querySelector("#editorFileInput"),
  guestEditUploadTrigger: document.querySelector("#guestEditUploadTrigger"),
  guestEditUploadTrigger2: document.querySelector("#guestEditUploadTrigger2"),
  memberWorkspaceUploadTrigger: document.querySelector("#memberWorkspaceUploadTrigger"),
  memberWorkspaceUploadTrigger2: document.querySelector("#memberWorkspaceUploadTrigger2"),
  saveOnlineBtn2: document.querySelector("#saveOnlineBtn2"),
  exportEditorBtn2: document.querySelector("#exportEditorBtn2"),
  workspaceFolderFilter: document.querySelector("#workspaceFolderFilter"),
  workspaceTreeScope: document.querySelector("#workspaceTreeScope"),
  workspaceOpenSelectedBtn: document.querySelector("#workspaceOpenSelectedBtn"),
  workspaceBatchBar: document.querySelector("#workspaceBatchBar"),
  workspaceSelectionSummary: document.querySelector("#workspaceSelectionSummary"),
  workspaceSelectionHint: document.querySelector("#workspaceSelectionHint"),
  workspaceSelectAllVisibleBtn: document.querySelector("#workspaceSelectAllVisibleBtn"),
  workspaceClearSelectionBtn: document.querySelector("#workspaceClearSelectionBtn"),
  workspaceMergeSelectedBtn: document.querySelector("#workspaceMergeSelectedBtn"),
  workspaceDownloadSelectedBtn: document.querySelector("#workspaceDownloadSelectedBtn"),
  workspaceShareSelectedBtn: document.querySelector("#workspaceShareSelectedBtn"),
  workspaceTrashSelectedBtn: document.querySelector("#workspaceTrashSelectedBtn"),
  workspaceRestoreSelectedBtn: document.querySelector("#workspaceRestoreSelectedBtn"),
  workspacePurgeSelectedBtn: document.querySelector("#workspacePurgeSelectedBtn"),
  workspaceBatchRenameToggleBtn: document.querySelector("#workspaceBatchRenameToggleBtn"),
  workspaceBatchRenamePanel: document.querySelector("#workspaceBatchRenamePanel"),
  workspaceBatchPrefixInput: document.querySelector("#workspaceBatchPrefixInput"),
  workspaceBatchSuffixInput: document.querySelector("#workspaceBatchSuffixInput"),
  workspaceBatchFindInput: document.querySelector("#workspaceBatchFindInput"),
  workspaceBatchReplaceInput: document.querySelector("#workspaceBatchReplaceInput"),
  workspaceBatchFolderInput: document.querySelector("#workspaceBatchFolderInput"),
  workspaceBatchSequenceEnabled: document.querySelector("#workspaceBatchSequenceEnabled"),
  workspaceBatchSequenceStart: document.querySelector("#workspaceBatchSequenceStart"),
  workspaceBatchRenameResetBtn: document.querySelector("#workspaceBatchRenameResetBtn"),
  workspaceBatchRenameApplyBtn: document.querySelector("#workspaceBatchRenameApplyBtn"),
  workspaceBatchRenameHint: document.querySelector("#workspaceBatchRenameHint"),
  workspaceListHead: document.querySelector("#workspaceListHead"),
  workspaceUsage: document.querySelector("#workspaceUsage"),
  workspaceFiles: document.querySelector("#workspaceFiles"),
  workspaceFilesEmpty: document.querySelector("#workspaceFilesEmpty"),
  workspaceFolderTree: document.querySelector("#workspaceFolderTree"),
  workspaceRootBtn: document.querySelector("#workspaceRootBtn"),
  workspaceToggleSidebarBtn: document.querySelector("#workspaceToggleSidebarBtn"),
  workspaceViewActiveBtn: document.querySelector("#workspaceViewActiveBtn"),
  workspaceViewTrashBtn: document.querySelector("#workspaceViewTrashBtn"),
  workspaceEmptyTrashBtn: document.querySelector("#workspaceEmptyTrashBtn"),
  workspaceTableModeBtn: document.querySelector("#workspaceTableModeBtn"),
  workspaceCardModeBtn: document.querySelector("#workspaceCardModeBtn"),
  workspaceSearchInput: document.querySelector("#workspaceSearchInput"),
  workspaceSortSelect: document.querySelector("#workspaceSortSelect"),
  workspaceHeadNameBtn: document.querySelector("#workspaceHeadNameBtn"),
  workspaceHeadDateBtn: document.querySelector("#workspaceHeadDateBtn"),
  workspaceShares: document.querySelector("#workspaceShares"),
  workspaceSharesEmpty: document.querySelector("#workspaceSharesEmpty"),
  workspaceMemberSummary: document.querySelector("#workspaceMemberSummary"),
  workspacePlanSummary: document.querySelector("#workspacePlanSummary"),
  workspacePlans: document.querySelector("#workspacePlans"),
  workspaceOrders: document.querySelector("#workspaceOrders"),
  workspaceTabOverviewBtn: document.querySelector("#workspaceTabOverviewBtn"),
  workspaceTabSharesBtn: document.querySelector("#workspaceTabSharesBtn"),
  workspaceTabPlanBtn: document.querySelector("#workspaceTabPlanBtn"),
  workspaceTabOverview: document.querySelector("#workspaceTabOverview"),
  workspaceTabShares: document.querySelector("#workspaceTabShares"),
  workspaceTabPlan: document.querySelector("#workspaceTabPlan"),
  workspacePagination: document.querySelector("#workspacePagination"),
  workspacePaginationInfo: document.querySelector("#workspacePaginationInfo"),
  workspacePaginationPages: document.querySelector("#workspacePaginationPages"),
  workspacePageSelect: document.querySelector("#workspacePageSelect"),
  // 兑换码
  redeemCodeInput: document.querySelector("#redeemCodeInput"),
  redeemBtn: document.querySelector("#redeemBtn"),
  redeemResult: document.querySelector("#redeemResult"),
  // 分享模态框
  shareModal: document.querySelector("#shareModal"),
  shareForm: document.querySelector("#shareForm"),
  shareCloseBtn: document.querySelector("#shareCloseBtn"),
  shareAccessMode: document.querySelector("#shareAccessMode"),
  sharePasswordRow: document.querySelector("#sharePasswordRow"),
  sharePassword: document.querySelector("#sharePassword"),
  shareMaxDownloads: document.querySelector("#shareMaxDownloads"),
  shareExpiresAt: document.querySelector("#shareExpiresAt"),
  shareDestroyAfterReading: document.querySelector("#shareDestroyAfterReading"),
  guestDailyExportsItems: document.querySelectorAll(".guestDailyExportsDisplay")
};

const appState = {
  user: null,
  entitlements: null,
  guestEntitlements: null,
  guestUsage: null,
  allowRegistration: true,
  smtpConfigured: false,
  guestPlan: "member",
  guestDailyExports: 1,
  authPanelVisible: false,
  authView: "password",
  codeFlowExistingUser: null,
  authEmailLookupToken: 0,
  workspaceSideTab: "overview",
  workspaceSidebarCollapsed: false,
  workspaceSearchQuery: "",
  workspaceSort: "newest",
  workspaceDisplayMode: "table",
  workspace: [],
  folders: [],
  folderTree: [],
  shares: [],
  plans: [],
  orders: [],
  subscriptions: [],
  batchRenameOpen: false,
  selectedFileIds: new Set(),
  activeFolder: "",
  includeChildren: false,
  currentView: "active",
  sharingFile: null,
  workspacePage: 1,
  workspacePageSize: 20,
  workspaceTotalPages: 1
};

let lastRenderedVisibleFiles = [];

function setResult(target, message, isError = false) {
  if (target) {
    setElementResult(target, message, isError, { visibleClass: "is-visible" });
  } else if (message) {
    showToast(message, isError);
  }
}

function syncAuthAutocompleteFields() {
  if (elements.changePasswordUsername) {
    elements.changePasswordUsername.value = appState.user?.email || "";
  }
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatMoney(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

function formatBillingInterval(interval) {
  const value = String(interval || "").trim().toLowerCase();
  const labels = {
    daily: "天",
    weekly: "周",
    monthly: "月",
    yearly: "年"
  };
  return labels[value] || (interval || "周期");
}

function formatOrderStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  const labels = {
    pending: "待审核",
    paid: "已支付",
    cancelled: "已取消",
    failed: "失败"
  };
  return labels[value] || (status || "未设置");
}

function formatPaymentMethod(method) {
  const value = String(method || "").trim().toLowerCase();
  const labels = {
    manual: "人工处理",
    offline: "线下支付",
    bank: "银行转账",
    alipay: "支付宝",
    wechat: "微信支付",
    paypal: "PayPal",
    stripe: "Stripe"
  };
  return labels[value] || (method || "未设置");
}

function formatPlanLabel(planCode) {
  const code = String(planCode || "").trim();
  const matchedPlan = appState.plans.find((plan) => String(plan.code || "") === code);
  if (matchedPlan?.name) {
    return matchedPlan.name;
  }
  const labels = {
    member: "会员版",
    pro: "专业版",
    team: "团队版",
    enterprise: "企业版",
    guest: "游客版"
  };
  return labels[code] || code || "未设置";
}

function formatDateTime(value) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return "未设置";
  }
  return time.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

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
      const previewName = renameTouchesNames ? buildBatchRenamePreviewName(selectedFiles[0], 0, options) : selectedFiles[0].originalName;
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

function getCurrentSubscription() {
  if (!Array.isArray(appState.subscriptions) || !appState.subscriptions.length || !appState.entitlements) {
    return null;
  }
  const currentCode = String(appState.entitlements.code || "");
  const activeSubscriptions = appState.subscriptions.filter((subscription) => {
    return subscription.status === "active" && String(subscription.planCode || "") === currentCode;
  });
  activeSubscriptions.sort((left, right) => {
    return new Date(right.periodEnd || 0).getTime() - new Date(left.periodEnd || 0).getTime();
  });
  return activeSubscriptions[0] || null;
}

function getSubscriptionExpiryText() {
  const currentSubscription = getCurrentSubscription();
  return currentSubscription?.periodEnd ? formatDateTime(currentSubscription.periodEnd) : "永久有效";
}

function buildGuestUsageText() {
  const usage = appState.guestUsage;
  const plan = appState.guestEntitlements;
  if (!usage || !plan) {
    return "游客可直接在首页打开编辑台试用。";
  }
  if (Number(usage.limit || 0) < 1) {
    return `当前未开放游客免费导出，游客能力按 ${plan.name} 展示。`;
  }
  return `当前按 ${plan.name} 能力开放，今日已用 ${usage.used}/${usage.limit} 次，剩余 ${usage.remaining} 次。`;
}

function updateAuthModeHint() {
  if (!elements.authModeHint) return;
  if (!appState.smtpConfigured) {
    elements.authModeHint.textContent = "后台尚未配置邮箱发信参数，当前仅可使用密码登录。";
    return;
  }
  if (appState.codeFlowExistingUser === true) {
    elements.authModeHint.textContent = "该邮箱已注册，可直接输入验证码登录。验证码有效期 10 分钟。";
    return;
  }
  if (appState.codeFlowExistingUser === false) {
    elements.authModeHint.textContent = appState.allowRegistration
      ? "该邮箱尚未注册，请同时填写注册密码和验证码，验证成功后完成注册。"
      : "该邮箱尚未注册，且当前站点已关闭新用户注册。";
    return;
  }
  elements.authModeHint.textContent = appState.allowRegistration
    ? "已注册邮箱可直接用验证码登录；未注册邮箱需要同时填写注册密码，验证成功后才会创建账号。"
    : "当前站点已关闭新用户注册，仅已存在账号可继续通过验证码登录。";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function updateAuthEmailStatus(message = "", isError = false) {
  if (!elements.authEmailStatus) return;
  elements.authEmailStatus.textContent = message;
  elements.authEmailStatus.classList.toggle("error", Boolean(isError));
}

function updateAuthPanels() {
  const isPasswordView = appState.authView === "password";
  elements.passwordLoginForm?.classList.toggle("hidden", !isPasswordView);
  elements.authForm?.classList.toggle("hidden", isPasswordView);
  elements.showPasswordLoginBtn?.classList.toggle("active", isPasswordView);
  elements.showCodeLoginBtn?.classList.toggle("active", !isPasswordView);
  if (elements.sendCodeBtn) {
    elements.sendCodeBtn.disabled = !appState.smtpConfigured;
    elements.sendCodeBtn.textContent = appState.codeFlowExistingUser === false ? "发送注册验证码" : appState.codeFlowExistingUser === true ? "发送登录验证码" : "发送验证码";
  }
  if (elements.authRegisterPassword) {
    elements.authRegisterPassword.required = appState.codeFlowExistingUser === false && appState.allowRegistration;
  }
  if (elements.authRegisterPasswordField) {
    const shouldShowPasswordField = appState.codeFlowExistingUser !== true;
    elements.authRegisterPasswordField.classList.toggle("hidden", !shouldShowPasswordField);
    elements.authRegisterPasswordField.classList.toggle("field-strong", appState.codeFlowExistingUser === false && appState.allowRegistration);
  }
  if (elements.authSubmitBtn) {
    elements.authSubmitBtn.textContent = appState.codeFlowExistingUser === false ? "验证并注册" : appState.codeFlowExistingUser === true ? "验证码登录" : "继续";
  }
}

function updateSignedInLayout() {
  const signedIn = Boolean(appState.user);
  const user = appState.user;
  const authButtons = [
    elements.showLoginBtn,
    elements.showRegisterBtn,
    elements.showLoginBtn2,
    elements.showRegisterBtn2
  ];

  authButtons.forEach((button) => {
    button?.classList.toggle("hidden", signedIn);
  });

  // 更新顶部右侧用户区域
  const headerUser = document.getElementById("headerUser");
  const headerActions = document.getElementById("headerActions");
  const headerUserEmail = document.getElementById("headerUserEmail");
  const logoutBtn = document.getElementById("logoutBtn");
  const logoutBtn2 = document.getElementById("logoutBtn2");

  if (headerActions && headerUser) {
    headerActions.classList.toggle("hidden", signedIn);
    headerUser.classList.toggle("hidden", !signedIn);
  }

  if (headerUserEmail && user) {
    headerUserEmail.textContent = user.email;
  }

  // 显示/隐藏会员面板
  const memberInfoPanel = document.getElementById("memberInfoPanel");
  if (memberInfoPanel) {
    memberInfoPanel.classList.toggle("hidden", !signedIn);
  }

  // 工作台默认优先显示"我的文件"
  switchToFilesTab();

  [logoutBtn, logoutBtn2].forEach((button) => {
    if (button) {
      button.onclick = handleLegacyLogoutClick;
    }
  });

  // 登录后自动切换到工作台
  if (signedIn && typeof showPage === 'function') {
    showPage('workbench');
  }
}

function switchToFilesTab() {
  // 切换到"文件"面板
  document.querySelectorAll('.workspace-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.workspace-tabs .tab-btn[data-workspace-tab="files"]')?.classList.add('active');
  document.querySelectorAll('.workspace-panel').forEach(p => p.classList.add('hidden'));
  document.querySelector('.workspace-panel[data-panel="files"]')?.classList.remove('hidden');
}

window.switchToFilesTab = switchToFilesTab;

function updateWorkspaceSidePanels() {
  const tabs = [
    ["overview", elements.workspaceTabOverviewBtn, elements.workspaceTabOverview],
    ["shares", elements.workspaceTabSharesBtn, elements.workspaceTabShares],
    ["plan", elements.workspaceTabPlanBtn, elements.workspaceTabPlan]
  ];
  tabs.forEach(([name, button, panel]) => {
    button?.classList.toggle("active", appState.workspaceSideTab === name);
    panel?.classList.toggle("hidden", appState.workspaceSideTab !== name);
  });
}

function updateWorkspaceSidebarLayout() {
  document.querySelectorAll("#workspacePanel .workspace-sidebar").forEach((panel, index) => {
    if (index === 0) {
      panel.classList.toggle("collapsed", appState.workspaceSidebarCollapsed);
    }
  });
  if (elements.workspaceToggleSidebarBtn) {
    elements.workspaceToggleSidebarBtn.textContent = appState.workspaceSidebarCollapsed ? "展开" : "收起";
  }
}

function applyWorkspaceDisplayMode() {
  elements.workspaceFiles?.classList.toggle("workspace-files-card-mode", appState.workspaceDisplayMode === "card");
  elements.workspaceListHead?.classList.toggle("hidden", appState.workspaceDisplayMode !== "table" || lastRenderedVisibleFiles.length === 0);
  elements.workspaceTableModeBtn?.classList.toggle("active", appState.workspaceDisplayMode === "table");
  elements.workspaceCardModeBtn?.classList.toggle("active", appState.workspaceDisplayMode === "card");
}

function toggleAuthPanel(visible) {
  if (appState.user) {
    appState.authPanelVisible = false;
    elements.authPanel?.classList.add("hidden");
    return;
  }
  appState.authPanelVisible = Boolean(visible);
  elements.authPanel?.classList.toggle("hidden", !appState.authPanelVisible);
}

function revealAuthPanel() {
  toggleAuthPanel(true);
  if (!appState.user) {
    setResult(elements.authResult, "");
    resetCodeFlowState();
  }
  const target = appState.authView === "code" ? elements.authEmail : elements.loginEmail;
  window.setTimeout(() => target?.focus(), 180);
  setTopbarMenuOpen(false);
}

function setAuthView(view = "password") {
  appState.authView = view === "code" ? "code" : "password";
  updateAuthPanels();
}

function resetCodeFlowState() {
  appState.codeFlowExistingUser = null;
  appState.authEmailLookupToken += 1;
  if (elements.authRegisterPassword) {
    elements.authRegisterPassword.required = false;
  }
  updateAuthEmailStatus(appState.smtpConfigured ? "先输入邮箱，我们会自动判断是登录还是注册。" : "后台尚未配置邮箱发信参数，当前仅可使用密码登录。");
  updateAuthModeHint();
  updateAuthPanels();
}

async function detectAuthEmailState() {
  const email = String(elements.authEmail?.value || "").trim().toLowerCase();
  const requestToken = ++appState.authEmailLookupToken;

  if (!appState.smtpConfigured) {
    updateAuthEmailStatus("后台尚未配置邮箱发信参数，当前仅可使用密码登录。", true);
    return;
  }
  if (!email) {
    resetCodeFlowState();
    return;
  }
  if (!isValidEmail(email)) {
    appState.codeFlowExistingUser = null;
    updateAuthPanels();
    updateAuthModeHint();
    updateAuthEmailStatus("请输入正确的邮箱格式。", true);
    return;
  }

  updateAuthEmailStatus("正在检查邮箱状态...");
  try {
    const data = await requestJson("/api/auth/email-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    if (requestToken !== appState.authEmailLookupToken) return;
    appState.codeFlowExistingUser = Boolean(data.existingUser);
    updateAuthModeHint();
    updateAuthPanels();
    if (data.existingUser) {
      updateAuthEmailStatus("检测到这是已注册邮箱，可直接收验证码登录。");
    } else if (data.allowRegistration) {
      updateAuthEmailStatus("检测到这是新邮箱，发送验证码后填写注册密码即可完成注册。");
    } else {
      updateAuthEmailStatus("该邮箱尚未注册，且当前站点已关闭新用户注册。", true);
    }
  } catch (error) {
    if (requestToken !== appState.authEmailLookupToken) return;
    appState.codeFlowExistingUser = null;
    updateAuthPanels();
    updateAuthModeHint();
    updateAuthEmailStatus(error.message || "邮箱状态检查失败。", true);
  }
}

function setTopbarMenuOpen(isOpen) {
  elements.topbarInner?.classList.toggle("menu-open", Boolean(isOpen));
  if (elements.navMenuBtn) {
    elements.navMenuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
}

async function logoutAndReset() {
  await requestJson("/api/auth/logout", { method: "POST" });
  appState.user = null;
  appState.entitlements = null;
  appState.authPanelVisible = false;
  appState.workspace = [];
  appState.selectedFileIds.clear();
  await syncSession();
}

function showPostLogoutPage() {
  if (typeof showPage === "function") {
    showPage("features");
  }
}

function toggleHidden(elementsToToggle, hidden) {
  elementsToToggle.forEach((element) => {
    element?.classList.toggle("hidden", hidden);
  });
}

function setDisabled(elementsToToggle, disabled) {
  elementsToToggle.forEach((element) => {
    if (element) {
      element.disabled = disabled;
    }
  });
}

function openPasswordAuth(message = "") {
  setAuthView("password");
  revealAuthPanel();
  setResult(elements.authResult, message, Boolean(message));
}

function openRegisterAuth() {
  if (!appState.allowRegistration) {
    openPasswordAuth("当前站点暂未开放新用户注册，请先使用已有账号登录。");
    return;
  }
  setAuthView("code");
  revealAuthPanel();
}

async function handleLegacyLogoutClick() {
  await logoutAndReset();
  loadAccount();
  showPostLogoutPage();
}

function initSectionSpy() {
  if (!elements.topbarNavLinks.length) return;
  const sections = elements.topbarNavLinks
    .map((link) => {
      const href = link.getAttribute("href");
      if (!href?.startsWith("#")) return null;
      const section = document.querySelector(href);
      return section ? { link, section, href } : null;
    })
    .filter(Boolean);

  if (!sections.length) return;

  const activateLink = (href) => {
    sections.forEach(({ link }) => {
      link.classList.toggle("active", link.getAttribute("href") === href);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const current = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (current?.target?.id) {
        activateLink(`#${current.target.id}`);
      }
    },
    {
      rootMargin: "-18% 0px -58% 0px",
      threshold: [0.2, 0.45, 0.7]
    }
  );

  sections.forEach(({ section, link, href }) => {
    observer.observe(section);
    link.addEventListener("click", () => {
      activateLink(href);
      setTopbarMenuOpen(false);
    });
  });

  activateLink("#top");
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

function updateAuthView() {
  const user = appState.user;
  if (elements.currentUserLabel) {
    elements.currentUserLabel.textContent = user ? `当前账号：${user.email}` : "未登录";
  }
  if (user && appState.entitlements) {
    if (elements.accountHint) {
      elements.accountHint.textContent = "";
      elements.accountHint.classList.add("hidden");
    }
  } else {
    if (elements.accountHint) {
      elements.accountHint.textContent = "登录后可在线保存，并进入个人空间继续处理文件。";
      elements.accountHint.classList.remove("hidden");
    }
  }

  elements.guestEditUploadTrigger?.classList.toggle("hidden", Boolean(user));
  elements.guestEditUploadTrigger2?.classList.toggle("hidden", Boolean(user));
  elements.exportEditorBtn2?.classList.toggle("hidden", Boolean(user));
  elements.memberWorkspaceUploadTrigger?.classList.toggle("hidden", !Boolean(user));
  elements.memberWorkspaceUploadTrigger2?.classList.toggle("hidden", !Boolean(user));
  elements.saveOnlineBtn2?.classList.toggle("hidden", !Boolean(user));
  elements.workspaceFolderInput?.classList.toggle("hidden", !Boolean(user));

  if (elements.workspaceFolderInput) {
    elements.workspaceFolderInput.placeholder = user ? "保存到空间（可选目录）" : "保存到本地";
  }

  if (elements.guestPolicyTitle) {
    elements.guestPolicyTitle.textContent = user
      ? `当前账号为 ${appState.entitlements?.name || "会员"}`
      : "游客试用额度";
  }
  if (elements.guestPolicyHint) {
    elements.guestPolicyHint.textContent = user
      ? `你当前使用的是 ${appState.entitlements?.name || "会员套餐"}，下方仍可查看全部套餐权益。`
      : buildGuestUsageText();
  }
  if (user) {
    appState.authPanelVisible = false;
  }
  elements.authPanel?.classList.toggle("hidden", user ? true : !appState.authPanelVisible);
  elements.workspacePanel?.classList.toggle("hidden", !user);
  elements.logoutBtn?.classList.toggle("hidden", !user);
  elements.adminLink?.classList.toggle("hidden", !user || user.role !== "admin");
  toggleHidden(
    [
      elements.showLoginBtn,
      elements.showRegisterBtn,
      elements.showLoginBtn2,
      elements.showRegisterBtn2
    ],
    Boolean(user)
  );
  setDisabled(
    [
      elements.showRegisterBtn,
      elements.showRegisterBtn2
    ],
    !appState.allowRegistration
  );
  elements.registerDisabledHint?.classList.toggle("hidden", appState.allowRegistration);
  updateSignedInLayout();
  updateAuthModeHint();
  updateAuthPanels();
  updateWorkspaceSidebarLayout();
  window.Z7PdfEditor?.setCurrentUser(user);
}

function renderPublicPlans() {
  if (!elements.publicPlans) return;
  elements.publicPlans.innerHTML = "";
  const activeCode = appState.user
    ? appState.entitlements?.code
    : appState.guestEntitlements?.code || appState.guestPlan;
  const plans = appState.plans || [];
  if (plans.length === 0) {
    elements.publicPlans.innerHTML = '<p class="helper-text">套餐信息加载中...</p>';
    return;
  }

  const orderedMemberPlans = ["member", "pro", "team"]
    .map((code) => plans.find((plan) => plan.code === code))
    .filter(Boolean);
  const displayPlans = [
    {
      code: "guest",
      name: "普通游客",
      description: `未注册也可直接试用，当前每日可免费导出 ${appState.guestDailyExports} 次。`,
      priceCents: 0,
      billingInterval: "daily",
      storageQuotaMb: 0,
      maxFiles: 0,
      maxShareLinks: 0,
      allowCompression: Boolean(appState.guestEntitlements?.allowCompression),
      allowSplit: Boolean(appState.guestEntitlements?.allowSplit),
      allowSecurity: Boolean(appState.guestEntitlements?.allowSecurity),
      allowOnlineSave: false,
      allowHistory: false,
      isGuest: true
    },
    ...orderedMemberPlans
  ];

  const getBadge = (plan) => {
    if (plan.isGuest) {
      return appState.user ? "游客模式" : "默认试用";
    }
    return appState.user
      ? (plan.code === activeCode ? "当前套餐" : "可升级")
      : "会员方案";
  };

  const getActionButton = (plan) => {
    if (plan.isGuest || plan.code === activeCode) return "";
    return '<button class="btn btn-sm btn-primary subscribe-btn plan-redeem-btn" data-plan="' + plan.code + '">兑换会员</button>';
  };

  const supportChip = (value) => value
    ? '<span class="support-chip is-on">✓</span>'
    : '<span class="support-chip is-off">✗</span>';
  const quotaSummary = (plan) => plan.storageQuotaMb > 0
    ? `${plan.storageQuotaMb} MB · ${plan.maxFiles} 文件 · ${plan.maxShareLinks} 分享`
    : "无空间";
  const rows = [
    ["空间大小", (plan) => plan.storageQuotaMb > 0 ? `${plan.storageQuotaMb} MB` : "无"],
    ["文件数", (plan) => plan.maxFiles > 0 ? `${plan.maxFiles} 个` : "无"],
    ["分享链接", (plan) => plan.maxShareLinks > 0 ? `${plan.maxShareLinks} 个` : "无"],
    ["在线保存", (plan) => supportChip(Boolean(plan.allowOnlineSave ?? plan.maxFiles > 0))],
    ["历史记录", (plan) => supportChip(Boolean(plan.allowHistory ?? plan.maxFiles > 0))],
    ["页面编辑", () => supportChip(true)],
    ["压缩功能", (plan) => supportChip(Boolean(plan.allowCompression))],
    ["水印页码", () => supportChip(true)],
    ["拆分加密", (plan) => supportChip(Boolean(plan.allowSplit || plan.allowSecurity))]
  ];

  const table = document.createElement("div");
  table.className = "table-wrap";
  table.innerHTML = `
    <table class="compare-table compare-table-plans">
      <thead>
        <tr>
          <th>对比项</th>
          ${displayPlans.map((plan) => `
          <th class="${plan.code === activeCode || (plan.isGuest && !appState.user) ? "is-active" : ""}">
              <div class="compare-plan-head">
                <span class="plan-badge">${getBadge(plan)}</span>
                <strong>${plan.name}</strong>
                <div class="compare-plan-meta">
                  <span class="compare-price">${plan.isGuest ? "免费" : formatMoney(plan.priceCents)}</span>
                  <span class="compare-sub">${plan.isGuest ? "" : `/${formatBillingInterval(plan.billingInterval)}`}</span>
                </div>
                ${getActionButton(plan)}
              </div>
            </th>
          `).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows.map(([label, render]) => `
          <tr>
            <td>${label}</td>
            ${displayPlans.map((plan) => `
              <td class="${plan.code === activeCode || (plan.isGuest && !appState.user) ? "is-active" : ""}">${render(plan)}</td>
            `).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  elements.publicPlans.appendChild(table);
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
  // 阅后即焚模式下,忽略下载次数限制
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
  
  // 点击文件名打开编辑
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

function renderWorkspace(files = [], folders = [], folderTree = [], shares = [], usedBytes = 0, quotaBytes = 0) {
  appState.workspace = files;
  appState.folders = folders;
  appState.folderTree = folderTree;
  appState.shares = shares;
  elements.workspaceUsage.textContent = `已用 ${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)}`;
  elements.workspaceUsage.dataset.usedBytes = String(usedBytes || 0);
  elements.workspaceUsage.dataset.quotaBytes = String(quotaBytes || 0);
  updateSortControls();
  renderFolderFilter();
  renderFolderTree();
  renderShares();
  updateWorkspaceSidePanels();
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

  lastRenderedVisibleFiles = visibleFiles;

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
    applyWorkspaceDisplayMode();
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
  applyWorkspaceDisplayMode();
  renderBatchRenameState();
}

function renderPagination() {
  if (!elements.workspacePagination) return;
  const { workspacePage, workspaceTotalPages } = appState;

  const pageSelect = elements.workspacePageSelect;
  if (pageSelect) {
    pageSelect.innerHTML = "";
    for (let i = 1; i <= workspaceTotalPages; i++) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = `${i} / ${workspaceTotalPages}`;
      if (i === workspacePage) option.selected = true;
      pageSelect.appendChild(option);
    }
  }
}

function goToPage(page) {
  appState.workspacePage = page;
  renderWorkspace(
    appState.workspace,
    appState.folders,
    appState.folderTree,
    appState.shares,
    Number(elements.workspaceUsage?.dataset.usedBytes || 0),
    Number(elements.workspaceUsage?.dataset.quotaBytes || 0)
  );
}

function renderShares() {
  elements.workspaceShares.innerHTML = "";
  elements.workspaceSharesEmpty.classList.toggle("hidden", appState.shares.length > 0);
  appState.shares.forEach((share) => {
    const item = document.createElement("article");
    item.className = "share-item";
    const fullUrl = new URL(share.shareUrl, window.location.origin).toString();
    
    // 构建状态信息
    const statusParts = [];
    if (share.destroyAfterReading) statusParts.push("阅后即焚");
    if (!share.expiresAt) statusParts.push("永不过期");
    else {
      const expireDate = new Date(share.expiresAt);
      if (expireDate > new Date()) {
        const days = Math.ceil((expireDate - new Date()) / (1000 * 60 * 60 * 24));
        statusParts.push(`${days}天后到期`);
      } else {
        statusParts.push("已过期");
      }
    }
    if (!share.enabled) statusParts.push("已停用");
    
    // 下载信息
    const downloadInfo = `下载 ${share.downloadCount}${share.maxDownloads ? `/${share.maxDownloads}` : ""}`;
    
    // 状态行:移除已停用,添加下载信息
    const displayStatusParts = statusParts.filter(p => p !== "已停用");
    const statusLine = displayStatusParts.length > 0 
      ? `${displayStatusParts.join(" · ")} · ${downloadInfo}` 
      : downloadInfo;
    
    item.innerHTML = `
      <div class="share-header">
        <strong class="share-filename" style="cursor:pointer;" title="点击打开">${share.fileName || "分享文件"}</strong>
      </div>
      <div class="share-status">${statusLine}</div>
    `;
    
    // 点击文件名打开
    const filenameEl = item.querySelector(".share-filename");
    filenameEl.addEventListener("click", () => {
      window.open(fullUrl, "_blank", "noreferrer");
    });
    
    // 操作按钮
    const actions = document.createElement("div");
    actions.className = "workspace-file-actions";
    
    // 复制链接图标按钮 (兼容非 HTTPS 环境)
    actions.appendChild(createActionButton("📋", "ghost-button", async () => {
      try {
        // 优先使用 Clipboard API,失败则使用降级方案
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(fullUrl);
        } else {
          // 降级方案:使用 textarea + execCommand
          const textarea = document.createElement("textarea");
          textarea.value = fullUrl;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
        setResult(elements.workspaceResult, "链接已复制");
      } catch (error) {
        // 最后的降级方案:提示用户手动复制
        prompt("复制以下链接:", fullUrl);
      }
    }, "复制链接"));
    
    // 启用/停用状态图标
    if (share.enabled) {
      // 启用状态:显示停用按钮
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
      // 已停用状态:显示灰色禁用图标
      const disabledIcon = document.createElement("span");
      disabledIcon.textContent = "⏸️";
      disabledIcon.className = "ghost-button share-disabled-icon";
      disabledIcon.title = "已停用";
      actions.appendChild(disabledIcon);
    }
    
    // 删除按钮 (始终显示)
    actions.appendChild(createActionButton("🗑️", "ghost-button ghost-danger", async () => {
      // 检查是否已停用
      if (share.enabled) {
        alert("请先停用分享再删除");
        return;
      }
      if (!confirm("确定要删除这个分享吗?")) return;
      try {
        await requestJson(`/api/workspace/shares/${share.id}/permanent`, { method: "DELETE" });
        setResult(elements.workspaceResult, "已删除");
        // 只刷新分享数据,不刷新整个工作区
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

function renderPlans() {
  if (!elements.workspacePlans || !elements.workspaceOrders || !elements.workspacePlanSummary) {
    return;
  }
  elements.workspacePlans.innerHTML = "";
  elements.workspaceOrders.innerHTML = "";

  if (!appState.entitlements) {
    if (elements.workspaceMemberSummary) {
      elements.workspaceMemberSummary.textContent = "登录后显示会员信息。";
    }
    elements.workspacePlanSummary.textContent = "";
    elements.workspacePlanSummary.classList.add("hidden");
    return;
  }

  if (elements.workspaceMemberSummary) {
    const pendingCount = appState.orders.filter((order) => order.status === "pending").length;
    const usedBytes = Number(elements.workspaceUsage?.dataset.usedBytes || 0);
    const quotaBytes = Number(elements.workspaceUsage?.dataset.quotaBytes || 0);
    const subscriptionExpiresText = getSubscriptionExpiryText();
    elements.workspaceMemberSummary.innerHTML = `
      <div class="member-overview-compact">
        <div class="member-overview-row"><strong>空间：</strong>${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)}</div>
        <div class="member-overview-row"><strong>文件：</strong>${appState.workspace.length}/${appState.entitlements.maxFiles}</div>
        <div class="member-overview-row"><strong>分享：</strong>${appState.shares.length}/${appState.entitlements.maxShareLinks}</div>
        <div class="member-overview-row"><strong>套餐：</strong>${appState.entitlements.name}</div>
        <div class="member-overview-row"><strong>订单：</strong>${pendingCount} 个</div>
        <div class="member-overview-row member-overview-expiry"><strong>到期：</strong>${subscriptionExpiresText}</div>
      </div>
    `;
  }

  elements.workspacePlanSummary.innerHTML = "";
  elements.workspacePlanSummary.classList.add("hidden");

  appState.plans.forEach((plan) => {
    const isCurrent = plan.code === appState.entitlements.code;
    const card = document.createElement("article");
    card.className = `plan-card${isCurrent ? " active" : ""}`;
    card.innerHTML = `
      <strong class="plan-card-title">${plan.name}${isCurrent ? "（当前）" : ""}</strong>
      <span class="plan-card-detail">${plan.description || ""}</span>
      <span class="plan-card-meta">${formatMoney(plan.priceCents)} / ${formatBillingInterval(plan.billingInterval)}</span>
      <span class="plan-card-detail">空间 ${plan.storageQuotaMb} MB</span>
      <span class="plan-card-detail">文件上限 ${plan.maxFiles}</span>
      <span class="plan-card-detail">分享上限 ${plan.maxShareLinks}</span>
      <span class="plan-card-detail">压缩 ${plan.allowCompression ? "支持" : "不支持"} / 拆分 ${plan.allowSplit ? "支持" : "不支持"} / 加密 ${plan.allowSecurity ? "支持" : "不支持"}</span>
    `;
    if (!isCurrent) {
      card.appendChild(createActionButton("兑换会员", "btn btn-primary btn-sm", async () => {
        window.showRedeemForm?.();
      }));
    }
    elements.workspacePlans.appendChild(card);
  });

  // 只显示最近的3条订单
  appState.orders.slice(0, 3).forEach((order) => {
    const item = document.createElement("article");
    item.className = "order-item";
    item.innerHTML = `
      <strong>订单 #${order.id}</strong>
      <span>${formatPlanLabel(order.planCode)} / ${formatMoney(order.amountCents)} / ${formatPaymentMethod(order.paymentMethod)}</span>
      <span>状态：${formatOrderStatus(order.status)}</span>
    `;
    elements.workspaceOrders.appendChild(item);
  });
}

async function refreshWorkspace() {
  if (!appState.user) return;
  try {
    const params = new URLSearchParams();
    if (appState.activeFolder) params.set("folderPath", appState.activeFolder);
    if (appState.includeChildren) params.set("scope", "tree");
    if (appState.currentView === "trash") params.set("view", "trash");
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await requestJson(`/api/workspace/files${query}`);
    appState.entitlements = data.entitlements || appState.entitlements;
    renderWorkspace(
      data.files || [],
      data.folders || [],
      data.folderTree || [],
      data.shares || [],
      data.usedBytes || 0,
      data.quotaBytes || 0
    );
    renderPlans();
  } catch (error) {
    setResult(elements.workspaceResult, error.message || "空间加载失败", true);
  }
}

async function loadAccount() {
  if (!appState.user) return;
  const data = await requestJson("/api/workspace/account");
  appState.entitlements = data.entitlements || null;
  appState.plans = data.plans || [];
  appState.orders = data.orders || [];
  appState.subscriptions = data.subscriptions || [];
  syncAuthAutocompleteFields();
  updateAuthView();
  renderPublicPlans();
  renderPlans();
}

async function syncSession() {
  try {
    const [config, me] = await Promise.all([requestJson("/api/public-config"), requestJson("/api/auth/me")]);
    appState.allowRegistration = Boolean(config.allowRegistration);
    appState.smtpConfigured = Boolean(config.smtpConfigured);
    appState.plans = config.plans || [];
    appState.guestPlan = config.guestPlan || "member";
    appState.guestDailyExports = Number(config.guestDailyExports || 0);
    if (elements.guestDailyExportsItems) {
      elements.guestDailyExportsItems.forEach(el => el.textContent = appState.guestDailyExports);
    }
    appState.guestEntitlements = me.guestEntitlements || config.guestEntitlements || null;
    appState.guestUsage = me.guestUsage || config.guestUsage || null;
    if (elements.appTitle) {
      elements.appTitle.textContent = config.appName || "Z7 PDF 工作台";
    }
    document.title = config.appName || "Z7 PDF 工作台";
    appState.user = me.user || null;
    appState.entitlements = me.entitlements || null;
    syncAuthAutocompleteFields();
    if (!appState.smtpConfigured && appState.authView === "code") {
      appState.authView = "password";
    }
    updateAuthView();
    renderPublicPlans();
    if (appState.user) {
      await loadAccount();
      await refreshWorkspace();
    }
  } catch (error) {
    setResult(elements.authResult, error.message || "初始化失败", true);
  }
}

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
      body: JSON.stringify({
        email,
        code,
        password
      })
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
  elements.authRegisterPasswordField.classList.toggle("field-strong", appState.codeFlowExistingUser === false && appState.allowRegistration && !isStrongEnough);
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
  revealAuthPanel();
  setResult(elements.authResult, "登录后可进入会员中心，查看个人空间、分享记录和套餐信息。");
  setTopbarMenuOpen(false);
});

elements.guestEditUploadTrigger2?.addEventListener("click", () => elements.editorFileInput?.click());
  elements.memberWorkspaceUploadTrigger2?.addEventListener("click", () => elements.workspaceUploadInput?.click());
  elements.workspaceUploadInput?.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  try {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    formData.append("folderPath", String(elements.workspaceFolderInput?.value || "").trim());
    await requestJson("/api/workspace/upload", {
      method: "POST",
      body: formData
    });
    setResult(elements.workspaceResult, `已上传 ${files.length} 个文件到会员空间。`);
    event.target.value = "";
    await refreshWorkspace();
    // 上传成功后切换到文件标签页
    switchToFilesTab();
  } catch (error) {
    setResult(elements.workspaceResult, error.message || "文件上传失败", true);
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

elements.workspacePageSelect?.addEventListener("change", (e) => {
  const page = parseInt(e.target.value, 10);
  if (page >= 1 && page <= appState.workspaceTotalPages) {
    appState.workspacePage = page;
    renderWorkspace(
      appState.workspace,
      appState.folders,
      appState.folderTree,
      appState.shares,
      Number(elements.workspaceUsage?.dataset.usedBytes || 0),
      Number(elements.workspaceUsage?.dataset.quotaBytes || 0)
    );
  }
});

elements.workspaceToggleSidebarBtn?.addEventListener("click", () => {
  appState.workspaceSidebarCollapsed = !appState.workspaceSidebarCollapsed;
  updateWorkspaceSidebarLayout();
});

elements.workspaceSearchInput?.addEventListener("input", () => {
  appState.workspaceSearchQuery = String(elements.workspaceSearchInput.value || "");
  appState.workspacePage = 1;
  renderWorkspace(
    appState.workspace,
    appState.folders,
    appState.folderTree,
    appState.shares,
    Number(elements.workspaceUsage?.dataset.usedBytes || 0),
    Number(elements.workspaceUsage?.dataset.quotaBytes || 0)
  );
});

elements.workspaceSortSelect?.addEventListener("change", () => {
  appState.workspaceSort = String(elements.workspaceSortSelect.value || "newest");
  renderWorkspace(
    appState.workspace,
    appState.folders,
    appState.folderTree,
    appState.shares,
    Number(elements.workspaceUsage?.dataset.usedBytes || 0),
    Number(elements.workspaceUsage?.dataset.quotaBytes || 0)
  );
});

elements.workspaceTableModeBtn?.addEventListener("click", () => {
  appState.workspaceDisplayMode = "table";
  renderWorkspace(
    appState.workspace,
    appState.folders,
    appState.folderTree,
    appState.shares,
    Number(elements.workspaceUsage?.dataset.usedBytes || 0),
    Number(elements.workspaceUsage?.dataset.quotaBytes || 0)
  );
});

elements.workspaceCardModeBtn?.addEventListener("click", () => {
  appState.workspaceDisplayMode = "card";
  renderWorkspace(
    appState.workspace,
    appState.folders,
    appState.folderTree,
    appState.shares,
    Number(elements.workspaceUsage?.dataset.usedBytes || 0),
    Number(elements.workspaceUsage?.dataset.quotaBytes || 0)
  );
});

elements.workspaceHeadNameBtn?.addEventListener("click", () => {
  appState.workspaceSort = appState.workspaceSort === "name-asc" ? "name-desc" : "name-asc";
  renderWorkspace(
    appState.workspace,
    appState.folders,
    appState.folderTree,
    appState.shares,
    Number(elements.workspaceUsage?.dataset.usedBytes || 0),
    Number(elements.workspaceUsage?.dataset.quotaBytes || 0)
  );
});

elements.workspaceHeadDateBtn?.addEventListener("click", () => {
  appState.workspaceSort = appState.workspaceSort === "newest" ? "oldest" : "newest";
  renderWorkspace(
    appState.workspace,
    appState.folders,
    appState.folderTree,
    appState.shares,
    Number(elements.workspaceUsage?.dataset.usedBytes || 0),
    Number(elements.workspaceUsage?.dataset.quotaBytes || 0)
  );
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

// 批量合并PDF
elements.workspaceMergeSelectedBtn?.addEventListener("click", async () => {
  const files = appState.workspace.filter((file) => appState.selectedFileIds.has(file.id) && file.kind === "pdf");
  if (files.length < 2) {
    setResult(elements.workspaceResult, "请至少选择2个PDF文件进行合并。", true);
    return;
  }

  try {
    setResult(elements.workspaceResult, `正在合并 ${files.length} 个文件...`);

    // 下载所有选中文件的二进制数据
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

    // 调用合并API
    const formData = new FormData();
    fileBuffers.forEach((file, index) => {
      const blob = new Blob([file.buffer], { type: 'application/pdf' });
      formData.append('files', blob, file.name);
    });

    const response = await fetch('/api/merge', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '合并失败');
    }

    // 获取合并后的PDF并在编辑器中打开
    const blob = await response.blob();
    const mergedName = `merged_${files.length}_files.pdf`;

    // 创建File对象并打开到编辑器
    const mergedFile = new File([blob], mergedName, { type: 'application/pdf' });

    if (!window.Z7PdfEditor || typeof window.Z7PdfEditor.loadFiles !== 'function') {
      throw new Error('编辑器尚未加载完成，请刷新页面后重试。');
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
  lastRenderedVisibleFiles.forEach((file) => appState.selectedFileIds.add(file.id));
  renderWorkspace(
    appState.workspace,
    appState.folders,
    appState.folderTree,
    appState.shares,
    Number(elements.workspaceUsage?.dataset.usedBytes || 0),
    Number(elements.workspaceUsage?.dataset.quotaBytes || 0)
  );
});

elements.workspaceClearSelectionBtn?.addEventListener("click", () => {
  appState.selectedFileIds.clear();
  renderWorkspace(
    appState.workspace,
    appState.folders,
    appState.folderTree,
    appState.shares,
    Number(elements.workspaceUsage?.dataset.usedBytes || 0),
    Number(elements.workspaceUsage?.dataset.quotaBytes || 0)
  );
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

window.addEventListener("load", async () => {
  // 暴露全局变量和函数供页面导航使用
  window.appState = appState;
  window.revealAuthPanel = revealAuthPanel;
  window.toggleAuthPanel = toggleAuthPanel;
  window.updateSignedInLayout = updateSignedInLayout;
  window.showPage = showPage;
  
  initSectionSpy();
  await syncSession();

  // 全局事件委托：套餐兑换按钮
  document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('plan-redeem-btn')) {
      window.showRedeemForm?.("请先登录会员账号，再使用兑换码兑换会员。");
    }
  });

  // 兑换码按钮 - 显示模态框
  elements.redeemBtn?.addEventListener('click', () => {
    window.showRedeemForm?.();
  });

  // 兑换码表单提交
  document.getElementById("redeemForm")?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const codeInput = document.getElementById("redeemCodeInput");
    const resultEl = document.getElementById("redeemResult");
    const code = codeInput?.value?.trim().toUpperCase();
    if (!code) {
      setResult(resultEl, "请输入兑换码", true);
      return;
    }
    try {
      const res = await requestJson("/api/workspace/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      setResult(resultEl, res.message || "兑换成功！");
      codeInput.value = "";
      await loadAccount();
      // 关闭模态框
      setTimeout(() => {
        document.getElementById("authPanel")?.classList.add("hidden");
      }, 1500);
    } catch (error) {
      setResult(resultEl, error.message || "兑换失败", true);
    }
  });
});

// 忘记密码 - 显示表单
elements.showForgotPassword?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById("authLoginSection")?.classList.add("hidden");
  document.getElementById("authForgotSection")?.classList.remove("hidden");
  if (elements.authPanelTitle) {
    elements.authPanelTitle.textContent = "忘记密码";
  }
});

// 忘记密码 - 返回登录
elements.backToLogin?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById("authForgotSection")?.classList.add("hidden");
  document.getElementById("authLoginSection")?.classList.remove("hidden");
  if (elements.authPanelTitle) {
    elements.authPanelTitle.textContent = "登录或注册";
  }
});

// 忘记密码 - 发送验证码
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
    elements.forgotSendCodeBtn.disabled = true;
    let countdown = 60;
    const interval = setInterval(() => {
      countdown--;
      if (elements.forgotSendCodeBtn) {
        elements.forgotSendCodeBtn.textContent = `${countdown}秒后重试`;
      }
      if (countdown <= 0) {
        clearInterval(interval);
        if (elements.forgotSendCodeBtn) {
          elements.forgotSendCodeBtn.disabled = false;
          elements.forgotSendCodeBtn.textContent = "发送验证码";
        }
      }
    }, 1000);
  } catch (error) {
    setResult(elements.authResult, error.message || "发送失败", true);
  }
});

// 忘记密码 - 提交重置
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
    // 切换回登录表单
    document.getElementById("authForgotSection")?.classList.add("hidden");
    document.getElementById("authLoginSection")?.classList.remove("hidden");
    if (elements.authPanelTitle) {
      elements.authPanelTitle.textContent = "登录或注册";
    }
    if (elements.loginPassword) {
      elements.loginPassword.value = "";
    }
  } catch (error) {
    setResult(elements.authResult, error.message || "重置失败", true);
  }
});

// 修改密码（已登录）- 发送验证码到新邮箱
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
    elements.changeEmailSendCodeBtn.disabled = true;
    let countdown = 60;
    const interval = setInterval(() => {
      countdown--;
      if (elements.changeEmailSendCodeBtn) {
        elements.changeEmailSendCodeBtn.textContent = `${countdown}秒后重试`;
      }
      if (countdown <= 0) {
        clearInterval(interval);
        if (elements.changeEmailSendCodeBtn) {
          elements.changeEmailSendCodeBtn.disabled = false;
          elements.changeEmailSendCodeBtn.textContent = "发送验证码";
        }
      }
    }, 1000);
  } catch (error) {
    setResult(elements.authResult, error.message || "发送失败", true);
  }
});

// 修改邮箱 - 提交
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

// 修改密码（已登录）- 提交
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

// 显示修改密码表单
window.showChangePasswordForm = function() {
  const authPanel = document.getElementById("authPanel");
  const loginSection = document.getElementById("authLoginSection");
  const changePasswordSection = document.getElementById("authChangePasswordSection");
  const changeEmailSection = document.getElementById("authChangeEmailSection");
  const authPanelTitle = document.getElementById("authPanelTitle");
  
  if (loginSection) loginSection.classList.add("hidden");
  if (changePasswordSection) changePasswordSection.classList.remove("hidden");
  if (changeEmailSection) changeEmailSection.classList.add("hidden");
  if (authPanelTitle) authPanelTitle.textContent = "修改密码";
  if (authPanel) authPanel.classList.remove("hidden");
};

// 显示修改邮箱表单
window.showChangeEmailForm = function() {
  const authPanel = document.getElementById("authPanel");
  const loginSection = document.getElementById("authLoginSection");
  const changePasswordSection = document.getElementById("authChangePasswordSection");
  const changeEmailSection = document.getElementById("authChangeEmailSection");
  const authPanelTitle = document.getElementById("authPanelTitle");
  const currentEmailDisplay = document.getElementById("currentEmailDisplay");
  
  if (loginSection) loginSection.classList.add("hidden");
  if (changePasswordSection) changePasswordSection.classList.add("hidden");
  if (changeEmailSection) changeEmailSection.classList.remove("hidden");
  if (authPanelTitle) authPanelTitle.textContent = "修改邮箱";
  if (currentEmailDisplay && appState.user) {
    currentEmailDisplay.textContent = appState.user.email;
  }
  syncAuthAutocompleteFields();
  if (authPanel) authPanel.classList.remove("hidden");
};

// 显示兑换表单
window.showRedeemForm = function() {
  if (!appState.user) {
    openPasswordAuth("请先登录会员账号，再使用兑换码兑换会员。");
    return;
  }

  const authPanel = document.getElementById("authPanel");
  const loginSection = document.getElementById("authLoginSection");
  const changePasswordSection = document.getElementById("authChangePasswordSection");
  const changeEmailSection = document.getElementById("authChangeEmailSection");
  const redeemSection = document.getElementById("authRedeemSection");
  const authPanelTitle = document.getElementById("authPanelTitle");
  const redeemResult = document.getElementById("redeemResult");
  const redeemCodeInput = document.getElementById("redeemCodeInput");
  
  if (loginSection) loginSection.classList.add("hidden");
  if (changePasswordSection) changePasswordSection.classList.add("hidden");
  if (changeEmailSection) changeEmailSection.classList.add("hidden");
  if (redeemSection) redeemSection.classList.remove("hidden");
  if (authPanelTitle) authPanelTitle.textContent = "兑换会员";
  if (redeemResult) redeemResult.textContent = "";
  
  appState.authPanelVisible = true;
  if (authPanel) authPanel.classList.remove("hidden");
  window.setTimeout(() => redeemCodeInput?.focus(), 120);
};

// 绑定修改密码和修改邮箱按钮事件
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

// 分享模态框事件绑定
elements.shareForm?.addEventListener("submit", handleShareSubmit);
elements.shareCloseBtn?.addEventListener("click", () => elements.shareModal.classList.add("hidden"));
elements.shareModal?.addEventListener("click", (e) => {
  if (e.target === elements.shareModal) elements.shareModal.classList.add("hidden");
});
elements.shareAccessMode?.addEventListener("change", (e) => {
  elements.sharePasswordRow.classList.toggle("hidden", e.target.value !== "password");
});

// 阅后即焚选中时禁用下载次数输入框
elements.shareDestroyAfterReading?.addEventListener("change", (e) => {
  const isChecked = e.target.checked;
  elements.shareMaxDownloads.disabled = isChecked;
  if (isChecked) {
    elements.shareMaxDownloads.value = "";
    elements.shareMaxDownloads.title = "阅后即焚模式下,下载次数限制无效";
  } else {
    elements.shareMaxDownloads.title = "";
  }
});
