# Copilot CLI 宿主适配层设计文档

## 1. 概述

为 oh-my-superagents 添加 GitHub Copilot CLI 宿主深度支持，采用 Agent + Plugin + Hooks 方案。

## 2. Copilot CLI 架构分析

### 2.1 自定义指令系统

Copilot CLI 通过以下文件读取指令（按优先级）：

| 位置 | 文件 | 作用域 |
|------|------|--------|
| 全局 | `~/.copilot/copilot-instructions.md` | 所有会话 |
| 仓库级 | `.github/copilot-instructions.md` | 当前仓库 |
| 模块化 | `.github/instructions/**/*.instructions.md` | 匹配的文件 |
| Agent 指令 | `AGENTS.md`（Git 根或 cwd） | 仓库级 |
| 兼容文件 | `Copilot.md`, `GEMINI.md`, `CODEX.md` | 仓库级 |

### 2.2 自定义 Agent 系统

- 文件格式：`.agent.md` 扩展名
- 存放位置：`.github/agents/`（仓库级）或 `~/.copilot/agents/`（全局）
- 文件名即 agent 名称（如 `security-expert.agent.md` → agent `security-expert`）
- 使用方式：`copilot --agent <name> --prompt "..."`

### 2.3 会话状态

- 路径：`~/.copilot/session-state/{session-id}/`
- 包含：events.jsonl、workspace.yaml、plan.md、checkpoints/、files/

## 3. 设计方案

### 3.1 适配层架构（参考 claude.ts 薄适配层模式）

```
src/
├── copilot.ts              # Copilot 适配层（薄，~150行）
└── ...

test/
└── copilot.test.ts        # 对应测试
```

### 3.2 Agent 工件生成

将 OMS 内置阶段映射为 Copilot 自定义 Agent：

| OMS 阶段 | Copilot Agent 文件 | Agent 名称 |
|-----------|-------------------|------------|
| brainstorming | `.github/agents/oms-brainstorm.agent.md` | oms-brainstorm |
| writing-plans | `.github/agents/oms-plan.agent.md` | oms-plan |
| subagent-driven-development | `.github/agents/oms-execute.agent.md` | oms-execute |
| requesting-code-review | `.github/agents/oms-review.agent.md` | oms-review |
| verification-before-completion | `.github/agents/oms-verify.agent.md` | oms-verify |
| frontend-design | `.github/agents/oms-visual.agent.md` | oms-visual |
| webapp-testing | `.github/agents/oms-web-test.agent.md` | oms-web-test |

### 3.3 Agent 文件格式

```markdown
# OMS Agent: oms-brainstorm

<!-- oms-marker stage=1; host=copilot; source=superpowers; route=phase.brainstorming; projection=agent; rendered-name=oms-brainstorm -->

## Description
Routes the `brainstorming` phase through OMS profile `<profileId>`.

## Instructions
Use the superpowers workflow entry `superpowers/brainstorming` for `phase.brainstorming` whenever it is relevant.
If that superpowers entry is unavailable, say that the required workflow source is not installed for Copilot and stop instead of improvising a replacement workflow.
Stay focused on the current phase and do not switch to a different superpowers phase unless the user explicitly asks.

## Route Metadata
- canonical route: `phase.brainstorming`
- source: `superpowers`
- profile: `<profileId>`
- model: `<model>`
```

### 3.4 Plugin 系统

Copilot CLI 当前没有类似 OpenCode 的 Plugin API。采用以下方案：
- 不生成 plugin bundle（Copilot CLI 无此概念）
- 通过 `copilot-instructions.md` 注入 OMS 全局指令
- 全局指令文件：`~/.copilot/copilot-instructions.md`（由 OMS 管理）

### 3.5 Hooks 系统

Copilot CLI 当前没有 hooks 机制。记录此限制，未来 Copilot CLI 支持后扩展。

### 3.6 路由支持

| 工作流源 | 支持状态 | 说明 |
|---------|---------|------|
| superpowers | ✅ 支持 | 生成 `.github/agents/*.agent.md` |
| gstack | ❌ 不支持 | Copilot CLI 无 gstack 集成方式 |
| direct | ❌ 不支持 | 暂不支持 intent 路由 |

### 3.7 能力声明

在 `src/capabilities.ts` 中添加 copilot 宿主能力：

```typescript
copilot: {
  workflow: {
    superpowers: { stage: 1, direct: false, gstack: false },
  },
  features: {
    hooks: false,
    plugin: false,
    laneRouting: false,
    contextProviders: false,
  },
}
```

## 4. 实现任务分解

### Task 1: 能力声明（1个文件）
- 在 `src/capabilities.ts` 中添加 copilot 宿主能力

### Task 2: 适配层实现（1个文件 + 测试）
- 创建 `src/copilot.ts`
- 实现 `PHASE_TO_COPILOT_AGENT` 映射
- 实现 `renderCopilotAgentFile()` 函数
- 实现 `buildCopilotArtifacts()` 函数
- 添加路由元数据标记逻辑

### Task 3: 集成到控制平面（修改 2个文件）
- 在 `src/control-plane.ts` 中添加 copilot 的 materialize 逻辑
- 在 `src/config.ts` 中添加 copilot 的宿主识别

### Task 4: CLI 命令支持（修改 1个文件）
- 在 `src/cli.ts` 中添加 copilot 子命令支持（status/use/disable/sync/doctor/explain）

### Task 5: 测试（1个文件）
- 创建 `test/copilot.test.ts`
- TDD 方式编写测试

### Task 6: 文档更新
- 更新 README.md 和 README.zh-CN.md 添加 Copilot CLI 支持说明

## 5. 设计决策

1. **薄适配层**：参考 claude.ts（138行），copilot.ts 保持薄，仅负责 Agent 工件生成
2. **Agent 文件位置**：使用 `.github/agents/` 而非全局 `~/.copilot/agents/`，便于项目级管理
3. **不实现 Plugin/Hooks**：Copilot CLI 当前无此概念，避免 YAGNI
4. **Stage 1 支持**：superpowers 工作流以 Stage 1（薄适配层）方式支持，与 Claude Code 同级
5. **全局指令**：通过 `copilot-instructions.md` 提供辅助指令，但不作为核心机制

## 6. 兼容性考虑

- Copilot CLI 版本差异：指令文件路径可能因版本变化，需持续跟踪官方文档
- Agent 描述字段：当前设计使用 Description 字段辅助 Copilot 理解 agent 用途
- 会话状态：暂不使用 `~/.copilot/session-state/`，留待未来增强
