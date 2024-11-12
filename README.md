# personal-finance-backend-aws

github workflow experimentations

### experiment 1

investigate how to configure pipeline with job steps and some constraints.

- workflow dependency
- workflow actions
- workflow trigger
- workflow secret and env contexts
- workflow re-use scripts
- caching

**Outcome**: the different jobs in same/other workflow, doesn't share environment exported secrets. but @aws-credential is caching the already active session by id, so acquiring and using session gets faster.

certain workflow trigger has some criteria. such as `workflow_dispatch` is manual trigger, but can be activate the workflow with this trigger only through default branch. most probably cannot risk for branches.

dependency or script reusage is not effective. and caching data is difficult if attempted to use in different workflows or jobs.

### experiment 2

investigate how to assume cdk role through OIDC web identity token. what permissions can I configured to assumed deployment role. are there any restrictions or concerns?

- find and configured all required control access
- document manual steps or policies required to create to branch `aws-manual`

### experiment 3

how to execute manual workflow jobs.

- destroy infra stack
- backup data - if workflow is not an workable or security wise option document it to do manually if required.

### experiment 4

how to find security vulnarability or any other security contraints.if someone forks, can they run workflow or see my secrets ?

### experiment 5
