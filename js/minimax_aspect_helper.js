import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXT_NAME = "bilal.minimax_h3_aspect_helper";
const PY_NODE_NAME = "MiniMaxH3AspectHelper";
const STATUS_WIDGET_NAME = "mmh3_status_panel";

const TOOLTIPS = {
    "image": "Source image used to determine the aspect ratio. The original image is also forwarded unchanged through the Original Image output.",
    "Short Edge Mode": "Choose how the target short edge is selected. Preset uses a MiniMax-compatible preset. Manual uses the value entered in Manual Short Edge.",
    "Short Edge Preset": "Select the target short edge from the known MiniMax-compatible dimensions. Only used when Short Edge Mode is Preset.",
    "Manual Short Edge": "Enter a custom short edge. The value is aligned to a multiple of 32. Only used when Short Edge Mode is Manual.",
    "Long Edge Mode": "Minimax Preset chooses the closest hardcoded long-edge preset to the image aspect ratio while staying within the H3 canvas budget when possible. Calculate overrides the long edge mathematically and rounds it to a multiple of 32.",
    "Pixel Limit Behavior": "Controls what happens when the resized resolution exceeds the 1,032,192 px H3 canvas budget. Stop aborts execution. Warn allows execution and displays a warning.",
    "status": "Shows the detected input resolution, selected sizing modes, ideal and chosen long edge, final resized resolution, pixel count, remaining headroom, and pixel-limit status.",
    "resized_image": "Input image resized to the calculated MiniMax target width and height.",
    "resized_height": "Height of the resized image and calculated MiniMax target resolution.",
    "resized_width": "Width of the resized image and calculated MiniMax target resolution.",
    "original_image": "Original input image forwarded unchanged.",
    "original_height": "Original height of the input image before resizing.",
    "original_width": "Original width of the input image before resizing.",
    "help": "Open MiniMax H3 Aspect Helper help",
};

const HELP_TEXT = `MiniMax H3 Aspect Helper

This node reads the aspect ratio of an input image and creates a MiniMax-friendly target resolution while also preserving access to the original image and dimensions.

Short Edge
Preset uses one of the built-in MiniMax-compatible short-edge values.

Manual lets you enter your own short edge. Manual values are aligned to a multiple of 32.

The selected short edge is kept fixed when determining the target resolution.

Long Edge
The node first calculates the ideal long edge from the input image's aspect ratio.

Minimax Preset selects the closest available long-edge preset to that ideal value while staying within the H3 canvas budget when possible.

Calculate overrides the long edge mathematically and rounds it to a multiple of 32.

Example:

1920 × 1080 input + 768 short edge

Ideal long edge: 1365.33

- Minimax Preset: chooses the closest compatible preset that stays within the H3 canvas budget when possible
- Calculate: rounds the calculated value to a multiple of 32

In Minimax Preset mode, over-budget preset pairs are skipped when another valid preset is available.

Pixel Limit
Maximum target size:

1,032,192 pixels

If the selected resolution exceeds this limit:

- Stop — stops workflow execution and shows an error.
- Warn — displays a warning but allows execution to continue.

The node never silently lowers your selected short edge.

Outputs
The node always provides both versions:

Resized
- Resized Image
- Resized Height
- Resized Width

Original
- Original Image
- Original Height
- Original Width

This lets you use both versions elsewhere in the workflow without changing settings or running the node twice.

Status Panel
The status panel shows:

- original image dimensions
- selected short-edge mode
- selected short edge
- long-edge mode
- mathematically ideal long edge
- actual chosen long edge
- final resized resolution
- total pixel count
- remaining pixel headroom
- current limit status`;

function getWidget(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

function ensureTooltipEl() {
    let el = document.getElementById("mmh3-tooltip");
    if (!el) {
        el = document.createElement("div");
        el.id = "mmh3-tooltip";
        el.style.position = "fixed";
        el.style.zIndex = "100000";
        el.style.maxWidth = "340px";
        el.style.padding = "8px 10px";
        el.style.borderRadius = "8px";
        el.style.background = "rgba(20,20,20,0.96)";
        el.style.color = "#f2f2f2";
        el.style.fontSize = "12px";
        el.style.lineHeight = "1.4";
        el.style.boxShadow = "0 6px 24px rgba(0,0,0,0.35)";
        el.style.border = "1px solid rgba(255,255,255,0.12)";
        el.style.pointerEvents = "none";
        el.style.whiteSpace = "pre-wrap";
        el.style.display = "none";
        document.body.appendChild(el);
    }
    return el;
}

function showTooltip(text, clientX, clientY) {
    if (!text) return;
    const el = ensureTooltipEl();
    el.textContent = text;
    el.style.display = "block";

    const pad = 14;
    let left = clientX + 16;
    let top = clientY + 18;

    const rect = el.getBoundingClientRect();
    if (left + rect.width + pad > window.innerWidth) {
        left = window.innerWidth - rect.width - pad;
    }
    if (top + rect.height + pad > window.innerHeight) {
        top = clientY - rect.height - 12;
    }
    if (left < pad) left = pad;
    if (top < pad) top = pad;

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function hideTooltip() {
    const el = document.getElementById("mmh3-tooltip");
    if (el) el.style.display = "none";
}

function ensureHelpModal() {
    let overlay = document.getElementById("mmh3-help-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "mmh3-help-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.58)";
    overlay.style.zIndex = "100001";
    overlay.style.display = "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "24px";

    const modal = document.createElement("div");
    modal.style.width = "min(760px, 100%)";
    modal.style.maxHeight = "85vh";
    modal.style.overflow = "auto";
    modal.style.background = "#1f1f1f";
    modal.style.color = "#f2f2f2";
    modal.style.border = "1px solid rgba(255,255,255,0.12)";
    modal.style.borderRadius = "12px";
    modal.style.boxShadow = "0 20px 60px rgba(0,0,0,0.45)";
    modal.style.padding = "18px 18px 16px 18px";
    modal.style.boxSizing = "border-box";

    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.alignItems = "center";
    topRow.style.justifyContent = "space-between";
    topRow.style.marginBottom = "10px";

    const title = document.createElement("div");
    title.textContent = "MiniMax H3 Aspect Helper";
    title.style.fontSize = "18px";
    title.style.fontWeight = "700";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.border = "1px solid rgba(255,255,255,0.12)";
    closeBtn.style.background = "#2b2b2b";
    closeBtn.style.color = "#f2f2f2";
    closeBtn.style.padding = "8px 12px";
    closeBtn.style.borderRadius = "8px";
    closeBtn.style.cursor = "pointer";

    const pre = document.createElement("pre");
    pre.textContent = HELP_TEXT;
    pre.style.margin = "0";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-word";
    pre.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    pre.style.fontSize = "14px";
    pre.style.lineHeight = "1.55";

    closeBtn.onclick = () => overlay.style.display = "none";
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.style.display = "none";
    };

    topRow.appendChild(title);
    topRow.appendChild(closeBtn);
    modal.appendChild(topRow);
    modal.appendChild(pre);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    return overlay;
}

function showHelpModal() {
    ensureHelpModal().style.display = "flex";
}

function roundedRect(ctx, x, y, w, h, r = 7) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function wrapLine(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return [text];

    const words = String(text).split(/\s+/);
    const out = [];
    let line = "";

    for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(test).width > maxWidth) {
            out.push(line);
            line = word;
        } else {
            line = test;
        }
    }

    if (line) out.push(line);
    return out.length ? out : [String(text)];
}

function getOrCreateStatusWidget(node) {
    if (node.__mmh3StatusWidget) return node.__mmh3StatusWidget;

    if (node.widgets) {
        node.widgets = node.widgets.filter(
            (w) => w.name !== "status" && w.name !== STATUS_WIDGET_NAME
        );
    }

    const widget = {
        type: "custom",
        name: STATUS_WIDGET_NAME,
        value: "Waiting for execution...",
        serialize: false,
        options: { serialize: false },

        computeSize(width) {
            return [Math.max(width || 300, 300), 200];
        },

        computeLayoutSize() {
            return {
                minWidth: 1,
                minHeight: 200,
                maxHeight: 200,
            };
        },

        draw(ctx, node, widgetWidth, y, H) {
            this.last_y = y;
            this.last_h = H || 200;
            this.last_w = widgetWidth;

            const margin = 10;
            const boxX = margin;
            const boxY = y + 4;
            const boxW = Math.max(40, widgetWidth - margin * 2);
            const boxH = Math.max(192, (H || 200) - 8);

            ctx.save();

            roundedRect(ctx, boxX, boxY, boxW, boxH, 7);
            ctx.fillStyle = "rgba(0,0,0,0.24)";
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.14)";
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.beginPath();
            ctx.rect(boxX + 7, boxY + 7, boxW - 14, boxH - 14);
            ctx.clip();

            ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillStyle = "#d8d8d8";

            const rawLines = String(this.value || "Waiting for execution...").split("\n");
            const maxTextWidth = boxW - 22;
            const lineHeight = 15;
            let ty = boxY + 10;

            for (const raw of rawLines) {
                const wrapped = wrapLine(ctx, raw, maxTextWidth);
                for (const line of wrapped) {
                    if (ty + lineHeight > boxY + boxH - 7) break;
                    ctx.fillText(line, boxX + 11, ty);
                    ty += lineHeight;
                }
            }

            ctx.restore();
        },
    };

    if (typeof node.addCustomWidget === "function") {
        node.addCustomWidget(widget);
    } else {
        node.widgets = node.widgets || [];
        node.widgets.push(widget);
    }

    node.__mmh3StatusWidget = widget;
    return widget;
}

function setStatusText(widget, text) {
    widget.value = text || "No status";
}

function setWidgetEnabled(widget, enabled) {
    if (!widget) return;
    widget.disabled = !enabled;

    if (widget.inputEl) {
        widget.inputEl.disabled = !enabled;
        widget.inputEl.style.opacity = enabled ? "1" : "0.45";
        widget.inputEl.title = TOOLTIPS[widget.name] || "";
    }
}

function updateShortEdgeMode(node) {
    const modeWidget = getWidget(node, "Short Edge Mode");
    const presetWidget = getWidget(node, "Short Edge Preset");
    const manualWidget = getWidget(node, "Manual Short Edge");

    if (!modeWidget) return;

    const usePreset = String(modeWidget.value) === "Preset";
    setWidgetEnabled(presetWidget, usePreset);
    setWidgetEnabled(manualWidget, !usePreset);

    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function installModeCallback(node) {
    const modeWidget = getWidget(node, "Short Edge Mode");
    if (!modeWidget || modeWidget.__mmh3ModeInstalled) return;

    modeWidget.__mmh3ModeInstalled = true;
    const originalCallback = modeWidget.callback;

    modeWidget.callback = function (value) {
        if (originalCallback) originalCallback.apply(this, arguments);
        updateShortEdgeMode(node);
    };

    updateShortEdgeMode(node);
}

function setNodeLevelColor(node, level) {
    if (!node.__mmh3OriginalColors) {
        node.__mmh3OriginalColors = {
            color: node.color,
            bgcolor: node.bgcolor,
        };
    }

    if (level === "error") {
        node.color = "#7a1f1f";
        node.bgcolor = "#3d1616";
    } else if (level === "warn") {
        node.color = "#8a5a00";
        node.bgcolor = "#3f2c00";
    } else {
        node.color = node.__mmh3OriginalColors.color;
        node.bgcolor = node.__mmh3OriginalColors.bgcolor;
    }
}

function showPopup(level, message) {
    const severity =
        level === "error" ? "error" :
        level === "warn" ? "warn" :
        "info";

    const candidates = [
        app.extensionManager?.toast,
        app.extensionManager?.toastManager,
        app.ui?.toast,
        app.ui?.toastManager,
    ].filter(Boolean);

    for (const manager of candidates) {
        try {
            if (typeof manager.add === "function") {
                manager.add({
                    severity,
                    summary: "MiniMax H3 Aspect Helper",
                    detail: message,
                    life: severity === "error" ? 8000 : 6000,
                });
                return;
            }

            if (typeof manager[severity] === "function") {
                manager[severity](message);
                return;
            }
        } catch (_) {}
    }

    if (severity === "error") {
        window.alert(message);
    } else {
        console.warn("[MiniMax H3 Aspect Helper]", message);
    }
}

function ensureReasonableNodeSize(node) {
    const minWidth = 340;

    try {
        const computed = node.computeSize?.();
        const currentW = node.size?.[0] || 0;
        const currentH = node.size?.[1] || 0;
        const wantedW = Math.max(currentW, minWidth, computed?.[0] || 0);
        const wantedH = Math.max(currentH, computed?.[1] || 0);

        if (typeof node.setSize === "function") {
            node.setSize([wantedW, wantedH]);
        }
    } catch (_) {}
}

function installTooltipsAndHelp(nodeType) {
    const origDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function(ctx) {
        if (origDrawForeground) origDrawForeground.apply(this, arguments);
        if (this.flags?.collapsed) return;

        // LiteGraph draws the title/decor bar ABOVE the node body:
        // body starts at y = 0, title bar occupies approximately -titleHeight .. 0.
        // Anchor the help button entirely inside that decoration bar so it never
        // bleeds into the body/widgets.
        const titleHeight =
            (globalThis.LiteGraph && Number(globalThis.LiteGraph.NODE_TITLE_HEIGHT)) ||
            30;

        const w = 16;
        const h = 16;
        const rightPadding = 8;

        const x = (this.size?.[0] || 320) - rightPadding - w;
        const y = -titleHeight + Math.floor((titleHeight - h) / 2);

        this.__mmh3HelpRect = { x, y, w, h };

        ctx.save();
        roundedRect(ctx, x, y, w, h, 4);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#efefef";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", x + w / 2, y + h / 2 + 0.5);
        ctx.restore();
    };

    const origMouseDown = nodeType.prototype.onMouseDown;
    nodeType.prototype.onMouseDown = function(e, localPos, graphCanvas) {
        const p = localPos || [0, 0];
        const r = this.__mmh3HelpRect;
        if (
            r &&
            p[0] >= r.x && p[0] <= r.x + r.w &&
            p[1] >= r.y && p[1] <= r.y + r.h
        ) {
            showHelpModal();
            return true;
        }
        return origMouseDown ? origMouseDown.apply(this, arguments) : false;
    };

    const origMouseMove = nodeType.prototype.onMouseMove;
    nodeType.prototype.onMouseMove = function(e, localPos, graphCanvas) {
        const p = localPos || [0, 0];
        let shown = false;

        const r = this.__mmh3HelpRect;
        if (
            r &&
            p[0] >= r.x && p[0] <= r.x + r.w &&
            p[1] >= r.y && p[1] <= r.y + r.h
        ) {
            showTooltip(TOOLTIPS.help, e.clientX, e.clientY);
            shown = true;
        }

        if (!shown) {
            const statusWidget = this.__mmh3StatusWidget;
            if (statusWidget && statusWidget.last_y != null) {
                const sy = statusWidget.last_y;
                const sh = statusWidget.last_h || 200;
                const sw = (this.size?.[0] || 320) - 20;
                if (p[0] >= 10 && p[0] <= 10 + sw && p[1] >= sy && p[1] <= sy + sh) {
                    showTooltip(TOOLTIPS.status, e.clientX, e.clientY);
                    shown = true;
                }
            }
        }

        // Real input slot tooltip
        if (!shown && this.inputs?.length) {
            const slotPos = this.getConnectionPos?.(true, 0);
            if (slotPos) {
                const dx = p[0] - slotPos[0];
                const dy = p[1] - slotPos[1];
                if (dx * dx + dy * dy <= 100) {
                    showTooltip(TOOLTIPS.image, e.clientX, e.clientY);
                    shown = true;
                }
            }
        }

        // Output slot tooltips
        if (!shown && this.outputs?.length) {
            for (let i = 0; i < this.outputs.length; i++) {
                const out = this.outputs[i];
                const slotPos = this.getConnectionPos?.(false, i);
                if (!slotPos) continue;
                const dx = p[0] - slotPos[0];
                const dy = p[1] - slotPos[1];
                if (dx * dx + dy * dy <= 100) {
                    const tip = TOOLTIPS[out.name];
                    if (tip) {
                        showTooltip(tip, e.clientX, e.clientY);
                        shown = true;
                        break;
                    }
                }
            }
        }

        // Widget row tooltips (best-effort row hit areas)
        if (!shown && this.widgets?.length) {
            let lastY = 26;
            for (const w of this.widgets) {
                const name = w.name;
                if (!TOOLTIPS[name] && name !== STATUS_WIDGET_NAME) continue;

                let y = (w.last_y != null) ? w.last_y : lastY;
                let h = (w.last_h != null) ? w.last_h : (
                    typeof w.computeSize === "function" ? (w.computeSize(this.size?.[0] || 320)?.[1] || 24) : 24
                );

                if (name !== STATUS_WIDGET_NAME) {
                    h = Math.max(22, Math.min(h, 26));
                }

                const x = 8;
                const width = (this.size?.[0] || 320) - 16;
                if (p[0] >= x && p[0] <= x + width && p[1] >= y && p[1] <= y + h) {
                    showTooltip(TOOLTIPS[name], e.clientX, e.clientY);
                    shown = true;
                    break;
                }

                lastY = y + h + 4;
            }
        }

        if (!shown) hideTooltip();

        return origMouseMove ? origMouseMove.apply(this, arguments) : false;
    };

    const origMouseLeave = nodeType.prototype.onMouseLeave;
    nodeType.prototype.onMouseLeave = function() {
        hideTooltip();
        return origMouseLeave ? origMouseLeave.apply(this, arguments) : false;
    };
}

app.registerExtension({
    name: EXT_NAME,

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== PY_NODE_NAME) return;

        installTooltipsAndHelp(nodeType);

        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalOnNodeCreated
                ? originalOnNodeCreated.apply(this, arguments)
                : undefined;

            const statusWidget = getOrCreateStatusWidget(this);
            setStatusText(statusWidget, "Waiting for execution...");

            // Set DOM-element titles where available
            for (const w of this.widgets || []) {
                if (w.inputEl && TOOLTIPS[w.name]) {
                    w.inputEl.title = TOOLTIPS[w.name];
                }
            }

            installModeCallback(this);

            requestAnimationFrame(() => ensureReasonableNodeSize(this));
            return result;
        };

        const originalOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = originalOnConfigure
                ? originalOnConfigure.apply(this, arguments)
                : undefined;

            requestAnimationFrame(() => {
                const statusWidget = getOrCreateStatusWidget(this);
                if (!statusWidget.value) {
                    setStatusText(statusWidget, "Waiting for execution...");
                }

                for (const w of this.widgets || []) {
                    if (w.inputEl && TOOLTIPS[w.name]) {
                        w.inputEl.title = TOOLTIPS[w.name];
                    }
                }

                installModeCallback(this);
                updateShortEdgeMode(this);
                ensureReasonableNodeSize(this);
            });

            return result;
        };
    },

    setup() {
        api.addEventListener(
            "bilal.minimax_h3_aspect_helper.status",
            (event) => {
                const detail = event.detail || {};
                const nodeId = Number(detail.node_id);
                const node = app.graph?.getNodeById?.(nodeId);

                if (!node) return;

                const widget = getOrCreateStatusWidget(node);
                setStatusText(widget, detail.status_text || "No status");

                setNodeLevelColor(node, detail.level || "ok");
                ensureReasonableNodeSize(node);
                app.graph?.setDirtyCanvas?.(true, true);
            }
        );

        api.addEventListener(
            "bilal.minimax_h3_aspect_helper.popup",
            (event) => {
                const detail = event.detail || {};
                showPopup(
                    detail.level || "warn",
                    detail.message || "MiniMax H3 resolution warning."
                );
            }
        );
    },
});
