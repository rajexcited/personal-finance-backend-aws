---
name: Request - Deploy or Rollback Production Environment
about: Submit a request for release deployment or rollback to a previous version in the production environment.
title: "[Request] [Rollback] Provision Production Environment"
labels: [deployment, "env: production", rollback]
---

# Production Environment Deployment Form

This form standardizes deployment requests for production environment, ensuring clarity and completeness.

### Deployment Type:

_(Select one option by marking an "X" in the corresponding checkbox.)_

- [ ] **Release**
- [ ] **Rollback**

### Release Deployment / Rollback Details:

_(Provide details for the release or rollback)_

- **Version to Deploy (Release/Rollback):** v0.2.0 <!-- Specify the version for release or rollback deployment. -->
- **Existing Deployed Version:** v0.1.0 <!-- Indicate the current production version. -->

#### Release Notes

_(Provide priority changes or specify "Not Applicable" for rollbacks)_

https://github.com/rajexcited/personal-finance-backend-aws/releases/tag/v0.2.0 <!--  tag version  -->

- Not Applicable for rollbacks

### Reason for Deployment / Rollback:

_(Briefly explan purpose, e.g., feature updates, bug fixes, performance improvements.)_

- **Trigger Conditions (for Rollback):** _(Specify conditions initiating rollback, e.g., critical failures detected.)_
<!--  Remove this trigger conditions item if rollback is selected  -->

#### Risk Assessment

- **Risk Level:** Low / Medium / High
- **Justification for Risk level:** _(Provide reasoning for the chosen risk level.)_
  _(Include why risk level is chosen for release notes, not the notes itself)_

### Environment Details:

- **Environment Name:** Production Environment

### Deployment Schedule:

_(Use the format mm-dd-yyyy HH:MM:SS in 24-hour CST time.)_

- **Preferred Date and Time:** 03-15-2025 13:40:35

### Pre Deployment Validations:

_(Checks off tasks to verify readiness for deployment.)_

- [ ] Milestone Pull Requests validated
- [ ] Regression test plan executed (provide link to test plan)
- [ ] All related issues are resolved

### Post Deployment Tasks:

#### Smoke Test Verification:

_(Provide verification tasks to be performed after release deployment / rollback)_

- [ ] list of deployed Api gateway resources and methods are in proper status
- [ ] Successful login on Desktop Chrome browser v134.x
- [ ] Successful login on Android(15) Chrome browser v135.x

#### Health Check Verification:

_(List manual or automated verification tasks for system health.)_

- [ ] Deployment downtime is under one hour
- [ ] Rest login api is accessible
- [ ] not getting any 5xx errors for rest api

### Additional Notes or Special Instructions:

_(Include any additional notes, considerations, or requirements, e.g. major upgrade, ensure backups are created)_

> [!IMPORTANT]  
> If a release deployment fails and a rollback is required, submit a rollback request form as a sub-issue of this request.

> [!TIP]  
> Update the sub-issue with post-deployment verification results. If failure occurs, include detailed explanations.
