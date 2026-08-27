# ComfyUI MiniMax H3 Aspect Helper

## Overview

MiniMax H3 Aspect Helper is a ComfyUI custom node that takes an input image, reads its aspect ratio, and determines a MiniMax H3-friendly target canvas from a selected short edge. It resizes the image while exposing both resized and untouched versions—with both sets of dimensions—for use in separate workflow branches.

## Features

- Automatic input aspect-ratio detection
- Short Edge **Preset** and **Manual** modes
- **Minimax Preset** long-edge selection
- **Calculate** long-edge override
- Dimensions aligned to multiples of 32
- **1,032,192 px** H3 canvas-budget validation
- Configurable **Stop** or **Warn** behavior
- Original and resized image outputs simultaneously
- Original and resized dimensions simultaneously
- Multiline status panel
- Hover tooltips
- Built-in help popup opened by the `?` title-bar button

## Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/xb1n0ry/ComfyUI-MiniMax-H3-Aspect-Helper.git
```

Restart ComfyUI and refresh the frontend.

## Updating

```bash
cd ComfyUI/custom_nodes/ComfyUI-MiniMax-H3-Aspect-Helper
git pull
```

Restart ComfyUI and refresh the frontend after updating.

## Inputs

| Input | Type or choices | Purpose |
|---|---|---|
| `image` | IMAGE | Source image used to detect the aspect ratio, create the resized output, and provide the unchanged original output. |
| `Short Edge Mode` | `Preset`, `Manual` | Chooses whether the short edge comes from the hardcoded preset list or the manual value. Default: `Preset`. |
| `Short Edge Preset` | `352`, `416`, `480`, `544`, `608`, `640`, `672`, `736`, `768`, `832`, `928`, `1024`, `1088` | Target short edge in Preset mode. Default: `768`. |
| `Manual Short Edge` | INT, 32–8192, step 32 | Custom short edge in Manual mode. The effective value is aligned to a multiple of 32. Default: `768`. |
| `Long Edge Mode` | `Calculate`, `Minimax Preset` | Chooses mathematical ×32 calculation or budget-aware selection from the hardcoded long-edge presets. Default: `Minimax Preset`. |
| `Pixel Limit Behavior` | `Stop`, `Warn` | Controls what happens when the final canvas exceeds the H3 canvas budget. Default: `Stop`. |

ComfyUI supplies a hidden `unique_id` input so frontend status and popup events reach the correct node.

## Outputs

| Order | Output | Type | Purpose |
|---:|---|---|---|
| 1 | `resized_image` | IMAGE | Image resized to the selected target canvas. |
| 2 | `resized_height` | INT | Target height. |
| 3 | `resized_width` | INT | Target width. |
| 4 | `original_image` | IMAGE | Original input image passed through unchanged. |
| 5 | `original_height` | INT | Original input height. |
| 6 | `original_width` | INT | Original input width. |

Both versions are exposed simultaneously so the resized and untouched source images can be used in different workflow branches without changing node settings.

## Minimax Preset vs Calculate

### Minimax Preset

The node:

1. Reads the input image aspect ratio.
2. Keeps the selected short edge fixed.
3. Calculates the ideal long edge.
4. Searches the complete hardcoded long-edge lookup table.
5. Chooses the closest suitable preset.
6. Skips preset combinations exceeding `1,032,192 px` when another valid preset is available.
7. If no valid combination is available, allows **Pixel Limit Behavior** to handle the result.

The complete long-edge table is:

`608`, `736`, `864`, `960`, `1056`, `1152`, `1216`, `1280`, `1344`, `1376`, `1504`, `1664`, `1824`, `1920`

Values are not removed merely because one particular short-edge pairing would exceed the budget. Validity depends on the area of the resulting pair.

### Calculate

**Calculate overrides the long edge mathematically and rounds it to a multiple of 32.**

Calculate mode is not restricted to the hardcoded long-edge preset table. If its result exceeds the H3 canvas budget, Stop/Warn behavior applies.

## H3 canvas budget

The H3 canvas budget is **1,032,192 px**. This is an area budget (`width × height`), not a requirement that every output literally be 1344 × 768. Different aspect ratios and long-edge values are valid as long as their total area stays within the budget.

- **Stop:** displays an error and stops workflow execution when the result exceeds the budget.
- **Warn:** displays a warning and continues workflow execution when the result exceeds the budget.

The node never silently reduces the selected short edge.

## Examples

```text
1344 × 768 = 1,032,192 → valid
1376 × 768 = 1,056,768 → over budget
1376 × 736 = 1,012,736 → valid
```

## Status panel and help

The JavaScript extension provides a multiline status panel with the original and resized dimensions, short-edge and long-edge modes, ideal and chosen long edge, pixel count, remaining headroom or overage, limit behavior, and current status.

Hover tooltips explain the inputs, outputs, status panel, and help control. The `?` button in the node title/decor bar opens a built-in help popup. Over-budget execution displays warning or error feedback and applies matching node colors.

## Example workflow

```text
Load Image
    ↓
MiniMax H3 Aspect Helper
    ├── resized_image
    ├── resized_height ──► MiniMax height
    ├── resized_width  ──► MiniMax width
    ├── original_image
    ├── original_height
    └── original_width
```

## Disclaimer

Independent community helper for ComfyUI MiniMax H3 workflows. Not affiliated with or endorsed by MiniMax or ComfyUI.
