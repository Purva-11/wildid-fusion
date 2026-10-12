"""
Documented image preprocessing pipeline for MiewID.
Matches james-burgess/miewid-onnx and conservationxlabs/miewid-msv3 specifications.
"""

from io import BytesIO
from typing import Union
import numpy as np
from PIL import Image

from .config import config

class MiewIDPreprocessor:
    def __init__(self, input_size: int = config.input_size):
        self.input_size = input_size
        self.mean = np.array(config.imagenet_mean, dtype=np.float32)
        self.std = np.array(config.imagenet_std, dtype=np.float32)
        self.mean_255 = self.mean * 255.0
        self.std_255 = self.std * 255.0

    def preprocess(self, image_input: Union[Image.Image, bytes, bytearray, BytesIO]) -> np.ndarray:
        """
        Preprocesses a cropped animal image chip into an NCHW float32 tensor.
        
        Steps:
          1. Load & convert to RGB (standardizing color space)
          2. Bilinear resize to (input_size, input_size) [documented 440x440]
          3. Convert to float32 ndarray
          4. Normalize with ImageNet mean & standard deviation: (arr - mean_255) / std_255
          5. Transpose from (H, W, C) to (C, H, W)
          6. Expand batch dimension -> (1, C, H, W)
        """
        if isinstance(image_input, (bytes, bytearray)):
            image = Image.open(BytesIO(image_input))
        elif isinstance(image_input, BytesIO):
            image = Image.open(image_input)
        elif isinstance(image_input, Image.Image):
            image = image_input
        else:
            raise ValueError(f"Unsupported image input type: {type(image_input)}")

        # 1. Convert to RGB
        chip = image.convert("RGB")

        # 2. Resize to target dimension using Bilinear sampling
        chip = chip.resize((self.input_size, self.input_size), Image.Resampling.BILINEAR)

        # 3 & 4. Float32 conversion and ImageNet normalization
        arr = np.array(chip, dtype=np.float32)
        arr = (arr - self.mean_255) / self.std_255

        # 5. Transpose to CHW
        arr = np.transpose(arr, (2, 0, 1))

        # 6. Add batch dimension -> (1, 3, H, W)
        tensor = np.expand_dims(arr, axis=0)
        return tensor.astype(np.float32)
