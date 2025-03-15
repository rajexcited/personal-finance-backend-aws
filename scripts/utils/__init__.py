from pathlib import Path
from .config import Environment, app_config
from .args_processor import ArgumentProcessor
from .error_handler import aws_error_handler

rootpath = Path(__file__).resolve().parents[2]
