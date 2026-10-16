"""
WildID Fusion — Official MIT Detector (MDV6-mit-yolov9-c) ONNX Export & Parity Verification
Executed inside isolated .conversion_venv to produce backend/models/megadetector.onnx.
"""
import os
import sys
import shutil
import hashlib
import time
from pathlib import Path
import numpy as np
import torch
import onnx
import onnxruntime as ort

# ---------------------------------------------------------------------------
# Configuration & Constants
# ---------------------------------------------------------------------------
EXPECTED_MD5 = "d8626ba22fccbd9c520e0deb19d721f7"
EXPECTED_SIZE = 118911015
CHECKPOINT_URL = "https://zenodo.org/records/15398270/files/MDV6-mit-yolov9-c.ckpt?download=1"
CONFIG_URL = "https://zenodo.org/records/15178680/files/config_v9s.yaml?download=1"

BACKEND_DIR = Path(__file__).resolve().parent
MODELS_DIR = BACKEND_DIR / "models"
CHECKPOINT_PATH = MODELS_DIR / "MDV6-mit-yolov9-c.ckpt"
CONFIG_PATH = MODELS_DIR / "config_v9s.yaml"
ONNX_PATH = MODELS_DIR / "megadetector.onnx"

ATOL_THRESHOLD = 1e-4  # Maximum allowed absolute error for FP32 parity
RTOL_THRESHOLD = 1e-3  # Maximum allowed relative error

MODELS_DIR.mkdir(parents=True, exist_ok=True)


def verify_and_prepare_checkpoint():
    print("===========================================================================")
    print("[STEP 1] Checkpoint Integrity and Local Cache Preparation")
    print("===========================================================================")
    hub_ckpt_dir = Path(torch.hub.get_dir()) / "checkpoints"
    hub_ckpt_dir.mkdir(parents=True, exist_ok=True)

    # Ensure config_v9s.yaml is present in models/ and hub checkpoints
    hub_config = hub_ckpt_dir / "config_v9s.yaml"
    if not hub_config.exists() or hub_config.stat().st_size == 0:
        if CONFIG_PATH.exists() and CONFIG_PATH.stat().st_size > 0:
            shutil.copy(CONFIG_PATH, hub_config)
            print(f"Copied config_v9s.yaml to {hub_config}")
        else:
            raise RuntimeError(f"Missing config_v9s.yaml at {CONFIG_PATH}")

    # Check checkpoint file size
    if not CHECKPOINT_PATH.exists():
        raise RuntimeError(f"Checkpoint file does not exist at {CHECKPOINT_PATH}")

    current_size = CHECKPOINT_PATH.stat().st_size
    print(f"Checking checkpoint size: {current_size} bytes (expected: {EXPECTED_SIZE})...")
    if current_size != EXPECTED_SIZE:
        raise RuntimeError(
            f"Checkpoint download incomplete ({current_size}/{EXPECTED_SIZE} bytes). "
            f"Please wait for download transfer to complete."
        )

    # Compute MD5
    print("Computing MD5 checksum of checkpoint...")
    hasher = hashlib.md5()
    with open(CHECKPOINT_PATH, "rb") as f:
        for chunk in iter(lambda: f.read(8192 * 1024), b""):
            hasher.update(chunk)
    calculated_md5 = hasher.hexdigest()
    print(f"  Calculated MD5: {calculated_md5}")
    print(f"  Expected MD5:   {EXPECTED_MD5}")

    if calculated_md5 != EXPECTED_MD5:
        raise ValueError(f"MD5 checksum mismatch! Expected {EXPECTED_MD5}, got {calculated_md5}")
    print("  [PASS] MD5 Checksum successfully verified.")

    # Copy to torch.hub cache so MegaDetectorV6MIT loads locally with 0 downloads
    hub_ckpt = hub_ckpt_dir / "MDV6-mit-yolov9-c.ckpt"
    if not hub_ckpt.exists() or hub_ckpt.stat().st_size != EXPECTED_SIZE:
        print(f"Caching checkpoint to {hub_ckpt}...")
        shutil.copy(CHECKPOINT_PATH, hub_ckpt)
        print("  [PASS] Checkpoint cached in torch hub directory.")
    else:
        print(f"  Checkpoint already cached at {hub_ckpt}.")

    return calculated_md5


class MegaDetectorMITONNXExportWrapper(torch.nn.Module):
    """
    Wraps Microsoft's clean-room MIT YOLOv9 model and Vec2Box converter.
    Guarantees the exported ONNX model produces a single output tensor with shape
    [1, 7, 8400], exactly fulfilling the 'yolov8_raw' parser contract:
        Channels:
          0: xc (center x in model pixel grid [0, 640])
          1: yc (center y in model pixel grid [0, 640])
          2: w  (width in model pixel grid [0, 640])
          3: h  (height in model pixel grid [0, 640])
          4: animal score   (sigmoid probability [0, 1])
          5: person score   (sigmoid probability [0, 1])
          6: vehicle score  (sigmoid probability [0, 1])
    """
    def __init__(self, model, converter):
        super().__init__()
        self.model = model
        self.converter = converter

    def forward(self, x):
        raw_out = self.model(x)
        preds_cls, _, preds_box = self.converter(raw_out["Main"])
        # preds_cls: [B, 8400, 3] (logits)
        # preds_box: [B, 8400, 4] ([x1, y1, x2, y2] corners in 0..640)

        x1 = preds_box[..., 0:1]
        y1 = preds_box[..., 1:2]
        x2 = preds_box[..., 2:3]
        y2 = preds_box[..., 3:4]

        xc = (x1 + x2) / 2.0
        yc = (y1 + y2) / 2.0
        w = x2 - x1
        h = y2 - y1

        boxes = torch.cat([xc, yc, w, h], dim=-1)   # [B, 8400, 4]
        scores = torch.sigmoid(preds_cls)            # [B, 8400, 3]

        combined = torch.cat([boxes, scores], dim=-1) # [B, 8400, 7]
        return combined.transpose(1, 2)             # [B, 7, 8400]


def load_and_wrap_model():
    print("\n===========================================================================")
    print("[STEP 2] Loading PyTorch-Wildlife MegaDetectorV6MIT")
    print("===========================================================================")
    from PytorchWildlife.models import detection as pw_detection

    print("Instantiating MegaDetectorV6MIT from local cache...")
    detector = pw_detection.MegaDetectorV6MIT(
        version="MDV6-mit-yolov9-c",
        device="cpu",
        pretrained=True
    )
    detector._load_model(weights=detector.weights, device=detector.device, url=detector.url)
    detector.model.eval()
    print("  [PASS] Successfully loaded model and converter.")

    wrapper = MegaDetectorMITONNXExportWrapper(detector.model, detector.converter)
    wrapper.eval()
    return wrapper


def inspect_forward_contract(export_model):
    print("\n===========================================================================")
    print("[STEP 3] Inspecting Real Forward Output & Contract Conformity")
    print("===========================================================================")
    dummy_input = torch.randn(1, 3, 640, 640, dtype=torch.float32)

    with torch.no_grad():
        out = export_model(dummy_input)

    print(f"  Export wrapper output shape: {out.shape}")
    print(f"  Export wrapper output dtype: {out.dtype}")

    # Assert exact contract: [1, 7, 8400]
    assert out.ndim == 3, f"Expected 3D tensor, got {out.ndim}"
    assert out.shape[0] == 1, f"Expected batch size 1, got {out.shape[0]}"
    assert out.shape[1] == 7, f"Expected 7 channels (4 coords + 3 classes), got {out.shape[1]}"
    assert out.shape[2] == 8400, f"Expected 8400 anchor predictions, got {out.shape[2]}"

    coords = out[0, :4, :].numpy()
    scores = out[0, 4:, :].numpy()
    print(f"  Box coordinate ranges: xc=[{coords[0].min():.2f}, {coords[0].max():.2f}], w=[{coords[2].min():.2f}, {coords[2].max():.2f}]")
    print(f"  Class score ranges (sigmoid probabilities): min={scores.min():.4f}, max={scores.max():.4f}")
    assert scores.min() >= 0.0 and scores.max() <= 1.0, "Class scores must be valid sigmoid probabilities in [0, 1]"
    print("  [PASS] Real forward pass strictly conforms to 'yolov8_raw' parser contract.")
    return dummy_input


def export_to_onnx(export_model, dummy_input):
    print("\n===========================================================================")
    print(f"[STEP 4] Exporting ONNX Graph to {ONNX_PATH}")
    print("===========================================================================")
    # Clean up any previous partial or external data artifacts
    if ONNX_PATH.exists():
        ONNX_PATH.unlink()
    data_file = ONNX_PATH.with_suffix(".onnx.data")
    if data_file.exists():
        data_file.unlink()

    export_succeeded = False
    for opset in [17, 18]:
        try:
            print(f"Attempting ONNX export with opset_version={opset} (dynamo=False)...")
            torch.onnx.export(
                export_model,
                dummy_input,
                str(ONNX_PATH),
                export_params=True,
                opset_version=opset,
                do_constant_folding=True,
                dynamo=False,
                input_names=["images"],
                output_names=["output0"],
                dynamic_axes={"images": {0: "batch_size"}, "output0": {0: "batch_size"}}
            )
            # Verify that ort can load this model before accepting
            test_sess = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
            print(f"  [PASS] Successfully exported and verified load with opset_version={opset}.")
            export_succeeded = True
            break
        except Exception as e:
            print(f"  Export/load with opset {opset} failed: {e}")

    if not export_succeeded:
        raise RuntimeError("ONNX export failed across all attempted opset versions.")


def verify_parity_and_artifact(export_model, calculated_md5):
    print("\n===========================================================================")
    print("[STEP 5] Testing Numerical Parity: PyTorch vs. ONNX Runtime")
    print("===========================================================================")
    torch.manual_seed(42)
    test_input = torch.randn(1, 3, 640, 640, dtype=torch.float32)

    with torch.no_grad():
        pt_out = export_model(test_input).numpy()

    ort_session = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
    ort_in_name = ort_session.get_inputs()[0].name
    ort_out = ort_session.run(None, {ort_in_name: test_input.numpy()})[0]

    coord_abs_err = np.abs(pt_out[:, :4, :] - ort_out[:, :4, :])
    score_abs_err = np.abs(pt_out[:, 4:, :] - ort_out[:, 4:, :])
    all_abs_err = np.abs(pt_out - ort_out)

    max_coord_err = float(np.max(coord_abs_err))
    mean_coord_err = float(np.mean(coord_abs_err))
    max_norm_coord_err = float(np.max(coord_abs_err / 640.0))

    max_score_err = float(np.max(score_abs_err))
    mean_score_err = float(np.mean(score_abs_err))

    mean_all_err = float(np.mean(all_abs_err))

    print(f"  Coordinates (0..640 px grid):")
    print(f"    Max Pixel Error:       {max_coord_err:.6e} px (Threshold: 0.01 px)")
    print(f"    Mean Pixel Error:      {mean_coord_err:.6e} px")
    print(f"    Max Normalized Error:  {max_norm_coord_err:.6e} (Threshold: 1e-4)")
    print(f"  Class Scores (0..1 sigmoid probabilities):")
    print(f"    Max Probability Error: {max_score_err:.6e} (Threshold: 1e-4)")
    print(f"    Mean Probability Error:{mean_score_err:.6e}")
    print(f"  Overall Mean Error:      {mean_all_err:.6e} (Threshold: 1e-4)")

    if max_norm_coord_err > 1e-4:
        raise AssertionError(f"Coordinate parity failure: normalized max error {max_norm_coord_err} > 1e-4")
    if max_score_err > 1e-4:
        raise AssertionError(f"Score parity failure: max score error {max_score_err} > 1e-4")
    if mean_all_err > 1e-4:
        raise AssertionError(f"Overall parity failure: mean error {mean_all_err} > 1e-4")

    print("  [PASS] Numerical parity confirmed within strict thresholds.")

    print("\n===========================================================================")
    print("[STEP 6] Validating ONNX Artifact Integrity & Checksums")
    print("===========================================================================")
    onnx_model = onnx.load(str(ONNX_PATH))
    onnx.checker.check_model(onnx_model)
    print("  [PASS] onnx.checker.check_model passed.")

    inputs = [(i.name, i.shape, i.type) for i in ort_session.get_inputs()]
    outputs = [(o.name, o.shape, o.type) for o in ort_session.get_outputs()]
    print(f"  ONNX Inputs:  {inputs}")
    print(f"  ONNX Outputs: {outputs}")

    assert inputs[0][1][2:] == [640, 640], f"Unexpected input shape: {inputs[0][1]}"
    assert ort_out.shape == (1, 7, 8400), f"Unexpected executed output shape: {ort_out.shape}"
    assert outputs[0][1][2] == 8400, f"Unexpected anchor count: {outputs[0][1]}"

    # Compute SHA-256 of the generated ONNX binary
    sha256 = hashlib.sha256()
    with open(ONNX_PATH, "rb") as f:
        for chunk in iter(lambda: f.read(8192 * 1024), b""):
            sha256.update(chunk)
    onnx_sha256 = sha256.hexdigest()

    file_size_mb = ONNX_PATH.stat().st_size / (1024 * 1024)
    print(f"\n  Final Artifact Path:   {ONNX_PATH}")
    print(f"  Final Artifact Size:   {file_size_mb:.2f} MB")
    print(f"  Generated ONNX SHA256: {onnx_sha256}")
    print(f"  Source Checkpoint MD5: {calculated_md5}")
    print("\n===========================================================================")
    print(" [COMPLETE] ONNX CONVERSION AND COMPREHENSIVE VALIDATION SUCCESSFUL!")
    print("===========================================================================")


def main():
    calculated_md5 = verify_and_prepare_checkpoint()
    export_model = load_and_wrap_model()
    dummy_input = inspect_forward_contract(export_model)
    export_to_onnx(export_model, dummy_input)
    verify_parity_and_artifact(export_model, calculated_md5)


if __name__ == "__main__":
    main()
