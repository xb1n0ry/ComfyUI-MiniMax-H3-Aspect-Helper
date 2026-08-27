import torch
import torch.nn.functional as F

try:
    from server import PromptServer
except Exception:
    PromptServer = None


PIXEL_LIMIT = 1_032_192
MULTIPLE = 32

SHORT_EDGE_PRESETS = (
    "352", "416", "480", "544", "608", "640", "672",
    "736", "768", "832", "928", "1024", "1088"
)

LONG_EDGE_PRESETS = (
    608, 736, 864, 960, 1056, 1152, 1216,
    1280, 1344, 1376, 1504, 1664, 1824, 1920
)

SHORT_EDGE_MODES = ("Preset", "Manual")
LONG_EDGE_MODES = ("Calculate", "Minimax Preset")
PIXEL_LIMIT_BEHAVIORS = ("Stop", "Warn")


def round_to_multiple(value, multiple=MULTIPLE):
    return max(multiple, int(round(float(value) / multiple) * multiple))


def resize_bhwc_image(image, width, height):
    current_h = int(image.shape[1])
    current_w = int(image.shape[2])

    if current_w == width and current_h == height:
        return image

    x = image.movedim(-1, 1)  # BHWC -> BCHW
    x = F.interpolate(
        x,
        size=(height, width),
        mode="bicubic",
        align_corners=False,
        antialias=True,
    )
    return x.movedim(1, -1).clamp(0.0, 1.0)  # BCHW -> BHWC


class MiniMaxH3AspectHelper:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),

                "Short Edge Mode": (SHORT_EDGE_MODES, {
                    "default": "Preset",
                }),

                "Short Edge Preset": (SHORT_EDGE_PRESETS, {
                    "default": "768",
                }),

                "Manual Short Edge": ("INT", {
                    "default": 768,
                    "min": 32,
                    "max": 8192,
                    "step": 32,
                }),

                "Long Edge Mode": (LONG_EDGE_MODES, {
                    "default": "Minimax Preset",
                }),

                "Pixel Limit Behavior": (PIXEL_LIMIT_BEHAVIORS, {
                    "default": "Stop",
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT", "IMAGE", "INT", "INT")
    RETURN_NAMES = (
        "resized_image",
        "resized_height",
        "resized_width",
        "original_image",
        "original_height",
        "original_width",
    )
    FUNCTION = "execute"
    CATEGORY = "MiniMax"
    DESCRIPTION = (
        "Preserves the input image aspect ratio, resolves a MiniMax H3-style "
        "canvas, enforces the 1,032,192 px H3 canvas budget, and outputs both resized and original images and dimensions."
    )

    def _send_event(self, event_name, payload):
        if PromptServer is None:
            return
        try:
            PromptServer.instance.send_sync(event_name, payload)
        except Exception:
            pass

    def _resolve_short_edge(self, short_edge_mode, short_edge_preset, manual_short_edge):
        if short_edge_mode == "Preset":
            requested = int(short_edge_preset)
            source = "Preset"
        else:
            requested = int(manual_short_edge)
            source = "Manual"

        effective = round_to_multiple(requested, MULTIPLE)
        return requested, effective, source

    def _pick_preset_long_edge(self, ideal_long_edge, short_edge):
        """
        Choose the closest hardcoded long-edge preset that:
        1. is not shorter than the selected short edge, and
        2. keeps the final canvas within the H3 budget.

        If no preset can satisfy the H3 budget for the selected short edge,
        fall back to the closest size-compatible preset and let the configured
        Stop/Warn behavior handle the over-budget result.
        """
        size_candidates = [v for v in LONG_EDGE_PRESETS if v >= short_edge]
        if not size_candidates:
            size_candidates = list(LONG_EDGE_PRESETS)

        safe_candidates = [
            v for v in size_candidates
            if (short_edge * v) <= PIXEL_LIMIT
        ]

        candidates = safe_candidates if safe_candidates else size_candidates
        chosen = min(candidates, key=lambda v: (abs(v - ideal_long_edge), v))
        return int(chosen)

    def _calculate_target_size(self, orig_w, orig_h, effective_short_edge, long_edge_mode):
        if orig_w <= 0 or orig_h <= 0:
            raise ValueError(f"Invalid image dimensions: {orig_w}x{orig_h}")

        if orig_w == orig_h:
            return effective_short_edge, effective_short_edge, float(effective_short_edge), "Square Match"

        portrait = orig_w < orig_h

        if portrait:
            ideal_long = effective_short_edge * (orig_h / orig_w)
        else:
            ideal_long = effective_short_edge * (orig_w / orig_h)

        if long_edge_mode == "Calculate":
            chosen_long = round_to_multiple(ideal_long, MULTIPLE)
            long_edge_source = "Calculated"
        else:
            chosen_long = self._pick_preset_long_edge(ideal_long, effective_short_edge)
            long_edge_source = "Preset"

        if portrait:
            target_w = effective_short_edge
            target_h = chosen_long
        else:
            target_w = chosen_long
            target_h = effective_short_edge

        return int(target_w), int(target_h), float(ideal_long), long_edge_source

    def _build_status_text(
        self,
        orig_w,
        orig_h,
        target_w,
        target_h,
        requested_short_edge,
        effective_short_edge,
        short_edge_source,
        short_edge_mode,
        long_edge_mode,
        ideal_long_edge,
        long_edge_source,
        total_pixels,
        over_limit,
        pixel_limit_behavior,
    ):
        if requested_short_edge == effective_short_edge:
            short_edge_line = f"Short        {effective_short_edge}px [{short_edge_source}]"
        else:
            short_edge_line = (
                f"Short        {requested_short_edge}px -> {effective_short_edge}px "
                f"[{short_edge_source} / 32px]"
            )

        if over_limit and pixel_limit_behavior == "Stop":
            status = "Error - Pixel Limit Exceeded"
            level = "error"
        elif over_limit:
            status = "Warning - Pixel Limit Exceeded"
            level = "warn"
        else:
            status = "Ok"
            level = "ok"

        if over_limit:
            over_by = total_pixels - PIXEL_LIMIT
            pct = (over_by / PIXEL_LIMIT) * 100.0
            extra = f"Limit        +{over_by:,} px ({pct:.2f}%)"
        else:
            extra = f"Headroom     {PIXEL_LIMIT - total_pixels:,} px"

        text = (
            f"Input        {orig_w} x {orig_h}\n"
            f"Short Mode   {short_edge_mode}\n"
            f"{short_edge_line}\n"
            f"Long Mode    {long_edge_mode}\n"
            f"Ideal Long   {ideal_long_edge:.2f}px\n"
            f"Long         {max(target_w, target_h)}px [{long_edge_source}]\n"
            f"Resized      {target_w} x {target_h}\n"
            f"Pixels       {total_pixels:,} / {PIXEL_LIMIT:,}\n"
            f"Status       {status}\n"
            f"{extra}\n"
            f"Limit Mode   {pixel_limit_behavior}\n"
            f"Outputs      Resized + Original"
        )

        return text, level

    def execute(self, image, unique_id=None, **kwargs):
        short_edge_mode = kwargs["Short Edge Mode"]
        short_edge_preset = kwargs["Short Edge Preset"]
        manual_short_edge = kwargs["Manual Short Edge"]
        long_edge_mode = kwargs["Long Edge Mode"]
        pixel_limit_behavior = kwargs["Pixel Limit Behavior"]

        if unique_id is None and "unique_id" in kwargs:
            unique_id = kwargs.get("unique_id")

        if image is None:
            raise ValueError("No image received.")
        if len(image.shape) != 4:
            raise ValueError(
                f"Expected ComfyUI IMAGE tensor in BHWC format, got shape: {tuple(image.shape)}"
            )

        orig_h = int(image.shape[1])
        orig_w = int(image.shape[2])

        requested_short_edge, effective_short_edge, short_edge_source = self._resolve_short_edge(
            short_edge_mode, short_edge_preset, manual_short_edge
        )

        target_w, target_h, ideal_long_edge, long_edge_source = self._calculate_target_size(
            orig_w, orig_h, effective_short_edge, long_edge_mode
        )

        total_pixels = target_w * target_h
        over_limit = total_pixels > PIXEL_LIMIT

        status_text, level = self._build_status_text(
            orig_w=orig_w,
            orig_h=orig_h,
            target_w=target_w,
            target_h=target_h,
            requested_short_edge=requested_short_edge,
            effective_short_edge=effective_short_edge,
            short_edge_source=short_edge_source,
            short_edge_mode=short_edge_mode,
            long_edge_mode=long_edge_mode,
            ideal_long_edge=ideal_long_edge,
            long_edge_source=long_edge_source,
            total_pixels=total_pixels,
            over_limit=over_limit,
            pixel_limit_behavior=pixel_limit_behavior,
        )

        self._send_event("bilal.minimax_h3_aspect_helper.status", {
            "node_id": unique_id,
            "level": level,
            "status_text": status_text,
        })

        if over_limit:
            over_by = total_pixels - PIXEL_LIMIT
            pct = (over_by / PIXEL_LIMIT) * 100.0
            message = (
                f"Calculated resolution {target_w} x {target_h} = {total_pixels:,} px "
                f"exceeds the {PIXEL_LIMIT:,} px H3 canvas budget by {over_by:,} px ({pct:.2f}%). "
                f"Lower the short edge."
            )

            self._send_event("bilal.minimax_h3_aspect_helper.popup", {
                "node_id": unique_id,
                "level": "error" if pixel_limit_behavior == "Stop" else "warn",
                "message": message,
            })

            if pixel_limit_behavior == "Stop":
                raise ValueError("MiniMax H3 Aspect Helper: " + message)

        resized_image = resize_bhwc_image(image, target_w, target_h)

        return (
            resized_image,
            int(target_h),
            int(target_w),
            image,
            int(orig_h),
            int(orig_w),
        )


NODE_CLASS_MAPPINGS = {
    "MiniMaxH3AspectHelper": MiniMaxH3AspectHelper,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MiniMaxH3AspectHelper": "MiniMax H3 Aspect Helper",
}
