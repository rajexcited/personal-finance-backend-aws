from io import TextIOWrapper
from pathlib import Path
import subprocess
import sys
import threading
from typing import Dict
from .utils import Environment, ArgumentProcessor, app_config, rootpath, aws_error_handler
from .iam_role.policy import create_custom_policies, delete_custom_policies
from .iam_role.role import save_json
import boto3
from mypy_boto3_cloudformation import CloudFormationClient
from mypy_boto3_cloudformation.type_defs import StackEventTypeDef
from mypy_boto3_s3 import S3Client
from datetime import datetime, timedelta
import time
import colorama
from colorama import Fore

cft: CloudFormationClient = boto3.client('cloudformation')
s3: S3Client = boto3.client('s3')


def get_timestamp_logfile_suffix():
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H-%M-%S")
    return f"{date_str}_{time_str}"


def create_manage_policy_arns(arg_values: Dict):
    cfn_role_name = "cfn-exec-role"
    role_base_dir = arg_values["cdk_roles_dir"]/cfn_role_name
    custom_policies_result = create_custom_policies(role_base_dir=role_base_dir,
                                                    aws_account_number=arg_values["aws_account"],
                                                    environment=arg_values["environment"],
                                                    fail_if_exists=False,
                                                    update_if_exists=arg_values["update_policies_if_exists"],
                                                    name_suffix=f"-{app_config['app_id']}{arg_values['environment'].value}",
                                                    name_prefix="cdk"
                                                    )
    base_dir = Path("bootstrap")/arg_values["cdk_roles_dir"]
    save_json(custom_policies_result,
              role_base_dir=base_dir,
              role_name=cfn_role_name,
              save_for="Create custom policies")

    manage_policy_arns = [policy_result["response"]["PolicyArn"]
                          for policy_result in custom_policies_result.values()]

    return custom_policies_result, manage_policy_arns


def get_stack_name(arg_values: Dict):
    app_id = app_config["app_id"]
    env_name = arg_values["environment"].name
    stack_name = f'CDKToolkit-{app_id}-{env_name}'
    return stack_name


def get_qualifier_value(arg_values: Dict):
    env_id = arg_values["environment"].value
    qualifier_value = app_config["app_id"]+env_id
    return qualifier_value


def is_stack_exists(stack_name: str, expected_status: str = None):
    # verify stack exists or not.
    result = describe_stacks(StackName=stack_name)
    if not result:
        return False
    print("Describe Stack: ", stack_name,
          "Status: ", result["ResponseMetadata"]["HTTPStatusCode"])
    if len(result["Stacks"]) == 0:
        return False

    if expected_status is not None and result["Stacks"][0]["StackStatus"] != expected_status:
        return False

    return True


def validate_bootstap_stack(arg_values: Dict):
    stack_name = get_stack_name(arg_values)
    if is_stack_exists(stack_name):
        colorama.init(autoreset=True)
        print(Fore.RED + "CDK has already been bootstrap.",
              "Stack " + Fore.GREEN + stack_name,
              "with qualifier " + Fore.RED + get_qualifier_value(arg_values), "already exists")
        exit(1)


def capture_output(process: subprocess.Popen, file_path: Path):
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w") as f:
        for line in iter(process.stdout.readline, ""):
            sys.stdout.write(line)
            sys.stdout.write("\n")
            f.writelines([line])

    process.stdout.close()
    print("output file at",
          file_path.relative_to(rootpath).resolve())


def capture_error_out(process: subprocess.Popen, file_path: Path):
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w", errors="replace") as f:
        for line in iter(process.stderr.readline, ""):
            sys.stderr.write(line)
            sys.stderr.write("\n")
            f.writelines([line])

    process.stderr.close()
    print("error output file at",
          file_path.relative_to(rootpath).resolve())


def bootstrap_cdk(arg_values: Dict):
    app_id = app_config["app_id"]
    env_id = arg_values["environment"].value

    stack_name = get_stack_name(arg_values)
    manage_policy_arns = []
    manage_policy_results = {}

    if not arg_values["template_only"]:
        validate_bootstap_stack(arg_values)

        manage_policy_results, manage_policy_arns = create_manage_policy_arns(
            arg_values)

    command = []
    command.append('cdk')
    command.append('bootstrap')
    command.append(
        f'aws://{arg_values["aws_account"]}/{arg_values["aws_region"]}')
    # command.append(f'--trust {arg_values["aws_account"]}')
    command.append(f'--tags appId={app_id}')
    command.append(f'--tags environment={env_id}')
    command.append(f'--toolkit-stack-name "{stack_name}"')
    command.append(f'--qualifier "{get_qualifier_value(arg_values)}"')
    command.append(
        f' --cloudformation-execution-policies "{",".join(manage_policy_arns)}"')
    base_file_path = rootpath/"dist/bootstrap"
    timestamp_suffix = get_timestamp_logfile_suffix()
    file_name = f"{stack_name}_{timestamp_suffix}.output.log"
    if arg_values["template_only"]:
        command.append('--show-template')
        file_name = f"template_{timestamp_suffix}.yml"

    try:
        process = subprocess.Popen(" ".join(command), shell=True,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   # check=True, capture_output=True, text=True)
                                   text=True, encoding='utf-8', errors='ignore')

        print("Executing Command")
        print(" ".join(command))
        file_path = base_file_path/file_name
        # capture_output(process, file_path=file_path)
        error_file_path = file_path.with_suffix(".error.log")
        # capture_error_out(process, file_path=error_file_path)
        # Create and start a thread to capture the output
        capture_errorout_thread = threading.Thread(
            target=capture_error_out, args=(process, error_file_path))
        capture_output_thread = threading.Thread(
            target=capture_output, args=(process, file_path))

        capture_output_thread.start()
        capture_errorout_thread.start()
        process.wait()
        capture_output_thread.join()
        capture_errorout_thread.join()

        if process.returncode is None or process.returncode == 0:
            print("bootstrapping CDK is completed.")
            # print warnings
            # print("".join(stderr))
            if arg_values["dry_run"]:
                print('Dry run requested')
                dry_run_arg_request = {
                    "destroy_bootstrap": True,
                    "delete_policies": True,
                    "aws_account": arg_values["aws_account"],
                    "aws_region": arg_values["aws_region"],
                    "environment": arg_values["environment"],
                    "template_only": arg_values["template_only"],
                    "cdk_roles_dir": arg_values["cdk_roles_dir"]
                }
                delete_bootstrap_stack(
                    dry_run_arg_request, manage_policy_results)

        else:
            print("bootstrap exited with error",
                  "return code: ", process.returncode)

    except subprocess.CalledProcessError as e:
        print(f"Error: {e}")
        print(f"Error Output:\n", e.stderr)


def print_stack_event(event: StackEventTypeDef, stack_name: str, file: TextIOWrapper, show_events_after_time: datetime):
    if event["Timestamp"].astimezone() < show_events_after_time.astimezone():
        return False

    output = [stack_name]
    output.append(event["Timestamp"].astimezone().strftime("%I:%M:%S %p"))
    output.append(f'{event["ResourceStatus"]:30}')
    output.append(f'{event["ResourceType"]:30}')
    output.append(event["LogicalResourceId"] + " " +
                  event.get("ResourceStatusReason", "") + " " +
                  event.get("DetailedStatus", ""))
    print(" | ".join(output), "\n")
    file.write(" | ".join(output))
    file.write("\n")
    file.flush()
    return True


describe_stack_events = aws_error_handler(
    cft.describe_stack_events, expected_error_code="ValidationError", not_exists_type="stack")
describe_stacks = aws_error_handler(
    cft.describe_stacks, expected_error_code="ValidationError", not_exists_type="stack")


def wait_stack_deletion_events(stack_name: str):
    file_path = Path(
        f"dist/bootstrap/destroy/delete-stack-events_{get_timestamp_logfile_suffix()}.log")
    file_path.parent.mkdir(parents=True, exist_ok=True)
    total_wait_min = 30
    sleep_duration_seconds = 5
    remaining_loop_count = total_wait_min*60/sleep_duration_seconds
    with open(file_path, "w", errors="replace") as logfile:
        # Poll for stack events
        show_events_after_time = datetime.now()-timedelta(seconds=10)
        stack_id = None
        while True:
            if not stack_id:
                response = describe_stack_events(StackName=stack_name)
            else:
                response = describe_stack_events(StackName=stack_id)
            if not response:
                print("stack is deleted")
                break

            events = response['StackEvents']
            # Print the most recent events
            for event in events:
                if not stack_id:
                    stack_id = event["StackId"]
                is_printed = print_stack_event(event, stack_name=stack_name,
                                               file=logfile, show_events_after_time=show_events_after_time)
                if is_printed:
                    # Check if stack deletion is complete
                    if event["ResourceType"] == "AWS::CloudFormation::Stack":
                        if event["ResourceStatus"] == "DELETE_COMPLETE":
                            print(f"\nStack deletion complete: {stack_name}")
                            remaining_loop_count = 0
                        if event["ResourceStatus"].endswith('FAILED'):
                            print(f"\nStack deletion failed: {stack_name}")
                            print(event.get("ResourceStatusReason", "") +
                                  " " + event.get("DetailedStatus", ""))
                            break

            if remaining_loop_count == 0:
                print("Waited for maximum allowed time")
                break
            remaining_loop_count -= 1
            # Wait before polling again
            show_events_after_time = datetime.now()
            time.sleep(sleep_duration_seconds)


delete_bucket = aws_error_handler(
    s3.delete_bucket, expected_error_code="NoSuchBucket", not_exists_type="bucket")


def delete_asset_s3(arg_values: Dict):
    aws_account = arg_values["aws_account"]
    aws_region = arg_values["aws_region"]
    qualifier = get_qualifier_value(arg_values)
    bucket_name = f"cdk-{qualifier}-assets-{aws_account}-{aws_region}"
    print("attempting to delete asset bucket")
    delete_bucket_response = delete_bucket(Bucket=bucket_name)
    save_json({"request": {"Bucket": bucket_name}, "response": delete_bucket_response},
              role_base_dir=Path("bootstrap"),
              role_name="bucket",
              save_for="Delete Assets Bucket")
    if not delete_bucket_response:
        print("asset bucket not exists. hence couldnot delete.")


def delete_bootstrap_stack(arg_values: Dict, manage_policy_results: Dict = None):
    if "template_only" in arg_values and arg_values["template_only"]:
        print("cannot delete stack. The template request is local only, will not affect aws account")
        return
    if "dry_run" in arg_values and arg_values["dry_run"]:
        print("dry run is not supported in delete stack action")
        return

    print('Deleting bootstrap stack')
    stack_name = get_stack_name(arg_values)
    if not is_stack_exists(stack_name):
        colorama.init(autoreset=True)
        print("stack ", Fore.LIGHTRED_EX + stack_name,
              "doesnot exists. cannot be deleted")
        delete_asset_s3(arg_values)
        return

    delete_stack_response = cft.delete_stack(StackName=stack_name)
    save_json(delete_stack_response,
              role_base_dir=Path("bootstrap"), role_name="destroy", save_for="Delete Stack")
    wait_stack_deletion_events(stack_name)
    delete_asset_s3(arg_values)

    if arg_values["delete_policies"]:
        if not manage_policy_results:
            arg_values["update_policies_if_exists"] = False
            manage_policy_results, ignore_arns = create_manage_policy_arns(
                arg_values)
            delete_policies_request = []
            for name, result in manage_policy_results.items():
                delete_policies_request.append({
                    "policy_name": name,
                    "policy_arn": result["response"]["PolicyArn"]
                })
            delete_policies_results = delete_custom_policies(
                delete_policies_request)
            base_dir = Path("bootstrap")/arg_values["cdk_roles_dir"]
            save_json(data={"request": delete_policies_request, "response": delete_policies_results},
                      role_base_dir=base_dir,
                      role_name="cfn-exec-role",
                      save_for=f"Delete Custom Policies"
                      )


########################
# Bootstrap Value Rules:
############
# Qualifier: there must be 9 chars according cdk bootstrap cli rules. default value is `hnb659fds`.
#       So we are dividing into 6+3 to customize to accomodate control for app by env. the format is `<appId><envId>`
# 6 chars AppId (if less than 6, add some dummy/mock chars.)
# 3 chars Environment Id
#######
# Tags: app tag is required to identify which boootstrap is for what? also if further access control requires, can use tags in access conditions.
##############


if __name__ == "__main__":
    arg_processor = ArgumentProcessor(
        description="bootstrap cdk by environment")

    arg_processor.add_argument("--bootstrap", action="store_true", value_type=bool, is_required=True,
                               help="To start bootstrapping CDK by environment")
    arg_processor.add_argument("--destroy", action="store_true", value_type=bool, is_required=False,
                               help="To destroy bootstrap CDK stack by environment")
    arg_processor.add_argument("--cdk-roles-dir", value_type=Path, is_required=True,
                               help="Provide base directory where all necessary template files located")
    arg_processor.add_argument("--aws-account", value_type=int, is_required=True,
                               help="Provide AWS Account number where you want to create the role")
    arg_processor.add_argument("--aws-region", value_type=str, is_required=False, default_value="us-east-2",
                               help="Provide AWS Region for bootstrap stack.")
    arg_processor.add_argument("--environment", value_type=Environment, choices=[e.name for e in Environment], is_required=True,
                               help="Provide Allowed Environment Name")
    arg_processor.add_argument("--update-policies-if-exists", action="store_true", value_type=bool, is_required=False,
                               help="If this param is provided, policies will be updated with new version")
    arg_processor.add_argument("--delete-policies", action="store_true", value_type=bool, is_required=False,
                               help="If provided along with destroy, policies will be deleted")
    arg_processor.add_argument("--template-only", action="store_true", value_type=bool, is_required=False,
                               help="Indicates to only generate bootstrap stack template")
    arg_processor.add_argument("--dry-run", action="store_true", value_type=bool, is_required=False,
                               help="Dry run to validate cicd role creation")

    arg_values = arg_processor.parse_and_validate_args()
    if arg_values["destroy"]:
        delete_bootstrap_stack(arg_values)
    else:
        bootstrap_cdk(arg_values)
