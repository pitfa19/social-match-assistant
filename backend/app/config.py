"""Settings loaded from the environment (.env locally). The key never leaves the backend."""
import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    api_key: str | None
    base_url: str
    connect_timeout: float
    read_timeout: float


def get_settings() -> Settings:
    return Settings(
        api_key=(os.getenv("MINDCASE_API_KEY") or "").strip() or None,
        base_url=(os.getenv("MINDCASE_BASE_URL") or "https://api.mindcase.co/v1").rstrip("/"),
        connect_timeout=float(os.getenv("MINDCASE_CONNECT_TIMEOUT", "5")),
        read_timeout=float(os.getenv("MINDCASE_READ_TIMEOUT", "120")),
    )
