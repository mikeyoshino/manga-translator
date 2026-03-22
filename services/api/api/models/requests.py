"""Request Pydantic models for translation endpoints."""

from pydantic import BaseModel

from manga_shared.config import Config


class TranslateRequest(BaseModel):
    """This request can be a multipart or a json request"""
    image: bytes | str
    """can be a url, base64 encoded image or a multipart image"""
    config: Config = Config()
    """in case it is a multipart this needs to be a string(json.stringify)"""


class BatchTranslateRequest(BaseModel):
    """Batch translation request"""
    images: list[bytes | str]
    """List of images, can be URLs, base64 encoded strings, or binary data"""
    config: Config = Config()
    """Translation configuration"""
    batch_size: int = 4
    """Batch size, default is 4"""
