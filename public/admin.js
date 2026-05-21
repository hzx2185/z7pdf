import { escapeHtml, requestJson, setResult as setElementResult } from "./common.js?v=0414c";

const elements = {
  overviewCards: document.querySelector("#overviewCards"),
  usersTableBody: document.querySelector("#usersTableBody"),
  plansList: document.querySelector("#plansList"),
  settingsForm: document.querySelector("#settingsForm"),
  settingAppName: document.querySelector("#settingAppName"),
  settingPlan: document.querySelector("#settingPlan"),
  settingGuestPlan: document.querySelector("#settingGuestPlan"),
  settingQuota: document.querySelector("#settingQuota"),
  settingGuestDailyExports: document.querySelector("#settingGuestDailyExports"),
  settingAllowRegistration: document.querySelector("#settingAllowRegistration"),
  settingSmtpHost: document.querySelector("#settingSmtpHost"),
  settingSmtpPort: document.querySelector("#settingSmtpPort"),
  settingSmtpUser: document.querySelector("#settingSmtpUser"),
  settingSmtpPass: document.querySelector("#settingSmtpPass"),
  settingSmtpFromEmail: document.querySelector("#settingSmtpFromEmail"),
  settingSmtpFromName: document.querySelector("#settingSmtpFromName"),
  settingSmtpSecure: document.querySelector("#settingSmtpSecure"),
  settingSmtpTestEmail: document.querySelector("#settingSmtpTestEmail"),
  testSmtpBtn: document.querySelector("#testSmtpBtn"),
  smtpTestResult: document.querySelector("#smtpTestResult"),
  currentVersionValue: document.querySelector("#currentVersionValue"),
  latestVersionValue: document.querySelector("#latestVersionValue"),
  latestUpdatedAtValue: document.querySelector("#latestUpdatedAtValue"),
  checkUpdateBtn: document.querySelector("#checkUpdateBtn"),
  versionUpdateResult: document.querySelector("#versionUpdateResult"),
  memberSearch: document.querySelector("#memberSearch"),
  memberRoleFilter: document.querySelector("#memberRoleFilter"),
  memberPlanFilter: document.querySelector("#memberPlanFilter"),
  memberExpiryFrom: document.querySelector("#memberExpiryFrom"),
  memberExpiryTo: document.querySelector("#memberExpiryTo"),
  memberFilterSummary: document.querySelector("#memberFilterSummary"),
  planSearch: document.querySelector("#planSearch"),
  planStatusFilter: document.querySelector("#planStatusFilter"),
  planFilterSummary: document.querySelector("#planFilterSummary"),
  adminResult: document.querySelector("#adminResult"),
  navLinks: Array.from(document.querySelectorAll(".nav-link[data-page]")),
  // 兑换码
  redeemPlanSelect: document.querySelector("#redeemPlanSelect"),
  redeemDuration: document.querySelector("#redeemDuration"),
  redeemCount: document.querySelector("#redeemCount"),
  redeemExpiresAt: document.querySelector("#redeemExpiresAt"),
  redeemCodeForm: document.querySelector("#redeemCodeForm"),
  redeemCodesResult: document.querySelector("#redeemCodesResult"),
  redeemCodesList: document.querySelector("#redeemCodesList")
};

const state = {
  users: [],
  plans: [],
  subscriptions: [],
  version: null,
  versionCheck: null
};

function setResult(message, isError = false) {
  setElementResult(elements.adminResult, message, isError);
}

function formatResponseMessage(error, fallback = "请求失败") {
  const detailText = Array.isArray(error?.details) && error.details.length
    ? `\n${error.details.join("\n")}`
    : "";
  return `${error?.message || fallback}${detailText}`;
}

function getSmtpSettingsPayload() {
  return {
    smtp_host: elements.settingSmtpHost.value.trim(),
    smtp_port: String(elements.settingSmtpPort.value || 465),
    smtp_user: elements.settingSmtpUser.value.trim(),
    smtp_pass: elements.settingSmtpPass.value,
    smtp_from_email: elements.settingSmtpFromEmail.value.trim(),
    smtp_from_name: elements.settingSmtpFromName.value.trim(),
    smtp_secure: elements.settingSmtpSecure.checked ? "true" : "false"
  };
}

function formatSmtpTestSuccess(response) {
  const result = response?.result || {};
  const lines = [
    response?.message || "测试邮件已发送。",
    result.accepted?.length ? `服务器接受：${result.accepted.join("、")}` : "",
    result.rejected?.length ? `服务器拒绝：${result.rejected.join("、")}` : "",
    result.response ? `SMTP 返回：${result.response}` : "",
    result.messageId ? `邮件 ID：${result.messageId}` : ""
  ].filter(Boolean);
  return lines.join("\n");
}

function formatBytes(bytes) {
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(1)} MB`;
}

function formatMoney(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

function formatBillingInterval(interval) {
  const value = String(interval || "").trim().toLowerCase();
  const labels = {
    daily: "每日",
    weekly: "每周",
    monthly: "每月",
    yearly: "每年"
  };
  return labels[value] || (interval || "周期未设");
}

function formatStatusLabel(status) {
  const labels = {
    member: "会员",
    admin: "管理员"
  };
  return labels[status] || status;
}

function formatDateTime(value, fallback = "暂无") {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatVersion(value) {
  const version = String(value || "").trim().replace(/^v/i, "");
  return version ? `v${version}` : "未知版本";
}

function formatPlanLabel(planCode) {
  const code = String(planCode || "").trim();
  const matchedPlan = state.plans.find((plan) => String(plan.code || "") === code);
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

function getDateTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isSameOrAfterDate(value, dateText) {
  if (!dateText) return true;
  const valueTime = getDateTime(value);
  const minTime = new Date(`${dateText}T00:00:00`).getTime();
  return valueTime >= minTime;
}

function isSameOrBeforeDate(value, dateText) {
  if (!dateText) return true;
  const valueTime = getDateTime(value);
  const maxTime = new Date(`${dateText}T23:59:59`).getTime();
  return valueTime <= maxTime;
}

function getSubscriptionSortScore(subscription) {
  if (!subscription) return 0;
  if (subscription.status === "active") return 3;
  if (subscription.status === "expired") return 2;
  if (subscription.status === "cancelled") return 1;
  return 0;
}

function getLatestSubscriptionForUser(userId) {
  return state.subscriptions
    .filter((subscription) => Number(subscription.userId) === Number(userId))
    .sort((first, second) => {
      const scoreDiff = getSubscriptionSortScore(second) - getSubscriptionSortScore(first);
      if (scoreDiff !== 0) return scoreDiff;
      const endDiff = getDateTime(second.periodEnd) - getDateTime(first.periodEnd);
      if (endDiff !== 0) return endDiff;
      const updatedDiff = getDateTime(second.updatedAt) - getDateTime(first.updatedAt);
      if (updatedDiff !== 0) return updatedDiff;
      return Number(second.id || 0) - Number(first.id || 0);
    })[0] || null;
}

function getMemberRows() {
  return state.users.map((user) => ({
    ...user,
    subscription: getLatestSubscriptionForUser(user.id)
  }));
}

function renderVersionInfo(version = state.version, check = state.versionCheck) {
  const current = check?.current || version || {};
  const latest = check?.latest || {};
  const hasLatest = Boolean(latest.version);
  const releaseTime = latest.publishedAt || latest.updatedAt;

  if (elements.currentVersionValue) {
    elements.currentVersionValue.textContent = formatVersion(current.version);
  }
  if (elements.latestVersionValue) {
    if (hasLatest) {
      elements.latestVersionValue.textContent = formatVersion(latest.version);
    } else if (check) {
      elements.latestVersionValue.textContent = "未发布";
    }
  }
  if (elements.latestUpdatedAtValue) {
    elements.latestUpdatedAtValue.textContent = formatDateTime(
      releaseTime,
      hasLatest ? "Docker Hub 未提供" : check ? "无记录" : "待检查"
    );
  }
}

function buildBillingIntervalOptions(selectedValue) {
  return ["daily", "weekly", "monthly", "yearly"]
    .map((interval) => {
      const selected = interval === selectedValue ? " selected" : "";
      return `<option value="${interval}"${selected}>${escapeHtml(formatBillingInterval(interval))}</option>`;
    })
    .join("");
}

function createBadge(label, tone = "neutral") {
  const safeTone = ["neutral", "success", "warn", "danger", "accent"].includes(tone) ? tone : "neutral";
  return `<span class="admin-badge admin-badge-${safeTone}">${escapeHtml(label)}</span>`;
}

function appendBadge(container, label, tone = "neutral") {
  const safeTone = ["neutral", "success", "warn", "danger", "accent"].includes(tone) ? tone : "neutral";
  const badge = document.createElement("span");
  badge.className = `admin-badge admin-badge-${safeTone}`;
  badge.textContent = label;
  container.appendChild(badge);
}

function createPlanField(labelText, key, type, value, attributes = {}) {
  const label = document.createElement("label");
  label.className = "field";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;
  const input = document.createElement("input");
  input.dataset.key = key;
  input.type = type;
  Object.entries(attributes).forEach(([name, attributeValue]) => {
    input.setAttribute(name, attributeValue);
  });
  input.value = value ?? "";
  label.append(labelSpan, input);
  return label;
}

function createPlanCheck(labelText, key, checked) {
  const label = document.createElement("label");
  label.className = "check";
  const input = document.createElement("input");
  input.dataset.key = key;
  input.type = "checkbox";
  input.checked = Boolean(checked);
  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;
  label.append(input, labelSpan);
  return label;
}

function renderPlanBadges(container, plan) {
  container.replaceChildren();
  appendBadge(container, plan.active ? "已启用" : "已停用", plan.active ? "success" : "warn");
  appendBadge(container, formatMoney(plan.priceCents), "accent");
  appendBadge(container, formatBillingInterval(plan.billingInterval), "neutral");
}

function renderPlanSummary(container, plan) {
  container.replaceChildren();
  [
    `${plan.storageQuotaMb} MB 空间`,
    `${plan.maxFiles} 个文件`,
    `${plan.maxShareLinks} 个分享`
  ].forEach((text) => {
    const item = document.createElement("span");
    item.textContent = text;
    container.appendChild(item);
  });
}

function renderEmptyRow(target, columns, title, description) {
  target.innerHTML = `
    <tr>
      <td class="admin-empty-cell" colspan="${columns}">
        <div class="admin-empty-state">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(description)}</span>
        </div>
      </td>
    </tr>
  `;
}

function populatePlanSettingOptions(selectedDefaultPlan = "", selectedGuestPlan = "") {
  if (elements.settingPlan) {
    elements.settingPlan.innerHTML = "";
  }
  if (elements.settingGuestPlan) {
    elements.settingGuestPlan.innerHTML = "";
  }

  state.plans.forEach((plan) => {
    const label = `${plan.name} (${plan.code})`;
    if (elements.settingPlan) {
      const option = document.createElement("option");
      option.value = plan.code;
      option.textContent = label;
      option.selected = plan.code === selectedDefaultPlan;
      elements.settingPlan.appendChild(option);
    }
    if (elements.settingGuestPlan) {
      const option = document.createElement("option");
      option.value = plan.code;
      option.textContent = label;
      option.selected = plan.code === selectedGuestPlan;
      elements.settingGuestPlan.appendChild(option);
    }
  });

  if (elements.settingPlan && !elements.settingPlan.value && state.plans[0]) {
    elements.settingPlan.value = state.plans[0].code;
  }
  if (elements.settingGuestPlan && !elements.settingGuestPlan.value && state.plans[0]) {
    elements.settingGuestPlan.value = state.plans[0].code;
  }
}

function populateMemberPlanFilterOptions() {
  if (!elements.memberPlanFilter) {
    return;
  }

  const selectedValue = elements.memberPlanFilter.value;
  elements.memberPlanFilter.innerHTML = '<option value="">全部</option>';
  state.plans.forEach((plan) => {
    const option = document.createElement("option");
    option.value = plan.code;
    option.textContent = `${plan.name} (${plan.code})`;
    option.selected = plan.code === selectedValue;
    elements.memberPlanFilter.appendChild(option);
  });
}

function renderOverview(data) {
  const cards = [
    { label: "会员数", value: Number(data.stats?.users || 0), note: "注册账号总数" },
    { label: "文件数", value: Number(data.stats?.files || 0), note: "未删除文件" },
    { label: "总占用", value: formatBytes(data.stats?.storageBytes || 0), note: "当前存储占用" },
    { label: "有效分享", value: Number(data.stats?.shares || 0), note: "已启用分享链接" },
    { label: "未到期会员", value: Number(data.stats?.activeMemberships || 0), note: "按到期时间统计" }
  ];

  // Remove any existing dynamic cards (overview-card) that are NOT the version card
  const existingCards = elements.overviewCards.querySelectorAll(".overview-card:not(.version-card-unified)");
  existingCards.forEach((card) => card.remove());

  // Insert the dynamic cards BEFORE the version card
  const versionCard = elements.overviewCards.querySelector(".version-card-unified");
  cards.forEach((card) => {
    const item = document.createElement("article");
    item.className = "overview-card";
    item.innerHTML = `
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <small>${card.note}</small>
    `;
    if (versionCard) {
      elements.overviewCards.insertBefore(item, versionCard);
    } else {
      elements.overviewCards.appendChild(item);
    }
  });

  state.version = data.version || null;
  state.versionCheck = null;
  renderVersionInfo();

  elements.settingAppName.value = data.settings?.app_name || "";
  populatePlanSettingOptions(data.settings?.default_member_plan || "member", data.settings?.guest_plan || "member");
  elements.settingQuota.value = Number(data.settings?.workspace_quota_mb || 512);
  elements.settingGuestDailyExports.value = Number(data.settings?.guest_daily_exports || 1);
  elements.settingAllowRegistration.checked =
    String(data.settings?.allow_registration || "true").toLowerCase() === "true";
  elements.settingSmtpHost.value = data.settings?.smtp_host || "";
  elements.settingSmtpPort.value = Number(data.settings?.smtp_port || 465);
  elements.settingSmtpUser.value = data.settings?.smtp_user || "";
  elements.settingSmtpPass.value = "";
  elements.settingSmtpPass.placeholder =
    data.settings?.smtp_pass_configured === "true" ? "留空则保留已保存密码" : "邮箱授权码";
  elements.settingSmtpFromEmail.value = data.settings?.smtp_from_email || "";
  elements.settingSmtpFromName.value = data.settings?.smtp_from_name || "Z7 PDF 工作台";
  if (elements.settingSmtpTestEmail && !elements.settingSmtpTestEmail.value) {
    elements.settingSmtpTestEmail.value = data.settings?.smtp_from_email || data.settings?.smtp_user || "";
  }
  elements.settingSmtpSecure.checked =
    String(data.settings?.smtp_secure || "true").toLowerCase() === "true";
}

function createRoleSelect(value) {
  const select = document.createElement("select");
  ["member", "admin"].forEach((role) => {
    const option = document.createElement("option");
    option.value = role;
    option.textContent = formatStatusLabel(role);
    if (role === value) option.selected = true;
    select.appendChild(option);
  });
  return select;
}

function createPlanSelect(value) {
  const select = document.createElement("select");
  state.plans.forEach((plan) => {
    const option = document.createElement("option");
    option.value = plan.code;
    option.textContent = `${plan.name} (${plan.code})`;
    if (plan.code === value) option.selected = true;
    select.appendChild(option);
  });
  if (!select.value && state.plans[0]) {
    select.value = state.plans[0].code;
  }
  return select;
}

function renderUsers(users = []) {
  elements.usersTableBody.innerHTML = "";
  if (!users.length) {
    renderEmptyRow(elements.usersTableBody, 8, "没有匹配的会员数据", "调整搜索、角色、套餐或到期时间筛选条件后再试。");
    return;
  }
  users.forEach((user) => {
    const row = document.createElement("tr");
    const subscription = user.subscription || null;
    const roleSelect = createRoleSelect(user.role);
    roleSelect.className = "admin-select";
    const planSelect = createPlanSelect(user.plan);
    planSelect.className = "admin-select";
    const endInput = document.createElement("input");
    endInput.type = "text";
    endInput.value = subscription?.periodEnd || "";
    endInput.className = "compact-input admin-input";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "ghost-button admin-action-button";
    saveButton.textContent = "保存";
    saveButton.addEventListener("click", async () => {
      try {
        const requests = [
          requestJson(`/api/admin/users/${user.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: roleSelect.value,
              plan: planSelect.value
            })
          })
        ];
        if (subscription?.id) {
          requests.push(requestJson(`/api/admin/subscriptions/${subscription.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              periodEnd: endInput.value
            })
          }));
        }
        await Promise.all(requests);
        setResult(`已更新会员：${user.email}`);
        await loadAdminData();
      } catch (error) {
        setResult(error.message || "会员更新失败", true);
      }
    });

    const subscriptionEndCell = subscription?.id ? "" : "无记录";

    row.innerHTML = `
      <td>${user.id}</td>
      <td>
        <div class="admin-cell-stack">
          <strong>${escapeHtml(user.email)}</strong>
          <span>${createBadge(formatStatusLabel(user.role), user.role === "admin" ? "accent" : "neutral")}</span>
        </div>
      </td>
      <td class="admin-cell-role"></td>
      <td class="admin-cell-plan"></td>
      <td>${formatBytes(user.usedBytes)}</td>
      <td class="admin-cell-subscription-end">${subscriptionEndCell}</td>
      <td>${new Date(user.createdAt).toLocaleString("zh-CN")}</td>
      <td class="admin-cell-action"></td>
    `;
    row.querySelector(".admin-cell-role").appendChild(roleSelect);
    row.querySelector(".admin-cell-plan").appendChild(planSelect);
    if (subscription?.id) {
      row.querySelector(".admin-cell-subscription-end").appendChild(endInput);
    }
    row.querySelector(".admin-cell-action").appendChild(saveButton);
    elements.usersTableBody.appendChild(row);
  });
}

function renderPlans(plans = []) {
  elements.plansList.innerHTML = "";
  if (!plans.length) {
    elements.plansList.innerHTML = `
      <article class="admin-empty-panel">
        <strong>还没有可管理的套餐</strong>
        <span>初始化套餐后，这里会显示价格、空间和功能权限配置。</span>
      </article>
    `;
    return;
  }
  plans.forEach((plan) => {
    const card = document.createElement("article");
    card.className = "plan-admin-card";
    const planLabel = formatPlanLabel(plan.code);

    const head = document.createElement("div");
    head.className = "plan-admin-head";
    const title = document.createElement("div");
    title.className = "plan-admin-title";
    const titleText = document.createElement("strong");
    titleText.textContent = plan.name;
    const subtitle = document.createElement("span");
    subtitle.textContent = planLabel;
    title.append(titleText, subtitle);
    const badges = document.createElement("div");
    badges.className = "plan-admin-badges";
    renderPlanBadges(badges, plan);
    head.append(title, badges);

    const summary = document.createElement("div");
    summary.className = "plan-admin-summary";
    renderPlanSummary(summary, plan);

    const firstRow = document.createElement("div");
    firstRow.className = "inline-fields";
    const billingLabel = document.createElement("label");
    billingLabel.className = "field";
    const billingText = document.createElement("span");
    billingText.textContent = "周期";
    const billingSelect = document.createElement("select");
    billingSelect.dataset.key = "billingInterval";
    ["daily", "weekly", "monthly", "yearly"].forEach((interval) => {
      const option = document.createElement("option");
      option.value = interval;
      option.textContent = formatBillingInterval(interval);
      option.selected = interval === plan.billingInterval;
      billingSelect.appendChild(option);
    });
    billingLabel.append(billingText, billingSelect);
    firstRow.append(
      createPlanField("价格（分）", "priceCents", "number", plan.priceCents, { min: "0", step: "100" }),
      billingLabel
    );

    const quotaRow = document.createElement("div");
    quotaRow.className = "inline-fields";
    quotaRow.append(
      createPlanField("空间 MB", "storageQuotaMb", "number", plan.storageQuotaMb, { min: "1", step: "1" }),
      createPlanField("文件数", "maxFiles", "number", plan.maxFiles, { min: "1", step: "1" }),
      createPlanField("分享数", "maxShareLinks", "number", plan.maxShareLinks, { min: "0", step: "1" })
    );

    const featureRow = document.createElement("div");
    featureRow.className = "inline-fields";
    featureRow.append(
      createPlanCheck("压缩", "allowCompression", plan.allowCompression),
      createPlanCheck("拆分", "allowSplit", plan.allowSplit),
      createPlanCheck("加密", "allowSecurity", plan.allowSecurity),
      createPlanCheck("启用", "active", plan.active)
    );

    card.append(
      head,
      summary,
      createPlanField("名称", "name", "text", plan.name),
      createPlanField("说明", "description", "text", plan.description || ""),
      firstRow,
      quotaRow,
      featureRow
    );
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "secondary-button";
    saveButton.textContent = "保存套餐";
    const cardResult = document.createElement("p");
    cardResult.className = "result-message";
    cardResult.setAttribute("aria-live", "polite");
    saveButton.addEventListener("click", async () => {
      const payload = {};
      card.querySelectorAll("[data-key]").forEach((input) => {
        payload[input.dataset.key] = input.type === "checkbox" ? input.checked : input.value;
      });
      saveButton.disabled = true;
      saveButton.textContent = "保存中...";
      try {
        const response = await requestJson(`/api/admin/plans/${plan.code}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const savedPlan = response?.plan || {};
        const savedName = savedPlan.name || payload.name || plan.name;
        setElementResult(cardResult, `已保存套餐：${savedName}`, false, { visibleClass: "is-visible" });
        setResult(`已保存套餐：${savedName}`);
        Object.assign(plan, savedPlan);
        titleText.textContent = savedName;
        subtitle.textContent = formatPlanLabel(savedPlan.code || plan.code);
        renderPlanBadges(badges, {
          active: savedPlan.active ?? payload.active,
          priceCents: savedPlan.priceCents ?? payload.priceCents,
          billingInterval: savedPlan.billingInterval ?? payload.billingInterval
        });
        renderPlanSummary(summary, {
          storageQuotaMb: savedPlan.storageQuotaMb ?? payload.storageQuotaMb,
          maxFiles: savedPlan.maxFiles ?? payload.maxFiles,
          maxShareLinks: savedPlan.maxShareLinks ?? payload.maxShareLinks
        });
      } catch (error) {
        setElementResult(cardResult, error.message || "套餐保存失败", true, { visibleClass: "is-visible" });
        setResult(error.message || "套餐保存失败", true);
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = "保存套餐";
      }
    });
    card.appendChild(saveButton);
    card.appendChild(cardResult);
    elements.plansList.appendChild(card);
  });
}

function applyFilters() {
  const memberKeyword = elements.memberSearch?.value.trim().toLowerCase() || "";
  const memberRole = elements.memberRoleFilter?.value || "";
  const memberPlan = elements.memberPlanFilter?.value || "";
  const memberExpiryFrom = elements.memberExpiryFrom?.value || "";
  const memberExpiryTo = elements.memberExpiryTo?.value || "";
  const planKeyword = elements.planSearch?.value.trim().toLowerCase() || "";
  const planStatus = elements.planStatusFilter?.value || "";

  const memberRows = getMemberRows();
  const filteredUsers = memberRows.filter((user) => {
    const subscription = user.subscription || null;
    const planText = formatPlanLabel(user.plan).toLowerCase();
    const subscriptionPlanText = formatPlanLabel(subscription?.planCode).toLowerCase();
    const matchesKeyword =
      !memberKeyword ||
      String(user.email || "").toLowerCase().includes(memberKeyword) ||
      String(user.plan || "").toLowerCase().includes(memberKeyword) ||
      planText.includes(memberKeyword) ||
      String(subscription?.planCode || "").toLowerCase().includes(memberKeyword) ||
      subscriptionPlanText.includes(memberKeyword);
    const matchesRole = !memberRole || String(user.role || "") === memberRole;
    const matchesPlan =
      !memberPlan ||
      String(user.plan || "") === memberPlan ||
      String(subscription?.planCode || "") === memberPlan;
    const matchesExpiry =
      (!memberExpiryFrom && !memberExpiryTo) ||
      (subscription?.periodEnd &&
        isSameOrAfterDate(subscription.periodEnd, memberExpiryFrom) &&
        isSameOrBeforeDate(subscription.periodEnd, memberExpiryTo));
    return matchesKeyword && matchesRole && matchesPlan && matchesExpiry;
  });

  const filteredPlans = state.plans.filter((plan) => {
    const matchesKeyword =
      !planKeyword ||
      String(plan.name || "").toLowerCase().includes(planKeyword) ||
      String(plan.code || "").toLowerCase().includes(planKeyword) ||
      String(plan.description || "").toLowerCase().includes(planKeyword);
    const matchesStatus =
      !planStatus || (planStatus === "active" ? Boolean(plan.active) : !Boolean(plan.active));
    return matchesKeyword && matchesStatus;
  });

  renderUsers(filteredUsers);
  renderPlans(filteredPlans);
  if (elements.memberFilterSummary) {
    elements.memberFilterSummary.textContent = `${filteredUsers.length} / ${memberRows.length}`;
  }
  if (elements.planFilterSummary) {
    elements.planFilterSummary.textContent = `${filteredPlans.length} / ${state.plans.length}`;
  }
}

async function loadAdminData() {
  try {
    const [overview, users, plans, subscriptions, redeemCodes] = await Promise.all([
      requestJson("/api/admin/overview"),
      requestJson("/api/admin/users"),
      requestJson("/api/admin/plans"),
      requestJson("/api/admin/subscriptions"),
      requestJson("/api/admin/redeem-codes")
    ]);
    state.users = users.users || [];
    state.plans = plans.plans || [];
    state.subscriptions = subscriptions.subscriptions || [];
    state.redeemCodes = redeemCodes.codes || [];
    renderOverview(overview);
    populateMemberPlanFilterOptions();
    applyFilters();
    
    // 填充套餐下拉框
    if (elements.redeemPlanSelect) {
      elements.redeemPlanSelect.innerHTML = '<option value="">请选择套餐</option>';
      state.plans.forEach(plan => {
        if (plan.active) {
          const option = document.createElement("option");
          option.value = plan.code;
          option.textContent = plan.name;
          elements.redeemPlanSelect.appendChild(option);
        }
      });
    }
    
    renderRedeemCodes();
  } catch (error) {
    setResult(error.message || "后台数据加载失败", true);
  }
}

function renderRedeemCodes() {
  if (!elements.redeemCodesList) return;
  elements.redeemCodesList.innerHTML = "";
  const codes = state.redeemCodes || [];
  if (codes.length === 0) {
    elements.redeemCodesList.innerHTML = '<p class="helper-text">暂无兑换码</p>';
    return;
  }
  codes.forEach(c => {
    const item = document.createElement("div");
    item.className = "code-item";
    item.innerHTML = `
      <code>${c.code}</code>
      <span>${c.planName} · ${c.durationDays}天</span>
      <span>${c.usedCount}/${c.maxUses}次</span>
      <span>${c.expiresAt ? '至 ' + c.expiresAt.slice(0,10) : '永久有效'}</span>
    `;
    elements.redeemCodesList.appendChild(item);
  });
}

function initSectionNavigation() {
  if (!elements.navLinks.length || !("IntersectionObserver" in window)) {
    return;
  }

  const sections = elements.navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const observer = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];

      if (!visibleEntry?.target?.id) {
        return;
      }

      elements.navLinks.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === `#${visibleEntry.target.id}`);
      });
    },
    {
      rootMargin: "-20% 0px -60% 0px",
      threshold: [0.2, 0.45, 0.7]
    }
  );

  sections.forEach((section) => observer.observe(section));
  elements.navLinks[0]?.classList.add("active");
}

elements.settingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await requestJson("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: {
          app_name: elements.settingAppName.value,
          default_member_plan: elements.settingPlan.value,
          guest_plan: elements.settingGuestPlan.value,
          workspace_quota_mb: String(elements.settingQuota.value || 512),
          guest_daily_exports: String(elements.settingGuestDailyExports.value || 0),
          allow_registration: elements.settingAllowRegistration.checked ? "true" : "false",
          ...getSmtpSettingsPayload()
        }
      })
    });
    setResult("后台配置已保存到数据库。");
    await loadAdminData();
  } catch (error) {
    setResult(formatResponseMessage(error, "配置保存失败"), true);
  }
});

elements.testSmtpBtn?.addEventListener("click", async () => {
  const testEmail = String(elements.settingSmtpTestEmail?.value || "").trim();
  elements.testSmtpBtn.disabled = true;
  elements.testSmtpBtn.textContent = "测试中...";
  setElementResult(elements.smtpTestResult, "正在连接 SMTP 并发送测试邮件...", false, {
    visibleClass: "is-visible"
  });

  try {
    const response = await requestJson("/api/admin/smtp/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        settings: getSmtpSettingsPayload()
      })
    });
    const message = formatSmtpTestSuccess(response);
    setElementResult(elements.smtpTestResult, message, false, { visibleClass: "is-visible" });
    setResult(response?.message || "SMTP 测试成功。");
  } catch (error) {
    const message = formatResponseMessage(error, "SMTP 测试失败");
    setElementResult(elements.smtpTestResult, message, true, { visibleClass: "is-visible" });
    setResult(message, true);
  } finally {
    elements.testSmtpBtn.disabled = false;
    elements.testSmtpBtn.textContent = "发送测试邮件";
  }
});

elements.checkUpdateBtn?.addEventListener("click", async () => {
  elements.checkUpdateBtn.disabled = true;
  elements.checkUpdateBtn.textContent = "检查中...";
  setElementResult(elements.versionUpdateResult, "", false, { visibleClass: "is-visible" });

  try {
    const response = await requestJson("/api/admin/version/check", {
      method: "POST"
    });
    state.version = response.current || state.version;
    state.versionCheck = response;
    renderVersionInfo();

    if (response.updateAvailable) {
      const message = response.message
        || `发现新版本 ${formatVersion(response.latest?.version)}，当前为 ${formatVersion(response.current?.version)}。`;
      setElementResult(elements.versionUpdateResult, message, false, { visibleClass: "is-visible" });
      setResult(message);
    } else if (response.message) {
      // If there's an explicit custom message from backend (e.g. no tag in Docker Hub), show it
      setElementResult(elements.versionUpdateResult, response.message, false, { visibleClass: "is-visible" });
      setResult(response.message);
    } else {
      setElementResult(elements.versionUpdateResult, "", false, { visibleClass: "is-visible" });
    }
  } catch (error) {
    const message = error.message || "检查更新失败";
    setElementResult(elements.versionUpdateResult, message, true, { visibleClass: "is-visible" });
    setResult(message, true);
  } finally {
    elements.checkUpdateBtn.disabled = false;
    elements.checkUpdateBtn.textContent = "检查更新";
  }
});

[
  elements.memberSearch,
  elements.memberRoleFilter,
  elements.memberPlanFilter,
  elements.memberExpiryFrom,
  elements.memberExpiryTo,
  elements.planSearch,
  elements.planStatusFilter
].forEach((control) => {
  control?.addEventListener("input", applyFilters);
  control?.addEventListener("change", applyFilters);
});

window.addEventListener("load", () => {
  initSectionNavigation();
  loadAdminData();
  
  // 兑换码生成表单
  elements.redeemCodeForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const planCode = elements.redeemPlanSelect.value;
    const durationDays = Number(elements.redeemDuration.value);
    const count = Number(elements.redeemCount.value);
    const expiresAt = elements.redeemExpiresAt.value;
    
    try {
      const res = await requestJson("/api/admin/redeem-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode,
          durationDays,
          count,
          expiresAt: expiresAt || null
        })
      });
      
      setResult(`成功生成 ${res.codes.length} 个兑换码`, false);
      elements.redeemCodesResult.textContent = `生成成功：${res.codes.join(' ')}`;
      elements.redeemCodesResult.classList.remove("error");
      
      // 刷新列表
      const redeemRes = await requestJson("/api/admin/redeem-codes");
      state.redeemCodes = redeemRes.codes || [];
      renderRedeemCodes();
      elements.redeemCodeForm.reset();
    } catch (error) {
      setResult(error.message || "生成失败", true);
    }
  });
});
