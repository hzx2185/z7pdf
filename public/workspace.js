import { requestJson, setResult as setElementResult, showToast } from "./common.js?v=0414b";
import { createWorkspaceAuthRuntime } from "./workspace-auth-runtime.js?v=0414b";
import { setupWorkspaceBindings } from "./workspace-bindings-runtime.js?v=0414b";
import { createWorkspaceFilesRuntime } from "./workspace-files-runtime.js?v=0414b";

function showPage(...args) {
  if (typeof window.showPage === "function") {
    return window.showPage(...args);
  }
  return undefined;
}

const elements = {
  appTitle: document.querySelector("#appTitle") || document.querySelector(".brand"),
  currentUserLabel: document.querySelector("#currentUserLabel"),
  accountHint: document.querySelector("#accountHint"),
  navMenuBtn: document.querySelector("#navMenuBtn"),
  topbarInner: document.querySelector(".topbar-inner"),
  topbarNavLinks: Array.from(document.querySelectorAll(".topbar-link")),
  memberCenterNav: document.querySelector("#memberCenterNav") || document.querySelector('[data-page="workbench"]'),
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
  guestEditUploadTrigger: document.querySelector("#guestEditUploadTrigger2"),
  guestEditUploadTrigger2: document.querySelector("#guestEditUploadTrigger2"),
  memberWorkspaceUploadTrigger: document.querySelector("#memberWorkspaceUploadTrigger2"),
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
  redeemBtn: document.querySelector("#showRedeemBtn"),
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
  subscriptions: [],
  batchRenameOpen: false,
  selectedFileIds: new Set(),
  activeFolder: "",
  includeChildren: false,
  currentView: "active",
  sharingFile: null,
  workspacePage: 1,
  workspacePageSize: 20,
  workspaceTotalPages: 1,
  lastRenderedVisibleFiles: []
};

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

function isFreeMembershipPlan(plan) {
  return !plan?.isGuest && Number(plan?.priceCents || 0) <= 0;
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

function createActionButton(label, className, handler, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  if (title) button.title = title;
  button.addEventListener("click", handler);
  return button;
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
  elements.workspaceListHead?.classList.toggle("hidden", appState.workspaceDisplayMode !== "table" || appState.lastRenderedVisibleFiles.length === 0);
  elements.workspaceTableModeBtn?.classList.toggle("active", appState.workspaceDisplayMode === "table");
  elements.workspaceCardModeBtn?.classList.toggle("active", appState.workspaceDisplayMode === "card");
}

const workspaceFilesRuntime = createWorkspaceFilesRuntime({
  elements,
  appState,
  setResult,
  formatBytes,
  updateWorkspaceSidePanels,
  applyWorkspaceDisplayMode,
  refreshWorkspace: () => refreshWorkspace()
});

const {
  applyBatchRename,
  clearBatchRenameForm,
  createShareForFile,
  goToPage,
  handleShareSubmit,
  insertSelectedWorkspaceFilesInEditor,
  openFilesInEditor,
  renderBatchRenameState,
  renderShares,
  renderWorkspace,
  runBatchAction,
  triggerFileDownload
} = workspaceFilesRuntime;

window.insertSelectedWorkspaceFilesInEditor = insertSelectedWorkspaceFilesInEditor;
window.getSelectedWorkspacePdfCount = () =>
  appState.workspace.filter(
    (file) => appState.selectedFileIds.has(file.id) && String(file.kind || "").trim() === "pdf"
  ).length;

const workspaceAuthRuntime = createWorkspaceAuthRuntime({
  elements,
  appState,
  setResult,
  formatMoney,
  formatBillingInterval,
  isFreeMembershipPlan,
  syncAuthAutocompleteFields,
  updateWorkspaceSidebarLayout,
  renderPlans,
  refreshWorkspace: () => refreshWorkspace(),
  setTopbarMenuOpen,
  showPostLogoutPage,
  showPage
});

const {
  detectAuthEmailState,
  handleLegacyLogoutClick,
  isValidEmail,
  loadAccount,
  logoutAndReset,
  openPasswordAuth,
  openRegisterAuth,
  renderPublicPlans,
  resetCodeFlowState,
  revealAuthPanel,
  setAuthView,
  switchToFilesTab,
  syncSession,
  toggleAuthPanel,
  updateAuthEmailStatus,
  updateAuthModeHint,
  updateAuthPanels,
  updateAuthView,
  updateSignedInLayout
} = workspaceAuthRuntime;

window.switchToFilesTab = switchToFilesTab;

function setTopbarMenuOpen(isOpen) {
  elements.topbarInner?.classList.toggle("menu-open", Boolean(isOpen));
  if (elements.navMenuBtn) {
    elements.navMenuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
}

function showPostLogoutPage() {
  if (typeof showPage === "function") {
    showPage("features");
  }
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


function renderPlans() {
  if (!elements.workspacePlans || !elements.workspacePlanSummary) {
    return;
  }
  elements.workspacePlans.innerHTML = "";

  if (!appState.entitlements) {
    if (elements.workspaceMemberSummary) {
      elements.workspaceMemberSummary.textContent = "登录后显示会员信息。";
    }
    const guestPlan = appState.guestEntitlements;
    const guestSummary = guestPlan
      ? `当前游客按 ${guestPlan.name} 能力试用。`
      : "当前为游客模式。";
    elements.workspacePlanSummary.innerHTML = `
      <div class="member-overview-compact">
        <div class="member-overview-row"><strong>当前状态：</strong>未登录</div>
        <div class="member-overview-row">${guestSummary}</div>
      </div>
    `;
    elements.workspacePlanSummary.classList.remove("hidden");
    elements.workspacePlans.innerHTML = "";
    elements.workspacePlans.classList.add("hidden");
    return;
  }

  elements.workspacePlans.classList.remove("hidden");

  if (elements.workspaceMemberSummary) {
    const usedBytes = Number(elements.workspaceUsage?.dataset.usedBytes || 0);
    const quotaBytes = Number(elements.workspaceUsage?.dataset.quotaBytes || 0);
    const subscriptionExpiresText = getSubscriptionExpiryText();
    elements.workspaceMemberSummary.innerHTML = `
      <div class="member-overview-compact">
        <div class="member-overview-row"><strong>空间：</strong>${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)}</div>
        <div class="member-overview-row"><strong>文件：</strong>${appState.workspace.length}/${appState.entitlements.maxFiles}</div>
        <div class="member-overview-row"><strong>分享：</strong>${appState.shares.length}/${appState.entitlements.maxShareLinks}</div>
        <div class="member-overview-row"><strong>套餐：</strong>${appState.entitlements.name}</div>
        <div class="member-overview-row member-overview-expiry"><strong>到期：</strong>${subscriptionExpiresText}</div>
      </div>
    `;
  }

  elements.workspacePlanSummary.innerHTML = `
    <div class="member-overview-compact">
      <div class="member-overview-row"><strong>当前套餐：</strong>${appState.entitlements.name}</div>
      <div class="member-overview-row member-overview-expiry"><strong>会员到期：</strong>${getSubscriptionExpiryText()}</div>
      <div class="member-overview-row"><strong>开通方式：</strong>使用兑换码开通或续期会员</div>
    </div>
  `;
  elements.workspacePlanSummary.classList.remove("hidden");

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
    if (!isCurrent && !isFreeMembershipPlan(plan)) {
      card.appendChild(createActionButton("兑换会员", "btn btn-primary btn-sm", async () => {
        window.showRedeemForm?.();
      }));
    }
    elements.workspacePlans.appendChild(card);
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

setupWorkspaceBindings({
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
});

window.renderPlans = renderPlans;
