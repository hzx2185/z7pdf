import { requestJson } from "./common.js?v=0414b";

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
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

export function createWorkspaceAuthRuntime({
  elements,
  appState,
  setResult,
  formatMoney,
  formatBillingInterval,
  isFreeMembershipPlan,
  syncAuthAutocompleteFields,
  updateWorkspaceSidebarLayout,
  renderPlans,
  refreshWorkspace,
  setTopbarMenuOpen,
  showPostLogoutPage,
  showPage
}) {
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
      elements.sendCodeBtn.textContent = appState.codeFlowExistingUser === false
        ? "发送注册验证码"
        : appState.codeFlowExistingUser === true
          ? "发送登录验证码"
          : "发送验证码";
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
      elements.authSubmitBtn.textContent = appState.codeFlowExistingUser === false
        ? "验证并注册"
        : appState.codeFlowExistingUser === true
          ? "验证码登录"
          : "继续";
    }
  }

  function switchToFilesTab() {
    switchWorkspacePrimaryTab("files");
  }

  function switchWorkspacePrimaryTab(tabName = "files") {
    const normalizedTab = tabName === "member" ? "member" : "files";
    document.querySelectorAll(".workspace-tabs .tab-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.workspaceTab === normalizedTab);
    });
    document.querySelectorAll(".workspace-panel").forEach((panel) => panel.classList.add("hidden"));
    document.querySelector(`.workspace-panel[data-panel="${normalizedTab}"]`)?.classList.remove("hidden");
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

    const memberInfoPanel = document.getElementById("memberInfoPanel");
    if (memberInfoPanel) {
      memberInfoPanel.classList.toggle("hidden", false);
    }

    elements.workspaceTabOverviewBtn?.classList.toggle("hidden", !signedIn);
    elements.workspaceTabSharesBtn?.classList.toggle("hidden", !signedIn);
    if (!signedIn) {
      appState.workspaceSideTab = "plan";
    }
    elements.workspaceTabOverviewBtn?.classList.toggle("active", signedIn && appState.workspaceSideTab === "overview");
    elements.workspaceTabSharesBtn?.classList.toggle("active", signedIn && appState.workspaceSideTab === "shares");
    elements.workspaceTabPlanBtn?.classList.toggle("active", appState.workspaceSideTab === "plan");
    elements.workspaceTabOverview?.classList.toggle("hidden", !signedIn || appState.workspaceSideTab !== "overview");
    elements.workspaceTabShares?.classList.toggle("hidden", !signedIn || appState.workspaceSideTab !== "shares");
    elements.workspaceTabPlan?.classList.toggle("hidden", appState.workspaceSideTab !== "plan");

    const activeWorkspaceTab = document.querySelector(".workspace-tabs .tab-btn.active")?.dataset.workspaceTab;
    switchWorkspacePrimaryTab(activeWorkspaceTab || (signedIn ? "files" : "member"));

    [logoutBtn, logoutBtn2].forEach((button) => {
      if (button) {
        button.onclick = handleLegacyLogoutClick;
      }
    });

    if (signedIn && typeof showPage === "function") {
      showPage("workbench");
    }
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

  async function logoutAndReset() {
    await requestJson("/api/auth/logout", { method: "POST" });
    appState.user = null;
    appState.entitlements = null;
    appState.authPanelVisible = false;
    appState.workspace = [];
    appState.selectedFileIds.clear();
    await syncSession();
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
    await loadAccount();
    showPostLogoutPage?.();
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
    } else if (elements.accountHint) {
      elements.accountHint.textContent = "登录后可在线保存，并进入个人空间继续处理文件。";
      elements.accountHint.classList.remove("hidden");
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
      elements.guestPolicyTitle.textContent = user ? `当前账号为 ${appState.entitlements?.name || "会员"}` : "游客试用额度";
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
    elements.logoutBtn?.classList.toggle("hidden", !user);
    elements.adminLink?.classList.toggle("hidden", !user || user.role !== "admin");

    toggleHidden([
      elements.showLoginBtn,
      elements.showRegisterBtn,
      elements.showLoginBtn2,
      elements.showRegisterBtn2
    ], Boolean(user));

    setDisabled([
      elements.showRegisterBtn,
      elements.showRegisterBtn2
    ], !appState.allowRegistration);

    elements.registerDisabledHint?.classList.toggle("hidden", appState.allowRegistration);
    updateSignedInLayout();
    updateAuthModeHint();
    updateAuthPanels();
    updateWorkspaceSidebarLayout?.();
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
      if (plan.isGuest) return appState.user ? "游客模式" : "默认试用";
      return appState.user ? (plan.code === activeCode ? "当前套餐" : "可升级") : "会员方案";
    };

    const getActionButton = (plan) => {
      if (plan.isGuest || plan.code === activeCode || isFreeMembershipPlan(plan)) return "";
      return `<button class="btn btn-sm btn-primary subscribe-btn plan-redeem-btn" data-plan="${plan.code}">兑换会员</button>`;
    };

    const supportChip = (value) =>
      value ? '<span class="support-chip is-on">✓</span>' : '<span class="support-chip is-off">✗</span>';

    const rows = [
      ["开通", (plan) => {
        if (plan.isGuest) return '<span class="compare-head-note">当前默认可用</span>';
        if (plan.code === activeCode) return '<span class="compare-head-note">当前套餐</span>';
        if (isFreeMembershipPlan(plan)) return '<span class="compare-head-note">已包含</span>';
        return getActionButton(plan) || '<span class="compare-head-note">可开通</span>';
      }],
      ["价格", (plan) => plan.isGuest ? "免费试用" : `${formatMoney(plan.priceCents)} / ${formatBillingInterval(plan.billingInterval)}`],
      ["说明", (plan) => `<span class="compare-head-desc">${plan.description || (plan.isGuest ? "未注册也可直接试用基础能力。" : "适合日常 PDF 编辑与导出。")}</span>`],
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

  async function loadAccount() {
    if (!appState.user) return;
    const data = await requestJson("/api/workspace/account");
    appState.entitlements = data.entitlements || null;
    appState.plans = data.plans || [];
    appState.subscriptions = data.subscriptions || [];
    syncAuthAutocompleteFields?.();
    updateAuthView();
    renderPublicPlans();
    renderPlans?.();
  }

  async function syncSession() {
    try {
      const [config, me] = await Promise.all([
        requestJson("/api/public-config"),
        requestJson("/api/auth/me")
      ]);
      appState.allowRegistration = Boolean(config.allowRegistration);
      appState.smtpConfigured = Boolean(config.smtpConfigured);
      appState.plans = config.plans || [];
      appState.guestPlan = config.guestPlan || "member";
      appState.guestDailyExports = Number(config.guestDailyExports || 0);
      elements.guestDailyExportsItems?.forEach((element) => {
        element.textContent = appState.guestDailyExports;
      });
      appState.guestEntitlements = me.guestEntitlements || config.guestEntitlements || null;
      appState.guestUsage = me.guestUsage || config.guestUsage || null;
      if (elements.appTitle) {
        elements.appTitle.textContent = config.appName || "Z7 PDF 工作台";
      }
      document.title = config.appName || "Z7 PDF 工作台";
      appState.user = me.user || null;
      appState.entitlements = me.entitlements || null;
      syncAuthAutocompleteFields?.();
      if (!appState.smtpConfigured && appState.authView === "code") {
        appState.authView = "password";
      }
      updateAuthView();
      renderPublicPlans();
      if (appState.user) {
        await loadAccount();
        await refreshWorkspace?.();
      }
    } catch (error) {
      setResult(elements.authResult, error.message || "初始化失败", true);
    }
  }

  return {
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
  };
}
