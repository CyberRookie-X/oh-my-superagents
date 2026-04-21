# Copilot CLI 宿主深度支持设计文档

## 概述

为 `oh-my-superagents` 新增 GitHub Copilot CLI 宿主适配器，通过 Agent + Plugin + Hooks 方案实现完整的 Copilot CLI 深度支持。使 Copilot CLI 能够通过 OMS 控制面加载和执行 superpowers 工作流。

## 背景

Copilot CLI 的插件系统支持四种扩展机制：
1. **Custom Agents** — `.agent.md` 文件，定义专门的 AI 助手
2. **Skills** — `SKILL.md` 文件，定义可调用的能力
3. **Hooks** — `hooks.json`，在会话生命周期中注入自定义行为
4. **MCP Servers** — `.mcp.json`，外部工具集成

## 架构设计

### 整体方案

```
oh-my-superagents CLI
  │
  ├─ copilot.ts (新适配器)
  │   ├─ 生成 Copilot CLI 插件结构
  │   │   ├─ plugin.json (插件清单)
  │   │   ├─ agents/*.agent.md (代理文件)
  │   │   ├─ skills/*/SKILL.md (技能文件)
  │   │   └─ hooks.json (生命周期钩子)
  │   └─ 集成到现有 CLI 命令 (status/use/disable/sync/doctor)
  │
  ├─ 更新 capabilities.ts (注册 copilot 宿主)
  ├─ 更新 materialize.ts (新增清理规则)
  ├─ 更新 cli.ts (新增 copilot 宿主分发)
  └─ 更新 config.ts (新增 copilot 配置项)
```

### 插件输出结构

```
.copilot/plugins/oh-my-superagents-copilot/
├── plugin.json              # 插件清单
├── agents/                  # OMS 代理文件
│   ├── oms-brainstorm.agent.md
│   ├── oms-plan.agent.md
│   ├── oms-execute.agent.md
│   ├── oms-review.agent.md
│   ├── oms-verify.agent.md
│   ├── oms-visual.agent.md
│   └── oms-web-test.agent.md
├── skills/                  # OMS 技能文件
│   ├── oms-status/SKILL.md
│   ├── oms-use/SKILL.md
│   ├── oms-disable/SKILL.md
│   ├── oms-sync/SKILL.md
│   └── oms-doctor/SKILL.md
└── hooks.json              # 会话生命周期钩子
```

### 代理文件格式

```markdown
---
name: oms-brainstorm
description: Brainstorming phase agent for oh-my-superagents
tools: ["bash", "edit", "read", "glob", "grep"]
---

# generated-by: oh-my-superagents; do-not-edit: true
<!-- oms-route: stage=1; host=copilot; source=superpowers; route=phase.brainstorm; projection=agent; rendered-name=oms-brainstorm -->

You are the oms-brainstorm phase agent for oh-my-superagents.
Use the workflow entry `superpowers/brainstorming` for `phase.brainstorm` whenever it is relevant.
If that superpowers entry is unavailable, say that the required workflow source is not installed for Copilot CLI and stop.
Stay focused on the current phase.
```

### Hooks 设计

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "command": "oh-my-superagents doctor --host copilot --quiet",
        "cwd": ".",
        "env": {}
      }
    ],
    "preToolUse": [
      {
        "type": "command",
        "command": "oh-my-superagents status --host copilot --quiet",
        "cwd": "."
      }
    ]
  }
}
```

## 实现要点

### 1. 新增 `src/copilot.ts`

仿照 `src/codex.ts` 和 `src/claude.ts` 的适配器模式：
- 定义 `PHASE_TO_COPILOT_AGENT` 映射
- 实现 `buildCopilotArtifacts()` 生成插件结构
- 实现 `renderCopilotAgentFile()` 渲染 `.agent.md` 文件
- 实现 `renderCopilotPluginJson()` 渲染 `plugin.json`
- 实现 `renderCopilotHooksJson()` 渲染 `hooks.json`
- 实现 `explainCopilotPhase()` 用于 `explain` 命令

### 2. 更新 `src/capabilities.ts`

- 扩展 `CapabilityHost` 类型，新增 `"copilot"`
- 更新 `getHostProjectionDecision()` 支持 copilot
- 更新 `getControlPlaneCommandDecision()` 支持 copilot

### 3. 更新 `src/config.ts`

- 无需新增配置项（复用现有 RouterConfig 结构）

### 4. 更新 `src/cli.ts`

- 在 host 参数中新增 `"copilot"` 选项
- 新增 copilot 制品的 sync 逻辑
- 新增 copilot 的 doctor 逻辑
- 新增 copilot 的 explain 逻辑

### 5. 更新 `src/materialize.ts`

- 新增 copilot 清理规则（基于 ownerPrefix `oms-`）
- 新增 copilot 制品目录 `.copilot/plugins/oh-my-superagents-copilot/`

### 6. 更新 `src/index.ts`

- 导出新模块的公共 API

## 测试计划

仿照现有测试模式，新增以下测试文件：
- `test/copilot.test.ts` — 适配器核心功能测试
- `test/copilot-artifacts.test.ts` — 制品生成测试
- 更新 `test/capabilities.test.ts` — 新增 copilot 能力测试
- 更新 `test/cli.test.ts` — 新增 copilot CLI 命令测试
- 更新 `test/materialize.test.ts` — 新增 copilot 清理规则测试

## 不实现的功能

- Copilot CLI 的 Direct 模式（初版仅支持 superpowers 模式）
- MCP Server 集成（留待后续版本）
- 插件市场发布（留待后续版本）
