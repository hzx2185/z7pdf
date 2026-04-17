import {
  cloneAnnotation,
  clampAnnotationPoint,
  clampAnnotationRect,
  createTextBoxRect,
  distanceBetweenPoints,
  drawArrowOnCanvas,
  drawSelectedAnnotationOutline,
  getAnnotationCanvasScale,
  getAnnotationHandleAtPoint,
  getSelectedAnnotationCursor,
  isDirectSelectableAnnotation,
  moveAnnotationFromSnapshot,
  promptTextBoxText,
  resizeRectFromHandle,
  rgbaFromHex,
  updateArrowEndpointFromSnapshot,
  wrapCanvasTextLines
} from "./editor-annotation-utils.js?v=0414b";
export {
  drawManagedOverlayData,
  mountManagedPreviewOverlay,
  redrawManagedPreviewOverlay
} from "./editor-overlay-drawing-runtime.js?v=0414b";

function isManagedOverlayAnnotationInteraction(interaction) {
  return (
    interaction?.type === "move-annotation" ||
    interaction?.type === "resize-annotation" ||
    interaction?.type === "move-arrow-endpoint"
  );
}

function getManagedDraftAnnotationMessage(type) {
  return type === "pencil"
    ? "已添加画线标注。"
    : type === "rect"
      ? "已添加矩形标注。"
      : "已添加箭头标注。";
}


export function attachManagedOverlayEvents({
  overlay,
  page,
  state,
  stopOverlayEvent,
  getCoords,
  ensurePreviewPageState,
  getSelectedAnnotation,
  setSelectedAnnotation,
  clearSelectedAnnotation,
  getAnnotationDefaultStyle,
  findSelectableAnnotationIndexAtPoint,
  selectAnnotationAtIndex,
  beginSelectedAnnotationInteraction,
  editTextBoxAtIndex,
  refreshSelectionDisplay,
  redrawOverlay,
  refreshLinkedLayers,
  updateThumbCard,
  updateMeta,
  updateUndoAvailability,
  renderCropLivePreview,
  cloneCrop,
  isPointInCrop,
  clampCropToBounds,
  cropsEqual,
  pushVisualHistory,
  setResult,
  openPreview,
  applySelectedAnnotationInteraction,
  finalizeSelectedAnnotationInteraction,
  finalizeDraftAnnotation,
  updateCursor
}) {
  const session = {
    suppressTextInsert: false
  };

  overlay.onclick = (event) => {
    if (!state.activeTool) return;

    stopOverlayEvent(event);
    if (session.suppressTextInsert) {
      session.suppressTextInsert = false;
      return;
    }
    if (state.activeTool !== "textbox") return;

    ensurePreviewPageState?.(page);
    const text = promptTextBoxText("");
    if (!text) {
      setResult?.("未输入文本，已取消插入。");
      return;
    }

    const rect = createTextBoxRect(getCoords(event), text);
    if (!rect) {
      setResult?.("文本框位置无效，请换个位置再试。", true);
      return;
    }

    const defaults = getAnnotationDefaultStyle?.("textbox") || {};
    page.annotations.push({
      type: "textbox",
      rect,
      text,
      fontSize: Number(defaults.fontSize || 14),
      lineWidth: Number(defaults.lineWidth || 1.25),
      padding: Number(defaults.padding || 8),
      strokeColor: defaults.strokeColor || "#f97316",
      strokeOpacity: Number(defaults.strokeOpacity ?? 0.9),
      fillColor: defaults.fillColor || "#fff7ed",
      fillOpacity: Number(defaults.fillOpacity ?? 0.92),
      textColor: defaults.textColor || "#111827",
      textOpacity: Number(defaults.textOpacity ?? 0.98)
    });
    pushVisualHistory?.(page, {
      type: "annotation-add",
      index: page.annotations.length - 1
    });
    setSelectedAnnotation?.(page, page.annotations.length - 1);
    redrawOverlay?.(false);
    refreshLinkedLayers?.();
    updateThumbCard?.(page);
    updateMeta?.();
    updateUndoAvailability?.();
    setResult?.("已添加文本框。");
  };

  overlay.ondblclick = (event) => {
    if (!state.activeTool) return;

    stopOverlayEvent(event);
    const coords = getCoords(event);
    const hitIndex = findSelectableAnnotationIndexAtPoint?.(page, coords) ?? -1;
    if (hitIndex < 0) {
      openPreview?.();
      return;
    }

    setSelectedAnnotation?.(page, hitIndex);
    if (page.annotations?.[hitIndex]?.type === "textbox") {
      editTextBoxAtIndex?.(hitIndex);
    } else {
      refreshSelectionDisplay?.();
    }
  };

  overlay.ondragstart = (event) => {
    stopOverlayEvent(event);
  };

  overlay.onmousedown = (event) => {
    if (!state.activeTool) return;

    stopOverlayEvent(event);
    const coords = getCoords(event);
    ensurePreviewPageState?.(page);

    const selected = getSelectedAnnotation?.();
    const selectedIndex = selected ? selected.index : -1;
    if (selectedIndex >= 0 && beginSelectedAnnotationInteraction?.(selectedIndex, coords)) {
      session.suppressTextInsert = true;
      return;
    }

    const hitIndex =
      state.activeTool === "crop" ? -1 : findSelectableAnnotationIndexAtPoint?.(page, coords) ?? -1;

    if (hitIndex >= 0) {
      session.suppressTextInsert = true;
      state.isDrawing = false;
      state.currentLine = null;
      state.previewInteraction = null;
      selectAnnotationAtIndex?.(hitIndex);
      return;
    }

    clearSelectedAnnotation?.({ pageId: page.id });

    if (state.activeTool === "textbox") {
      session.suppressTextInsert = false;
      state.isDrawing = false;
      state.currentLine = null;
      state.previewInteraction = null;
      refreshSelectionDisplay?.();
      return;
    }

    state.isDrawing = true;
    refreshSelectionDisplay?.();

    if (state.activeTool === "pencil") {
      const defaults = getAnnotationDefaultStyle?.("pencil") || {};
      state.currentLine = {
        type: "pencil",
        points: [[coords.x, coords.y]],
        lineWidth: Number(defaults.lineWidth || 2),
        strokeColor: defaults.strokeColor || "#dc2626",
        strokeOpacity: Number(defaults.strokeOpacity ?? 0.8)
      };
      page.annotations.push(state.currentLine);
    } else if (state.activeTool === "rect") {
      const defaults = getAnnotationDefaultStyle?.("rect") || {};
      state.previewInteraction = {
        type: "draw-rect",
        start: clampAnnotationPoint(coords)
      };
      state.currentLine = {
        type: "rect",
        rect: {
          x: coords.x,
          y: coords.y,
          w: 0.001,
          h: 0.001
        },
        lineWidth: Number(defaults.lineWidth || 2),
        strokeColor: defaults.strokeColor || "#0f766e",
        strokeOpacity: Number(defaults.strokeOpacity ?? 0.94),
        fillColor: defaults.fillColor || "#2dd4bf",
        fillOpacity: Number(defaults.fillOpacity ?? 0.14)
      };
      page.annotations.push(state.currentLine);
    } else if (state.activeTool === "arrow") {
      const defaults = getAnnotationDefaultStyle?.("arrow") || {};
      state.previewInteraction = {
        type: "draw-arrow",
        start: clampAnnotationPoint(coords)
      };
      state.currentLine = {
        type: "arrow",
        start: clampAnnotationPoint(coords),
        end: clampAnnotationPoint(coords),
        lineWidth: Number(defaults.lineWidth || 2.5),
        strokeColor: defaults.strokeColor || "#2563eb",
        strokeOpacity: Number(defaults.strokeOpacity ?? 0.96)
      };
      page.annotations.push(state.currentLine);
    } else if (state.activeTool === "crop") {
      state.previewCropOrigin = cloneCrop?.(page.crop);
      if (page.crop && isPointInCrop?.(coords, page.crop)) {
        state.previewInteraction = {
          type: "move-crop",
          start: coords,
          crop: cloneCrop?.(page.crop)
        };
      } else {
        state.previewInteraction = {
          type: "draw-crop"
        };
        page.crop = { x: coords.x, y: coords.y, w: 0.001, h: 0.001 };
        renderCropLivePreview?.(page);
        redrawOverlay?.(true);
      }
    }
  };

  overlay.onmousemove = (event) => {
    const coords = getCoords(event);
    if (!state.isDrawing) {
      updateCursor?.(coords);
      return;
    }

    stopOverlayEvent(event);

    if (isManagedOverlayAnnotationInteraction(state.previewInteraction)) {
      applySelectedAnnotationInteraction?.(coords);
      updateCursor?.(coords);
      return;
    }

    updateCursor?.(coords);

    if (state.activeTool === "pencil" && state.currentLine) {
      state.currentLine.points.push([coords.x, coords.y]);
      redrawOverlay?.(false);
    } else if (state.activeTool === "rect" && state.currentLine && state.previewInteraction?.start) {
      state.currentLine.rect = {
        x: Math.min(state.previewInteraction.start.x, coords.x),
        y: Math.min(state.previewInteraction.start.y, coords.y),
        w: Math.abs(coords.x - state.previewInteraction.start.x),
        h: Math.abs(coords.y - state.previewInteraction.start.y)
      };
      redrawOverlay?.(false);
    } else if (state.activeTool === "arrow" && state.currentLine) {
      state.currentLine.end = clampAnnotationPoint(coords);
      redrawOverlay?.(false);
    } else if (state.activeTool === "crop" && page.crop) {
      if (state.previewInteraction?.type === "move-crop" && state.previewInteraction.crop) {
        const dx = coords.x - state.previewInteraction.start.x;
        const dy = coords.y - state.previewInteraction.start.y;
        page.crop = clampCropToBounds?.({
          x: state.previewInteraction.crop.x + dx,
          y: state.previewInteraction.crop.y + dy,
          w: state.previewInteraction.crop.w,
          h: state.previewInteraction.crop.h
        });
      } else {
        page.crop.w = coords.x - page.crop.x;
        page.crop.h = coords.y - page.crop.y;
      }
      renderCropLivePreview?.(page);
      redrawOverlay?.(true);
    }
  };

  overlay.onmouseup = (event) => {
    if (event && state.activeTool) {
      stopOverlayEvent(event);
    }

    if (isManagedOverlayAnnotationInteraction(state.previewInteraction)) {
      finalizeSelectedAnnotationInteraction?.();
      if (event?.clientX != null && event?.clientY != null) {
        updateCursor?.(getCoords(event));
      }
      return;
    }

    if (state.activeTool === "pencil" || state.activeTool === "rect" || state.activeTool === "arrow") {
      const committedType = finalizeDraftAnnotation?.();
      if (committedType) {
        setResult?.(getManagedDraftAnnotationMessage(committedType));
      }
      return;
    }

    state.isDrawing = false;
    state.currentLine = null;
    if (state.activeTool === "crop" && page.crop) {
      if (state.previewInteraction?.type !== "move-crop") {
        if (page.crop.w < 0) {
          page.crop.x += page.crop.w;
          page.crop.w = Math.abs(page.crop.w);
        }
        if (page.crop.h < 0) {
          page.crop.y += page.crop.h;
          page.crop.h = Math.abs(page.crop.h);
        }
        if (page.crop.w < 0.005 || page.crop.h < 0.005) {
          page.crop = null;
        } else {
          page.crop = clampCropToBounds?.(page.crop);
        }
      }

      const nextCrop = cloneCrop?.(page.crop);
      const previousCrop = cloneCrop?.(state.previewCropOrigin);
      if (!cropsEqual?.(nextCrop, previousCrop)) {
        pushVisualHistory?.(page, {
          type: "crop-change",
          previousCrop
        });
        updateUndoAvailability?.();
      }

      state.previewCropOrigin = null;
      state.previewInteraction = null;
      renderCropLivePreview?.(page);
      redrawOverlay?.(true);
      refreshLinkedLayers?.();
      updateThumbCard?.(page);
      updateMeta?.();
      if (event?.clientX != null && event?.clientY != null) {
        updateCursor?.(getCoords(event));
      } else {
        overlay.style.cursor = state.activeTool ? "crosshair" : "default";
      }
    }
  };

  overlay.onmouseleave = () => {
    if (!state.isDrawing) return;
    if (
      (state.activeTool === "pencil" || state.activeTool === "rect" || state.activeTool === "arrow") &&
      state.currentLine
    ) {
      overlay.onmouseup?.();
      return;
    }
    if (state.activeTool === "crop" && page.crop) {
      overlay.onmouseup?.();
    }
  };

  overlay.onmouseenter = (event) => {
    updateCursor?.(getCoords(event));
  };
}

export function selectManagedOverlayAnnotation({
  index,
  page,
  clearSelectedAnnotation,
  setSelectedAnnotation,
  refreshSelectionDisplay
}) {
  if (index < 0) {
    clearSelectedAnnotation?.({ pageId: page.id });
  } else {
    setSelectedAnnotation?.(page, index);
  }

  refreshSelectionDisplay?.();
}

export function editManagedOverlayTextBox({
  index,
  page,
  pushVisualHistory,
  setSelectedAnnotation,
  refreshSelectionDisplay,
  updateThumbCard,
  updateMeta,
  updateUndoAvailability,
  setResult
}) {
  const annotation = page.annotations?.[index];
  if (!annotation || annotation.type !== "textbox") {
    return false;
  }

  const nextText = promptTextBoxText(annotation.text);
  if (!nextText) {
    return false;
  }

  const previousAnnotation = cloneAnnotation(annotation);
  const desiredRect =
    createTextBoxRect(
      { x: annotation.rect?.x ?? 0, y: annotation.rect?.y ?? 0 },
      nextText
    ) || annotation.rect;

  annotation.text = nextText;
  annotation.rect =
    clampAnnotationRect({
      x: Number(annotation.rect?.x || 0),
      y: Number(annotation.rect?.y || 0),
      w: Math.max(Number(annotation.rect?.w || 0), Number(desiredRect?.w || 0)),
      h: Math.max(Number(annotation.rect?.h || 0), Number(desiredRect?.h || 0))
    }) || annotation.rect;

  pushVisualHistory?.(page, {
    type: "annotation-update",
    index,
    previousAnnotation
  });
  setSelectedAnnotation?.(page, index);
  refreshSelectionDisplay?.();
  updateThumbCard?.(page);
  updateMeta?.();
  updateUndoAvailability?.();
  setResult?.("已更新文本框内容。");
  return true;
}

export function beginManagedOverlayAnnotationInteraction({
  annotationIndex,
  point,
  page,
  state,
  overlay,
  setSelectedAnnotation,
  refreshSelectionDisplay
}) {
  const annotation = page.annotations?.[annotationIndex];
  if (!annotation || !isDirectSelectableAnnotation(annotation)) {
    return false;
  }

  const handle = getAnnotationHandleAtPoint(annotation, point);
  const cursor = handle ? true : getSelectedAnnotationCursor(annotation, point);
  if (!cursor) {
    return false;
  }

  const previousAnnotation = cloneAnnotation(annotation);
  let interaction = null;

  if ((annotation.type === "rect" || annotation.type === "textbox") && handle) {
    interaction = {
      type: "resize-annotation",
      index: annotationIndex,
      handle,
      previousAnnotation
    };
  } else if (annotation.type === "arrow" && handle) {
    interaction = {
      type: "move-arrow-endpoint",
      index: annotationIndex,
      endpoint: handle,
      previousAnnotation
    };
  } else if (
    annotation.type === "rect" ||
    annotation.type === "textbox" ||
    annotation.type === "arrow" ||
    annotation.type === "pencil"
  ) {
    interaction = {
      type: "move-annotation",
      index: annotationIndex,
      start: clampAnnotationPoint(point),
      previousAnnotation
    };
  }

  if (!interaction) {
    return false;
  }

  setSelectedAnnotation?.(page, annotationIndex);
  state.isDrawing = true;
  state.currentLine = null;
  state.previewInteraction = interaction;
  overlay.style.cursor = interaction.type === "move-annotation" ? "grabbing" : overlay.style.cursor;
  refreshSelectionDisplay?.();
  return true;
}

export function applyManagedOverlayAnnotationInteraction({
  point,
  page,
  interaction,
  refreshSelectionDisplay
}) {
  if (!interaction) return false;

  const annotation = page.annotations?.[interaction.index];
  if (!annotation) return false;

  if (interaction.type === "move-annotation") {
    const dx = point.x - interaction.start.x;
    const dy = point.y - interaction.start.y;
    const nextAnnotation = moveAnnotationFromSnapshot(interaction.previousAnnotation, dx, dy);
    if (nextAnnotation) {
      page.annotations[interaction.index] = nextAnnotation;
    }
    refreshSelectionDisplay?.();
    return true;
  }

  if (interaction.type === "resize-annotation") {
    const nextRect = resizeRectFromHandle(interaction.previousAnnotation.rect, interaction.handle, point);
    if (nextRect) {
      page.annotations[interaction.index] = {
        ...annotation,
        rect: nextRect
      };
    }
    refreshSelectionDisplay?.();
    return true;
  }

  if (interaction.type === "move-arrow-endpoint") {
    const nextAnnotation = updateArrowEndpointFromSnapshot(
      interaction.previousAnnotation,
      interaction.endpoint,
      point
    );
    if (nextAnnotation) {
      page.annotations[interaction.index] = nextAnnotation;
    }
    refreshSelectionDisplay?.();
    return true;
  }

  return false;
}

export function finalizeManagedOverlayAnnotationInteraction({
  page,
  state,
  redrawOverlay,
  refreshLinkedLayers,
  updateThumbCard,
  updateMeta,
  pushVisualHistory,
  updateUndoAvailability,
  setSelectedAnnotation,
  setResult
}) {
  const interaction = state.previewInteraction;
  if (!interaction || !Number.isInteger(interaction.index)) {
    return false;
  }

  const annotation = page.annotations?.[interaction.index];
  const previousAnnotation = interaction.previousAnnotation;
  state.isDrawing = false;
  state.currentLine = null;
  state.previewInteraction = null;

  if (!annotation || !previousAnnotation) {
    return false;
  }

  const changed = JSON.stringify(annotation) !== JSON.stringify(previousAnnotation);
  setSelectedAnnotation?.(page, interaction.index);
  redrawOverlay?.(false);
  refreshLinkedLayers?.();
  updateThumbCard?.(page);
  updateMeta?.();

  if (changed) {
    pushVisualHistory?.(page, {
      type: "annotation-update",
      index: interaction.index,
      previousAnnotation
    });
    updateUndoAvailability?.();
    setResult?.("已更新标注位置或尺寸。");
  } else {
    updateUndoAvailability?.();
  }

  return changed;
}

export function finalizeManagedDraftAnnotation({
  page,
  state,
  redrawOverlay,
  refreshLinkedLayers,
  updateThumbCard,
  updateMeta,
  pushVisualHistory,
  updateUndoAvailability,
  setSelectedAnnotation
}) {
  const currentAnnotation = state.currentLine;
  state.isDrawing = false;
  state.currentLine = null;
  state.previewInteraction = null;

  if (!currentAnnotation) return null;

  let keep = false;
  if (currentAnnotation.type === "pencil") {
    keep = currentAnnotation.points.length >= 2;
  } else if (currentAnnotation.type === "rect") {
    const nextRect = clampAnnotationRect(currentAnnotation.rect);
    keep = Boolean(nextRect && nextRect.w >= 0.008 && nextRect.h >= 0.008);
    currentAnnotation.rect = nextRect;
  } else if (currentAnnotation.type === "arrow") {
    currentAnnotation.start = clampAnnotationPoint(currentAnnotation.start);
    currentAnnotation.end = clampAnnotationPoint(currentAnnotation.end);
    keep = distanceBetweenPoints(currentAnnotation.start, currentAnnotation.end) >= 0.012;
  }

  if (!keep) {
    page.annotations = page.annotations.filter((item) => item !== currentAnnotation);
    redrawOverlay?.(false);
    return null;
  }

  const index = page.annotations.indexOf(currentAnnotation);
  if (index >= 0) {
    pushVisualHistory?.(page, {
      type: "annotation-add",
      index
    });
    setSelectedAnnotation?.(page, index);
  }

  redrawOverlay?.(false);
  refreshLinkedLayers?.();
  updateThumbCard?.(page);
  updateMeta?.();
  updateUndoAvailability?.();
  return currentAnnotation.type;
}

export function updateManagedOverlayCursor({
  overlay,
  page,
  coords,
  activeTool,
  previewInteraction,
  getSelectedAnnotation,
  findSelectableAnnotationIndexAtPoint,
  isPointInCrop
}) {
  if (previewInteraction?.type === "move-annotation") {
    overlay.style.cursor = "grabbing";
    return;
  }

  if (activeTool !== "crop") {
    const selected = getSelectedAnnotation?.();
    const selectedAnnotation = selected ? page.annotations?.[selected.index] : null;
    const selectedCursor = getSelectedAnnotationCursor(selectedAnnotation, coords);
    if (selectedCursor) {
      overlay.style.cursor = selectedCursor;
      return;
    }

    if (findSelectableAnnotationIndexAtPoint?.(page, coords) >= 0) {
      overlay.style.cursor = "pointer";
      return;
    }
  }

  if (activeTool === "crop" && page.crop && isPointInCrop?.(coords, page.crop)) {
    overlay.style.cursor = "move";
    return;
  }

  overlay.style.cursor = activeTool ? "crosshair" : "default";
}
