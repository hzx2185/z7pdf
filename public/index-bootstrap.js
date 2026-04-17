const PARTIALS = [
  { mountId: "workbenchMount", url: "/index-workbench.partial.html" },
  { mountId: "modalMount", url: "/index-modals.partial.html" }
];

async function loadPartial({ mountId, url }) {
  const mount = document.getElementById(mountId);
  if (!mount) {
    throw new Error(`Missing mount node: ${mountId}`);
  }

  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Failed to load partial: ${url}`);
  }

  mount.innerHTML = await response.text();
}

async function bootstrapIndexPage() {
  for (const partial of PARTIALS) {
    await loadPartial(partial);
  }

  await import("/editor.js?v=0456");
  await import("/workspace.js?v=0417");
  await import("/index-page.js?v=0415");
}

try {
  await bootstrapIndexPage();
} catch (error) {
  console.error("[IndexBootstrap] Failed to initialize page", error);
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div class="result-message error is-visible" style="position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;">页面初始化失败，请刷新重试。</div>'
  );
}
