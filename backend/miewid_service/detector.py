"""
Wildlife Animal Detection Module for WildID Fusion.

Provides:
- WildlifeDetector: ONNX Runtime engine for category-agnostic wildlife detection (MegaDetector standard).
- Standard MegaDetector Categories:
    1: "animal"
    2: "person"
    3: "vehicle"
- Explicit, configurable output format parser:
    1. 'decoded_boxes': End-to-end decoded boxes with shape (1, N, 6): [x1, y1, x2, y2, confidence, class_id]
    2. 'yolov5_raw': Raw YOLOv5/MegaDetector v5 predictions with shape (1, N, 5 + num_classes):
       [xc, yc, w, h, objectness, p_animal, p_person, p_vehicle]
    3. 'yolov8_raw': Raw YOLOv8/v9/MegaDetector v6 predictions with shape (1, 4 + num_classes, N):
       Row 0..3: [xc, yc, w, h], Rows 4..: class probabilities (no separate objectness)
- Aspect-ratio-preserving letterbox preprocessing with (114, 114, 114) padding.
- Reversal of letterbox scaling and padding back to normalized image coordinates [ymin, xmin, ymax, xmax].
- Normalized geometry helpers: bounding box validation, context padding, boundary clamping, and cropping.
- Pure Python Non-Maximum Suppression (NMS).
- Explicit failure state handling when model weights are not loaded.
"""

from pathlib import Path
from typing import List, Dict, Tuple, Optional, Union, Any, Set
import numpy as np
from PIL import Image
from pydantic import BaseModel, Field
import onnxruntime as ort

from .config import config

CATEGORY_MAP: Dict[int, str] = {
    1: "animal",
    2: "person",
    3: "vehicle"
}

SUPPORTED_DETECTOR_FORMATS: Set[str] = {
    "yolov5_raw",
    "yolov8_raw",
    "decoded_boxes"
}

LETTERBOX_PAD_COLOR: Tuple[int, int, int] = (114, 114, 114)


class DetectorModelError(Exception):
    """Raised when wildlife detector weights are unavailable, unsupported, or inference fails."""
    pass


class BoundingBoxNormalized(BaseModel):
    """
    Normalized bounding box coordinates in [0.0, 1.0].
    Standard format: [ymin, xmin, ymax, xmax].
    """
    ymin: float = Field(..., ge=0.0, le=1.0, description="Top boundary normalized [0, 1]")
    xmin: float = Field(..., ge=0.0, le=1.0, description="Left boundary normalized [0, 1]")
    ymax: float = Field(..., ge=0.0, le=1.0, description="Bottom boundary normalized [0, 1]")
    xmax: float = Field(..., ge=0.0, le=1.0, description="Right boundary normalized [0, 1]")

    def to_list(self) -> List[float]:
        return [round(self.ymin, 4), round(self.xmin, 4), round(self.ymax, 4), round(self.xmax, 4)]


class DetectionResult(BaseModel):
    """Single object detection with category and confidence score."""
    box: BoundingBoxNormalized
    category_id: int = Field(..., description="1: animal, 2: person, 3: vehicle")
    category_name: str = Field(..., description="'animal', 'person', or 'vehicle'")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Detector confidence in [0.0, 1.0]")


class DetectionBatchResult(BaseModel):
    """Contract for detector execution output."""
    status: str = Field(..., description="'SUCCESS', 'NO_ANIMALS', or 'UNAVAILABLE'")
    total_detections: int
    animal_detections: List[DetectionResult]
    non_animal_detections: List[DetectionResult]
    primary_animal: Optional[DetectionResult] = None
    crop_padding_applied: float
    disclaimer: str = (
        "Primary crop selects the detection with the highest detector confidence score. "
        "Highest confidence indicates strongest detector activation, NOT necessarily "
        "the most ecologically relevant animal in a multi-subject camera-trap frame."
    )


# ---------------------------------------------------------------------------
# Letterbox Preprocessing & Box Inversion Helpers
# ---------------------------------------------------------------------------

def letterbox_image(
    image: Image.Image,
    target_size: Tuple[int, int] = (640, 640),
    fill_color: Tuple[int, int, int] = LETTERBOX_PAD_COLOR
) -> Tuple[Image.Image, float, Tuple[int, int]]:
    """
    Resizes image while preserving aspect ratio, placing it centered on a canvas of
    target_size (width, height) with fill_color padding.

    Returns:
        (letterboxed_image, scale_factor, (pad_left, pad_top))
    """
    orig_w, orig_h = image.size
    target_w, target_h = target_size

    if orig_w <= 0 or orig_h <= 0 or target_w <= 0 or target_h <= 0:
        raise ValueError(
            f"Invalid dimensions for letterboxing: orig=({orig_w}, {orig_h}), target=({target_w}, {target_h})"
        )

    scale = min(target_w / orig_w, target_h / orig_h)
    new_w = int(round(orig_w * scale))
    new_h = int(round(orig_h * scale))

    resized_img = image.resize((new_w, new_h), Image.Resampling.BILINEAR)

    pad_left = int(round((target_w - new_w) / 2.0))
    pad_top = int(round((target_h - new_h) / 2.0))

    canvas = Image.new("RGB", (target_w, target_h), color=fill_color)
    canvas.paste(resized_img, (pad_left, pad_top))

    return canvas, scale, (pad_left, pad_top)


def unletterbox_box(
    box_coords: Union[List[float], Tuple[float, float, float, float]],
    scale: float,
    pad_offset: Tuple[int, int],
    orig_size: Tuple[int, int],
    target_size: Tuple[int, int]
) -> Optional[BoundingBoxNormalized]:
    """
    Inverts letterboxing and scaling for a bounding box [x1, y1, x2, y2] from model canvas
    space back to original image space, normalized to [0.0, 1.0].

    Parameters:
        box_coords: [x1, y1, x2, y2] in model space (pixel or normalized)
        scale: scale ratio used during letterboxing (target / orig)
        pad_offset: (pad_left, pad_top) offset in model pixel grid
        orig_size: (orig_w, orig_h) of the original unpadded image
        target_size: (target_w, target_h) of the letterboxed model input

    Returns:
        BoundingBoxNormalized [ymin, xmin, ymax, xmax] in [0.0, 1.0], or None if degenerate.
    """
    if scale <= 0.0:
        raise ValueError(f"Invalid scale factor for box unletterboxing: {scale}")

    x1, y1, x2, y2 = [float(c) for c in box_coords]
    orig_w, orig_h = orig_size
    target_w, target_h = target_size
    pad_x, pad_y = pad_offset

    # If coordinates are normalized [0.0, 1.0] relative to model canvas,
    # convert them to model pixel space first:
    if max(x1, y1, x2, y2) <= 1.05 and min(x1, y1, x2, y2) >= -0.05:
        x1 *= target_w
        y1 *= target_h
        x2 *= target_w
        y2 *= target_h

    # Subtract padding offset and unscale to original unpadded pixel dimensions
    x1_unscaled = (x1 - pad_x) / scale
    y1_unscaled = (y1 - pad_y) / scale
    x2_unscaled = (x2 - pad_x) / scale
    y2_unscaled = (y2 - pad_y) / scale

    # Normalize by original image dimensions
    xmin = x1_unscaled / orig_w
    ymin = y1_unscaled / orig_h
    xmax = x2_unscaled / orig_w
    ymax = y2_unscaled / orig_h

    try:
        return validate_and_normalize_box([ymin, xmin, ymax, xmax], clamp=True)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Geometry & Crop Helpers
# ---------------------------------------------------------------------------

def validate_and_normalize_box(
    coords: Union[List[float], Tuple[float, ...]],
    clamp: bool = True
) -> BoundingBoxNormalized:
    """
    Validates and normalizes coordinates [ymin, xmin, ymax, xmax].
    Ensures ymin <= ymax and xmin <= xmax.
    Clamps bounds to [0.0, 1.0] if clamp is True.
    """
    if len(coords) != 4:
        raise ValueError(f"Expected 4 bounding box coordinates [ymin, xmin, ymax, xmax], got {len(coords)}")

    ymin, xmin, ymax, xmax = [float(c) for c in coords]

    if ymin > ymax:
        raise ValueError(f"Invalid box geometry: ymin ({ymin}) cannot be greater than ymax ({ymax})")
    if xmin > xmax:
        raise ValueError(f"Invalid box geometry: xmin ({xmin}) cannot be greater than xmax ({xmax})")

    if clamp:
        ymin = max(0.0, min(1.0, ymin))
        xmin = max(0.0, min(1.0, xmin))
        ymax = max(0.0, min(1.0, ymax))
        xmax = max(0.0, min(1.0, xmax))

    # Guard against zero-area box after clamping
    if ymin >= ymax or xmin >= xmax:
        raise ValueError(f"Degenerate zero-area bounding box: [{ymin}, {xmin}, {ymax}, {xmax}]")

    return BoundingBoxNormalized(ymin=ymin, xmin=xmin, ymax=ymax, xmax=xmax)


def apply_padding_and_scale_box(
    box: BoundingBoxNormalized,
    padding: float,
    image_width: int,
    image_height: int
) -> Tuple[int, int, int, int]:
    """
    Expands a normalized box by context padding and converts to pixel integers (x1, y1, x2, y2).
    Clamps strictly to [0, image_width] and [0, image_height].
    """
    if image_width <= 0 or image_height <= 0:
        raise ValueError(f"Invalid image dimensions: {image_width}x{image_height}")

    bw = box.xmax - box.xmin
    bh = box.ymax - box.ymin

    pad_w = bw * padding
    pad_h = bh * padding

    # Expand and clamp normalized coordinates
    xmin_norm = max(0.0, box.xmin - pad_w)
    xmax_norm = min(1.0, box.xmax + pad_w)
    ymin_norm = max(0.0, box.ymin - pad_h)
    ymax_norm = min(1.0, box.ymax + pad_h)

    # Convert to pixel space (PIL crop requires (left, top, right, bottom))
    x1 = int(round(xmin_norm * image_width))
    y1 = int(round(ymin_norm * image_height))
    x2 = int(round(xmax_norm * image_width))
    y2 = int(round(ymax_norm * image_height))

    # Boundary safety
    x1 = max(0, min(image_width - 1, x1))
    y1 = max(0, min(image_height - 1, y1))
    x2 = max(x1 + 1, min(image_width, x2))
    y2 = max(y1 + 1, min(image_height, y2))

    return x1, y1, x2, y2


def crop_detection(
    image: Image.Image,
    box: BoundingBoxNormalized,
    padding: float = config.detector_crop_padding
) -> Image.Image:
    """
    Crops an image using the specified normalized box and context padding.
    """
    x1, y1, x2, y2 = apply_padding_and_scale_box(box, padding, image.width, image.height)
    return image.crop((x1, y1, x2, y2))


def compute_iou(box1: BoundingBoxNormalized, box2: BoundingBoxNormalized) -> float:
    """Computes Intersection over Union (IoU) between two normalized boxes."""
    inter_ymin = max(box1.ymin, box2.ymin)
    inter_xmin = max(box1.xmin, box2.xmin)
    inter_ymax = min(box1.ymax, box2.ymax)
    inter_xmax = min(box1.xmax, box2.xmax)

    if inter_ymax <= inter_ymin or inter_xmax <= inter_xmin:
        return 0.0

    inter_area = (inter_ymax - inter_ymin) * (inter_xmax - inter_xmin)
    area1 = (box1.ymax - box1.ymin) * (box1.xmax - box1.xmin)
    area2 = (box2.ymax - box2.ymin) * (box2.xmax - box2.xmin)
    union_area = area1 + area2 - inter_area

    if union_area <= 0.0:
        return 0.0
    return inter_area / union_area


def apply_nms(
    detections: List[DetectionResult],
    iou_threshold: float = config.detector_nms_threshold
) -> List[DetectionResult]:
    """Pure Python Non-Maximum Suppression on detection candidates."""
    if not detections:
        return []

    # Sort descending by confidence
    sorted_dets = sorted(detections, key=lambda d: d.confidence, reverse=True)
    selected: List[DetectionResult] = []

    while sorted_dets:
        chosen = sorted_dets.pop(0)
        selected.append(chosen)

        # Discard overlapping detections of the same category
        remaining = []
        for d in sorted_dets:
            if d.category_id == chosen.category_id:
                iou = compute_iou(chosen.box, d.box)
                if iou < iou_threshold:
                    remaining.append(d)
            else:
                remaining.append(d)
        sorted_dets = remaining

    return selected


# ---------------------------------------------------------------------------
# WildlifeDetector Class
# ---------------------------------------------------------------------------

class WildlifeDetector:
    """
    Pretrained Wildlife Animal Detector using ONNX Runtime.
    Keeps detector session completely isolated from MiewID Re-ID inference engine.
    Supports configurable output formats: 'yolov5_raw', 'yolov8_raw', and 'decoded_boxes'.
    """

    def __init__(
        self,
        model_path: Optional[Union[str, Path]] = None,
        confidence_threshold: float = config.detector_confidence_threshold,
        nms_threshold: float = config.detector_nms_threshold,
        crop_padding: float = config.detector_crop_padding,
        output_format: Optional[str] = None
    ):
        self.confidence_threshold = confidence_threshold
        self.nms_threshold = nms_threshold
        self.crop_padding = crop_padding

        self.output_format = output_format or config.detector_output_format
        if self.output_format not in SUPPORTED_DETECTOR_FORMATS:
            raise DetectorModelError(
                f"Unsupported detector output format '{self.output_format}'. "
                f"Supported formats: {sorted(list(SUPPORTED_DETECTOR_FORMATS))}"
            )

        self.session: Optional[ort.InferenceSession] = None
        self.input_name: str = ""
        self.output_name: str = ""
        self.resolved_model_path: Optional[Path] = None
        self.blocker_reason: Optional[str] = None

        self._initialize_model(model_path)

    def _initialize_model(self, model_path: Optional[Union[str, Path]]) -> None:
        """Attempts to load detector ONNX model from configured local path."""
        if model_path is not None:
            candidates = [Path(model_path)]
            target_desc = str(model_path)
        else:
            candidates = [config.detector_model_path, Path("megadetector.onnx")]
            target_desc = str(config.detector_model_path)

        for path in candidates:
            if path and path.exists() and path.is_file():
                try:
                    opts = ort.SessionOptions()
                    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                    providers = ["CPUExecutionProvider"]
                    self.session = ort.InferenceSession(str(path), sess_options=opts, providers=providers)
                    self.input_name = self.session.get_inputs()[0].name
                    self.output_name = self.session.get_outputs()[0].name
                    self.resolved_model_path = path
                    return
                except Exception as e:
                    self.blocker_reason = f"Failed to load ONNX detector session at {path}: {str(e)}"
                    return

        self.blocker_reason = (
            f"Detector model weights not found at '{target_desc}'. "
            "Setup required: place verified, licensed MegaDetector ONNX weights in the models directory. "
            "See DETECTOR_SETUP.md for instructions."
        )

    @property
    def is_loaded(self) -> bool:
        """Returns True if the ONNX detector session is active."""
        return self.session is not None

    def detect(self, image: Image.Image) -> DetectionBatchResult:
        """
        Runs object detection on the input image using aspect-ratio-preserving letterboxing.

        Raises DetectorModelError if model weights are not loaded or if inference fails.
        Never silently bypasses detection or returns synthetic success when weights are missing.
        """
        if not self.is_loaded:
            raise DetectorModelError(
                f"Wildlife detector is unavailable. Reason: {self.blocker_reason}"
            )

        # Retrieve expected model input shape (default to 640x640 if dynamic or unspecified)
        input_shape = self.session.get_inputs()[0].shape
        det_h = input_shape[2] if len(input_shape) >= 4 and isinstance(input_shape[2], int) else 640
        det_w = input_shape[3] if len(input_shape) >= 4 and isinstance(input_shape[3], int) else 640

        target_size = (det_w, det_h)
        orig_size = (image.width, image.height)

        # 1. Letterbox preprocessing with aspect-ratio preservation
        letterboxed_img, scale, pad_offset = letterbox_image(
            image=image.convert("RGB"),
            target_size=target_size,
            fill_color=LETTERBOX_PAD_COLOR
        )

        # 2. Normalize pixel values to [0.0, 1.0] and format as NCHW tensor
        img_arr = np.array(letterboxed_img, dtype=np.float32) / 255.0
        img_arr = np.transpose(img_arr, (2, 0, 1))
        input_tensor = np.expand_dims(img_arr, axis=0).astype(np.float32)

        # 3. Run ONNX inference
        outputs = self.session.run(None, {self.input_name: input_tensor})

        # 4. Parse output according to configured output_format
        raw_detections = self._parse_onnx_outputs(
            outputs=outputs,
            orig_size=orig_size,
            target_size=target_size,
            scale=scale,
            pad_offset=pad_offset
        )

        return self.process_detections(raw_detections)

    def _parse_onnx_outputs(
        self,
        outputs: List[np.ndarray],
        orig_size: Tuple[int, int] = (640, 640),
        target_size: Tuple[int, int] = (640, 640),
        scale: float = 1.0,
        pad_offset: Tuple[int, int] = (0, 0)
    ) -> List[DetectionResult]:
        """
        Dispatches tensor parsing to the configured output format parser.
        Validates outputs and explicitly rejects unknown formats or invalid outputs.
        """
        if not outputs or not isinstance(outputs, (list, tuple)):
            raise DetectorModelError("Model execution returned empty or invalid output tensors")

        out = outputs[0]
        if not isinstance(out, np.ndarray):
            raise DetectorModelError(f"Expected numpy ndarray in model outputs, got {type(out)}")

        if not np.all(np.isfinite(out)):
            raise DetectorModelError("Model output tensor contains non-finite values (NaN or Inf)")

        if self.output_format == "decoded_boxes":
            return self._parse_decoded_boxes(out, orig_size, target_size, scale, pad_offset)
        elif self.output_format == "yolov5_raw":
            return self._parse_yolov5_raw(out, orig_size, target_size, scale, pad_offset)
        elif self.output_format == "yolov8_raw":
            return self._parse_yolov8_raw(out, orig_size, target_size, scale, pad_offset)
        else:
            raise DetectorModelError(
                f"Unsupported detector output format: '{self.output_format}'. "
                f"Supported formats: {sorted(list(SUPPORTED_DETECTOR_FORMATS))}"
            )

    def _parse_decoded_boxes(
        self,
        out: np.ndarray,
        orig_size: Tuple[int, int],
        target_size: Tuple[int, int],
        scale: float,
        pad_offset: Tuple[int, int]
    ) -> List[DetectionResult]:
        """
        Parses end-to-end decoded boxes with layout:
            Shape: (1, num_boxes, 6)
            Row: [x1, y1, x2, y2, confidence, class_id]

        Contract details:
        - Box coordinates [x1, y1, x2, y2] are corners in letterboxed model space.
        - Confidence is extracted directly from column 4.
        - Class ID is extracted directly from column 5 as integer category ID (1: animal, 2: person, 3: vehicle).
          NO offset is added.
        """
        if out.ndim != 3 or out.shape[0] != 1 or out.shape[2] != 6:
            raise DetectorModelError(
                f"Tensor shape mismatch for 'decoded_boxes': expected (1, num_boxes, 6), got {out.shape}"
            )

        detections: List[DetectionResult] = []
        rows = out[0]

        # Filter by confidence threshold
        conf_mask = rows[:, 4] >= self.confidence_threshold
        valid_indices = np.where(conf_mask)[0]

        for idx in valid_indices:
            row = rows[idx]
            conf = float(row[4])
            cls_id = int(round(float(row[5])))
            x1, y1, x2, y2 = float(row[0]), float(row[1]), float(row[2]), float(row[3])

            box = unletterbox_box(
                box_coords=[x1, y1, x2, y2],
                scale=scale,
                pad_offset=pad_offset,
                orig_size=orig_size,
                target_size=target_size
            )
            if box is None:
                continue

            detections.append(DetectionResult(
                box=box,
                category_id=cls_id,
                category_name=CATEGORY_MAP.get(cls_id, "unknown"),
                confidence=round(conf, 4)
            ))

        return detections

    def _parse_yolov5_raw(
        self,
        out: np.ndarray,
        orig_size: Tuple[int, int],
        target_size: Tuple[int, int],
        scale: float,
        pad_offset: Tuple[int, int]
    ) -> List[DetectionResult]:
        """
        Parses raw YOLOv5-style predictions (e.g. MegaDetector v5 ONNX exports):
            Shape: (1, num_anchors, 5 + num_classes) where num_classes >= 1
            Row: [xc, yc, w, h, objectness, p_class0, p_class1, p_class2, ...]

        Contract details:
        - Coordinates [xc, yc, w, h] are center and dimensions in model input pixel grid [0, target_w/h].
        - Corner conversion: x1 = xc - w/2, y1 = yc - h/2, x2 = xc + w/2, y2 = yc + h/2.
        - Confidence score per class: score_c = objectness * p_class_c.
        - Winning class: best_class = argmax(score_c), confidence = max(score_c).
        - Class mapping: 0-indexed class index c maps to MegaDetector category ID (c + 1):
          0 -> 1 ('animal'), 1 -> 2 ('person'), 2 -> 3 ('vehicle').
        """
        if out.ndim != 3 or out.shape[0] != 1 or out.shape[2] < 6:
            raise DetectorModelError(
                f"Tensor shape mismatch for 'yolov5_raw': expected (1, num_anchors, 5 + num_classes) with shape[2] >= 6, got {out.shape}"
            )

        detections: List[DetectionResult] = []
        rows = out[0]  # shape: (num_anchors, 5 + num_classes)

        obj_conf = rows[:, 4]
        class_probs = rows[:, 5:]  # shape: (num_anchors, num_classes)

        # Multi-class confidence score: objectness * conditional class probability
        class_scores = obj_conf[:, None] * class_probs
        best_class_indices = np.argmax(class_scores, axis=1)
        best_scores = np.max(class_scores, axis=1)

        # Filter by confidence threshold
        valid_mask = best_scores >= self.confidence_threshold
        valid_indices = np.where(valid_mask)[0]

        for idx in valid_indices:
            conf = float(best_scores[idx])
            cls_idx = int(best_class_indices[idx])
            cat_id = cls_idx + 1  # 0-indexed YOLO classes map to 1-indexed MegaDetector category IDs

            xc = float(rows[idx, 0])
            yc = float(rows[idx, 1])
            w = float(rows[idx, 2])
            h = float(rows[idx, 3])

            x1 = xc - (w / 2.0)
            y1 = yc - (h / 2.0)
            x2 = xc + (w / 2.0)
            y2 = yc + (h / 2.0)

            box = unletterbox_box(
                box_coords=[x1, y1, x2, y2],
                scale=scale,
                pad_offset=pad_offset,
                orig_size=orig_size,
                target_size=target_size
            )
            if box is None:
                continue

            detections.append(DetectionResult(
                box=box,
                category_id=cat_id,
                category_name=CATEGORY_MAP.get(cat_id, "unknown"),
                confidence=round(conf, 4)
            ))

        return detections

    def _parse_yolov8_raw(
        self,
        out: np.ndarray,
        orig_size: Tuple[int, int],
        target_size: Tuple[int, int],
        scale: float,
        pad_offset: Tuple[int, int]
    ) -> List[DetectionResult]:
        """
        Parses raw YOLOv8/v9-style predictions (e.g. MegaDetector v6 ONNX exports):
            Shape: (1, 4 + num_classes, num_anchors) where num_classes >= 1 and 4 + num_classes < num_anchors
            Channels:
                0: xc (center x in model pixel grid)
                1: yc (center y in model pixel grid)
                2: w  (width in model pixel grid)
                3: h  (height in model pixel grid)
                4..: class probability scores directly (no separate objectness branch)

        Contract details:
        - Coordinates [xc, yc, w, h] are center and dimensions in model input pixel grid [0, target_w/h].
        - Corner conversion: x1 = xc - w/2, y1 = yc - h/2, x2 = xc + w/2, y2 = yc + h/2.
        - Confidence score per class: score_c = p_class_c.
        - Winning class: best_class = argmax(score_c), confidence = max(score_c).
        - Class mapping: 0-indexed class index c maps to MegaDetector category ID (c + 1):
          0 -> 1 ('animal'), 1 -> 2 ('person'), 2 -> 3 ('vehicle').
        """
        if out.ndim != 3 or out.shape[0] != 1 or out.shape[1] < 5:
            raise DetectorModelError(
                f"Tensor shape mismatch for 'yolov8_raw': expected (1, 4 + num_classes, num_anchors) with shape[1] >= 5, got {out.shape}"
            )

        detections: List[DetectionResult] = []
        preds = out[0]  # shape: (4 + num_classes, num_anchors)

        class_probs = preds[4:, :]  # shape: (num_classes, num_anchors)
        best_class_indices = np.argmax(class_probs, axis=0)  # shape: (num_anchors,)
        best_scores = np.max(class_probs, axis=0)  # shape: (num_anchors,)

        # Filter by confidence threshold
        valid_mask = best_scores >= self.confidence_threshold
        valid_indices = np.where(valid_mask)[0]

        for idx in valid_indices:
            conf = float(best_scores[idx])
            cls_idx = int(best_class_indices[idx])
            cat_id = cls_idx + 1  # 0-indexed YOLO classes map to 1-indexed MegaDetector category IDs

            xc = float(preds[0, idx])
            yc = float(preds[1, idx])
            w = float(preds[2, idx])
            h = float(preds[3, idx])

            x1 = xc - (w / 2.0)
            y1 = yc - (h / 2.0)
            x2 = xc + (w / 2.0)
            y2 = yc + (h / 2.0)

            box = unletterbox_box(
                box_coords=[x1, y1, x2, y2],
                scale=scale,
                pad_offset=pad_offset,
                orig_size=orig_size,
                target_size=target_size
            )
            if box is None:
                continue

            detections.append(DetectionResult(
                box=box,
                category_id=cat_id,
                category_name=CATEGORY_MAP.get(cat_id, "unknown"),
                confidence=round(conf, 4)
            ))

        return detections

    def process_detections(self, raw_detections: List[DetectionResult]) -> DetectionBatchResult:
        """
        Filters raw detections by confidence, applies NMS, separates animals from
        non-animals, and identifies the primary animal detection.
        """
        # 1. Filter by confidence threshold
        confident = [d for d in raw_detections if d.confidence >= self.confidence_threshold]

        # 2. Non-Maximum Suppression
        nms_results = apply_nms(confident, self.nms_threshold)

        # 3. Partition animals vs non-animals (person, vehicle)
        animal_dets = [d for d in nms_results if d.category_id == 1]
        non_animal_dets = [d for d in nms_results if d.category_id != 1]

        # 4. Sort animals descending by confidence score
        animal_dets.sort(key=lambda d: d.confidence, reverse=True)

        # 5. Primary animal candidate (highest confidence detection)
        primary = animal_dets[0] if animal_dets else None
        status = "SUCCESS" if animal_dets else "NO_ANIMALS"

        return DetectionBatchResult(
            status=status,
            total_detections=len(nms_results),
            animal_detections=animal_dets,
            non_animal_detections=non_animal_dets,
            primary_animal=primary,
            crop_padding_applied=self.crop_padding
        )

    def extract_primary_crop(
        self,
        image: Image.Image,
        detection_result: DetectionBatchResult
    ) -> Tuple[Image.Image, Optional[DetectionResult]]:
        """
        Extracts cropped animal chip for the primary detection using context padding.
        Returns the original image if no animal was detected.
        """
        if detection_result.primary_animal is None:
            return image, None

        chip = crop_detection(
            image=image,
            box=detection_result.primary_animal.box,
            padding=self.crop_padding
        )
        return chip, detection_result.primary_animal
