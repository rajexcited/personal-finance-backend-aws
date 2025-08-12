from argparse import ArgumentParser
from enum import Enum
import re
from typing import Dict, List, Optional
from datetime import timedelta
from ...md_parser import parsed_body, get_list_items
from ...md_parser.models import MdHeader, MdListItemTitleContent, MdListItemTodo
from ...utils import convert_to_human_readable, export_to_env, get_converted_enum, get_parsed_arg_value, get_valid_dict, get_preferred_datetime, get_now, parse_milestone_dueon


class RequestType(Enum):
    Provision = "provision"
    Deprovision = "deprovision"


def validate_test_plan_issue_link(testplan_section_list: List, request_form_issue_details: dict, testplan_type: str):
    testplantype = testplan_type.lower()
    request_title = str(request_form_issue_details["title"])
    if testplantype not in request_title.lower():
        raise ValueError("Test Plan type is not included in request form title")

    testplan_link_match = None
    section_list = get_list_items(testplan_section_list)
    for listitem in section_list:
        if isinstance(listitem, MdListItemTitleContent) and listitem.content is not None:
            item_title = str(listitem.title).lower()
            if testplantype in item_title and "test plan" in item_title:
                testplan_link_match = re.match(r".*https://github.com.+/issues/(\d+)", listitem.content)
            else:
                testplan_link_match = re.match(r".*#(\d+)", listitem.content)

    if not testplan_link_match:
        raise ValueError("Test Plan issue link is not in correct format")


def validate_deployment_schedule(deployment_schedule_list: List, request_form_issue_details: dict, branch_details: Dict[str, str], request_type: RequestType):
    if request_type == RequestType.Provision:
        if not branch_details["name"].startswith("milestone") and branch_details["name"] != "master":
            raise ValueError("Deployment is only supported for master branch or milestone branch.")
        if branch_details["name"] == "master" and request_form_issue_details["milestone"]["state"] == "open":
            raise ValueError("Deployment on the master branch is prohibited while the milestone is open.")
        if branch_details["name"].startswith("milestone") and request_form_issue_details["milestone"]["state"] == "closed":
            raise ValueError("Deployment on the milestone branch is prohibited while the milestone is closed.")

    preferred_date_obj = None
    deploy_scope = None
    delete_schedule_date_obj = None
    mdlist = get_list_items(deployment_schedule_list)
    for listitem in mdlist:
        if isinstance(listitem, MdListItemTitleContent) and listitem.title is not None:
            if "Preferred Date and Time" in listitem.title:
                preferred_date_obj = get_preferred_datetime(listitem.content)
            if "Deployment Scope" in listitem.title and listitem.content is not None:
                deploy_scope = listitem.content.strip()
            if "Schedule to delete after" in listitem.title and listitem.content is not None:
                if "Preserve previous schedule" in listitem.content:
                    export_to_env({"delete_schedule": "PreservePreviousSchedule"})
                else:
                    delete_schedule_date_obj = get_preferred_datetime(listitem.content)

    if not preferred_date_obj:
        raise ValueError("Preferred Date and Time format is not correct.")

    now = get_now()
    delta = timedelta(hours=1)
    if preferred_date_obj < (now-delta):
        raise ValueError("Preferred Date and Time is in past")
    if (preferred_date_obj-delta) > now:
        raise ValueError("Preferred Date and Time is in future")

    if request_form_issue_details["milestone"]["state"] == "open":
        milestone_due_date_obj = parse_milestone_dueon(request_form_issue_details["milestone"]["due_on"])
        if not milestone_due_date_obj:
            raise ValueError("cannot convert milestone due date")
        if preferred_date_obj > milestone_due_date_obj:
            raise ValueError("Preferred Date and Time is after milestone due date")

    if deploy_scope not in ["API only", "UI and API"]:
        raise ValueError("Deployment Sope is not in correct format")

    if "UI" not in deploy_scope and request_type == RequestType.Deprovision:
        raise ValueError("for deprovisioning, scope must have both UI and API.")

    if delete_schedule_date_obj is not None:
        time_diff = abs(delete_schedule_date_obj-preferred_date_obj)
        if time_diff < timedelta(minutes=15):
            raise ValueError(f"Invalid schedule deletion request. The difference [{convert_to_human_readable(time_diff)}] is less than 15 minutes")
        if time_diff > timedelta(days=30):
            raise ValueError(f"Invalid schedule deletion request. The difference [{convert_to_human_readable(time_diff)}] is greater than 1 month")
        formatted_datetime = preferred_date_obj.strftime("%Y-%m-%d %H:%M:%S %Z")
        export_to_env({"delete_schedule": formatted_datetime})

    return deploy_scope


def validate_env_details(env_details_contents: List):
    has_testplan_env = False
    mdlist = get_list_items(env_details_contents)
    for listitem in mdlist:
        if isinstance(listitem, MdListItemTodo) and listitem.label is not None:
            if listitem.is_checked and "Test Plan Environment" in listitem.label:
                has_testplan_env = True

    if not has_testplan_env:
        raise ValueError("Environment is incorrect")


def validate_release_details(release_detail_contents: List, request_form_issue_details: Dict) -> Dict[str, Optional[str]]:
    api_version: Optional[str] = None
    ui_version: Optional[str] = None
    rdc_list = get_list_items(release_detail_contents)
    for listitem in rdc_list:
        if isinstance(listitem, MdListItemTitleContent) and listitem.content is not None and listitem.title is not None:
            version_match = re.match(r"\s*(v\d+\.\d+\.\d+).*", listitem.content)
            if version_match:
                if "UI Version" in listitem.title:
                    ui_version = version_match.group(1)
                elif "API Version" in listitem.title:
                    api_version = version_match.group(1)

    if not api_version:
        raise ValueError("API Version is not in correct format")
    if api_version != request_form_issue_details["milestone"]["title"]:
        raise ValueError("API version must match with assigned milestone")

    return {
        "api_version": api_version,
        "ui_version": ui_version
    }


class ValidityHeader(Enum):
    TestplanDetails = "Test Plan"
    ReleaseDetails = "Release Deployment"
    EnvironmentDetails = "Environment Details"
    DeploymentSchedule = "Deployment Schedule"


def validate_request_form(request_form_issue_details: Dict, testplan_type: str, branch_details: Dict, request_type: RequestType):
    request_form_contents = parsed_body(request_form_issue_details["body"])
    if len(request_form_contents) <= 1:
        raise ValueError("Request form didnot follow the template properly")

    has_validity = {}
    has_validity[ValidityHeader.TestplanDetails] = False
    has_validity[ValidityHeader.ReleaseDetails] = False
    has_validity[ValidityHeader.EnvironmentDetails] = False
    has_validity[ValidityHeader.DeploymentSchedule] = False

    deploy_scope = ""
    version_details = {}
    for form_header in request_form_contents:
        if isinstance(form_header, MdHeader):
            if form_header.title is None:
                continue
            if ValidityHeader.ReleaseDetails.value in form_header.title:
                version_details = validate_release_details(
                    form_header.contents, request_form_issue_details)
                has_validity[ValidityHeader.ReleaseDetails] = True
            elif ValidityHeader.EnvironmentDetails.value in form_header.title:
                validate_env_details(form_header.contents)
                has_validity[ValidityHeader.EnvironmentDetails] = True
            elif ValidityHeader.DeploymentSchedule.value in form_header.title:
                deploy_scope = validate_deployment_schedule(form_header.contents,
                                                            request_form_issue_details=request_form_issue_details,
                                                            branch_details=branch_details,
                                                            request_type=request_type)
                has_validity[ValidityHeader.DeploymentSchedule] = True
            elif ValidityHeader.TestplanDetails.value in form_header.title:
                validate_test_plan_issue_link(form_header.contents,
                                              request_form_issue_details=request_form_issue_details,
                                              testplan_type=testplan_type)
                has_validity[ValidityHeader.TestplanDetails] = True

    # verify version details
    if "UI" in deploy_scope and not version_details["ui_version"]:
        raise ValueError("UI version is not provided for ui scope")

    missing_headers = []
    for header_title, is_valid in has_validity.items():
        if not is_valid:
            missing_headers.append(header_title)
    if len(missing_headers) > 0:
        raise ValueError("missing sections: " + ", ".join(missing_headers))


if __name__ == "__main__":
    """
    python -m scripts.request.deploy.testplan --validate --request-form-issue-details ../dist/request_form_issue_details/testplan_deploy.json --request-type provision --branch-details "{\"name\":\"mileston/v0\"}" --testplan-type regression
    python -m scripts.request.deploy.testplan --validate --request-form-issue-details ../dist/request_form_issue_details/testplan_deploy.json --request-type deprovision --branch-details "{\"name\":\"mileston/v0\"}" --testplan-type regression

    python -m scripts.request.deploy.testplan --validate --request-form-issue-details ../dist/request_form_issue_details/testplan_deploy.json --request-type provision --branch-details "{\"name\":\"master\"}" --testplan-type regression
    python -m scripts.request.deploy.testplan --validate --request-form-issue-details ../dist/request_form_issue_details/testplan_deploy.json --request-type provision --branch-details "{\"name\":\"feature\"}" --testplan-type regression
    python -m scripts.request.deploy.testplan --validate --request-form-issue-details ../dist/request_form_issue_details/testplan_deploy.json --request-type provision --branch-details "{\"name\":\"mileston/v0\"}" --testplan-type feature
    """
    parser = ArgumentParser(
        description="validates Deployment Request form for Testplan environment")
    parser.add_argument("--validate", action="store_true",
                        help="[Required] Validation Request")
    parser.add_argument("--request-form-issue-details",
                        help="[Required] Provide request form issue details as json")
    parser.add_argument("--testplan-type",
                        help="[Required] Provide Testplan type from label")
    parser.add_argument("--branch-details",
                        help="[Required] Provide branch details as json")
    parser.add_argument("--request-type", choices=["provision", "deprovision"],
                        help="[Required] Provide Request Type")
    args = parser.parse_args()

    try:
        get_parsed_arg_value(args, key="validate", arg_type_converter=bool)
        request_form_issue_details = get_parsed_arg_value(args, key="request_form_issue_details", arg_type_converter=get_valid_dict)
        testplan_type = get_parsed_arg_value(args, key="testplan_type", arg_type_converter=lambda x: x if isinstance(x, str) else None)
        branch_details = get_parsed_arg_value(args, key="branch_details", arg_type_converter=get_valid_dict)
        request_type = get_parsed_arg_value(args, key="request_type", arg_type_converter=lambda x: get_converted_enum(RequestType, str(x)))

    except Exception as e:
        print("error: ", e)
        parser.print_help()
        exit(1)

    validate_request_form(request_form_issue_details=request_form_issue_details,
                          testplan_type=testplan_type,
                          branch_details=branch_details,
                          request_type=RequestType(request_type))
