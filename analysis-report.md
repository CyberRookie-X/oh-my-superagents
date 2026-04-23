# oh-my-superagents 项目架构分析报告

## 1. 项目概述

oh-my-superagents（OMS）是一个为 AI CLI 工具提供路由与控制平面支持的项目，演进为通用路由与 OMS 控制平面产品。当前支持：

- **OpenCode** - 一等公民支持，完整 superpowers 工作流
- **Codex** (OpenAI) - 完整 superpowers 路由 + 实验性 direct mode
- **Qwen Code** (阿里) - Stage 2 superpowers + 实验性 direct mode
- **Claude Code** (Anthropic) - 薄宿主适配层，superpowers slice 支持

## 2. 项目结构

```
oh-my-superagents/
├── src/                          # 源代码（35个TS文件，13,582行）
│   ├── cli.ts                    # CLI 实现（3,084行）
│   ├── control-plane.ts          # OMS 控制平面（1,779行）
│   ├── config.ts                 # 配置管理（1,502行）
│   ├── plugin.ts                 # OpenCode 插件入口（261行）
│   ├── opencode.ts               # OpenCode 适配层（633行）
│   ├── codex.ts                  # Codex 适配层（197行）
│   ├── codex-bootstrap.ts        # Codex 引导层（563行）
│   ├── qwen.ts                   # Qwen 适配层（424行）
│   ├── claude.ts                 # Claude 适配层（138行）
│   ├── router.ts                 # 路由核心（188行）
│   ├── materialize.ts            # 工件协调层（712行）
│   ├── superpowers-compatibility.ts  # 兼容性监控（526行）
│   ├── superpowers-detectors.ts  # 检测器（567行）
│   ├── workflow-*.ts             # 工作流适配层
│   ├── context-*.ts              # 上下文系统（10个模块）
│   └── policy-*.ts               # 策略系统（4个模块）
├── test/                         # 测试（35个测试文件，约964KB）
├── docs/                         # 文档（架构说明 + superpowers specs/plans）
├── schemas/                      # JSON Schema 定义
├── catalogs/                     # 能力目录和入职问卷
└── scripts/                      # 辅助脚本
```

## 3. 五层架构

| 层级 | 文件 | 行数 | 职责 |
|------|------|------|------|
| **1. OMS 控制平面核心** | cli.ts, control-plane.ts, config.ts | 6,365 | 配置加载、preset 选择、命令解析、控制平面行为 |
| **2. 宿主适配层** | opencode.ts, codex.ts, qwen.ts, claude.ts | 1,392 | 渲染宿主原生工件、映射 OMS 阶段到宿主入口 |
| **3. 工作流适配层** | router.ts, workflow-*.ts | ~600 | 工作流源适配、路由规范化 |
| **4. 兼容性监控** | superpowers-compatibility.ts, detectors.ts | 1,093 | 检测上游安装状态、对照兼容矩阵评估 |
| **5. 工件协调层** | materialize.ts | 712 | 安全写入生成工件、识别并清理陈旧工件 |

**核心规则**：共享 OMS 核心比任何单个宿主适配层更厚，宿主适配层保持可替换。

## 4. 关键子系统

### 4.1 Agent 系统
各宿主通过生成对应格式的 Agent 工件实现阶段映射：
- OpenCode: `.opencode/agents/*.md`
- Codex: `.codex/agents/*.toml`
- Qwen: `.qwen/agents/*.md`
- Claude: `.claude/skills/*/SKILL.md`

### 4.2 Plugin 系统
- OpenCode: 实现 `@opencode-ai/plugin` 接口（`src/plugin.ts`）
- Codex: 生成 plugin bundle + marketplace entry（`src/codex-bootstrap.ts`）

### 4.3 Hooks 系统
- OpenCode `chat.params` hook: 为特定 agent 注入 `serviceTier: "fast"`

### 4.4 路由与工作流
- Canonical Route 模型：`phase.*`（superpowers）、`intent.*`（direct）
- 三种工作流源：superpowers、gstack、direct
- Lane 路由：按需技术栈组织的路由包

### 4.5 上下文系统
10个模块管理上下文生命周期、事件、工件、索引、提供者（CLI/MCP）、包、清单、压缩。

### 4.6 策略系统
4个模块实现策略族、解析、选择器和权限配置。

## 5. 配置系统

分层 `oh-my-superagents.config.jsonc`：
- 全局：`~/.config/oh-my-superagents/config.jsonc`
- 项目：`<project-root>/oh-my-superagents.config.jsonc`
- JSON Schema 验证：`schemas/oh-my-superagents.schema.json`

## 6. 测试体系

- 框架：Vitest
- 模式：TDD（测试驱动开发）
- 35个测试文件，最大为 `cli.test.ts`（302KB）
- 命令：`pnpm test`

## 7. 技术栈

| 技术 | 用途 |
|------|------|
| TypeScript | 主要开发语言 |
| Node.js | 运行时 |
| pnpm | 包管理器 |
| Vitest | 测试框架 |
| zod | 运行时模式验证 |
| jsonc-parser | JSONC 配置解析 |

## 8. Copilot CLI 现状

**当前状态：尚未实现任何 Copilot CLI 支持。**

需要实现的模块（参考现有宿主适配模式）：
- `src/copilot.ts` - Copilot 适配层
- `src/copilot-bootstrap.ts` - Copilot 引导层（如需要）
- `test/copilot.test.ts` - 对应测试
- 能力声明、路由集成、工作流适配

## 9. 设计原则与约束

1. OMS 核心厚度 > 任何宿主适配层
2. 宿主适配层可替换
3. OMS 语义在所有宿主上保持一致
4. 新宿主判断标准：存在真实缺口，且 OMS 能在不做成宿主专用框架的前提下补上
5. 采用 TDD + subagent-driven-development 模式开发

---
生成时间：2026-04-23
基于分支：MT-base @ ad76b0c
