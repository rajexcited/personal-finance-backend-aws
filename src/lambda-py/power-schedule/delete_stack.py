import boto3
import time
import os


def wait_for_stack_deletion(cloudformation, stack_name):
    """Polls CloudFormation until the stack is deleted."""
    stack_id = stack_name
    while True:
        try:
            response = cloudformation.describe_stacks(StackName=stack_id)
            stack_status = response['Stacks'][0]['StackStatus']
            print(f"Stack {stack_name} is in status: {stack_status}")

            if stack_status == "DELETE_COMPLETE":
                print(f"Stack {stack_name} has been successfully deleted.")
                return True
            stack_id = response["Stacks"][0]["StackId"]
        except cloudformation.exceptions.ClientError as e:
            if "does not exist" in str(e):
                print(f"Stack {stack_name} no longer exists.")
                return True
            else:
                raise e

        # Wait before checking again
        time.sleep(30)


def lambda_handler(event, context):
    cloudformation = boto3.client('cloudformation')

    stack_name = get_ui_stack_name()
    print(f"Initiating deletion of UI stack: {stack_name}")
    cloudformation.delete_stack(StackName=stack_name)
    # Wait for stack deletion to complete
    wait_for_stack_deletion(cloudformation, stack_name)

    empty_receipt_bucket()
    stack_name = get_infra_stack_name()
    print(f"Initiating deletion of Infra stack: {stack_name}")
    cloudformation.delete_stack(StackName=stack_name)

    return {"status": "Stack deletion started"}


def get_infra_stack_name():
    stack_name = os.getenv("INFRA_STACK")
    if stack_name is None:
        raise ValueError("infra stack is not found")
    return stack_name


def get_ui_stack_name():
    stack_name = os.getenv("UI_STACK")
    if stack_name is None:
        raise ValueError("ui stack is not found")
    return stack_name


def empty_receipt_bucket():
    receipt_bucket_name = os.getenv("RECEIPT_S3_BUCKET_NAME")
    if not receipt_bucket_name:
        return
    s3 = boto3.client("s3")
    s3_objects = s3.list_objects_v2(Bucket=receipt_bucket_name)
    if "Contents" in s3_objects:
        object_keys = [{"Key": obj["Key"]} for obj in s3_objects["Contents"]]
        delete_obj_response = s3.delete_objects(Bucket=receipt_bucket_name, Delete={"Objects": object_keys})
        print(f"Deleted {len(object_keys)} s3 objects from {receipt_bucket_name}")
        print(delete_obj_response)
    else:
        print(f"The bucket {receipt_bucket_name} is already empty")
