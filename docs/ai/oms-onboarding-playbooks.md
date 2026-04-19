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
- Prompt: Do verify flows need screenshots or visual review?
- Total writes: 4

#### Rule IDs
- `policyRules[0].id` => `"verify-vision"`

#### Selector Writes
- `policyRules[0].selector.lifecycleStage` => `["verify"]`
- `policyRules[0].selector.modalityRequirements` => `["vision-input"]`

#### Policy Writes
- `policyRules[0].policy.modelPolicy.requiredCapabilities` => `["vision-input"]`

#### Other Writes
- none

### subagent-packet-first
- Prompt: Should subagents default to packet-first context handoff?
- Total writes: 3

#### Rule IDs
- `policyRules[1].id` => `"subagent-packet-default"`

#### Selector Writes
- `policyRules[1].selector.agentRole` => `["subagent"]`

#### Policy Writes
- `policyRules[1].policy.contextPolicy.packetFirst` => `true`

#### Other Writes
- none

### review-vs-build-workload
- Prompt: Is the workload more review-heavy than build-heavy?
- Total writes: 3

#### Rule IDs
- `policyRules[2].id` => `"review-workload-default"`

#### Selector Writes
- `policyRules[2].selector.workloadTags` => `["review"]`

#### Policy Writes
- `policyRules[2].policy.modelPolicy.preferredProfiles` => `["vision-review"]`

#### Other Writes
- none

### browser-external-tools
- Prompt: Will the workflow rely on browser-oriented external tools?
- Total writes: 3

#### Rule IDs
- `policyRules[3].id` => `"browser-tooling-default"`

#### Selector Writes
- `policyRules[3].selector` => `{}`

#### Policy Writes
- `policyRules[3].policy.toolPolicy.allowedMcpTags` => `["browser","visual"]`

#### Other Writes
- none
