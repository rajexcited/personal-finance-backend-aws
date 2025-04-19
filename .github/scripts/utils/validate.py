import json
from pathlib import Path
from typing import Any, Dict, List


def get_valid_dict(arg: Any) -> Dict:
    ret_dict = arg
    if Path(arg).exists():
        with open(arg, "r") as f:
            ret_dict = json.load(f)
    elif isinstance(arg, str):
        try:
            ret_dict = json.loads(arg)
        except json.JSONDecodeError as e:
            print("arg is not json convertable")

    if isinstance(ret_dict, Dict):
        return ret_dict
    return None
