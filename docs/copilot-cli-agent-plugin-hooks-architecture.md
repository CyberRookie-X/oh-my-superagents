# Copilot CLI 宿主深度支持架构文档

## 概述

本文档详细说明如何使用 **Agent + Plugin + Hooks** 方案实现对 Copilot CLI（GitHub Copilot CLI/Codex）的完整宿主深度支持。

该方案的核心思想是将 OMS（oh-my-superagents）的控制平面能力深入集成到宿主环境中，通过生成宿主原生的 Agent 工件、插件系统和运行时 Hooks 实现无缝的用户体验。

## 架构组件

### 1. Agent（智能体）

Agent 是宿主原生的任务执行单元。OMS 为每个支持的宿主生成专用的 Agent 工件。

#### OpenCode Agent

**生成路径**: `.opencode/agents/*.md`

**支持的 Agent**:

| Agent 名称 | 用途 | 默认路由 |
|-----------|------|---------|
| `spr-brainstorm` | 头脑风暴阶段 | `phase.brainstorm` |
| `spr-plan` | 计划制定阶段 | `phase.plan` |
| `spr-execute` | 执行阶段 | `phase.execute` |
| `spr-review` | 审查阶段 | `phase.review` |
| `spr-verify` | 验证阶段 | `phase.verify` |
| `spr-visual` | 可视化阶段 | `phase.visual` |
| `spr-web-test` | Web 测试阶段 | `phase.web-test` |

**Agent 元数据文件**: `.opencode/oh-my-superagents/runtime-agent-metadata.json`

该文件在 `sync` 时生成，包含每个 Agent 的配置元数据：

```json
{
  "agents": {
    "spr-build": {
      "profile": "backend-build",
      "codexFast": true
    }
  }
}
```

#### Codex Agent

**生成路径**: `.codex/agents/*.toml`

Codex 使用 TOML 格式定义 Agent，支持 `superpowers` 工作流和 direct mode 两种模式。

**TOML Schema 关键字段**:

```toml
name = "oms-plan"
description = "Plan phase with superpowers"
model = "gpt-5.4"
model_reasoning_effort = "high"  # deep effort
service_tier = "fast"            # codexFast enabled
```

#### Direct Mode Agent

对于 direct mode，OMS 生成不同的 Agent 命名约定：

| 宿主 | Agent 命名 | 示例 |
|------|-----------|------|
| OpenCode | `rt-<intent>` | `rt-plan`, `rt-build` |
| Codex | `rt-<intent>.toml` | `rt-plan.toml` |
| Qwen | `rt-<intent>` | `rt-plan`, `rt-build` |

### 2. Plugin（插件）

OMS 为每个宿主提供专门的插件系统。

#### OpenCode 插件

**入口**: `src/plugin.ts` → `OhMySuperpowersPlugin`

**导出**: 默认导出作为 OpenCode 插件使用

**功能**:

1. **配置加载与验证**: 在启动时加载 `oh-my-superagents.config.jsonc`
2. **兼容性诊断**: 检测上游 superpowers 版本兼容性
3. **运行时 Hook**: 提供 `chat.params` 钩子修改 LLM 请求参数

**插件 Hooks 表面**:

```typescript
interface OhMySuperpowersHooks {
  "chat.params": (
    input: ChatParamsInput,
    output: ChatParamsOutput
  ) => Promise<void>
}
```

#### Codex 插件包

**生成路径**: `plugins/oh-my-superagents-codex/`

**结构**:

```
plugins/oh-my-superagents-codex/
├── .codex-plugin/
│   └── plugin.json          # 插件清单
└── skills/
    ├── oms-status/          # 状态查看技能
    │   └── SKILL.md
    ├── oms-sync/            # 同步技能
    │   └── SKILL.md
    ├── oms-doctor/          # 诊断技能
    │   └── SKILL.md
    └── oms-no-superpowers/  # 临时禁用技能
        └── SKILL.md
```

**Bootstrap 流程**:

```bash
oh-my-superagents bootstrap --host codex
```

1. 创建 starter `oh-my-superagents.config.jsonc`（如不存在）
2. 生成 `.agents/plugins/marketplace.json` 本地市场入口
3. 生成插件包 `plugins/oh-my-superagents-codex/`
4. 生成 `.codex/agents/*.toml` Agent 文件
5. 生成控制平面技能 `plugins/oh-my-superagents-codex/skills/*/SKILL.md`

### 3. Hooks（钩子系统）

Hooks 是在运行时拦截和修改宿主行为的机制。

#### chat.params Hook

**宿主**: OpenCode

**触发时机**: 每次 LLM 聊天请求参数构建时

**用途**: 根据当前 Agent 的 `codexFast` 配置修改请求的服务层级

**实现位置**: `src/plugin.ts`

**工作流程**:

```
1. 用户激活一个 Agent（如 spr-build）
2. OpenCode 调用 chat.params hook
3. OMS 插件读取 runtime-agent-metadata.json
4. 查询当前 Agent 的 codexFast 配置
5. 如果 codexFast: true，设置 output.options.serviceTier = "fast"
6. 请求以 fast 模式发送到 LLM
```

**代码示例**:

```typescript
return {
  "chat.params": async (input, output) => {
    const metadata = await readRuntimeAgentMetadata(rootDirectory)

    if (metadata?.agents[input.agent]?.codexFast) {
      output.options.serviceTier = "fast"
    }
  },
}
```

#### Hook 与配置文件的关系

```
┌─────────────────────────────────────────────────────┐
│           oh-my-superagents.config.jsonc            │
│  {                                                  │
│    "presets": {                                     │
│      "default": {                                   │
│        "profiles": {                                │
│          "build": {                                 │
│            "model": "gpt-5.4",                      │
│            "effort": "deep",                        │
│            "codexFast": true  ←──┐                 │
│          }                  │    │                │
│        }                      │    │               │
│      }                          │    │              │
│  }                              │    │              │
└──────────────────────────────────│────│──────────────┘
                                   │    │
                    ┌─────────────▼────▼─────────────┐
                    │   sync --host opencode         │
                    │   生成 runtime-agent-metadata   │
                    └─────────────┬──────────────────┘
                                  │
                    ┌─────────────▼──────────────────┐
                    │  .opencode/oh-my-superagents/  │
                    │  runtime-agent-metadata.json    │
                    └─────────────┬──────────────────┘
                                  │
                    ┌─────────────▼──────────────────┐
                    │    chat.params Hook             │
                    │    读取 metadata                │
                    │    设置 serviceTier             │
                    └─────────────────────────────────┘
```

### 4. 临时禁用助手

临时禁用助手允许用户在当前会话中暂时关闭 OMS，不影响持久化配置。

#### OpenCode 命令

**文件**: `.opencode/commands/oms-no-superpowers.md`

**内容**:

```markdown
---
description: Temporarily disable superpowers for this conversation.
---
告诉助手：
- 不要在此对话中使用 superpowers
- 不要主动加载 superpowers skills、workflows 或 phase agents
- 只有在我明确要求时才使用 superpowers

Extra instruction: $ARGUMENTS
```

#### Codex 技能

**文件**: `plugins/oh-my-superagents-codex/skills/oms-no-superpowers/SKILL.md`

**使用方式**:

```
/oms-no-superpowers
/oms-no-superpowers 请用原生方式回答，不用任何 superpowers
```

## 完整的 Copilot CLI 集成流程

### 首次设置（Codex）

```bash
# 1. 安装 oh-my-superagents
npm install -g oh-my-superagents

# 2. Bootstrap Codex 支持
oh-my-superagents bootstrap --host codex

# 3. 重启 Codex

# 4. 在 Codex 中安装本地插件
# 打开插件目录，安装 oh-my-superagents-codex

# 5. 验证安装
oh-my-superagents doctor --host codex
```

### 日常使用

```bash
# 同步配置和工件
oh-my-superagents sync --host codex

# 切换预设
oh-my-superagents use review --host codex

# 查看状态
oh-my-superagents status --host codex

# 诊断问题
oh-my-superagents doctor --host codex
```

### 运行时行为

```
用户: /oms-plan
       ↓
Codex 加载 oms-plan agent
       ↓
Agent 引用 spr-plan phase
       ↓
OMS router 解析到 profile: "build" (codexFast: true)
       ↓
Codex 发送请求时设置 service_tier = "fast"
       ↓
GPT-5.4 以 fast 模式处理请求
```

## 支持矩阵

| 功能 | OpenCode | Codex | 说明 |
|------|:--------:|:-----:|------|
| Agent 生成 | ✓ | ✓ | 支持 superpowers 和 direct mode |
| Plugin 系统 | ✓ | ✓ | 启动诊断和运行时钩子 |
| chat.params Hook | ✓ | - | 运行时参数修改 |
| 临时禁用助手 | ✓ | ✓ | 会话级禁用 |
| codexFast | ✓ | ✓ | 服务层级优化 |
| Bootstrap | - | ✓ | 一键初始化 |

## 扩展机制

### 添加新的宿主

1. 在 `src/` 创建新的适配文件（如 `src/newhost.ts`）
2. 实现 `buildArtifacts()` 工厂函数
3. 在 `src/cli.ts` 添加宿主处理逻辑
4. 在 `src/capabilities.ts` 注册宿主能力
5. 更新文档和测试

### 添加新的 Hook

1. 在插件接口中声明新的 Hook 类型
2. 在 `src/plugin.ts` 实现 Hook 逻辑
3. 添加对应的测试用例
4. 更新运行时元数据架构

## 故障排查

### Codex 插件未显示

1. 检查 `.agents/plugins/marketplace.json` 是否存在
2. 验证 `plugins/oh-my-superagents-codex/.codex-plugin/plugin.json` 格式
3. 重启 Codex

### codexFast 不生效

1. 确认 `runtime-agent-metadata.json` 存在且包含正确的 `codexFast` 设置
2. 检查 profile 配置中 `codexFast: true` 已设置
3. 运行 `oh-my-superagents doctor --host opencode` 查看诊断信息

### 临时禁用无效

1. 确认命令/技能文件存在
2. 检查文件内容包含正确的禁用指令
3. 尝试删除并重新 sync