import colorama
from dotenv import load_dotenv

colorama.init(autoreset=True)
load_dotenv()

try:
    from .manga_translator import *
except ImportError:
    # Lightweight API mode — heavy ML deps (torch, etc.) not installed.
    # Import only config and utils that the API server needs.
    from .config import Config
    from .utils import Context
