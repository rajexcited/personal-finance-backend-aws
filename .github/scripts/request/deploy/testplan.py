from argparse import ArgumentParser
from enum import Enum
import re
from typing import Dict, List
from datetime import timedelta
from ...md_parser import parsed_body, get_list_items
from ...md_parser.models import MdHeader, MdListItemTitleContent
from ...utils import export_to_env, get_valid_dict, get_preferred_datetime, get_now, parse_milestone_dueon


class RequestType(Enum):
    Provision = "provision"
    Deprovision = "deprovision"


def validate_test_plan_issue_link(testplan_section_list: List, request_form_issue_details: dict, testplan_type: str):
    if testplan_type.lower() not in request_form_issue_details["title"].lower():
        raise ValueError("Test Plan type is not included in request form title")

    section_list = get_list_items(testplan_section_list)
    for listitem in section_list:
        if isinstance(listitem, MdListItemTitleContent):
            if testplan_type.lower() in listitem.title.lower() and "Test Plan" in listitem.title.lower():
                linkMatch = re.match(r".+https.+/issues/(\d+).*", listitem.content)
                if not linkMatch:
                    raise ValueError("Test Plan issue link is not in correct format")


def validate_deployment_schedule(deployment_schedule_list: List, request_form_issue_details: dict, branch_details: dict, request_type: RequestType):
    if request_type == RequestType.Provision:
        if branch_details["name"] == "master" and request_form_issue_details["milestone"]["state"] == "open":
            raise ValueError(
                "Deployment on the master branch is prohibited while the milestone is open.")
        if branch_details["name"].startswith("milestone") and request_form_issue_details["milestone"]["state"] == "closed":
            raise ValueError(
                "Deployment on the milestone branch is prohibited while the milestone is closed.")

    preferred_date_obj = None
    deploy_scope = None
    mdlist = get_list_items(deployment_schedule_list)
    for listitem in mdlist:
        if isinstance(listitem.parsed_content, MdListItemTitleContent):
            if "Preferred Date and Time" in listitem.parsed_content.title:
                preferred_date_obj = get_preferred_datetime(listitem.parsed_content.content)
            if "Deployment Scope" in listitem.parsed_content.title:
                deploy_scope = listitem.parsed_content.content

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

    return deploy_scope


def validate_env_details(env_details_contents: List):
    has_testplan_env = False
    mdlist = get_list_items(env_details_contents)
    for listitem in mdlist:
        if isinstance(listitem.parsed_content, MdListItemTitleContent):
            if "Environment Name" in listitem.parsed_content.title and "Test Plan Environment" in listitem.parsed_content.content:
                has_testplan_env = True

    if not has_testplan_env:
        raise ValueError("Environment details is incorrect")


def validate_release_details(release_detail_contents: List, request_form_issue_details: Dict) -> Dict[str, str]:
    api_version = None
    ui_version = None
    rdc_list = get_list_items(release_detail_contents)
    for listitem in rdc_list:
        if isinstance(listitem.parsed_content, MdListItemTitleContent):
            version_match = re.match(r"\s*(v\d+\.\d+\.\d+).*", listitem.parsed_content.content)
            if version_match:
                if "UI Version" in listitem.parsed_content.title:
                    ui_version = version_match.group(1)
                elif "API Version" in listitem.parsed_content.title:
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
    ReleaseDetails = "Release Details"
    EnvironmentDetails = "Environment Details"
    DeploymentSchedule = "Deployment Schedule"


def validate_request_form(request_form_issue_details: dict, testplan_type: str, branch_details: dict, request_type: RequestType):
    request_form_contents = parsed_body(request_form_issue_details["body"])
    if len(request_form_contents) <= 1:
        raise ValueError("Request form didnot follow the template properly")

    has_validity = {}
    has_validity[ValidityHeader.TestplanDetails] = False
    has_validity[ValidityHeader.ReleaseDetails] = False
    has_validity[ValidityHeader.EnvironmentDetails] = False
    has_validity[ValidityHeader.DeploymentSchedule] = False

    for form_header in request_form_contents:
        if isinstance(form_header, MdHeader):
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
                                                            request_type=req_typ)
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
        if not getattr(args, "validate"):
            raise ValueError("validate arg is not provided")

        request_form_issue_details = get_valid_dict(
            getattr(args, "request_form_issue_details"))
        if not request_form_issue_details:
            raise ValueError("request form issue details are not provided")

        testplan_type = None
        if hasattr(args, "testplan_type"):
            testplan_type = getattr(args, "testplan_type")
        if not testplan_type:
            raise ValueError("testplan type is not provided")

        branch_details = get_valid_dict(getattr(args, "branch_details"))
        if not branch_details or len(branch_details) == 0:
            raise ValueError("branch details are not provided")

        req_typ = None
        if hasattr(args, "request_type"):
            req_typ = getattr(args, "request_type")
            req_typ = RequestType(req_typ)
        if not req_typ:
            raise ValueError("request type is not provided")

    except Exception as e:
        print("error: ", e)
        parser.print_help()
        exit(1)

    validate_request_form(request_form_issue_details,
                          testplan_type=testplan_type,
                          branch_details=branch_details,
                          request_type=req_typ)
