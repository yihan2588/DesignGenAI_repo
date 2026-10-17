"""Decode and sanitize local/worker images before provider use."""
from io import BytesIO
from PIL import Image,ImageOps,UnidentifiedImageError


def sanitize_image(raw: bytes) -> bytes:
    if not raw or len(raw)>50*1024*1024:raise ValueError('Image must be nonempty and at most 50 MB.')
    try:
        with Image.open(BytesIO(raw)) as image:
            if image.format not in {'JPEG','PNG','WEBP'} or image.width*image.height>50_000_000:
                raise ValueError('Unsupported image format or pixel count.')
            image.verify()
        with Image.open(BytesIO(raw)) as original:
            image=ImageOps.exif_transpose(original).convert('RGB')
            image.thumbnail((1200,1200))
            output=BytesIO();image.save(output,format='JPEG',quality=85)
            value=output.getvalue()
            if len(value)>2*1024*1024:raise ValueError('Sanitized image exceeds transport limit.')
            return value
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError) as failure:
        raise ValueError('Image could not be decoded safely.') from failure
