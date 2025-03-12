from enum import Enum
from typing import TypedDict


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
