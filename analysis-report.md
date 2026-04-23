# oh-my-superagents 项目架构分析报告

## 1. 项目概述

**项目名称**: `oh-my-superagents` (OMS)

**项目类型**: 开源的 AI CLI 路由与控制平面产品

**核心定位**:
- 为主流 AI CLI 平台（OpenCode、Codex、Qwen、Claude Code）提供宿主原生的路由与 OMS 控制平面支持
- 保持对上游 `superpowers` 工作流系统的一等公民支持
- 提供实验性的宿主原生 direct mode 切片

**主要功能**:
- 分层配置加载与 preset 管理
- 规范化路由（canonical route）模型
- 多宿主工件生成（OpenCode agents/commands、Codex TOML agents、Qwen agents/commands、Claude skills）
- 上游 `superpowers` 兼容性监控
- AI 辅助路由编写（author routing）
- Lane 感知路由与子代理执行

## 2. 技术栈

| 类别 | 技术 | 用途 |
|------|------|------|
| **语言** | TypeScript 5.8+ | 类型安全，strict 模式 |
| **运行时** | Node.js ES2022 | 跨平台 CLI |
| **验证** | Zod 3.24 | 配置 schema 验证 |
| **配置解析** | jsonc-parser | JSONC 配置文件解析 |
| **构建** | TypeScript Compiler | `tsc -p tsconfig.json` |
| **测试** | Vitest 3.1 | 单元测试框架 |
| **包管理** | pnpm 10.32 | 仓库维护（Corepack） |
| **插件 SDK** | @opencode-ai/plugin | OpenCode 插件接口 |

## 3. 目录结构

```
/home/adad/dev/oh-my-superagents/
├── src/                          # 核心源代码
│   ├── index.ts                  # 库导出入口
│   ├── bin.ts                    # CLI 可执行文件入口
│   ├── cli.ts                    # CLI 命令处理（~2100+ 行）
│   ├── plugin.ts                 # OpenCode 插件入口
│   ├── control-plane.ts          # 控制平面核心逻辑（~1800 行）
│   ├── config.ts                 # 配置加载与验证（~1500 行）
│   ├── router.ts                 # 路由解析器（~188 行）
│   ├── opencode.ts               # OpenCode 宿主适配层（~633 行）
│   ├── codex.ts                  # Codex 宿主适配层（~197 行）
│   ├── codex-bootstrap.ts        # Codex 引导程序
│   ├── qwen.ts                   # Qwen 宿主适配层（~424 行）
│   ├── claude.ts                 # Claude 宿主适配层
│   ├── capabilities.ts           # 能力策略层（~97 行）
│   ├── materialize.ts            # 工件物化与协调层（~712 行）
│   ├── workflow-*.ts             # 工作流源适配器
│   ├── context-*.ts              # 上下文管理相关
│   ├── policy-*.ts               # 策略相关
│   └── superpowers-*.ts         # superpowers 兼容性监控
├── test/                         # 测试文件
├── docs/                         # 架构文档与设计文档
│   ├── README-architecture.md    # 英文架构文档
│   ├── README-architecture.zh-CN.md  # 中文架构文档
│   └── superpowers/              # 详细设计规范
├── schemas/                      # JSON Schema 定义
├── scripts/                      # 构建脚本
├── package.json                  # 项目配置
└── tsconfig.json                 # TypeScript 配置
```

## 4. 核心模块分析

### 4.1 控制平面核心层

| 文件 | 行数 | 职责 |
|------|------|------|
| `control-plane.ts` | ~1800 | 控制平面状态解析、诊断汇总、preset 选择、lane 状态管理、上下文压缩、策略解析 |
| `config.ts` | ~1500 | 分层配置加载、legacy 配置迁移、Zod schema 验证、preset 复用解析 |
| `cli.ts` | ~2100+ | CLI 命令解析（status/use/disable/sync/doctor/explain/author）、输出格式化、兼容性处理 |

### 4.2 工作流适配层

| 文件 | 职责 |
|------|------|
| `router.ts` | 通用路由解析器，将 phase/intent 解析为 canonical route |
| `workflow-superpowers.ts` | superpowers 工作流源映射（7 个内置 phase） |
| `workflow-direct.ts` | direct mode 工作流源映射 |
| `workflow-gstack.ts` | gstack 第三方工作流源适配 |
| `workflow-sources.ts` | 工作流源规范化与类型定义 |

### 4.3 宿主适配层

| 文件 | 宿主 | 职责 |
|------|------|------|
| `opencode.ts` | OpenCode | 生成 `.opencode/agents/*.md` 和 `.opencode/commands/*.md` |
| `codex.ts` | Codex | 生成 `.codex/agents/*.toml` |
| `codex-bootstrap.ts` | Codex | 生成本地 plugin bundle 和 marketplace entry |
| `qwen.ts` | Qwen | 生成 `.qwen/agents/*.md` 和 `.qwen/commands/*.md` |
| `claude.ts` | Claude | 生成 `.claude/skills/*/SKILL.md` |

### 4.4 共享能力层

| 文件 | 职责 |
|------|------|
| `capabilities.ts` | 能力策略决策（支持/不支持的宿主-源-命令组合） |
| `materialize.ts` | 工件安全写入、所有权追踪、过期清理 |
| `superpowers-compatibility.ts` | 上游兼容性评估 |
| `superpowers-detectors.ts` | 各宿主 superpowers 安装检测 |

## 5. 设计模式

### 5.1 分层架构

项目遵循**共享核心比任何单个宿主适配层都更厚**的原则：

```
┌─────────────────────────────────────────┐
│         OMS 控制平面核心（中层）         │  ← control-plane.ts, config.ts, cli.ts
├─────────────────────────────────────────┤
│         工作流适配层（薄）              │  ← router.ts, workflow-*.ts
├─────────────────────────────────────────┤
│         共享能力策略层（薄）            │  ← capabilities.ts
├──────────┬──────────┬──────────┬─────────┤
│ OpenCode │  Codex   │  Qwen    │ Claude  │  ← 宿主适配层（薄到中层）
├──────────┴──────────┴──────────┴─────────┤
│         共享工件协调层（中薄）           │  ← materialize.ts
└─────────────────────────────────────────┘
```

### 5.2 适配器模式

每个宿主都有专门的适配层，将通用 OMS 模型转换为宿主原生工件：
- `opencode.ts` → OpenCode markdown agents/commands
- `codex.ts` → Codex TOML agents
- `qwen.ts` → Qwen markdown agents/commands
- `claude.ts` → Claude SKILL.md

### 5.3 规范路由模型

```
User-facing phase name     Internal canonical route
"writing-plans"     →     "phase.plan"
"brainstorming"      →     "phase.brainstorm"
...
```

源适配器再将 canonical route 映射为宿主原生工作流入口：
```
canonical route    →    source entry
"phase.plan"       →    "superpowers/writing-plans" (default)
"phase.plan"       →    "gstack/plan-eng-review"     (gstack source)
```

### 5.4 策略模式

`capabilities.ts` 集中定义能力决策策略，决定哪些宿主-源-命令组合被支持。

### 5.5 工厂模式

通过 `buildArtifacts`、`buildCodexArtifacts`、`buildQwenArtifacts` 等工厂函数生成宿主原生工件。

### 5.6 装饰器模式

使用 HTML 注释标记（`<!-- generated-by: oh-my-superagents -->`）追踪工件所有权。

## 6. 主入口点

### CLI 入口
```
bin.ts → cli.ts:runCli()
```

**支持的命令**:
- `oh-my-superagents status --host <opencode|codex|qwen|claude>`
- `oh-my-superagents use <preset> --host <host>`
- `oh-my-superagents disable --host <host>`
- `oh-my-superagents sync --host <host>`
- `oh-my-superagents doctor --host <host>`
- `oh-my-superagents explain --host <host> [--phase <phase>|--all]`
- `oh-my-superagents author routing --mode <superpowers|direct> --models <path>`
- `oh-my-superagents bootstrap --host codex`

### 插件入口
```
plugin.ts → OhMySuperpowersPlugin (export default)
```

用于 OpenCode 启动时的兼容性诊断和配置验证。

### 库导出入口
```
index.ts → 导出所有公开类型和函数
exports: "./dist/plugin.js", "./dist/index.js", "./library"
```

## 7. 支持矩阵

| 能力 | OpenCode | Codex | Qwen | Claude Code |
|------|----------|-------|------|-------------|
| superpowers 路由 | 完整 | 完整 | 部分 | 实验性 |
| Direct mode | 实验性 | 实验性 | 实验性 | 无 |
| OMS 控制平面 | 完整 | 完整 | 完整 | 实验性 |
| 兼容性监控 | 完整 | 完整 | 无 | 无 |

## 8. 配置系统

支持三层配置合并：
1. 全局配置 `~/.config/oh-my-superagents/config.jsonc`
2. 项目配置 `oh-my-superagents.config.jsonc`
3. 命令行显式指定 `--config`

**配置文件格式**: JSONC（带注释的 JSON）

## 9. 源码规模统计

| 层 | 主要文件 | 源码行数 | 厚度 |
|----|---------|---------|------|
| OMS 控制平面核心 | control-plane.ts, config.ts, cli.ts | ~4316 | 中等 |
| 工作流适配层 | router.ts, workflow-*.ts | ~371 | 薄 |
| 共享能力策略 | capabilities.ts | ~97 | 薄 |
| OpenCode 适配层 | opencode.ts | ~633 | 薄 |
| Codex 适配+bootstrap | codex.ts, codex-bootstrap.ts | ~760 | 中等 |
| Qwen 适配层 | qwen.ts | ~424 | 薄 |
| Claude 适配层 | claude.ts | ~138 | 薄 |
| 兼容性监控 | superpowers-compatibility.ts, detectors | ~1093 | 中等 |
| 共享工件协调 | materialize.ts | ~712 | 薄到中等 |

## 10. 关键设计原则

1. **共享核心优先**: OMS 核心被刻意设计得比任何单个宿主适配层更厚
2. **宿主差异隔离**: 宿主差异不应反向渗透进核心模型
3. **工件所有权追踪**: 通过 HTML 注释标记追踪OMS生成的工件
4. **就绪度分离**: 将 support、availability、compatibility、sync state 四个问题分开暴露

## 11. 现有文档

### 核心架构文档

| 文档 | 语言 | 路径 |
|------|------|------|
| 架构说明 | 中文 | `docs/README-architecture.zh-CN.md` (206 行) |
| Architecture | 英文 | `docs/README-architecture.md` (290 行) |

### 设计规范（Specs）

位于 `docs/superpowers/specs/`：
- `2026-04-09-oh-my-superagents-design.md` - 总体设计
- `2026-04-12-generic-routing-core-design.md` - 通用路由核心
- `2026-04-12-lane-routing-design.md` - Lane 路由设计
- `2026-04-13-workflow-source-fusion-foundation-design.md` - 工作流源融合
- `2026-04-15-hybrid-context-orchestration-design.md` - 混合上下文编排

### 计划文档（Plans）

位于 `docs/superpowers/plans/`，包含待实现功能的计划说明。

## 12. 总结

`oh-my-superagents` 是一个设计精良的多宿主 AI CLI 路由与控制平面产品，采用分层架构将共享逻辑与宿主特定逻辑分离。其核心价值在于：

1. 提供统一的路由模型，适配多个 AI CLI 宿主
2. 保持对上游 superpowers 的兼容性同时支持 direct mode
3. 通过控制平面命令（status/use/disable/sync/doctor）提供一致的宿主管理体验
4. 利用 Zod 进行严格的配置验证，保证配置安全

项目代码质量高，使用 TypeScript strict 模式，测试覆盖全面，文档详尽。