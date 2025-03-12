from argparse import Action, ArgumentParser
from enum import EnumType
from typing import Any, Iterable


class ArgumentProcessor:

    def __init__(self, description: str, exit_on_error: bool = True):
        self.parser = ArgumentParser(
            description=description, exit_on_error=False)
        self.arg_config = {}
        self.exit_on_error = exit_on_error

    def add_argument(self, name_flag: str, value_type: type, help: str, is_required: bool, action: str | type[Action] = None, choices: Iterable[str] = None, default_value: Any = None):
        prefix = "Required" if is_required else "Optional"
        arg_help = f"[{prefix}] {help}"
        params_dict = {
            "help": arg_help,
        }
        if action:
            params_dict["action"] = action
        else:
            params_dict["choices"] = choices
            params_dict["default"] = default_value
        if not action and not isinstance(value_type, EnumType):
            params_dict["type"] = value_type
        # if action:
        #     self.parser.add_argument(name_flag,
        #                              help=arg_help,
        #                              action=action)
        # elif isinstance(value_type, Enum):
        #     self.parser.add_argument(name_flag,
        #                              help=arg_help,
        #                              choices=choices,
        #                              default=default_value)
        # else:
        # print("params=", params_dict)
        self.parser.add_argument(name_flag, **params_dict)
        arg_key = name_flag.replace("--", "").replace("-", "_")
        self.arg_config[arg_key] = {
            "value_type": value_type,
            "is_required": is_required
        }

    def parse_and_validate_args(self):
        try:
            parsed_args = self.parser.parse_args()
            argvalue_dict = {}
            # print("retrieved parsed arg values", parsed_args)
            for k, v in self.arg_config.items():
                # print("arg config, k=", k, "and v=", v)
                if v['is_required']:
                    if not hasattr(parsed_args, k) or not getattr(parsed_args, k):
                        raise ValueError(f"Required argument '{k}' is missing")
                value = getattr(parsed_args, k)
                if isinstance(v["value_type"], EnumType):
                    value = v["value_type"][value]
                if not isinstance(value, v['value_type']):
                    raise ValueError(
                        f"Argument '{k}' must be of type {v['value_type'].__name__}")
                argvalue_dict[k] = value
            return argvalue_dict
        except Exception as e:
            print("error: ", e)
            self.parser.print_help()
            if self.exit_on_error:
                exit(1)
