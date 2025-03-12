from pathlib import Path
from .config import Environment, app_config
from .args_processor import ArgumentProcessor


rootpath = Path(__file__).resolve().parents[2]
