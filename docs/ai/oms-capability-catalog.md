# OMS Capability Catalog

Generated from `catalogs/oms-capabilities.json` and `schemas/oms-capability-catalog.schema.json`. Treat the catalog and schema as the authoritative sources.

This digest summarizes 5 model entries and 3 tool entries.

## Contract
- Source: `schemas/oms-capability-catalog.schema.json`
- Title: OMS Capability Catalog
- Required top-level fields: none
- Top-level properties: models, tools
- Definitions: model, tool

## Models

### backend-text
- Tags: backend, reasoning-heavy
- Supports: text, code

### fast-iteration
- Tags: frontend, backend, fast
- Supports: text, code

### multimodal-analysis
- Tags: analysis, data
- Supports: text, vision-input, code

### planning-heavy
- Tags: planning, architecture
- Supports: text, code

### vision-review
- Tags: frontend, review
- Supports: text, vision-input

## Tools

### filesystem
- Kind: provider
- Tags: io, project-context

### git-worktree
- Kind: skill
- Tags: version-control, isolation

### playwright
- Kind: mcp
- Tags: browser, visual, testing
