const navMenuBtn = document.getElementById("navMenuBtn");
const mainNav = document.getElementById("mainNav");
const imageToPdfBtn = document.getElementById("imageToPdfBtn");
const imageToPdfModal = document.getElementById("imageToPdfModal");
const imageToPdfCloseBtn = document.getElementById("imageToPdfCloseBtn");
const imageToPdfCancelBtn = document.getElementById("imageToPdfCancelBtn");
const imageToPdfInput = document.getElementById("imageToPdfInput");
const imagePreviewArea = document.getElementById("imagePreviewArea");
const imagePreviewGrid = document.getElementById("imagePreviewGrid");
const imageCountLabel = document.getElementById("imageCountLabel");
const clearImagesBtn = document.getElementById("clearImagesBtn");
const imageToPdfConvertBtn = document.getElementById("imageToPdfConvertBtn");

let selectedImages = [];

function showPage(pageName) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === pageName);
  });

  document.querySelectorAll(".page-section").forEach((section) => {
    section.classList.toggle(
      "active",
      section.id === pageName || (pageName === "home" && section.id === "features")
    );
  });

  document.body.classList.toggle("workbench-open", pageName === "workbench");
  document.dispatchEvent(new CustomEvent("page:shown", {
    detail: { pageName }
  }));
}

function handleHash() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    showPage(hash);
  } else {
    showPage("features");
  }
}

function closeImageToPdfModal() {
  imageToPdfModal?.classList.add("hidden");
  selectedImages = [];
  updateImagePreview();
}

function updateImagePreview() {
  if (selectedImages.length === 0) {
    imagePreviewArea?.classList.add("hidden");
    return;
  }

  imagePreviewArea?.classList.remove("hidden");
  if (imageCountLabel) {
    imageCountLabel.textContent = `已选择 ${selectedImages.length} 张图片`;
  }

  if (imagePreviewGrid) {
    imagePreviewGrid.innerHTML = selectedImages
      .map(
        (file, index) => `
          <div class="image-pdf-preview-item">
            <img src="${URL.createObjectURL(file)}" alt="待转换图片 ${index + 1}" />
            <button type="button" class="image-pdf-preview-remove" onclick="removeImage(${index})" aria-label="移除第 ${index + 1} 张图片">✕</button>
          </div>
        `
      )
      .join("");
  }
}

function openWorkbenchEditor(openPicker = false) {
  showPage("workbench");
  window.switchToFilesTab?.();
  if (openPicker) {
    window.setTimeout(() => {
      document.getElementById("editorFileInput")?.click();
    }, 120);
  }
}

window.showPage = showPage;
window.removeImage = (index) => {
  selectedImages.splice(index, 1);
  updateImagePreview();
};

navMenuBtn?.addEventListener("click", () => {
  mainNav?.classList.toggle("active");
});

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    if (window.innerWidth <= 720 && mainNav?.classList.contains("active")) {
      mainNav.classList.remove("active");
    }
  });
});

imageToPdfBtn?.addEventListener("click", () => {
  imageToPdfModal?.classList.remove("hidden");
});

imageToPdfCloseBtn?.addEventListener("click", closeImageToPdfModal);
imageToPdfCancelBtn?.addEventListener("click", closeImageToPdfModal);

imageToPdfInput?.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);
  selectedImages = [...selectedImages, ...files];
  updateImagePreview();
  event.target.value = "";
});

clearImagesBtn?.addEventListener("click", () => {
  selectedImages = [];
  updateImagePreview();
});

imageToPdfConvertBtn?.addEventListener("click", async () => {
  if (selectedImages.length === 0) {
    alert("请先选择图片");
    return;
  }

  const layout = document.getElementById("imageLayout")?.value || "1";
  const pageSize = document.getElementById("imagePageSize")?.value || "A4";
  const fit = document.getElementById("imageFit")?.value || "contain";
  const margin = document.getElementById("imageMargin")?.value || 10;
  const gap = document.getElementById("imageGap")?.value || 5;
  const filename = document.getElementById("imageOutputName")?.value || "images_to_pdf.pdf";

  const formData = new FormData();
  selectedImages.forEach((img) => formData.append("images", img));
  formData.append("layout", layout);
  formData.append("pageSize", pageSize);
  formData.append("fit", fit);
  formData.append("margin", margin);
  formData.append("gap", gap);
  formData.append("filename", filename);

  imageToPdfConvertBtn.disabled = true;
  imageToPdfConvertBtn.textContent = "转换中...";

  try {
    const response = await fetch("/api/image-to-pdf", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "转换失败");
    }

    const blob = await response.blob();
    const pdfFile = new File(
      [blob],
      filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
      { type: "application/pdf" }
    );

    if (window.Z7PdfEditor && typeof window.Z7PdfEditor.loadFiles === "function") {
      await window.Z7PdfEditor.loadFiles([pdfFile]);
      closeImageToPdfModal();
    } else {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = pdfFile.name;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      closeImageToPdfModal();
    }
  } catch (error) {
    alert(error.message || "转换失败");
  } finally {
    imageToPdfConvertBtn.disabled = false;
    imageToPdfConvertBtn.textContent = "转换为PDF";
  }
});

document.querySelectorAll(".nav-link[data-page]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const page = link.dataset.page;
    showPage(page);
    history.pushState(null, "", `#${page}`);
  });
});

window.addEventListener("hashchange", handleHash);
handleHash();

document.querySelectorAll(".toolbar-btn[data-menu]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const menuId = button.dataset.menu;
    const dropdown = document.getElementById(`menu${menuId.charAt(0).toUpperCase()}${menuId.slice(1)}`);
    if (!dropdown) {
      return;
    }

    const isOpen = dropdown.classList.contains("open");
    document.querySelectorAll(".dropdown").forEach((element) => element.classList.remove("open"));
    document.querySelectorAll(".toolbar-btn[data-menu]").forEach((element) => element.classList.remove("active"));

    if (!isOpen) {
      dropdown.classList.add("open");
      button.classList.add("active");
    }
  });
});

document.addEventListener("click", () => {
  document.querySelectorAll(".dropdown").forEach((dropdown) => dropdown.classList.remove("open"));
  document.querySelectorAll(".toolbar-btn[data-menu]").forEach((button) => button.classList.remove("active"));
});

document.getElementById("exportMode")?.addEventListener("change", (event) => {
  const splitField = document.getElementById("splitEveryField");
  if (splitField) {
    splitField.style.display = event.target.value === "splitEvery" ? "flex" : "none";
  }
});

document.querySelectorAll(".workspace-tabs .tab-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.workspaceTab;
    document.querySelectorAll(".workspace-tabs .tab-btn").forEach((element) => element.classList.remove("active"));
    button.classList.add("active");
    document.querySelectorAll(".workspace-panel").forEach((panel) => panel.classList.add("hidden"));
    document.querySelector(`.workspace-panel[data-panel="${tab}"]`)?.classList.remove("hidden");
  });
});

const sidebarToggle = document.getElementById("sidebarToggle");
const headerSidebarToggle = document.getElementById("headerSidebarToggle");
const sidebar = document.getElementById("sidebar");
if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });
}
if (headerSidebarToggle && sidebar) {
  headerSidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });
}

document.querySelectorAll(".tab-btn[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;
    document.querySelectorAll(".tab-btn[data-tab]").forEach((element) => element.classList.remove("active"));
    button.classList.add("active");
    document.querySelectorAll(".tab-content").forEach((content) => content.classList.add("hidden"));
    document.getElementById(`workspaceTab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`)?.classList.remove("hidden");
  });
});

document.getElementById("startEditBtn")?.addEventListener("click", () => {
  openWorkbenchEditor(false);
});

document.getElementById("uploadPdfBtn")?.addEventListener("click", () => {
  openWorkbenchEditor(false);
});
