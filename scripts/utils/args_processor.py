from argparse import _ArgumentGroup, Action, ArgumentParser
from enum import EnumType
from typing import Any, Dict, Iterable, Optional, Union


class MyArgumentGroup:
    def __init__(self, group_name: str, parser_group: _ArgumentGroup, min_required: int = 1):
        self.group_name = group_name
        self.min_required = min_required
        self.parser_group = parser_group
        self.arg_keys = []

    def add_argument(self, name_flag: str, **kwargs):
        arg_key = name_flag.replace("--", "").replace("-", "_")
        self.arg_keys.append(arg_key)
        self.parser_group.add_argument(name_flag, **kwargs)


class ArgumentProcessor:

    def __init__(self, description: str, exit_on_error: bool = True):
        self.parser = ArgumentParser(
            description=description, exit_on_error=False)
        self.arg_config = {}
        self.exit_on_error = exit_on_error
        self.parse_groups: Dict[str, MyArgumentGroup] = {}

    def get_group(self, group_name: str, description: Optional[str] = None, min_required_in_group: int = 0):
        if group_name not in self.parse_groups:
            parser_group = self.parser.add_argument_group(group_name, description=description)
            group = MyArgumentGroup(group_name, min_required=min_required_in_group, parser_group=parser_group)
            self.parse_groups[group_name] = group

        return self.parse_groups[group_name]

    def add_argument(self, name_flag: str, value_type: type, help: str, is_required: bool = False, action: Optional[Union[str, type[Action]]] = None, choices: Optional[Iterable[str]] = None, default_value: Any = None, group: Optional[MyArgumentGroup] = None):
        prefix = "Required" if is_required else "Optional"
        arg_help = f"[{prefix}] {help}"
        params_dict: Dict[str, Any] = {
            "help": arg_help,
        }
        if action:
            params_dict["action"] = action
        else:
            params_dict["choices"] = choices
            params_dict["default"] = default_value
        if not action and not isinstance(value_type, EnumType):
            params_dict["type"] = value_type
        if default_value:
            params_dict["help"] = f"{arg_help} Default Value: [{default_value}]"

        if isinstance(group, MyArgumentGroup) and group.group_name in self.parse_groups:
            group.add_argument(name_flag, **params_dict)
            is_required = False
        else:
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
                    raise ValueError(f"Argument '{k}' must be of type {v['value_type'].__name__}")
                argvalue_dict[k] = value

            for group_name, group in self.parse_groups.items():
                valid_count = 0
                for ak in group.arg_keys:
                    if argvalue_dict[ak]:
                        valid_count += 1
                if valid_count < group.min_required:
                    pluralS = "s" if group.min_required > 1 else ""
                    arg_keys = ", ".join(["--"+ak.replace("_", "-") for ak in group.arg_keys])
                    raise ValueError(f"At least {group.min_required} argument{pluralS} from group {group_name} ({arg_keys}), should be present")

            return argvalue_dict
        except Exception as e:
            print("error: ", e)
            self.parser.print_help()
            if self.exit_on_error:
                exit(1)
        return {}
