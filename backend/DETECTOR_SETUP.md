# Wildlife Animal Detection Setup & Integration Guide

This document details the upstream wildlife detector interface, geometry pipeline, ONNX output contracts, model compatibility matrix, and installation guide for **MegaDetector** in the **WildID Fusion** project.

---

## 1. Upstream Detection Architecture

WildID Fusion integrates wildlife detection prior to MiewID individual re-identification:

$$\text{Raw Camera-Trap Photo} \xrightarrow[\text{WildlifeDetector}]{\text{MegaDetector ONNX}} \text{Cropped Animal Chip} \xrightarrow[\text{MiewIDEngine}]{\text{MiewID ONNX}} \text{Individual Cosine Ranking}$$

### Component Separation:
- **`WildlifeDetector` ([backend/miewid_service/detector.py](file:///d:/Ansh%20Dekstop/WildHack%20Prototype/backend/miewid_service/detector.py))**: Category-level detection identifying bounding boxes for animals, persons, and vehicles.
- **`MiewIDEngine` ([backend/miewid_service/model.py](file:///d:/Ansh%20Dekstop/WildHack%20Prototype/backend/miewid_service/model.py))**: Fine-grained metric learning embedding model extracting 2152-dimensional unit vectors.
- **`ReferenceGallery` ([backend/miewid_service/gallery.py](file:///d:/Ansh%20Dekstop/WildHack%20Prototype/backend/miewid_service/gallery.py))**: Multi-image cosine similarity ranking partitioned by canonical biological species.

---

## 2. Detection Categories & Data Schema

Following the standard MegaDetector schema:
- **`1`**: `animal`
- **`2`**: `person`
- **`3`**: `vehicle`

### Output Contract:
```python
class BoundingBoxNormalized(BaseModel):
    ymin: float  # Top boundary normalized [0.0, 1.0]
    xmin: float  # Left boundary normalized [0.0, 1.0]
    ymax: float  # Bottom boundary normalized [0.0, 1.0]
    xmax: float  # Right boundary normalized [0.0, 1.0]

class DetectionResult(BaseModel):
    box: BoundingBoxNormalized
    category_id: int            # 1: animal, 2: person, 3: vehicle
    category_name: str          # "animal", "person", "vehicle"
    confidence: float           # Confidence score in [0.0, 1.0]

class DetectionBatchResult(BaseModel):
    status: str                 # "SUCCESS", "NO_ANIMALS", or "UNAVAILABLE"
    total_detections: int
    animal_detections: List[DetectionResult]
    non_animal_detections: List[DetectionResult]
    primary_animal: Optional[DetectionResult]
    crop_padding_applied: float
```

---

## 3. Supported ONNX Model Contracts

`WildlifeDetector` uses an **explicit, configurable output contract parser** configured via `detector_output_format` in `backend/miewid_service/config.py`. The detector does **not** guess formats from tensor shape alone. Unknown or mismatched tensor contracts are rejected with a clear `DetectorModelError`.

The three supported contracts are:

### Contract 1: `yolov5_raw` (Default for MegaDetector v5)
- **Configuration**: `detector_output_format = "yolov5_raw"`
- **Expected Output Shape**: `(1, num_anchors, 5 + num_classes)` with `shape[2] >= 6` (e.g. `(1, 25200, 8)` or `(1, 20400, 8)`)
- **Row Layout**: `[xc, yc, w, h, objectness, p_animal, p_person, p_vehicle]`
- **Coordinate System**: Center coordinates $(x_c, y_c)$ and dimensions $(w, h)$ in model pixel grid $[0, \text{det\_w}] \times [0, \text{det\_h}]$.
- **Corner Conversion**:
  $$x_1 = x_c - \frac{w}{2}, \quad y_1 = y_c - \frac{h}{2}, \quad x_2 = x_c + \frac{w}{2}, \quad y_2 = y_c + \frac{h}{2}$$
- **Score Calculation**: $\text{score}_c = \text{objectness} \times P(\text{class}_c \mid \text{object})$.
- **Class Mapping**: Classification head indices $c \in \{0, 1, 2\}$ map to MegaDetector category IDs via $c + 1$ ($0 \to 1$: `animal`, $1 \to 2$: `person`, $2 \to 3$: `vehicle`).

### Contract 2: `yolov8_raw` (For MegaDetector v6 / PyTorch-Wildlife YOLOv8 & YOLOv9)
- **Configuration**: `detector_output_format = "yolov8_raw"`
- **Expected Output Shape**: `(1, 4 + num_classes, num_anchors)` with `shape[1] >= 5` (e.g. `(1, 7, 8400)`)
- **Row Layout**:
  - Row 0..3: `[xc, yc, w, h]` in model pixel grid
  - Row 4..: class probability scores directly (YOLOv8/v9 has no separate objectness branch)
- **Corner Conversion**:
  $$x_1 = x_c - \frac{w}{2}, \quad y_1 = y_c - \frac{h}{2}, \quad x_2 = x_c + \frac{w}{2}, \quad y_2 = y_c + \frac{h}{2}$$
- **Score Calculation**: $\text{score}_c = P(\text{class}_c)$.
- **Class Mapping**: Classification head indices $c \in \{0, 1, 2\}$ map to MegaDetector category IDs via $c + 1$ ($0 \to 1$: `animal`, $1 \to 2$: `person`, $2 \to 3$: `vehicle`).

### Contract 3: `decoded_boxes` (For End-to-End ONNX Exports with Decoded Corners)
- **Configuration**: `detector_output_format = "decoded_boxes"`
- **Expected Output Shape**: `(1, num_boxes, 6)`
- **Row Layout**: `[x1, y1, x2, y2, confidence, class_id]`
- **Coordinate System**: Corner coordinates $[x_1, y_1, x_2, y_2]$ in letterbox space (pixel grid or normalized).
- **Score Calculation**: Extracted directly from column 4 (`confidence`).
- **Class Mapping**: Column 5 contains the integer category ID directly (1: `animal`, 2: `person`, 3: `vehicle`). **No offset is added.**

---

## 4. Preprocessing & Box Inversion: Letterboxing

To preserve aspect ratios and prevent geometric distortion on non-square camera-trap images (e.g. 16:9 widescreen or 4:3 traps):

1. **Letterbox Padding**:
   - The original image is scaled by $r = \min(\text{target\_w} / \text{orig\_w}, \text{target\_h} / \text{orig\_h})$.
   - The scaled image is centered on a $(\text{target\_w}, \text{target\_h})$ canvas.
   - The padding border is filled with standard YOLO neutral gray: **`(114, 114, 114)`**.
   - Padding offsets $(\text{pad\_left}, \text{pad\_top})$ are tracked.

2. **Unletterbox Box Inversion**:
   - Model coordinates $(x_1, y_1, x_2, y_2)$ are un-padded:
     $$x' = x - \text{pad\_left}, \quad y' = y - \text{pad\_top}$$
   - Then unscaled and normalized to the original unpadded image:
     $$x_{\text{norm}} = \frac{x'}{r \cdot \text{orig\_w}}, \quad y_{\text{norm}} = \frac{y'}{r \cdot \text{orig\_h}}$$
   - Clamped strictly to $[0.0, 1.0]$.
   - False positive predictions falling entirely within the letterbox padding bars result in degenerate boxes and are discarded safely.

---

## 5. Model Compatibility Matrix

> [!IMPORTANT]
> **Only ONNX exports that strictly match one of the three documented contracts (`yolov5_raw`, `yolov8_raw`, `decoded_boxes`) may be installed.**
> Do NOT assume an ONNX file is compatible based on its filename or architecture name alone. You must verify its tensor signature before deployment.

| Model Family / Variant | Official Source & Repo | License | Typical Tensor Signature | WildID Fusion Contract | Compatibility Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MegaDetector v5a** (`md_v5a.0.0.onnx`) | [microsoft/CameraTraps](https://github.com/microsoft/CameraTraps) via Zenodo Sparrow Model Zoo | MIT | Input: `(1, 3, 1280, 1280)`<br>Output: `(1, 25200, 8)` | `yolov5_raw` | **Supported** (set `detector_output_format = "yolov5_raw"`) |
| **MegaDetector v5b** (`md_v5b.0.0.onnx`) | [microsoft/CameraTraps](https://github.com/microsoft/CameraTraps) via Zenodo Sparrow Model Zoo | MIT | Input: `(1, 3, 1280, 1280)`<br>Output: `(1, 25200, 8)` | `yolov5_raw` | **Supported** (set `detector_output_format = "yolov5_raw"`) |
| **MDV6 Compact YOLOv9** (`MDV6-mit-yolov9-c.onnx`) | [microsoft/CameraTraps](https://github.com/microsoft/CameraTraps) / PyTorch-Wildlife | MIT | Input: `(1, 3, 640, 640)`<br>Output: `(1, 7, 8400)` | `yolov8_raw` | **Supported** (set `detector_output_format = "yolov8_raw"`) |
| **Decoded Corner ONNX Export** (End-to-End) | Custom PyTorch `torch.onnx.export` with NMS plugin | MIT / Apache-2.0 | Input: `(1, 3, H, W)`<br>Output: `(1, N, 6)` | `decoded_boxes` | **Supported** (set `detector_output_format = "decoded_boxes"`) |
| **Raw PyTorch Checkpoint** (`.pt`) | Any GitHub release | Various | N/A (TorchScript / Pickle) | N/A | **Incompatible** (cannot rename `.pt` to `.onnx`; requires ONNX export) |
| **YOLOv8x AGPL-3.0 Weights** | Ultralytics default exports | **AGPL-3.0** | Output: `(1, 7, 8400)` | `yolov8_raw` | **Blocked by License** (Avoid copyleft contamination in MIT codebase) |

---

## 6. How to Install and Verify Detector Weights

### Step 1: Verify the ONNX File Schema
Before installing, inspect your candidate ONNX model using Python to confirm its output tensor:
```python
import onnxruntime as ort
session = ort.InferenceSession("path/to/candidate.onnx", providers=["CPUExecutionProvider"])
inputs = [(i.name, i.shape, i.type) for i in session.get_inputs()]
outputs = [(o.name, o.shape, o.type) for o in session.get_outputs()]
print("Inputs:", inputs)
print("Outputs:", outputs)
```

- If `outputs[0].shape` is `[1, N, 8]` $\to$ use `detector_output_format = "yolov5_raw"`.
- If `outputs[0].shape` is `[1, 7, N]` $\to$ use `detector_output_format = "yolov8_raw"`.
- If `outputs[0].shape` is `[1, N, 6]` $\to$ use `detector_output_format = "decoded_boxes"`.

### Step 2: Configure the Format
In [backend/miewid_service/config.py](file:///d:/Ansh%20Dekstop/WildHack%20Prototype/backend/miewid_service/config.py):
```python
detector_output_format: str = "yolov8_raw"
```

### Step 3: Verified Official Artifact Installed
The officially converted and verified MIT-licensed wildlife detector is installed at:
```text
backend/models/megadetector.onnx
```

- **Source Checkpoint**: `MDV6-mit-yolov9-c.ckpt` (Zenodo 15398270)
- **Source MD5 Checksum**: `d8626ba22fccbd9c520e0deb19d721f7`
- **Model License**: MIT License (Microsoft AI for Good / PyTorch-Wildlife)
- **Export Format**: ONNX Opset 17, Single standalone artifact (no external `.data` files)
- **Export File Size**: 27.79 MB (29,140,890 bytes)
- **Generated ONNX SHA-256**: `fabe713a3c5c9bc452d59a925e309cc4c0621a8e4e7cd1fa8df3d3281ade3827`
- **Output Contract**: `yolov8_raw` with tensor shape `[1, 7, 8400]` (xc, yc, w, h in 0..640 px, and sigmoid probabilities for animal, person, vehicle)
- **Numerical Parity (PyTorch vs ONNX Runtime)**:
  - Max Coordinate Pixel Error: $1.77 \times 10^{-3}$ px ($< 0.01$ px tolerance; relative error $< 2.8 \times 10^{-6}$)
  - Max Class Probability Error: $1.25 \times 10^{-7}$ ($\ll 10^{-4}$ tolerance)
  - Overall Mean Error: $2.45 \times 10^{-5}$

### Step 4: Verification Procedure
1. Check service health:
   ```bash
   curl http://localhost:8000/health
   ```
   Verify `"detector_loaded": true` and `"detector_blocker_reason": null`.

2. Test dedicated detection on test photo:
   ```bash
   curl -X POST http://localhost:8000/api/detector/detect \
     -F "file=@test_data/demo_zebra.png"
   ```
   Verify HTTP 200 with `status="SUCCESS"`, category `"animal"`, and valid bounding boxes.

3. Test upstream detection + MiewID Re-ID pipeline:
   ```bash
   curl -X POST http://localhost:8000/api/reid/identify \
     -F "species=Plains Zebra" \
     -F "detect_animals=true" \
     -F "file=@test_data/demo_zebra.png"
   ```
   Verify HTTP 200 with `detector_applied=true`, `detector_status="ANIMAL_DETECTED"`, and `match_status="MATCHED"` or `"UNKNOWN"`.

---

## 7. Explicit Behavior When Weights Are Missing

If `backend/models/megadetector.onnx` is not present:
- **Detection Is Never Faked**: The API never reports synthetic detections or silently falls back to full-frame images when detection was requested.
- **Dedicated Endpoint**: `POST /api/detector/detect` immediately returns **HTTP 503 (Service Unavailable)** explaining that detector model weights are missing.
- **Re-ID Endpoint with `detect_animals=True`**: `POST /api/reid/identify` returns **HTTP 503** with setup instructions.
- **Direct Chip Re-ID (`detect_animals=False`, default)**: Operates seamlessly on pre-cropped animal chips using the loaded MiewID model, preserving all existing workflows.
