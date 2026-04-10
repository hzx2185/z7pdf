import { requestJson, setResult as setElementResult } from "./common.js";

const elements = {
  shareHint: document.querySelector("#shareHint"),
  shareMeta: document.querySelector("#shareMeta"),
  shareAccessForm: document.querySelector("#shareAccessForm"),
  sharePassword: document.querySelector("#sharePassword"),
  shareDownloadLink: document.querySelector("#shareDownloadLink"),
  shareResult: document.querySelector("#shareResult")
};

const token = new URLSearchParams(window.location.search).get("token") || "";

function setResult(message, isError = false) {
  setElementResult(elements.shareResult, message, isError);
}

function renderShare(share) {
  elements.shareMeta.innerHTML = `
    <strong>${share.file?.originalName || share.fileName || "分享文件"}</strong>
    <span>访问方式：${share.accessMode}</span>
    <span>${share.expiresAt ? `到期：${new Date(share.expiresAt).toLocaleString("zh-CN")}` : "不过期"}</span>
    <span>下载次数：${share.downloadCount}${share.maxDownloads ? ` / ${share.maxDownloads}` : ""}</span>
  `;
  elements.shareHint.textContent = share.requiresAccess
    ? share.accessMode === "login"
      ? "此分享仅限登录会员访问。登录后刷新页面即可下载。"
      : "此分享需要输入访问密码。"
    : "验证通过，可以直接下载。";
  elements.shareAccessForm.classList.toggle("hidden", !share.requiresAccess || share.accessMode !== "password");
  elements.shareDownloadLink.classList.toggle("hidden", Boolean(share.requiresAccess));
  elements.shareDownloadLink.href = `/api/share/${encodeURIComponent(token)}/download`;
}

async function loadShare() {
  if (!token) {
    setResult("缺少分享 token。", true);
    return;
  }
  try {
    const data = await requestJson(`/api/share/${encodeURIComponent(token)}`);
    renderShare(data.share);
  } catch (error) {
    setResult(error.message || "分享读取失败", true);
  }
}

elements.shareAccessForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await requestJson(`/api/share/${encodeURIComponent(token)}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: elements.sharePassword.value
      })
    });
    setResult("访问验证成功，正在准备下载。");
    elements.shareAccessForm.classList.add("hidden");
    elements.shareDownloadLink.classList.remove("hidden");
    elements.shareDownloadLink.click();
    await loadShare();
  } catch (error) {
    setResult(error.message || "访问验证失败", true);
  }
});

window.addEventListener("load", loadShare);
