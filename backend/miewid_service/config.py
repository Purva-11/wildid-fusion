"""
Configuration settings for MiewID inference and gallery matching.
"""

from pathlib import Path
from pydantic import BaseModel

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
GALLERY_DIR = BASE_DIR / "gallery_store"
GALLERY_DIR.mkdir(parents=True, exist_ok=True)

class MiewIDConfig(BaseModel):
    # Hugging Face Repository & File identifiers
    model_repo_space: str = "james-burgess/miewid-onnx"
    model_repo_base: str = "conservationxlabs/miewid-msv3"
    model_filename: str = "miewid.onnx"

    # Model Architecture Specifications
    backbone: str = "EfficientNetV2-M"
    input_size: int = 440
    embedding_dim: int = 2152

    # Preprocessing ImageNet Normalization Constants
    imagenet_mean: tuple = (0.485, 0.456, 0.406)
    imagenet_std: tuple = (0.229, 0.224, 0.225)

    # Re-Identification Decision Thresholds (Cosine Similarity in [-1, 1])
    # Note: Cosine similarity is a geometric distance measure in metric space, NOT a probability!
    high_confidence_threshold: float = 0.70
    moderate_confidence_threshold: float = 0.55

    # Execution options
    local_model_path: Path = MODEL_DIR / "miewid.onnx"

    # Reference Gallery Storage
    gallery_dir: Path = GALLERY_DIR
    gallery_manifest_filename: str = "manifest.json"
    gallery_embeddings_filename: str = "embeddings.npz"

    # Wildlife Detector Configuration (MegaDetector ONNX)
    detector_model_path: Path = MODEL_DIR / "megadetector.onnx"
    detector_confidence_threshold: float = 0.30
    detector_nms_threshold: float = 0.45
    detector_crop_padding: float = 0.08
    detector_output_format: str = "yolov8_raw"
    detector_letterbox_fill: tuple = (114, 114, 114)

config = MiewIDConfig()
