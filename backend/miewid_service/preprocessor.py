"""
Documented image preprocessing pipeline for MiewID.
Matches james-burgess/miewid-onnx and conservationxlabs/miewid-msv3 specifications.

Includes input sanity validations:
- Eager image decoding
- Minimum dimension rejection (< 10x10 px)
- Uniform/blank canvas rejection (pixel std < 0.5)

Note: Input sanity checks reject corrupted or uninformative visual chips;
they do not perform animal detection or classification.
"""

from io import BytesIO
from typing import Union
import numpy as np
from PIL import Image

from .config import config


class ImagePreprocessingError(ValueError):
    """Raised when an input image fails input validation or preprocessing."""
    pass


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

        Validations:
          1. Eagerly decodes image pixels.
          2. Rejects images smaller than 10x10 pixels.
          3. Rejects completely uniform / flat-color images (standard deviation < 0.5).
             (Note: Rejects degenerate blank inputs; does not detect animals).

        Transformations:
          1. Convert to RGB color space.
          2. Bilinear resize to (input_size, input_size) [440x440].
          3. Convert to float32 ndarray.
          4. Normalize with ImageNet mean & standard deviation: (arr - mean_255) / std_255.
          5. Transpose from (H, W, C) to (C, H, W).
          6. Expand batch dimension -> (1, C, H, W).
        """
        if isinstance(image_input, (bytes, bytearray)):
            image = Image.open(BytesIO(image_input))
        elif isinstance(image_input, BytesIO):
            image = Image.open(image_input)
        elif isinstance(image_input, Image.Image):
            image = image_input
        else:
            raise ImagePreprocessingError(f"Unsupported image input type: {type(image_input)}")

        # 1. Eager loading to catch truncated or corrupted images immediately
        try:
            image.load()
        except Exception as e:
            raise ImagePreprocessingError(f"Failed to decode image data: {str(e)}")

        # 2. Reject dimensions below 10x10 pixels
        width, height = image.size
        if width < 10 or height < 10:
            raise ImagePreprocessingError(
                f"Image dimensions ({width}x{height}) are too small. "
                "Minimum required dimensions are 10x10 pixels."
            )

        # 3. Standardize to RGB
        chip = image.convert("RGB")

        # 4. Reject completely uniform / zero-variance images
        # Rule: If standard deviation across all pixel intensities is < 0.5 (on 0-255 scale),
        # the chip is flat/blank and lacks meaningful visual structure.
        # Note: This is an input quality check and does NOT detect animals.
        raw_arr = np.array(chip, dtype=np.float32)
        pixel_std = float(np.std(raw_arr))
        if pixel_std < 0.5:
            raise ImagePreprocessingError(
                f"Image is degenerate/uniform (pixel standard deviation {pixel_std:.4f} < 0.5). "
                "Input contains zero or negligible visual variance. "
                "(Note: This check rejects blank/solid images; it is not an animal detector.)"
            )

        # 5. Resize to target dimension using Bilinear sampling
        chip = chip.resize((self.input_size, self.input_size), Image.Resampling.BILINEAR)

        # 6. Float32 conversion and ImageNet normalization
        arr = np.array(chip, dtype=np.float32)
        arr = (arr - self.mean_255) / self.std_255

        # 7. Transpose to CHW
        arr = np.transpose(arr, (2, 0, 1))

        # 8. Add batch dimension -> (1, 3, H, W)
        tensor = np.expand_dims(arr, axis=0)
        return tensor.astype(np.float32)
