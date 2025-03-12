import boto3
from mypy_boto3_iam import IAMClient


iam: IAMClient = boto3.client('iam')
