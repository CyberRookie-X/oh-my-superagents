# OMS Onboarding Playbooks

Generated from `catalogs/oms-onboarding-question-graph.json` and `schemas/oms-onboarding-question-graph.schema.json`. Treat the question graph and schema as the authoritative sources.

This digest summarizes question graph version 1 with 4 onboarding prompts.

## Contract
- Source: `schemas/oms-onboarding-question-graph.schema.json`
- Title: OMS Onboarding Question Graph
- Required top-level fields: version, questions
- Top-level properties: version, questions
- Definitions: question, write

## Playbooks

### frontend-visual-verification
- Prompt: Do verify flows need screenshots or visual comparisons?
- Total writes: 1

#### Rule IDs
- none

#### Selector Writes
- none

#### Policy Writes
- none

#### Other Writes
- `policyRules.visual-verification` => `{"id":"visual-verification","selector":{"lifecycleStage":["verify"],"workloadTags":["frontend"]},"policy":{"modelPolicy":{"requiredCapabilities":["vision-input"]}}}`

### subagent-packet-first
- Prompt: Should subagents default to packet-first execution?
- Total writes: 1

#### Rule IDs
- none

#### Selector Writes
- none

#### Policy Writes
- none

#### Other Writes
- `policyRules.packet-first` => `{"id":"packet-first","selector":{"lifecycleStage":["execute_task"]},"policy":{"toolPolicy":{"allowedSkillTags":["packet-first"]}}}`

### review-vs-build-workload
- Prompt: Is the workload more review-heavy or build-heavy?
- Total writes: 1

#### Rule IDs
- none

#### Selector Writes
- none

#### Policy Writes
- none

#### Other Writes
- `policyRules.review-heavy` => `{"id":"review-heavy","selector":{"lifecycleStage":["review"]},"policy":{"modelPolicy":{"preferredProfiles":["vision-review"]}}}`

### browser-external-tools
- Prompt: Will the workflow rely on browser automation tools?
- Total writes: 1

#### Rule IDs
- none

#### Selector Writes
- none

#### Policy Writes
- none

#### Other Writes
- `policyRules.browser-tools` => `{"id":"browser-tools","selector":{"workloadTags":["browser"]},"policy":{"modelPolicy":{"requiredCapabilities":["browser"]}}}`
