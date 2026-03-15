from dotenv import load_dotenv

load_dotenv()

try:
    import colorama
    colorama.init(autoreset=True)
    from .manga_translator import *
except ImportError:
    # Lightweight API mode — heavy ML deps (torch, etc.) not installed.
    # Import only config and utils that the API server needs.
    from .config import Config
    from .utils.generic import Context
