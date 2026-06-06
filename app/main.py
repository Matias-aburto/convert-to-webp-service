import io
import asyncio
import logging
import os
import time
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import PlainTextResponse, Response
from PIL import Image, UnidentifiedImageError
from pillow_heif import register_heif_opener
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware

register_heif_opener()

logger = logging.getLogger("webp-converter")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
REQUEST_TIMEOUT_SECONDS = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "60"))
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "30"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
DEFAULT_QUALITY = 80
MAX_DIMENSION = 10000
MAX_PIXELS = int(os.getenv("MAX_PIXELS", "50000000"))

Image.MAX_IMAGE_PIXELS = MAX_PIXELS

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
}


class ConversionError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: Dict[str, List[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        now = time.monotonic()
        window_start = now - self.window_seconds
        hits = [timestamp for timestamp in self._hits[key] if timestamp > window_start]
        if len(hits) >= self.max_requests:
            self._hits[key] = hits
            return False
        hits.append(now)
        self._hits[key] = hits
        return True


rate_limiter = RateLimiter(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_SECONDS)


def get_client_ip(request: Request) -> str:
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "POST" and request.url.path == "/convert":
            client_ip = get_client_ip(request)
            if not rate_limiter.is_allowed(client_ip):
                logger.warning("Rate limit exceeded: ip=%s path=%s", client_ip, request.url.path)
                return PlainTextResponse("Too many requests", status_code=429)
        return await call_next(request)


class TimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await asyncio.wait_for(call_next(request), timeout=REQUEST_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            logger.warning(
                "Request timeout: path=%s timeout_s=%s",
                request.url.path,
                REQUEST_TIMEOUT_SECONDS,
            )
            return PlainTextResponse("Request timeout", status_code=504)


app = FastAPI(title="webp-converter", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS", "GET"],
    allow_headers=["Accept", "Content-Type"],
)
app.add_middleware(TimeoutMiddleware)
app.add_middleware(RateLimitMiddleware)


def parse_quality(quality_raw: Optional[str]) -> int:
    if quality_raw is None or quality_raw == "":
        return DEFAULT_QUALITY
    try:
        quality = int(quality_raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="quality must be an integer between 1 and 100") from exc
    if quality < 1 or quality > 100:
        raise HTTPException(status_code=400, detail="quality must be an integer between 1 and 100")
    return quality


def parse_scale(scale_raw: Optional[str]) -> float:
    if scale_raw is None or scale_raw == "":
        return 1.0
    try:
        scale = float(scale_raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="scale must be a positive decimal number") from exc
    if scale <= 0:
        raise HTTPException(status_code=400, detail="scale must be a positive decimal number")
    return scale


def parse_positive_int(name: str, value_raw: Optional[str]) -> Optional[int]:
    if value_raw is None or value_raw == "":
        return None
    try:
        value = int(value_raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{name} must be a positive integer") from exc
    if value <= 0 or value > MAX_DIMENSION:
        raise HTTPException(
            status_code=400,
            detail=f"{name} must be a positive integer not greater than {MAX_DIMENSION}",
        )
    return value


def calculate_target_size(
    original_size: Tuple[int, int],
    scale: float,
    max_width: Optional[int],
    max_height: Optional[int],
) -> Tuple[int, int]:
    width, height = original_size
    scaled_width = max(1, int(round(width * scale)))
    scaled_height = max(1, int(round(height * scale)))

    if max_width is None and max_height is None:
        return scaled_width, scaled_height

    ratio_w = max_width / scaled_width if max_width else 1.0
    ratio_h = max_height / scaled_height if max_height else 1.0
    ratio = min(ratio_w, ratio_h, 1.0)

    final_width = max(1, int(round(scaled_width * ratio)))
    final_height = max(1, int(round(scaled_height * ratio)))
    return final_width, final_height


def validate_target_dimensions(target_width: int, target_height: int) -> None:
    if target_width > MAX_DIMENSION or target_height > MAX_DIMENSION:
        raise ConversionError(
            status_code=400,
            detail=f"Output dimensions exceed the maximum allowed size of {MAX_DIMENSION}px per side",
        )
    output_pixels = target_width * target_height
    if output_pixels > MAX_PIXELS:
        raise ConversionError(
            status_code=400,
            detail=f"Output image would be too large ({output_pixels} pixels). Max is {MAX_PIXELS} pixels",
        )


def normalize_image_mode(image: Image.Image) -> Image.Image:
    if image.mode in ("RGBA", "LA"):
        return image.convert("RGBA")
    if image.mode == "P":
        if "transparency" in image.info:
            return image.convert("RGBA")
        return image.convert("RGB")
    if image.mode not in ("RGB", "RGBA"):
        return image.convert("RGB")
    return image


def convert_to_webp_sync(
    payload: bytes,
    quality_value: int,
    scale_value: float,
    max_width_value: Optional[int],
    max_height_value: Optional[int],
) -> Tuple[bytes, int, int, int, int]:
    try:
        source_img = Image.open(io.BytesIO(payload))
        source_img.load()
    except UnidentifiedImageError as exc:
        raise ConversionError(status_code=415, detail="Unsupported or invalid image file") from exc
    except Exception as exc:  # pragma: no cover
        raise ConversionError(status_code=400, detail="Unable to read image file") from exc

    source_width, source_height = source_img.size
    target_width, target_height = calculate_target_size(
        (source_width, source_height),
        scale_value,
        max_width_value,
        max_height_value,
    )
    validate_target_dimensions(target_width, target_height)

    img = normalize_image_mode(source_img)
    if (target_width, target_height) != img.size:
        img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)

    output = io.BytesIO()
    save_kwargs = {
        "format": "WEBP",
        "quality": quality_value,
        "method": 6,
    }
    if img.mode == "RGBA":
        save_kwargs["lossless"] = False

    img.save(output, **save_kwargs)
    return output.getvalue(), source_width, source_height, target_width, target_height


@app.options("/convert")
async def convert_options() -> Response:
    return Response(status_code=204)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/convert")
async def convert_image(
    request: Request,
    image: UploadFile = File(...),
    quality: Optional[str] = Form(None),
    scale: Optional[str] = Form(None),
    maxWidth: Optional[str] = Form(None),
    maxHeight: Optional[str] = Form(None),
    format: Optional[str] = Form(None),
):
    start = time.perf_counter()

    if image.content_type not in ALLOWED_MIME_TYPES:
        if not (format == "heic" and image.content_type in {"application/octet-stream", None}):
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported media type: {image.content_type}. Supported: {', '.join(sorted(ALLOWED_MIME_TYPES))}",
            )

    quality_value = parse_quality(quality)
    scale_value = parse_scale(scale)
    max_width_value = parse_positive_int("maxWidth", maxWidth)
    max_height_value = parse_positive_int("maxHeight", maxHeight)

    payload = await image.read()
    payload_size = len(payload)
    if payload_size == 0:
        raise HTTPException(status_code=400, detail="image is empty")
    if payload_size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size is {MAX_UPLOAD_MB} MB",
        )

    try:
        webp_bytes, source_width, source_height, target_width, target_height = await asyncio.to_thread(
            convert_to_webp_sync,
            payload,
            quality_value,
            scale_value,
            max_width_value,
            max_height_value,
        )
    except ConversionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    elapsed_ms = int((time.perf_counter() - start) * 1000)
    logger.info(
        "convert_ok path=%s file=%s mime=%s in_bytes=%d out_bytes=%d quality=%s scale=%s max_width=%s max_height=%s src=%sx%s out=%sx%s duration_ms=%d",
        request.url.path,
        image.filename,
        image.content_type,
        payload_size,
        len(webp_bytes),
        quality_value,
        scale_value,
        max_width_value,
        max_height_value,
        source_width,
        source_height,
        target_width,
        target_height,
        elapsed_ms,
    )

    return Response(content=webp_bytes, media_type="image/webp", status_code=200)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return PlainTextResponse(str(exc.detail), status_code=exc.status_code)


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    logger.exception("Unhandled error: %s", str(exc))
    return PlainTextResponse("Internal Server Error", status_code=500)
