from pathlib import Path
from string import Template
from .utils import Environment, ArgumentProcessor
from .iam_role.role import create_role, delete_role, save_json
from .iam_role.policy import PolicyAction, delete_inline_policies, detach_manage_policies, revert_manage_policies


def create_cicd_role(args: dict):
    create_role_policy_actions = [
        PolicyAction.CREATE_CUSTOM_MANAGED_POLICY_IF_NEEDED,
        PolicyAction.ATTACH_MANAGE_POLICY
    ]
    create_role_response = create_role(
        role_base_dir=args["cicd_role_base_dir"],
        aws_account_number=args["aws_account"],
        environment=args["environment"] if isinstance(
            args["environment"], Environment) else Environment[args["environment"]],
        github_owner=args["github_owner"],
        github_repo=args["github_repo"],
        role_name_template=Template("$app_name-$env_name-cicd-role"),
        policy_actions=create_role_policy_actions
    )
    role_name = create_role_response["role_aws_response"]["Role"]["RoleName"]

    if args['dry_run']:
        print('Dry run, so deleting that was created')
        delete_inline_request = {
            "role_name": role_name,
            "policy_names": create_role_response["inline_policies"].keys()
        }
        delete_inline_response = delete_inline_policies(
            **delete_inline_request)
        save_json(data={"request": delete_inline_request, "response": delete_inline_response},
                  role_base_dir=args["cicd_role_base_dir"],
                  role_name=role_name,
                  save_for=f"Delete Inline Policies"
                  )
        detach_policies_request = []
        for policy_name, attach_result in create_role_response["attach_manage_policies"].items():
            detach_policies_request.append({
                "policy_arn": attach_result["request"]["PolicyArn"],
                "policy_name": policy_name
            })
        detach_policies_response = detach_manage_policies(role_name=role_name,
                                                          attach_policies=detach_policies_request)
        save_json(data={"request": detach_policies_request, "response": detach_policies_response},
                  role_base_dir=args["cicd_role_base_dir"],
                  role_name=role_name,
                  save_for=f"Detach Manage Policies"
                  )
        delete_role(role_base_dir=args["cicd_role_base_dir"],
                    role_name=role_name)

        rever_manage_policy_results = revert_manage_policies(
            create_role_response["custom_policies"])
        save_json(data=rever_manage_policy_results,
                  role_base_dir=args["cicd_role_base_dir"],
                  role_name=role_name,
                  save_for=f"Revert Custom Policies"
                  )
        print("Dry run completed")


if __name__ == "__main__":
    arg_processor = ArgumentProcessor(
        description="support utility to create iam cicd assume role")
    arg_processor.add_argument("--create", action="store_true", value_type=bool, is_required=True,
                               help="Indicate create role")
    arg_processor.add_argument("--cicd-role-base-dir", value_type=Path, is_required=True,
                               help="Provide base directory where all necessary template files located in creating cicd role. ex. 'cicd-role'")
    arg_processor.add_argument("--aws-account", value_type=int, is_required=True,
                               help="Provide AWS Account number where you want to create the role")
    arg_processor.add_argument("--environment", value_type=Environment, choices=[e.name for e in Environment], is_required=True,
                               help="Provide Allowed Environment Name")
    arg_processor.add_argument("--github-owner", value_type=str, is_required=True,
                               help="Provide Github Owner account id")
    arg_processor.add_argument("--github-repo", value_type=str, is_required=True,
                               help="Provide Github Repository name from where you want to trigger the workflow through assuming cicd role")
    arg_processor.add_argument("--dry-run", action="store_true", value_type=bool, is_required=False, default_value=False,
                               help="Dry run to validate cicd role creation")

    args_values = arg_processor.parse_and_validate_args()

    create_cicd_role(args_values)
