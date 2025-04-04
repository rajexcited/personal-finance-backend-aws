from enum import Enum
from typing import TypedDict
from pathlib import Path


class Environment(Enum):
    development = "dev"
    testplan = "tpe"
    experiment = "xpr"
    production = "prd"


class App_Config(TypedDict):
    app_name: str
    app_id: str


app_config = App_Config(
    app_name="personal-finance",
    app_id="prsfin"
)


def get_manage_policy_name_suffix(environment: Environment):
    return f"-{app_config['app_id']}{environment.value}"


def get_cdk_policy_prefix(file_dir_path: Path):
    path_resolved = f"{file_dir_path}"
    if "cdk-roles" in path_resolved:
        return "cdk"
    return ""
