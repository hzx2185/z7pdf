export function setResult(target, message, isError = false, options = {}) {
  if (target) {
    const { visibleClass } = options;
    target.textContent = message;
    target.classList.toggle("error", Boolean(isError));
    if (visibleClass) {
      target.classList.toggle(visibleClass, Boolean(message));
    }
  }
  if (message) {
    showToast(message, isError);
  }
}

let toastTimer = null;
export function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  if (toastTimer) {
    clearTimeout(toastTimer);
    toast.classList.remove("show");
  }
  toast.textContent = message;
  toast.classList.toggle("error", Boolean(isError));
  toast.classList.toggle("success", !isError);
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toastTimer = null;
  }, 5000);
}

export async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...options
    });
  } catch (_error) {
    throw new Error("无法连接到服务器，请检查服务是否已启动。");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

export async function requestJsonWithProgress(url, options = {}, onProgress = null) {
  const {
    method = "GET",
    headers = {},
    body = null
  } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.withCredentials = true;

    Object.entries(headers || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        xhr.setRequestHeader(key, value);
      }
    });

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || typeof onProgress !== "function") return;
      onProgress({
        loaded: event.loaded,
        total: event.total,
        percent: Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)))
      });
    };

    xhr.onerror = () => {
      reject(new Error("无法连接到服务器，请检查服务是否已启动。"));
    };

    xhr.onload = () => {
      const data = (() => {
        try {
          return JSON.parse(xhr.responseText || "{}");
        } catch (_error) {
          return {};
        }
      })();

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data.error || "请求失败"));
        return;
      }

      resolve(data);
    };

    xhr.send(body);
  });
}

export function getFilenameFromDisposition(headerValue) {
  if (!headerValue) return "result.pdf";
  const extendedMatch = headerValue.match(/filename\*\s*=\s*([^;]+)/i);
  if (extendedMatch) {
    const extendedValue = extendedMatch[1].trim().replace(/^"(.*)"$/, "$1");
    const charsetSeparator = extendedValue.indexOf("''");
    const encodedName =
      charsetSeparator >= 0 ? extendedValue.slice(charsetSeparator + 2) : extendedValue;
    try {
      return decodeURIComponent(encodedName);
    } catch (_error) {
      // Fall through to the basic filename parser if decoding fails.
    }
  }

  const match = headerValue.match(/filename\s*=\s*"?([^";]+)"?/i);
  return match ? match[1] : "result.pdf";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window
    })
  );

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1500);
}

export async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("Clipboard API failed, falling back:", err);
    }
  }

  // Fallback: Use a hidden textarea
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  let successful = false;
  try {
    successful = document.execCommand("copy");
  } catch (err) {
    console.error("Fallback copy failed:", err);
  }

  document.body.removeChild(textArea);
  return successful;
}
