# Copilot CLI (Codex) 深度支持实现计划

## 概览

在现有 Codex 支持基础上实现完整的 Agent + Plugin + Hooks 三层深度支持。

## 任务分解

### Task A: Agent 层增强

**文件**: `src/codex.ts`

1. 添加 lane-scoped agent 生成（参考 `opencode.ts` 中 `buildArtifacts` 的 lane 处理逻辑）
2. 生成 Codex 版本的运行时元数据 `runtime-agent-metadata.json`（路径 `.codex/oh-my-superagents/`）
3. 增强 developer instructions 以包含路由上下文、lane 分割指引
4. 添加 profile 级别的 `codexFast` 元数据到 agent TOML 注释

### Task B: Plugin 层增强

**文件**: `src/codex-bootstrap.ts`

1. 添加 MCP server 注册到 plugin manifest
2. 添加 app 级清单生成（codex-app.json）
3. 增强控制平面技能集，增加 `use`、`disable` 等命令的完整 skill 覆盖
4. 添加 lane 管理辅助技能

### Task C: Hooks 层实现

**新增文件**: `src/codex-hooks.ts`

1. 实现 `chat.params` hook 的 Codex 适配（通过 OpenCode plugin 兼容路径）
2. 实现命令执行 hooks（`command.execute.before`）
3. 实现工具执行 hooks（`tool.execute.before/after`）
4. 实现 provider hooks（参数修改、请求拦截）

**修改文件**: `src/plugin.ts`
- 添加 Codex hooks 注册

### Task D: 物化引擎增强

**文件**: `src/materialize.ts`

1. 添加 Codex 运行时元数据文件的所有权检测
2. 添加 Codex hooks 文件的所有权检测

### Task E: CLI 命令增强

**文件**: `src/cli.ts`

1. `sync --host codex` 命令支持生成运行时元数据
2. `doctor --host codex` 命令支持 hooks 状态检查

### Task F: 测试

1. 为所有新功能添加测试用例
2. 更新现有测试以覆盖增强功能
