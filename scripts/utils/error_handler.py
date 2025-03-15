import re
import botocore


def aws_error_handler(func, expected_error_code: str, not_exists_type: str):
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except botocore.exceptions.ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_message = f"{e}"
            not_exists_match = re.match(
                r".+" + re.escape(not_exists_type) + r".+ does not exist.*", error_message, re.IGNORECASE)
            not_found_match = re.match(
                r".+" + re.escape(not_exists_type) + r".+ was not found.*", error_message, re.IGNORECASE)
            if error_code != expected_error_code:
                raise e
            if not not_exists_match and not not_found_match:
                raise e

    return wrapper


# def cft_error_handler(func):
#     def wrapper(*args, **kwargs):
#         try:
#             return func(*args, **kwargs)
#         except botocore.exceptions.ClientError as e:
#             error_code = e.response["Error"]["Code"]
#             expected_match = re.match(
#                 r".+stack .+ does not exist", f"{e}", re.IGNORECASE)
#             if error_code != "ValidationError" or not expected_match:
#                 raise e

#     return wrapper
