from pathlib import Path
from string import Template
import json
from typing import List, TypedDict, Dict
from ..utils import Environment, app_config, rootpath, get_manage_policy_name_suffix
from .policy import get_trust_policy, PolicyAction, create_inline_policies, create_custom_policies, PolicyResponseTypeDef
from .client import iam
from mypy_boto3_iam.type_defs import CreateRoleRequestTypeDef, CreatePolicyResponseTypeDef, CreatePolicyVersionResponseTypeDef, AttachRolePolicyRequestTypeDef, CreateRoleResponseTypeDef


class RoleResponse(TypedDict):
    role_request: CreateRoleRequestTypeDef = None
    role_aws_response: CreateRoleResponseTypeDef = None
    role_action: str = None
    inline_policies: Dict = {}
    custom_policies: Dict = {}
    attach_manage_policies: Dict = {}


def save_json(data: dict, role_base_dir: Path, role_name: str, save_for: str):
    role_dir: Path = rootpath/"dist"/role_base_dir/role_name
    role_dir.mkdir(parents=True, exist_ok=True)
    file_name = save_for.lower().replace(" ", "-")+".json"
    file_path = role_dir/file_name
    with open(file_path, "w") as file:
        json.dump(data, file, indent=4, default=str)

    print(f"{save_for} for Role[{role_name}]", "File Created at:",
          file_path.relative_to(rootpath).resolve())

    return file_path


def prepare_role_request(role_base_dir: Path, aws_account_number: int | str, environment: Environment, role_name_template=Template, github_owner: str = None, github_repo_aws: str = None, github_repo_ui: str = None) -> CreateRoleRequestTypeDef:
    assume_role_policy_document = get_trust_policy(
        role_base_dir, aws_account_number=aws_account_number, environment=environment, github_owner=github_owner, github_repo_aws=github_repo_aws, github_repo_ui=github_repo_ui)
    role_name = role_name_template.substitute(
        env_name=environment.name.lower(),
        env_id=environment.value,
        **app_config
    )
    tags = [
        {'Key': 'appId', 'Value': app_config["app_id"]},
        {'Key': 'environment', 'Value': environment.value}
    ]

    create_role_request = CreateRoleRequestTypeDef(
        RoleName=role_name,
        AssumeRolePolicyDocument=assume_role_policy_document,
        Description='Role for CI/CD to assume. This can be used by github workflow only.',
        Tags=tags
    )

    return create_role_request


def create_role(role_base_dir: Path, aws_account_number: int | str, environment: Environment, role_name_template=Template, policy_actions: List[PolicyAction] = [], github_owner: str = None, github_repo_aws: str = None, github_repo_ui: str = None, aws_region: str = None):
    create_role_request = prepare_role_request(role_base_dir,
                                               aws_account_number=aws_account_number,
                                               environment=environment,
                                               role_name_template=role_name_template,
                                               github_owner=github_owner,
                                               github_repo_aws=github_repo_aws,
                                               github_repo_ui=github_repo_ui
                                               )

    save_json(create_role_request, role_base_dir,
              create_role_request["RoleName"], "Create Role Request")

    create_role_response = iam.create_role(**create_role_request)
    print('Created Role ARN:', create_role_response['Role']['Arn'])
    role_name = create_role_response["Role"]["RoleName"]
    save_json(create_role_response, role_base_dir,
              role_name, "Create Role Response")

    inline_policies_response = create_inline_policies(role_name=role_name,
                                                      role_base_dir=role_base_dir,
                                                      aws_account_number=aws_account_number,
                                                      aws_region=aws_region,
                                                      environment=environment)
    for policy_name, policy_result in inline_policies_response.items():
        save_json(policy_result,
                  role_base_dir=role_base_dir,
                  role_name=role_name,
                  save_for=f"Create Inline Policy {policy_name}")

    if PolicyAction.CREATE_CUSTOM_MANAGED_POLICY_IF_NEEDED in policy_actions:
        custom_policies_response = create_custom_policies(aws_account_number=aws_account_number,
                                                          aws_region=aws_region,
                                                          environment=environment,
                                                          role_base_dir=role_base_dir,
                                                          update_if_exists=False,
                                                          fail_if_exists=False,
                                                          name_suffix=get_manage_policy_name_suffix(environment))

        for policy_name, policy_result in custom_policies_response.items():
            save_json(policy_result,
                      role_base_dir=role_base_dir,
                      role_name=role_name,
                      save_for=f"Create Custom Policy {policy_name}")

    if PolicyAction.ATTACH_MANAGE_POLICY in policy_actions:
        attach_policies_response = {}
        for policy_name, custom_policy_result in custom_policies_response.items():
            policy_response: PolicyResponseTypeDef = custom_policy_result["response"]
            attach_role_policy_request = AttachRolePolicyRequestTypeDef(
                PolicyArn=policy_response["PolicyArn"],
                RoleName=role_name
            )
            attach_role_policy_response = iam.attach_role_policy(
                attach_role_policy_request)
            attach_policy_result = {
                "request": attach_role_policy_request,
                "response": attach_role_policy_response
            }
            attach_policies_response[policy_name] = attach_policy_result
            save_json(attach_policy_result,
                      role_base_dir=role_base_dir,
                      role_name=role_name,
                      save_for=f"Attach Policy {policy_name}")

    return RoleResponse(
        role_action="createRole",
        role_aws_response=create_role_response,
        role_request=create_role_request,
        inline_policies=inline_policies_response,
        custom_policies=custom_policies_response,
        attach_manage_policies=attach_policies_response
    )


def delete_role(role_base_dir: Path, role_name: str):
    delete_response = iam.delete_role(RoleName=role_name)
    print('Deleted Role Name:', role_name,
          'Status:', delete_response['ResponseMetadata']['HTTPStatusCode'],
          'RequestId: ', delete_response['ResponseMetadata']['RequestId'])
    save_json({"request": {"RoleName": role_name}, "response": delete_response},
              role_base_dir,
              role_name, "Delete Role")
    return delete_response
