import { clampAnnotationRect } from "./editor-annotation-utils.js?v=0414b";

export const MANAGED_PREVIEW_SEARCH_STATE_KEYS = {
  queryKey: "searchQuery",
  normalizedQueryKey: "normalizedSearchQuery",
  matchesKey: "searchMatches",
  matchesByPageKey: "searchMatchesByPage",
  activeMatchIndexKey: "activeSearchMatchIndex",
  timerKey: "searchTimer",
  runIdKey: "searchRunId",
  pendingKey: "searchPending"
};

export function normalizeSearchQuery(query) {
  return String(query || "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSearchText(text) {
  const normalizedChars = [];
  const normalizedMap = [];
  let lastWasSpace = true;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (/\s/.test(char)) {
      if (!lastWasSpace && normalizedChars.length > 0) {
        normalizedChars.push(" ");
        normalizedMap.push(index);
      }
      lastWasSpace = true;
      continue;
    }

    normalizedChars.push(char.toLocaleLowerCase());
    normalizedMap.push(index);
    lastWasSpace = false;
  }

  if (normalizedChars.at(-1) === " ") {
    normalizedChars.pop();
    normalizedMap.pop();
  }

  return {
    text: normalizedChars.join(""),
    map: normalizedMap
  };
}

export function clearSearchHighlightClasses(rootElement) {
  if (!rootElement) return;

  rootElement
    .querySelectorAll(".preview-search-hit, .preview-search-hit-current")
    .forEach((node) => {
      node.classList.remove("preview-search-hit", "preview-search-hit-current");
    });
}

function buildSearchItemFlags(pageMatches, activeMatch, itemRanges, itemCount) {
  const itemFlags = new Array(Math.min(itemRanges.length, itemCount)).fill(0);

  pageMatches.forEach((match) => {
    const matchFlag =
      activeMatch &&
      activeMatch.pageIndex === match.pageIndex &&
      activeMatch.start === match.start &&
      activeMatch.end === match.end
        ? 2
        : 1;

    for (let itemIndex = 0; itemIndex < itemFlags.length; itemIndex += 1) {
      const range = itemRanges[itemIndex];
      if (!range || range.end <= match.start) continue;
      if (range.start >= match.end) break;
      itemFlags[itemIndex] = Math.max(itemFlags[itemIndex], matchFlag);
    }
  });

  return itemFlags;
}

function applySearchItemFlagClasses(textDivs, itemFlags) {
  itemFlags.forEach((flag, itemIndex) => {
    if (flag === 0) return;
    textDivs[itemIndex]?.classList.add(flag === 2 ? "preview-search-hit-current" : "preview-search-hit");
  });
}

export function renderSearchMatchClassHighlights({
  rootElement,
  textDivs,
  itemRanges,
  pageMatches,
  activeMatch
}) {
  clearSearchHighlightClasses(rootElement);

  if (!rootElement || !Array.isArray(textDivs) || textDivs.length === 0 || !Array.isArray(pageMatches) || pageMatches.length === 0) {
    return;
  }

  const itemFlags = buildSearchItemFlags(pageMatches, activeMatch, itemRanges || [], textDivs.length);
  applySearchItemFlagClasses(textDivs, itemFlags);
}

export function renderSearchMatchCanvasHighlights({
  rootElement,
  canvas,
  textDivs,
  itemRanges,
  pageMatches,
  activeMatch,
  activeFillStyle = "rgba(255, 150, 92, 0.72)",
  activeStrokeStyle = "rgba(255, 119, 61, 0.88)",
  fillStyle = "rgba(255, 218, 121, 0.5)",
  strokeStyle = "rgba(255, 188, 66, 0.34)"
}) {
  const context = canvas?.getContext("2d");
  if (canvas && context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  clearSearchHighlightClasses(rootElement);

  if (
    !rootElement ||
    !canvas ||
    !context ||
    !Array.isArray(textDivs) ||
    textDivs.length === 0 ||
    !Array.isArray(pageMatches) ||
    pageMatches.length === 0
  ) {
    return;
  }

  const itemFlags = buildSearchItemFlags(pageMatches, activeMatch, itemRanges || [], textDivs.length);
  const canvasRect = canvas.getBoundingClientRect();

  itemFlags.forEach((flag, itemIndex) => {
    if (flag === 0) return;
    const textDiv = textDivs[itemIndex];
    const rect = textDiv?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    const x = rect.left - canvasRect.left;
    const y = rect.top - canvasRect.top;
    const width = rect.width;
    const height = rect.height;

    context.save();
    context.fillStyle = flag === 2 ? activeFillStyle : fillStyle;
    context.strokeStyle = flag === 2 ? activeStrokeStyle : strokeStyle;
    context.lineWidth = 1;
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
    context.restore();
  });
}

export function mergeTextAnnotationRects(rects) {
  const sorted = rects
    .map(clampAnnotationRect)
    .filter(Boolean)
    .sort((a, b) => (Math.abs(a.y - b.y) < 0.003 ? a.x - b.x : a.y - b.y));

  const merged = [];
  sorted.forEach((rect) => {
    const last = merged.at(-1);
    if (
      last &&
      Math.abs(last.y - rect.y) < 0.004 &&
      Math.abs(last.h - rect.h) < 0.008 &&
      rect.x <= last.x + last.w + 0.01
    ) {
      const right = Math.max(last.x + last.w, rect.x + rect.w);
      last.x = Math.min(last.x, rect.x);
      last.y = Math.min(last.y, rect.y);
      last.h = Math.max(last.h, rect.h);
      last.w = right - last.x;
      return;
    }

    merged.push({ ...rect });
  });

  return merged;
}

export function clearDomSelection(targetWindow = globalThis.window) {
  const selection = targetWindow?.getSelection?.();
  if (selection && selection.rangeCount > 0) {
    selection.removeAllRanges();
  }
}

export function computeFloatingToolbarPosition({
  anchorX,
  top,
  bottom,
  toolbarRect,
  boundaryRect,
  padding = 16,
  gap = 12
}) {
  let left = anchorX - boundaryRect.left - toolbarRect.width / 2;
  let nextTop = top - boundaryRect.top - toolbarRect.height - gap;

  const maxX = Math.max(padding, boundaryRect.width - toolbarRect.width - padding);
  left = Math.max(padding, Math.min(maxX, left));

  if (nextTop < padding) {
    nextTop = bottom - boundaryRect.top + gap;
  }

  const maxY = Math.max(padding, boundaryRect.height - toolbarRect.height - padding);
  nextTop = Math.max(padding, Math.min(maxY, nextTop));

  return { left, top: nextTop };
}

export function collectSearchMatches(pageIndex, searchIndex, normalizedQuery) {
  if (!normalizedQuery || !searchIndex.normalizedText || !searchIndex.normalizedMap.length) {
    return [];
  }

  const matches = [];
  let fromIndex = 0;

  while (fromIndex < searchIndex.normalizedText.length) {
    const foundIndex = searchIndex.normalizedText.indexOf(normalizedQuery, fromIndex);
    if (foundIndex < 0) break;

    const rawStart = searchIndex.normalizedMap[foundIndex];
    const rawEnd = searchIndex.normalizedMap[foundIndex + normalizedQuery.length - 1] + 1;

    matches.push({
      pageIndex,
      start: rawStart,
      end: rawEnd
    });

    fromIndex = foundIndex + Math.max(1, normalizedQuery.length);
  }

  return matches;
}

export function updateSearchUi({
  statusElement,
  prevButton,
  nextButton,
  pending,
  normalizedQuery,
  matchesLength,
  activeMatchIndex,
  idleLabel = "搜索"
}) {
  if (statusElement) {
    if (pending) {
      statusElement.textContent = "搜索中...";
    } else if (!normalizedQuery) {
      statusElement.textContent = idleLabel;
    } else if (matchesLength === 0) {
      statusElement.textContent = "0 / 0";
    } else {
      statusElement.textContent = `${activeMatchIndex + 1} / ${matchesLength}`;
    }
  }

  const disabled = pending || matchesLength <= 1;
  if (prevButton) {
    prevButton.disabled = disabled;
  }
  if (nextButton) {
    nextButton.disabled = disabled;
  }
}

function resolveSearchKeyMap(keyMap = {}) {
  return {
    queryKey: "query",
    normalizedQueryKey: "normalizedQuery",
    matchesKey: "matches",
    matchesByPageKey: "matchesByPage",
    activeMatchIndexKey: "activeMatchIndex",
    timerKey: "timer",
    runIdKey: "runId",
    pendingKey: "pending",
    ...keyMap
  };
}

export function cancelManagedTextLayer(stateObject, { warnMessage, keyMap = {} } = {}) {
  const {
    textLayerKey = "textLayer",
    textLayerRefKey = "textLayerRef"
  } = keyMap;

  if (stateObject[textLayerKey]) {
    try {
      stateObject[textLayerKey].cancel();
    } catch (error) {
      console.warn(warnMessage || "Text layer cancel failed", error);
    }
  }

  stateObject[textLayerRefKey]?.remove();
  stateObject[textLayerKey] = null;
  stateObject[textLayerRefKey] = null;
}

export function resetManagedSearchState({
  searchState,
  clearInput = false,
  inputElement,
  updateUi,
  clearHighlights,
  timerApi = globalThis.window,
  keyMap
}) {
  const keys = resolveSearchKeyMap(keyMap);

  if (searchState[keys.timerKey]) {
    timerApi?.clearTimeout?.(searchState[keys.timerKey]);
    searchState[keys.timerKey] = null;
  }

  searchState[keys.runIdKey] += 1;
  searchState[keys.pendingKey] = false;
  searchState[keys.matchesKey] = [];
  searchState[keys.matchesByPageKey] = new Map();
  searchState[keys.activeMatchIndexKey] = -1;

  if (clearInput) {
    searchState[keys.queryKey] = "";
    searchState[keys.normalizedQueryKey] = "";
    if (inputElement) {
      inputElement.value = "";
    }
  }

  updateUi?.();
  clearHighlights?.();
}

export function setManagedSearchActiveMatch({
  searchState,
  index,
  updateUi,
  renderHighlights,
  onSelectMatch,
  keyMap
}) {
  const keys = resolveSearchKeyMap(keyMap);
  const matches = searchState[keys.matchesKey];

  if (matches.length === 0) {
    searchState[keys.activeMatchIndexKey] = -1;
    updateUi?.();
    renderHighlights?.();
    return null;
  }

  const total = matches.length;
  const nextIndex = ((index % total) + total) % total;
  const nextMatch = matches[nextIndex];

  searchState[keys.activeMatchIndexKey] = nextIndex;
  updateUi?.();
  onSelectMatch?.(nextMatch, nextIndex);
  return nextMatch;
}

export function scheduleManagedSearch({
  searchState,
  query,
  normalizeQuery,
  runSearch,
  updateUi,
  clearHighlights,
  timerApi = globalThis.window,
  delayMs = 180,
  keyMap
}) {
  const keys = resolveSearchKeyMap(keyMap);

  searchState[keys.queryKey] = query;
  searchState[keys.runIdKey] += 1;

  if (searchState[keys.timerKey]) {
    timerApi?.clearTimeout?.(searchState[keys.timerKey]);
    searchState[keys.timerKey] = null;
  }

  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    void runSearch(query);
    return;
  }

  searchState[keys.pendingKey] = true;
  searchState[keys.matchesKey] = [];
  searchState[keys.matchesByPageKey] = new Map();
  searchState[keys.activeMatchIndexKey] = -1;
  updateUi?.();
  clearHighlights?.();

  searchState[keys.timerKey] = timerApi?.setTimeout?.(() => {
    searchState[keys.timerKey] = null;
    void runSearch(query);
  }, delayMs);
}

export async function activateManagedSearch({
  searchState,
  query,
  normalizeQuery,
  runSearch,
  stepSearch,
  keyMap
}) {
  const keys = resolveSearchKeyMap(keyMap);
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return;

  const needsSearch =
    searchState[keys.pendingKey] ||
    searchState[keys.normalizedQueryKey] !== normalizedQuery;

  if (needsSearch) {
    await runSearch(query);
    return;
  }

  stepSearch();
}

export async function getPageTextContent(page) {
  if (page.isBlank || !page.pdf) {
    return null;
  }

  if (page.previewTextContent) {
    return page.previewTextContent;
  }

  if (!page.previewTextContentPromise) {
    page.previewTextContentPromise = page.pdf
      .getPage(page.sourceIndex + 1)
      .then((pdfPage) => pdfPage.getTextContent())
      .then((textContent) => {
        page.previewTextContent = textContent;
        page.previewTextContentPromise = null;
        return textContent;
      })
      .catch((error) => {
        page.previewTextContentPromise = null;
        throw error;
      });
  }

  return page.previewTextContentPromise;
}

export async function ensurePageSearchIndex(page, normalizeSearchText) {
  if (page.previewSearchIndex) {
    return page.previewSearchIndex;
  }

  if (!page.previewSearchIndexPromise) {
    page.previewSearchIndexPromise = (async () => {
      const textContent = await getPageTextContent(page);
      const rawParts = [];
      const itemRanges = [];
      let offset = 0;

      if (textContent?.items?.length) {
        textContent.items.forEach((item) => {
          const text = typeof item.str === "string" ? item.str : "";
          const start = offset;
          rawParts.push(text);
          offset += text.length;
          itemRanges.push({ start, end: offset });

          if (item.hasEOL) {
            rawParts.push("\n");
            offset += 1;
          }
        });
      }

      const rawText = rawParts.join("");
      const normalized = normalizeSearchText(rawText);

      page.previewSearchIndex = {
        rawText,
        itemRanges,
        normalizedText: normalized.text,
        normalizedMap: normalized.map
      };
      page.previewSearchIndexPromise = null;

      return page.previewSearchIndex;
    })().catch((error) => {
      page.previewSearchIndexPromise = null;
      throw error;
    });
  }

  return page.previewSearchIndexPromise;
}

export async function executeDocumentSearch({
  pages,
  normalizedQuery,
  ensureSearchIndex,
  collectMatches,
  isCancelled,
  yieldControl,
  yieldEvery = 8
}) {
  const matches = [];
  const matchesByPage = new Map();

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    const searchIndex = await ensureSearchIndex(page);

    if (isCancelled?.()) {
      return null;
    }

    const pageMatches = collectMatches(pageIndex, searchIndex, normalizedQuery);
    if (pageMatches.length > 0) {
      matchesByPage.set(pageIndex, pageMatches);
      matches.push(...pageMatches);
    }

    if (yieldControl && pageIndex % yieldEvery === yieldEvery - 1) {
      await yieldControl();
      if (isCancelled?.()) {
        return null;
      }
    }
  }

  return { matches, matchesByPage };
}

function getManagedSearchInputValue(input) {
  return input instanceof HTMLInputElement ? input.value : "";
}

export function attachManagedPreviewSearchEvents({
  previewSearchInput,
  previewSearchPrevBtn,
  previewSearchNextBtn,
  schedulePreviewSearch,
  activatePreviewSearch
}) {
  previewSearchInput?.addEventListener("input", (event) => {
    schedulePreviewSearch?.(getManagedSearchInputValue(event.currentTarget));
  });

  previewSearchInput?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await activatePreviewSearch?.(event.shiftKey ? -1 : 1);
  });

  previewSearchPrevBtn?.addEventListener("click", async (event) => {
    event.stopPropagation();
    await activatePreviewSearch?.(-1);
  });

  previewSearchNextBtn?.addEventListener("click", async (event) => {
    event.stopPropagation();
    await activatePreviewSearch?.(1);
  });
}

export function attachManagedWorkspaceSearchEvents({
  editorWorkspaceSearchToggleBtn,
  editorWorkspaceSearchPanel,
  editorWorkspaceSearchInput,
  editorWorkspaceSearchPrevBtn,
  editorWorkspaceSearchNextBtn,
  workspaceSearchState,
  setWorkspaceSearchPanelVisible,
  scheduleWorkspaceSearch,
  activateWorkspaceSearch
}) {
  editorWorkspaceSearchToggleBtn?.addEventListener("click", () => {
    const willShow = editorWorkspaceSearchPanel?.classList.contains("hidden");
    setWorkspaceSearchPanelVisible?.(Boolean(willShow), {
      focus: Boolean(willShow),
      select: Boolean(willShow),
      clear: !willShow && !workspaceSearchState.normalizedQuery
    });
  });

  editorWorkspaceSearchInput?.addEventListener("input", (event) => {
    scheduleWorkspaceSearch?.(getManagedSearchInputValue(event.currentTarget));
  });

  editorWorkspaceSearchInput?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await activateWorkspaceSearch?.(event.shiftKey ? -1 : 1);
  });

  editorWorkspaceSearchPrevBtn?.addEventListener("click", async (event) => {
    event.stopPropagation();
    await activateWorkspaceSearch?.(-1);
  });

  editorWorkspaceSearchNextBtn?.addEventListener("click", async (event) => {
    event.stopPropagation();
    await activateWorkspaceSearch?.(1);
  });
}
