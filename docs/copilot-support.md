# Copilot CLI 宿主深度支持文档

## 概述

`oh-my-superagents` 提供对 GitHub Copilot CLI 的完整支持，通过 Agent + Plugin + Hooks 方案实现深度集成。本文档详细说明如何配置和使用 Copilot CLI 宿主支持。

## 支持特性

### 1. Agent 系统

Copilot CLI 支持以下内置 Agent，对应 OMS 的各个阶段：

| Agent 名称 | 对应阶段 | 用途 |
|-----------|---------|------|
| `oms-brainstorm` | brainstorming | 头脑风暴阶段 |
| `oms-plan` | writing-plans | 编写计划阶段 |
| `oms-execute` | subagent-driven-development | 子代理驱动开发阶段 |
| `oms-review` | requesting-code-review | 请求代码审查阶段 |
| `oms-verify` | verification-before-completion | 完成前验证阶段 |
| `oms-visual` | frontend-design | 前端设计阶段 |
| `oms-web-test` | webapp-testing | Web 应用测试阶段 |

### 2. Plugin 系统

Copilot Plugin 提供以下功能：

- **插件名称**: `oh-my-superagents`
- **版本**: `1.0.0`
- **许可证**: `MIT`
- **代理目录**: `agents/`
- **技能目录**: `skills/`
- **命令目录**: `commands/`
- **钩子文件**: `hooks.json`

### 3. Hooks 系统

Copilot Hooks 提供会话启动时的自动诊断功能：

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "bash": "oh-my-superagents status --host=copilot",
        "timeoutSec": 10
      }
    ]
  }
}
```

## 架构设计

### 1. Agent 文件渲染

每个 Agent 文件包含以下部分：

- **OMS 标记**: 标识文件由 `oh-my-superagents` 生成
- **路由元数据**: 包含 canonical route、source、model 等信息
- **目的说明**: 描述 Agent 的用途
- **使用说明**: 指导如何使用该 Agent

### 2. Skill 文件渲染

每个 Skill 文件包含以下部分：

- **OMS 标记**: 标识文件由 `oh-my-superagents` 生成
- **路由元数据**: 包含 canonical route、source、profile 等信息
- **目的说明**: 描述 Skill 的用途
- **使用说明**: 指导如何使用该 Skill

### 3. 能力策略

Copilot 投影受能力策略控制，确保只有支持的工作流源和路由才能被投影到 Copilot。

## 配置示例

### 1. 基本配置

在 `oh-my-superagents.config.jsonc` 中配置 Copilot 支持：

```jsonc
{
  "profiles": {
    "default": {
      "model": "gpt-4"
    }
  },
  "routes": {
    "phase.brainstorm": "default",
    "phase.plan": "default",
    "phase.execute": "default",
    "phase.review": "default",
    "phase.verify": "default",
    "phase.visual": "default",
    "phase.web-test": "default"
  },
  "defaultRoute": "default",
  "workflow": {
    "kind": "superpowers",
    "superpowers": {
      "phases": {
        "brainstorming": { "model": "gpt-4" },
        "writing-plans": { "model": "gpt-4" },
        "subagent-driven-development": { "model": "gpt-4" },
        "requesting-code-review": { "model": "gpt-4" },
        "verification-before-completion": { "model": "gpt-4" },
        "frontend-design": { "model": "gpt-4" },
        "webapp-testing": { "model": "gpt-4" }
      }
    }
  }
}
```

### 2. 生成 Copilot 工件

使用以下命令生成 Copilot 工件：

```bash
oh-my-superagents bootstrap --host=copilot
```

这将生成以下文件：

- `.github/copilot/agents/oms-*.md`
- `.github/copilot/skills/oms-*/SKILL.md`
- `.github/copilot/plugin.json`
- `.github/copilot/hooks.json`

## 使用流程

### 1. 初始化 Copilot 支持

```bash
# 生成 Copilot 工件
oh-my-superagents bootstrap --host=copilot

# 检查状态
oh-my-superagents status --host=copilot
```

### 2. 使用 Agent 进行工作流

1. **头脑风暴阶段**: 使用 `oms-brainstorm` Agent
2. **编写计划阶段**: 使用 `oms-plan` Agent
3. **开发阶段**: 使用 `oms-execute` Agent
4. **审查阶段**: 使用 `oms-review` Agent
5. **验证阶段**: 使用 `oms-verify` Agent

### 3. 配置路由

根据项目需求配置路由映射：

```jsonc
{
  "routes": {
    "phase.brainstorm": "gpt-4",
    "phase.plan": "gpt-4",
    "phase.execute": "gpt-4"
  }
}
```

## 技术实现

### 1. Agent 渲染函数

```typescript
export function renderCopilotAgentFile(input: RenderCopilotAgentFileInput): string
```

渲染 Copilot Agent 文件，包含 OMS 标记、路由元数据、目的说明和使用说明。

### 2. Skill 渲染函数

```typescript
export function renderCopilotSkillFile(input: RenderCopilotSkillFileInput): string
```

渲染 Copilot Skill 文件，包含 OMS 标记、路由元数据、目的说明和使用说明。

### 3. Plugin 清单渲染

```typescript
export function renderCopilotPluginManifest(): string
```

渲染 Copilot Plugin 清单，定义插件名称、版本、目录结构等。

### 4. Hooks 配置渲染

```typescript
export function renderCopilotHooksConfig(): string
```

渲染 Copilot Hooks 配置，定义会话启动时的自动诊断命令。

### 5. 工件构建函数

```typescript
export function buildCopilotArtifacts(config: RouterConfig): CopilotArtifacts
```

根据路由配置构建所有 Copilot 工件，包括 Agent、Skill、Plugin 和 Hooks。

## 能力策略

Copilot 投影受以下能力策略控制：

1. **源路由支持**: 检查源路由是否支持 Copilot 投影
2. **主机源投影**: 检查主机源投影是否支持
3. **控制平面命令**: 检查控制平面命令是否支持

如果任何策略不满足，将抛出错误并阻止投影。

## 最佳实践

### 1. 配置管理

- 使用分层配置（全局 + 项目级）
- 定期运行 `oh-my-superagents status` 检查配置状态
- 使用 `oh-my-superagents doctor` 诊断配置问题

### 2. 工作流使用

- 按阶段顺序使用对应的 Agent
- 在每个阶段完成后进行验证
- 使用 `oh-my-superagents explain` 查看路由解释

### 3. 故障排除

- 检查 `.github/copilot/` 目录是否正确生成
- 验证 Copilot CLI 是否正确安装和配置
- 查看 `oh-my-superagents status --host=copilot` 输出

## 限制和注意事项

1. **直接模式限制**: Copilot 直接模式投影尚未实现
2. **工作流源限制**: 只支持 `superpowers` 和 `gstack` 工作流源
3. **主机限制**: Copilot CLI 需要正确安装和配置

## 总结

`oh-my-superagents` 通过 Agent + Plugin + Hooks 方案为 Copilot CLI 提供完整的宿主深度支持。这种集成允许开发者在 Copilot CLI 环境中使用 OMS 的强大工作流功能，同时保持主机原生的用户体验。
