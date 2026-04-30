import { escapeHtml, requestJson, setResult as setElementResult } from "./common.js?v=0414b";

const elements = {
  overviewCards: document.querySelector("#overviewCards"),
  usersTableBody: document.querySelector("#usersTableBody"),
  subscriptionsTableBody: document.querySelector("#subscriptionsTableBody"),
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
  memberSearch: document.querySelector("#memberSearch"),
  memberRoleFilter: document.querySelector("#memberRoleFilter"),
  planSearch: document.querySelector("#planSearch"),
  planStatusFilter: document.querySelector("#planStatusFilter"),
  subscriptionSearch: document.querySelector("#subscriptionSearch"),
  subscriptionStatusFilter: document.querySelector("#subscriptionStatusFilter"),
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
  subscriptions: []
};

function setResult(message, isError = false) {
  setElementResult(elements.adminResult, message, isError);
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
    admin: "管理员",
    cancelled: "已取消",
    active: "生效中",
    expired: "已过期"
  };
  return labels[status] || status;
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

function renderOverview(data) {
  const cards = [
    { label: "会员数", value: Number(data.stats?.users || 0) },
    { label: "文件数", value: Number(data.stats?.files || 0) },
    { label: "总占用", value: formatBytes(data.stats?.storageBytes || 0) },
    { label: "有效分享", value: Number(data.stats?.shares || 0) },
    { label: "有效会员", value: Number(data.stats?.activeMemberships || 0) }
  ];

  elements.overviewCards.innerHTML = "";
  cards.forEach((card) => {
    const item = document.createElement("article");
    item.className = "overview-card";
    item.innerHTML = `
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <small>后台实时统计</small>
    `;
    elements.overviewCards.appendChild(item);
  });

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
    renderEmptyRow(elements.usersTableBody, 7, "还没有会员数据", "新用户注册后会出现在这里，可直接调整角色和套餐。");
    return;
  }
  users.forEach((user) => {
    const row = document.createElement("tr");
    const roleSelect = createRoleSelect(user.role);
    roleSelect.className = "admin-select";
    const planSelect = createPlanSelect(user.plan);
    planSelect.className = "admin-select";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "ghost-button admin-action-button";
    saveButton.textContent = "保存";
    saveButton.addEventListener("click", async () => {
      try {
        await requestJson(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: roleSelect.value,
            plan: planSelect.value
          })
        });
        setResult(`已更新用户：${user.email}`);
        await loadAdminData();
      } catch (error) {
        setResult(error.message || "用户更新失败", true);
      }
    });

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
      <td>${new Date(user.createdAt).toLocaleString("zh-CN")}</td>
      <td class="admin-cell-action"></td>
    `;
    row.querySelector(".admin-cell-role").appendChild(roleSelect);
    row.querySelector(".admin-cell-plan").appendChild(planSelect);
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
    card.innerHTML = `
      <div class="plan-admin-head">
        <div class="plan-admin-title">
          <strong>${escapeHtml(plan.name)}</strong>
          <span>${escapeHtml(planLabel)}</span>
        </div>
        <div class="plan-admin-badges">
          ${createBadge(plan.active ? "已启用" : "已停用", plan.active ? "success" : "warn")}
          ${createBadge(formatMoney(plan.priceCents), "accent")}
          ${createBadge(formatBillingInterval(plan.billingInterval), "neutral")}
        </div>
      </div>
      <div class="plan-admin-summary">
        <span>${plan.storageQuotaMb} MB 空间</span>
        <span>${plan.maxFiles} 个文件</span>
        <span>${plan.maxShareLinks} 个分享</span>
      </div>
      <label class="field"><span>名称</span><input data-key="name" type="text" value="${plan.name}" /></label>
      <label class="field"><span>说明</span><input data-key="description" type="text" value="${plan.description || ""}" /></label>
      <div class="inline-fields">
        <label class="field"><span>价格（分）</span><input data-key="priceCents" type="number" min="0" step="100" value="${plan.priceCents}" /></label>
        <label class="field"><span>周期</span><select data-key="billingInterval">${buildBillingIntervalOptions(plan.billingInterval)}</select></label>
      </div>
      <div class="inline-fields">
        <label class="field"><span>空间 MB</span><input data-key="storageQuotaMb" type="number" min="1" step="1" value="${plan.storageQuotaMb}" /></label>
        <label class="field"><span>文件数</span><input data-key="maxFiles" type="number" min="1" step="1" value="${plan.maxFiles}" /></label>
        <label class="field"><span>分享数</span><input data-key="maxShareLinks" type="number" min="0" step="1" value="${plan.maxShareLinks}" /></label>
      </div>
      <div class="inline-fields">
        <label class="check"><input data-key="allowCompression" type="checkbox" ${plan.allowCompression ? "checked" : ""} /><span>压缩</span></label>
        <label class="check"><input data-key="allowSplit" type="checkbox" ${plan.allowSplit ? "checked" : ""} /><span>拆分</span></label>
        <label class="check"><input data-key="allowSecurity" type="checkbox" ${plan.allowSecurity ? "checked" : ""} /><span>加密</span></label>
        <label class="check"><input data-key="active" type="checkbox" ${plan.active ? "checked" : ""} /><span>启用</span></label>
      </div>
    `;
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
        const title = card.querySelector(".plan-admin-title strong");
        const subtitle = card.querySelector(".plan-admin-title span");
        const badges = card.querySelector(".plan-admin-badges");
        const summary = card.querySelector(".plan-admin-summary");
        if (title) title.textContent = savedName;
        if (subtitle) subtitle.textContent = formatPlanLabel(savedPlan.code || plan.code);
        if (badges) {
          badges.innerHTML = `
            ${createBadge((savedPlan.active ?? payload.active) ? "已启用" : "已停用", (savedPlan.active ?? payload.active) ? "success" : "warn")}
            ${createBadge(formatMoney(savedPlan.priceCents ?? payload.priceCents), "accent")}
            ${createBadge(formatBillingInterval(savedPlan.billingInterval ?? payload.billingInterval), "neutral")}
          `;
        }
        if (summary) {
          summary.innerHTML = `
            <span>${savedPlan.storageQuotaMb ?? payload.storageQuotaMb} MB 空间</span>
            <span>${savedPlan.maxFiles ?? payload.maxFiles} 个文件</span>
            <span>${savedPlan.maxShareLinks ?? payload.maxShareLinks} 个分享</span>
          `;
        }
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

function renderSubscriptions(subscriptions = []) {
  elements.subscriptionsTableBody.innerHTML = "";
  if (!subscriptions.length) {
    renderEmptyRow(elements.subscriptionsTableBody, 7, "当前没有会员有效期记录", "会员兑换成功或后台手动调整后，会在这里显示当前状态和到期时间。");
    return;
  }
  subscriptions.forEach((subscription) => {
    const row = document.createElement("tr");
    const statusSelect = document.createElement("select");
    ["active", "expired", "cancelled"].forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = formatStatusLabel(status);
      option.selected = status === subscription.status;
      statusSelect.appendChild(option);
    });
    const endInput = document.createElement("input");
    endInput.type = "text";
    endInput.value = subscription.periodEnd;
    endInput.className = "compact-input";
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "ghost-button";
    saveButton.textContent = "保存";
    saveButton.addEventListener("click", async () => {
      try {
        await requestJson(`/api/admin/subscriptions/${subscription.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: statusSelect.value,
            periodEnd: endInput.value
          })
        });
        setResult(`已更新会员有效期 #${subscription.id}`);
        await loadAdminData();
      } catch (error) {
        setResult(error.message || "会员有效期更新失败", true);
      }
    });

    row.innerHTML = `
      <td>${subscription.id}</td>
      <td><strong>${escapeHtml(subscription.userEmail || "")}</strong></td>
      <td>${createBadge(formatPlanLabel(subscription.planCode), "neutral")}</td>
      <td class="admin-cell-role"></td>
      <td>${new Date(subscription.periodStart).toLocaleString("zh-CN")}</td>
      <td class="admin-cell-plan"></td>
      <td class="admin-cell-action"></td>
    `;
    statusSelect.className = "admin-select";
    endInput.classList.add("admin-input");
    saveButton.classList.add("admin-action-button");
    row.querySelector(".admin-cell-role").appendChild(statusSelect);
    row.querySelector(".admin-cell-plan").appendChild(endInput);
    row.querySelector(".admin-cell-action").appendChild(saveButton);
    elements.subscriptionsTableBody.appendChild(row);
  });
}

function applyFilters() {
  const memberKeyword = elements.memberSearch?.value.trim().toLowerCase() || "";
  const memberRole = elements.memberRoleFilter?.value || "";
  const planKeyword = elements.planSearch?.value.trim().toLowerCase() || "";
  const planStatus = elements.planStatusFilter?.value || "";
  const subscriptionKeyword = elements.subscriptionSearch?.value.trim().toLowerCase() || "";
  const subscriptionStatus = elements.subscriptionStatusFilter?.value || "";

  const filteredUsers = state.users.filter((user) => {
    const matchesKeyword =
      !memberKeyword ||
      String(user.email || "").toLowerCase().includes(memberKeyword) ||
      String(user.plan || "").toLowerCase().includes(memberKeyword);
    const matchesRole = !memberRole || String(user.role || "") === memberRole;
    return matchesKeyword && matchesRole;
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

  const filteredSubscriptions = state.subscriptions.filter((subscription) => {
    const matchesKeyword =
      !subscriptionKeyword ||
      String(subscription.userEmail || "").toLowerCase().includes(subscriptionKeyword) ||
      String(subscription.planCode || "").toLowerCase().includes(subscriptionKeyword);
    const matchesStatus = !subscriptionStatus || String(subscription.status || "") === subscriptionStatus;
    return matchesKeyword && matchesStatus;
  });

  renderUsers(filteredUsers);
  renderPlans(filteredPlans);
  renderSubscriptions(filteredSubscriptions);
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
          smtp_host: elements.settingSmtpHost.value.trim(),
          smtp_port: String(elements.settingSmtpPort.value || 465),
          smtp_user: elements.settingSmtpUser.value.trim(),
          smtp_pass: elements.settingSmtpPass.value,
          smtp_from_email: elements.settingSmtpFromEmail.value.trim(),
          smtp_from_name: elements.settingSmtpFromName.value.trim(),
          smtp_secure: elements.settingSmtpSecure.checked ? "true" : "false"
        }
      })
    });
    setResult("后台配置已保存到数据库。");
    await loadAdminData();
  } catch (error) {
    setResult(error.message || "配置保存失败", true);
  }
});

[
  elements.memberSearch,
  elements.memberRoleFilter,
  elements.planSearch,
  elements.planStatusFilter,
  elements.subscriptionSearch,
  elements.subscriptionStatusFilter
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
