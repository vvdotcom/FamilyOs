"""Private family photo processing.

Uploads are validated by content (not file name), decoded with a pixel limit, rotated by their EXIF
orientation, and re-encoded as plain JPEG. Re-encoding drops EXIF, GPS/location, and other metadata.
Only the TV-sized and thumbnail variants are stored; the original upload is discarded.
"""
from __future__ import annotations

import base64
import binascii
import io

from .domain import DomainError

MAX_UPLOAD_BYTES = 10_000_000
MAX_PIXELS = 40_000_000
HOUSEHOLD_PHOTO_QUOTA_BYTES = 150_000_000
VARIANTS = {"tv": (1920, 1080), "thumb": (480, 480), "check": (1024, 1024)}


def decode_upload(content_base64: str) -> bytes:
    try:
        raw = base64.b64decode(content_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise DomainError(422, "INVALID_PHOTO", "That photo could not be read.") from error
    if len(raw) > MAX_UPLOAD_BYTES:
        raise DomainError(413, "PHOTO_TOO_LARGE", "Choose a photo smaller than 10 MB.")
    if not (raw[:3] == b"\xff\xd8\xff" or raw.startswith(b"\x89PNG\r\n\x1a\n")
            or (raw[:4] == b"RIFF" and raw[8:12] == b"WEBP")):
        raise DomainError(415, "UNSUPPORTED_PHOTO", "Use a JPEG, PNG, or WebP photo.")
    return raw


def process_image(raw: bytes, variants: tuple[str, ...] = ("tv", "thumb")) -> tuple[dict[str, bytes], int, int]:
    """Return metadata-free JPEG variants plus the TV variant's dimensions."""
    try:
        from PIL import Image, ImageOps
    except ImportError as error:  # pragma: no cover - Pillow is a declared dependency
        raise DomainError(503, "PHOTO_PROCESSING_UNAVAILABLE", "Photo processing is not installed on this server.") from error
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in ("JPEG", "PNG", "WEBP"):
                raise DomainError(415, "UNSUPPORTED_PHOTO", "Use a JPEG, PNG, or WebP photo.")
            if source.width * source.height > MAX_PIXELS:
                raise DomainError(413, "PHOTO_TOO_LARGE", "That photo has too many pixels.")
            image = ImageOps.exif_transpose(source).convert("RGB")
    except DomainError:
        raise
    except Exception as error:  # Pillow raises several decoder-specific errors.
        raise DomainError(422, "INVALID_PHOTO", "That photo could not be read.") from error
    output: dict[str, bytes] = {}
    size = (image.width, image.height)
    for name in variants:
        copy = image.copy()
        copy.thumbnail(VARIANTS[name])
        buffer = io.BytesIO()
        copy.save(buffer, format="JPEG", quality=85, optimize=True)  # No exif= argument: metadata is dropped.
        output[name] = buffer.getvalue()
        if name == "tv":
            size = (copy.width, copy.height)
    return output, size[0], size[1]
