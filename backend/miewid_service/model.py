"""
MiewID Inference Engine using ONNX Runtime.
Evaluates and runs james-burgess/miewid-onnx.
"""

import os
from pathlib import Path
from typing import Optional, Union, Tuple
import numpy as np
from PIL import Image
import onnxruntime as ort
from huggingface_hub import hf_hub_download

from .config import config
from .preprocessor import MiewIDPreprocessor


class MiewIDModelError(Exception):
    """Raised when MiewID model weights cannot be loaded or inference fails."""
    pass


class MiewIDEngine:
    def __init__(
        self,
        model_path: Optional[Union[str, Path]] = None,
        preprocessor: Optional[MiewIDPreprocessor] = None,
    ):
        self.preprocessor = preprocessor or MiewIDPreprocessor()
        self.session: Optional[ort.InferenceSession] = None
        self.input_name: str = ""
        self.output_name: str = ""
        self.resolved_model_path: Optional[Path] = None
        self.blocker_reason: Optional[str] = None

        self._initialize_model(model_path)

    def _initialize_model(self, model_path: Optional[Union[str, Path]]) -> None:
        """
        Attempts to load the ONNX model from:
        1. Explicit local path or default local model directory.
        2. Hugging Face Space 'james-burgess/miewid-onnx'.
        3. Records any dependency or licensing blockers transparently.
        """
        # 1. Check local path
        candidates = []
        if model_path:
            candidates.append(Path(model_path))
        candidates.append(config.local_model_path)
        candidates.append(Path("miewid.onnx"))

        for path in candidates:
            if path and path.exists() and path.is_file():
                try:
                    self._create_onnx_session(path)
                    self.resolved_model_path = path
                    return
                except Exception as e:
                    print(f"Failed to load local ONNX model at {path}: {e}")

        # 2. Attempt download from Hugging Face Space: james-burgess/miewid-onnx
        try:
            downloaded = hf_hub_download(
                repo_id=config.model_repo_space,
                filename=config.model_filename,
                repo_type="space"
            )
            self._create_onnx_session(Path(downloaded))
            self.resolved_model_path = Path(downloaded)
            return
        except Exception as hf_err:
            self.blocker_reason = (
                f"Upstream asset blocker on Hugging Face: {config.model_repo_space} does not have "
                f"'{config.model_filename}' committed in the public repository tree (HTTP 404). "
                f"Underlying author repository 'james-burgess/miewid' is restricted/private (HTTP 401). "
                f"Details: {str(hf_err)}"
            )

    def _create_onnx_session(self, path: Path) -> None:
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        providers = ["CPUExecutionProvider"]
        self.session = ort.InferenceSession(str(path), sess_options=opts, providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    @property
    def is_loaded(self) -> bool:
        return self.session is not None

    def extract_embedding(self, image_input: Union[Image.Image, bytes, Path, str]) -> np.ndarray:
        """
        Preprocesses input image and runs ONNX inference, returning a unit-normalized 1D embedding vector.
        """
        if not self.is_loaded:
            raise MiewIDModelError(
                f"MiewID ONNX model session is not loaded. Blocker: {self.blocker_reason}"
            )

        if isinstance(image_input, (str, Path)):
            image_input = Image.open(image_input)

        # 1. Documented preprocessing
        input_tensor = self.preprocessor.preprocess(image_input)

        # 2. ONNX Inference
        outputs = self.session.run([self.output_name], {self.input_name: input_tensor})
        raw_embedding = outputs[0].flatten().astype(np.float32)

        # 3. L2 Unit Normalization
        norm = np.linalg.norm(raw_embedding)
        if norm > 1e-12:
            embedding = raw_embedding / norm
        else:
            embedding = raw_embedding

        return embedding
