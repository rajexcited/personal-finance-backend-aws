from pathlib import Path
import random
import shutil
from string import Template
import string
from typing import Dict
from .utils import Environment, ArgumentProcessor, rootpath, get_manage_policy_name_suffix, get_cdk_policy_prefix
from .iam_role.role import save_json
from .iam_role.policy import revert_manage_policies, create_custom_policies


def generate_random_id(length=20):
    characters = string.ascii_letters + string.digits
    random_id = ''.join(random.choice(characters) for _ in range(length))
    return random_id


def update_manage_policy(arg_values: Dict):
    """
    Arguments:
        arg_values (Dict): user input from command line. expected keys: policy_path, aws_account, environment, dry_run  

    Steps:
        1. move the policy file to unique dir under dist  
        2. call create policy with update  
        3. save request and response  
        4. if dry run, revert action  
        5. save request and response  
    """
    policy_path: Path = arg_values["policy_path"]
    if not policy_path.is_file():
        raise ValueError("Policy json file not found")
    role_base_dir = "dist/iam-policy/update_"+generate_random_id(length=5)
    # this will fail if path already exists, in case generated id is same. very rare possibilities
    Path(rootpath/role_base_dir/"policies/custom").mkdir(parents=True)
    copied_file_response = shutil.copy(
        policy_path, rootpath/role_base_dir/"policies/custom")
    print("File is copied, response: ", copied_file_response)
    policy_name_prefix = get_cdk_policy_prefix(policy_path)
    policy_name_suffix = get_manage_policy_name_suffix(
        arg_values["environment"])
    policy_update_result = create_custom_policies(role_base_dir,
                                                  aws_account_number=arg_values["aws_account"],
                                                  aws_region=arg_values["aws_region"],
                                                  environment=arg_values["environment"],
                                                  update_if_exists=True,
                                                  fail_if_exists=False,
                                                  name_suffix=policy_name_suffix,
                                                  name_prefix=policy_name_prefix
                                                  )
    save_json(data=policy_update_result,
              role_base_dir=role_base_dir,
              role_name=policy_path.stem,
              save_for=f"Update Custom Policy"
              )

    if arg_values['dry_run']:
        print('Dry run, so reverting policy update / create')
        rever_manage_policy_results = revert_manage_policies(
            policy_update_result)
        save_json(data=rever_manage_policy_results,
                  role_base_dir=role_base_dir,
                  role_name=policy_path.stem,
                  save_for=f"Revert Custom Policy updates"
                  )
        print("Dry run completed")


if __name__ == "__main__":
    arg_processor = ArgumentProcessor(
        description="support utility to update iam manage policy")
    arg_processor.add_argument("--update", action="store_true", value_type=bool, is_required=True,
                               help="Indicate update policy")
    arg_processor.add_argument("--policy-path", value_type=Path, is_required=True,
                               help="Provide file path of policy to be updated")
    arg_processor.add_argument("--aws-account", value_type=int, is_required=True,
                               help="Provide AWS Account number where you want to create the role")
    arg_processor.add_argument("--aws-region", value_type=str, is_required=False, default_value="us-east-2",
                               help="Provide AWS Region")
    arg_processor.add_argument("--environment", value_type=Environment, choices=[e.name for e in Environment], is_required=True,
                               help="Provide Allowed Environment Name")
    arg_processor.add_argument("--dry-run", action="store_true", value_type=bool, is_required=False, default_value=False,
                               help="Dry run to validate update policy")

    args_values = arg_processor.parse_and_validate_args()

    update_manage_policy(args_values)
