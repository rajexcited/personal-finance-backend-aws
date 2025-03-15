from enum import Enum
import json
from pathlib import Path
from string import Template
from typing import Any, Dict, List, TypedDict
from ..utils import rootpath, Environment, app_config, aws_error_handler
from .client import iam
from mypy_boto3_iam.type_defs import CreatePolicyResponseTypeDef, CreatePolicyVersionResponseTypeDef, DeleteRolePolicyRequestTypeDef, DetachRolePolicyRequestTypeDef, SetDefaultPolicyVersionRequestTypeDef, DeletePolicyVersionRequestTypeDef


class PolicyAction(Enum):
    UPDATE_INLINE = "update-inline-policy"
    ATTACH_MANAGE_POLICY = "attach-policy"
    CREATE_CUSTOM_MANAGED_POLICY_IF_NEEDED = "create-if-needed-custom-managed-policy"
    CREATE_ONLY = "create-policy"


class PolicyResponseTypeDef(TypedDict):
    is_created: bool = False
    is_updated: bool = False
    aws_response: CreatePolicyResponseTypeDef | CreatePolicyVersionResponseTypeDef = None
    message: str = None
    PolicyName: str = None
    PolicyArn: str = None
    previous_default_version_id: str = None


def validate_policy_document(policy_document: str, policy_name: str):
    json_policy = json.loads(policy_document)
    if not isinstance(json_policy, dict):
        raise ValueError(
            f"Policy document is not json object. One file can have only one policy document. policyName:{policy_name}")
    if 'Version' not in json_policy:
        raise ValueError(
            f"Version key is missing in policy document. policyName:{policy_name}")
    if 'Statement' not in json_policy:
        raise ValueError(
            f"Statement key is missing in policy document. policyName:{policy_name}")
    if not isinstance(json_policy['Statement'], list):
        raise ValueError(
            f"Statement key should be a list. policyName:{policy_name}")
    sid_list = []
    for statement in json_policy['Statement']:
        if 'Sid' not in statement:
            raise ValueError(
                f"Sid key is missing in statement. policyName:{policy_name}")
        if statement['Sid'] in sid_list:
            sid = statement["Sid"]
            raise ValueError(
                f"Sid value should be unique. found duplicate '{sid}'. policyName:{policy_name}")


def get_policy_document(data: Dict[str, str], policy_path: Path) -> tuple[str, str]:
    with open(policy_path, 'r') as policy_file:
        # validate trust policy json format
        policy_json = json.load(policy_file)
        policy_template = Template(json.dumps(policy_json, indent=4))

    required_keys = policy_template.get_identifiers()
    # print('required keys for template: ', required_keys)
    # compare keys of data with required_keys
    for key in required_keys:
        if key not in data or not data[key]:
            raise ValueError(f"Key {key} is missing from data")
    policy_document = policy_template.safe_substitute(data)
    file_name = policy_path.stem

    validate_policy_document(policy_document=policy_document,
                             policy_name=file_name)

    policy_name = file_name.replace("_", "-").replace(" ", "-").strip()
    return policy_document, policy_name


def get_trust_policy(role_base_dir: Path, aws_account_number: int | str, environment: Environment, github_owner: str = None, github_repo: str = None) -> str | None:
    json_file = Path('trust-relationship.json')
    trust_file_path = rootpath/role_base_dir/json_file
    if not trust_file_path.exists():
        return "{}"
    print('Found Trust File Path: ', trust_file_path.resolve())

    data = {
        "aws_principal_account": aws_account_number,
        "github_owner": github_owner,
        "github_repo": github_repo,
        "condition_key": "environment",
        "condition_value": 'aws-infra-'+environment.name.lower(),
    }
    trust_policy, trust_policy_name = get_policy_document(
        data, trust_file_path)
    return trust_policy


def prepare_policies(policy_dir: Path, aws_account_number: int | str, environment: Environment) -> Dict[str, str]:
    data = {
        "aws_principal_account": aws_account_number,
        "app_name": app_config["app_name"],
        "app_id": app_config["app_id"],
        "env_name": environment.name.lower(),
        "env_id": environment.value
    }
    print(f'Preparing Policy document from policy directory [{policy_dir}]')
    policy_dict = {}
    for policy_path in policy_dir.rglob("*.json"):
        policy_document, policy_name = get_policy_document(
            data, policy_path)
        policy_dict[policy_name] = policy_document
    print(
        f"retrieved {len(policy_dict.keys())} policies to be added from directory {policy_dir}")
    return policy_dict


def create_inline_policies(role_name: str, role_base_dir: Path, aws_account_number: int | str, environment: Environment) -> Dict[str, Dict]:
    inline_policies_dir = rootpath/role_base_dir/"policies/inline"
    inline_policy_dict = prepare_policies(policy_dir=inline_policies_dir,
                                          aws_account_number=aws_account_number,
                                          environment=environment)

    result = {}
    for policy_name, policy_document in inline_policy_dict.items():
        # print("policy_name=", policy_name, "policy_document=", policy_document)
        put_policy_response = iam.put_role_policy(
            RoleName=role_name,
            PolicyName=str(policy_name),
            PolicyDocument=str(policy_document)
        )
        print('Inline Policy added to Role:', role_name, 'Policy Name:', policy_name,
              'Response:', put_policy_response['ResponseMetadata']['HTTPStatusCode'])
        result[policy_name] = {
            "request": policy_document,
            "response": put_policy_response
        }

    return result


def delete_inline_policies(role_name: str, policy_names: List[str]):
    result = {}
    for policy_name in policy_names:
        delete_request = DeleteRolePolicyRequestTypeDef(
            RoleName=role_name,
            PolicyName=str(policy_name)
        )
        delete_response = iam.delete_role_policy(**delete_request)
        print("Deleted Policy Name:", policy_name,
              "status:", delete_response["ResponseMetadata"]["HTTPStatusCode"],
              " requestId: ", delete_response["ResponseMetadata"]["RequestId"])
        result[policy_name] = {
            "request": delete_request,
            "response": delete_response
        }

    return result


def detach_manage_policies(role_name: str, attach_policies: List[Dict]):
    result = {}
    for policy_details in attach_policies:
        detach_request = DetachRolePolicyRequestTypeDef(
            RoleName=role_name,
            PolicyArn=policy_details["policy_arn"]
        )
        detach_response = iam.detach_role_policy(**detach_request)
        print("Detached Manage policy Name: ", policy_details["policy_name"],
              "status:", detach_response["ResponseMetadata"]["HTTPStatusCode"],
              " requestId: ", detach_response["ResponseMetadata"]["RequestId"])
        result[policy_details["policy_name"]] = {
            "request": detach_request,
            "response": detach_response
        }

    return result


def set_default_version(manage_policies: List[Dict], delete_current_default: bool = True):
    result = {}
    for policy_details in manage_policies:
        default_version_request = SetDefaultPolicyVersionRequestTypeDef(
            PolicyArn=policy_details["policy_arn"],
            VersionId=policy_details["new_default_version_id"]
        )
        default_version_response = iam.set_default_policy_version(
            **default_version_request)
        result[policy_details["policy_name"]] = {
            "default_version": {
                "request": default_version_request,
                "response": default_version_response
            }}
        if delete_current_default:
            delete_version_request = DeletePolicyVersionRequestTypeDef(
                PolicyArn=policy_details["policy_arn"],
                VersionId=policy_details["current_default_version_id"]
            )
            delete_version_response = iam.delete_policy_version(
                **delete_version_request)
            result[policy_details["policy_name"]]["delete_version"] = {
                "request": delete_version_request,
                "response": delete_version_response
            }

    return result


def get_policy(policy_name: str, aws_account_number: str | int):
    policy_arn = f"arn:aws:iam::{aws_account_number}:policy/{policy_name}"
    try:
        get_policy_response = iam.get_policy(PolicyArn=policy_arn)
        return get_policy_response
    except Exception as e:
        # print(e)
        errorMessage = f"{e}"
        expected = f"An error occurred (NoSuchEntity) when calling the GetPolicy operation: Policy {policy_arn} was not found."
        if expected in errorMessage:
            return None
        # unexpected error
        raise e


def create_custom_policies(role_base_dir: Path, aws_account_number: int | str, environment: Environment, update_if_exists: bool = True, fail_if_exists: bool = True, name_suffix: str = "", name_prefix: str = ""):
    custom_policies_dir = rootpath/role_base_dir/"policies/custom"
    custom_policy_dict = prepare_policies(policy_dir=custom_policies_dir,
                                          aws_account_number=aws_account_number,
                                          environment=environment)

    result = {}
    tags = [
        {'Key': 'appId', 'Value': app_config["app_id"]},
        {'Key': 'environment', 'Value': environment.value}
    ]
    for policy_name_key, policy_document in custom_policy_dict.items():
        policy_name = policy_name_key.capitalize()
        capitalize_policy_name = "".join(
            [part.capitalize() for part in policy_name.split("-")])
        capitalize_policy_name = name_prefix + capitalize_policy_name + \
            name_suffix

        get_policy_response = get_policy(aws_account_number=aws_account_number,
                                         policy_name=capitalize_policy_name)

        if get_policy_response is None:
            create_response = iam.create_policy(
                Tags=tags,
                PolicyName=capitalize_policy_name,
                PolicyDocument=str(policy_document)
            )
            print("Custom Policy created, Policy Name:", capitalize_policy_name,
                  "Status: ", create_response["ResponseMetadata"]["HTTPStatusCode"])
            policy_response = PolicyResponseTypeDef(
                is_created=True,
                aws_response=create_response,
                PolicyName=create_response["Policy"]["PolicyName"],
                PolicyArn=create_response["Policy"]["Arn"],
                message="created policy first time"
            )
        elif fail_if_exists:
            raise ValueError(
                f"Custom Policy [{capitalize_policy_name}] already exists.")
        elif update_if_exists:
            create_version_response = iam.create_policy_version(
                PolicyArn=get_policy_response["Policy"]["Arn"],
                PolicyDocument=str(policy_document),
                SetAsDefault=True
            )
            print("Custom Policy updated, Policy Name:", capitalize_policy_name,
                  "Status: ", create_version_response["ResponseMetadata"]["HTTPStatusCode"])
            policy_response = PolicyResponseTypeDef(
                is_updated=True,
                aws_response=create_version_response,
                PolicyName=capitalize_policy_name,
                PolicyArn=get_policy_response["Policy"]["Arn"],
                message="updated policy with new version",
                previous_default_version_id=get_policy_response["Policy"]["DefaultVersionId"]
            )
        else:
            policy_response = PolicyResponseTypeDef(
                PolicyArn=get_policy_response["Policy"]["Arn"],
                PolicyName=capitalize_policy_name,
                message="Policy Already Exists. Skipping Creation/Updation"
            )

        result[capitalize_policy_name] = {
            "request": policy_document,
            "response": policy_response
        }

    return result


iam_delete_policy = aws_error_handler(
    iam.delete_policy, expected_error_code="NoSuchEntity", not_exists_type="policy")


def delete_custom_policies(manage_policies: List[Dict]):
    result = {}
    for policy_details in manage_policies:
        delete_policy_response = iam_delete_policy(
            PolicyArn=policy_details["policy_arn"]
        )
        result[policy_details["policy_name"]] = {
            "request": {
                "PolicyArn": policy_details["policy_arn"]
            },
            "response": delete_policy_response
        }

    return result


def revert_manage_policies(manage_policy_results: Dict):
    delete_policies_request = []
    default_version_request = []
    for policy_name, result in manage_policy_results.items():
        policy_response: PolicyResponseTypeDef = result["response"]
        print("policy response:", policy_response)
        if "is_created" in policy_response and policy_response["is_created"]:
            delete_policies_request.append({
                "policy_name": policy_name,
                "policy_arn": policy_response["PolicyArn"]
            })
        elif "is_updated" in policy_response and policy_response["is_updated"]:
            default_version_request.append({
                "policy_name": policy_name,
                "policy_arn": policy_response["PolicyArn"],
                "new_default_version_id": policy_response["previous_default_version_id"],
                "current_default_version_id": policy_response["aws_response"]["PolicyVersion"]["VersionId"]
            })
    delete_policy_response = delete_custom_policies(delete_policies_request)
    default_version_response = set_default_version(default_version_request)
    return {
        "delete_custom_policy": {
            "request": delete_policies_request,
            "response": delete_policy_response
        },
        "default_version_policy": {
            "request": default_version_request,
            "response": default_version_response
        }
    }
