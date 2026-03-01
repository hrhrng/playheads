"""
Error codes and response models for structured error handling
"""
from typing import Optional
from pydantic import BaseModel

# Error codes
AUTH_TOKEN_INVALID = "AUTH_TOKEN_INVALID"
AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED"
PERMISSION_DENIED = "PERMISSION_DENIED"
RATE_LIMIT = "RATE_LIMIT"
SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
VALIDATION_ERROR = "VALIDATION_ERROR"
NOT_FOUND = "NOT_FOUND"


class ErrorResponse(BaseModel):
    """Structured error response model"""
    error: str
    message: str
    status: int
    retryable: bool = False
    action: Optional[str] = None  # 'reauth', 'retry', 'contact_support'
