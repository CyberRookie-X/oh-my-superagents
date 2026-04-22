# oh-my-superagents 项目架构深度分析报告

## 1. 项目概述

**oh-my-superagents**（简称 OMS）是一个 AI 编排 CLI 工具，为多个 AI 编码宿主（OpenCode、Codex、Qwen、Claude Code）提供路由和控制平面支持，同时支持 superpowers 工作流。

### 1.1 核心定位

OMS 的核心设计原则是：

> 保持共享 OMS 核心比任何单一宿主适配器更厚。

这意味着：
- 宿主特定代码保持可替换性
- 路由、预设、兼容性检查、共享能力策略和 OMS 控制平面行为保持一致的模型
- 不是 superpowers 的替代品，不是跨宿主配置同步系统，也不是重量级多智能体编排框架

### 1.2 技术栈

| 维度 | 选择 |
|------|------|
| 语言 | TypeScript (ES2022, strict mode) |
| 模块系统 | ESM (NodeNext) |
| 包管理 | pnpm |
| 构建 | 原生 tsc 编译 |
| 测试 | Vitest |
| 运行时依赖 | `@opencode-ai/plugin`、`jsonc-parser`、`zod` |
| 开发依赖 | `@types/node`、`typescript`、`vitest` |

### 1.3 导出接口

项目提供三个主要入口点：
- `./dist/plugin.js` — OpenCode 插件入口（默认导出）
- `./dist/index.js` — 库 API（供编程调用）
- `./dist/bin.js` — CLI 二进制入口

---

## 2. 架构分层

OMS 采用 **七层架构**，从核心到边缘依次为：

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: 控制平面核心 (Control Plane Core)              │
│  config.ts, control-plane.ts, cli.ts                    │
│  约 4316 行 — 最厚层                                      │
├─────────────────────────────────────────────────────────┤
│  Layer 2: 工作流适配器 (Workflow Adapters)               │
│  router.ts, workflow-*.ts                               │
│  约 371 行 — 薄层                                         │
├─────────────────────────────────────────────────────────┤
│  Layer 3: 共享能力策略 (Shared Capability Policy)        │
│  capabilities.ts                                        │
│  约 97 行 — 极薄层                                        │
├─────────────────────────────────────────────────────────┤
│  Layer 4: 宿主适配器 (Host Adapters)                     │
│  opencode.ts, codex.ts, qwen.ts, claude.ts              │
│  约 1955 行 — 中等厚度                                    │
├─────────────────────────────────────────────────────────┤
│  Layer 5: 兼容性监控 (Compatibility Monitor)             │
│  superpowers-compatibility.ts, superpowers-detectors.ts │
│  约 1093 行 — 中等厚度                                    │
├─────────────────────────────────────────────────────────┤
│  Layer 6: 制品协调 (Artifact Reconciliation)             │
│  materialize.ts                                         │
│  约 712 行 — 薄到中等                                     │
├─────────────────────────────────────────────────────────┤
│  Layer 7: 上下文与策略系统 (Context & Policy System)     │
│  context-*.ts, policy-*.ts, lane-execution.ts           │
│  约 1100+ 行 — 中等厚度                                   │
└─────────────────────────────────────────────────────────┘
```

### 2.1 各层职责

| 层级 | 职责 | 关键文件 |
|------|------|----------|
| 控制平面核心 | 分层配置加载、遗留配置迁移、预设选择、命令别名解析、OMS 状态管理 | `config.ts`, `control-plane.ts`, `cli.ts` |
| 工作流适配器 | 将工作流阶段映射到规范路由 ID、源适配器映射 | `router.ts`, `workflow-superpowers.ts`, `workflow-direct.ts`, `workflow-gstack.ts`, `workflow-sources.ts` |
| 共享能力策略 | 决定 OMS 是否支持特定的源-路由-宿主组合 | `capabilities.ts` |
| 宿主适配器 | 将规范路由渲染为宿主原生制品 | `opencode.ts`, `codex.ts`, `qwen.ts`, `claude.ts` |
| 兼容性监控 | 检测上游 superpowers 安装状态并评估兼容性 | `superpowers-compatibility.ts`, `superpowers-detectors.ts` |
| 制品协调 | 安全写入制品、检测 OMS 拥有的制品、清理过时制品 | `materialize.ts` |
| 上下文与策略 | 上下文生命周期管理、压缩策略、策略规则匹配 | `context-*.ts`, `policy-*.ts` |

---

## 3. 核心模块分析

### 3.1 配置系统 (`config.ts`)

这是整个项目最核心的模块（约 1502 行），负责：

**配置格式**：
- 使用 JSONC（带注释的 JSON）格式：`oh-my-superagents.config.jsonc`
- 支持两层配置加载：全局配置（`~/.config/oh-my-superagents/config.jsonc`）和项目配置（`./oh-my-superagents.config.jsonc`）
- 高层级配置覆盖低层级配置

**配置 Schema 层次**：
```
LayeredControlPlaneConfigSchema
├── workflow: "superpowers" | "direct"
├── settings
│   ├── enabled: boolean
│   ├── activePreset: string
│   ├── defaultLane?: string
│   ├── laneSelection: "manual" | "suggest" | "auto"
│   ├── subagentExecution: "manual" | "suggest" | "auto"
│   ├── contextCompression: 压缩配置
│   ├── commandPrefix: string
│   ├── commands: 命令覆盖
│   └── superpowersCompatibility: "warn" | "strict"
├── sourcePresets: 源预设映射
├── compressionPresets: 压缩预设
├── contextProviders: 上下文提供者
├── authority: 权限配置
│   ├── workloadMappings: 工作负载映射
│   └── policyRules: 策略规则
├── profiles: 模型配置
├── lanes: 车道配置
└── presets: 预设配置
```

**关键设计决策**：
- 使用 Zod 进行运行时验证
- 支持遗留配置格式自动迁移
- 预设支持单级继承（`extends` 字段）
- 配置恢复机制：当主配置文件损坏时回退到 `.oms/last-known-good.json`

### 3.2 路由引擎 (`router.ts`)

路由引擎是 OMS 的心脏，负责将请求意图映射到模型配置：

**路由解析链**：
```
用户请求 → 阶段/意图 ID → 规范路由 ID → 工作流源 → 源条目 → 模型选择
```

**关键类型**：
```typescript
type ResolvedRoute = {
  routeId: string                    // 原始路由 ID
  canonicalRoute: CanonicalRouteId   // 规范路由 ID (phase.xxx | intent.xxx)
  profileId: string                  // 选中的模型配置
  routeSource: "preset-route" | "lane-route" | "lane-default" | "preset-default"
  effectiveLane?: string             // 生效的车道
  resolvedSource: WorkflowSourceKind // 解析的源类型
  sourceEntry: WorkflowSourceEntry   // 源条目
  selection: { model, variant, effort, codexFast, temperature }
}
```

**路由优先级**：
1. 预设中的显式路由（`preset-route`）
2. 车道中的显式路由（`lane-route`）
3. 车道的默认路由（`lane-default`）
4. 预设的默认路由（`preset-default`）

### 3.3 控制平面 (`control-plane.ts`)

控制平面是 OMS 的"大脑"，提供：

- **状态解析**：解析当前 OMS 状态（健康、缺失配置、禁用、制品不同步等）
- **车道状态管理**：管理车道的选择和应用
- **上下文压缩**：评估压缩就绪状态、选择上下文包、构建压缩引擎包
- **策略解析**：基于运行时上下文快照匹配策略规则
- **可解释性追踪**：为每个路由决策提供完整的追踪信息

---

## 4. 数据流分析

### 4.1 配置 → 路由 → 宿主适配器的完整数据流

```
┌──────────────────┐
│  配置文件 (JSONC) │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│  loadRouterConfig │───→│  loadControlPlane │
│  (加载并验证)      │     │  Config (分层合并) │
└────────┬─────────┘     └──────────────────┘
         │
         ▼
┌──────────────────┐
│  resolvePreset    │
│  (预设展开)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│  resolveRoute     │───→│  resolveEffective │
│  (路由解析)        │     │  Sources (源解析)  │
└────────┬─────────┘     └──────────────────┘
         │
         ▼
┌──────────────────┐
│  buildArtifacts   │
│  (构建宿主制品)    │
│  - opencode.ts    │
│  - codex.ts       │
│  - qwen.ts        │
│  - claude.ts      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  materialize      │
│  (制品写入与协调)  │
└──────────────────┘
```

### 4.2 工作流源映射

```
规范路由 ID          源类型          源条目名称
─────────────────   ────────────   ──────────────────────
phase.brainstorm    superpowers    brainstorming
phase.plan          superpowers    writing-plans
phase.plan          gstack         plan-eng-review
phase.execute       superpowers    subagent-driven-development
phase.execute       gstack         ship
phase.review        superpowers    requesting-code-review
phase.review        gstack         review
phase.verify        superpowers    verification-before-completion
phase.verify        gstack         qa
phase.visual        superpowers    frontend-design
phase.web-test      superpowers    webapp-testing
intent.xxx          direct         (用户自定义意图)
```

### 4.3 上下文生命周期流

```
bootstrap → design → prepare_workspace → plan → execute_task → review → verify → integrate_branch
                                                                                    ↕
                                                                             checkpoint / resume
```

---

## 5. 设计模式与抽象

### 5.1 规范路由模式 (Canonical Route Pattern)

所有工作流阶段都被映射到统一的规范路由 ID：
- Superpowers 阶段 → `phase.{brainstorm|plan|execute|review|verify|visual|web-test}`
- 直接模式意图 → `intent.{用户定义意图}`

这种抽象使得：
- 路由引擎不依赖任何特定工作流的词汇
- 新工作流只需添加适配器即可接入
- 宿主适配器使用统一的规范 ID

### 5.2 工作流源适配器模式 (Workflow Source Adapter Pattern)

```typescript
type WorkflowSourceKind = "superpowers" | "gstack" | "direct"

type WorkflowSourceEntry = {
  canonicalRoute: CanonicalRouteId
  source: WorkflowSourceKind
  entryName?: string
}
```

每个源类型提供：
- 规范路由到源条目的映射
- 源特定的入口名称解析

### 5.3 分层配置模式 (Layered Configuration Pattern)

```
全局配置 (低优先级) → 项目配置 (高优先级) → 运行时覆盖 (最高优先级)
```

合并策略：
- 对象类型：浅合并，高层覆盖低层
- 数组类型：追加合并（如 `workloadMappings`、`policyRules`）
- 特定字段支持 `null` 显式清除

### 5.4 策略选择器模式 (Policy Selector Pattern)

```typescript
type PolicySelector = {
  path?: string[]              // glob 模式路径匹配
  lifecycleStage?: string[]    // 生命周期阶段
  workflowSource?: string[]    // 工作流源
  agentRole?: string[]         // 代理角色 (primary/subagent)
  workloadTags?: string[]      // 工作负载标签
  modalityRequirements?: string[] // 模态需求
}
```

策略规则按顺序匹配，匹配的策略族（Policy Families）合并：
- `modelPolicy`：模型选择策略
- `contextPolicy`：上下文压缩策略
- `toolPolicy`：工具访问策略

### 5.5 依赖注入模式 (Dependency Injection Pattern)

CLI 层大量使用依赖注入以实现可测试性：

```typescript
type CliDeps = {
  mkdir: (...) => Promise<void>
  writeFile: (...) => Promise<void>
  loadConfig: typeof loadRouterConfig
  resolveControlPlane: typeof resolveControlPlane
  buildArtifacts: typeof buildArtifacts
  detectOpenCodeSuperpowers: typeof detectOpenCodeSuperpowers
  // ... 更多依赖
}
```

### 5.6 所有权标记模式 (Ownership Marker Pattern)

所有 OMS 生成的制品都包含所有权标记：

```
<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-route: stage=1; host=opencode; source=superpowers; route=phase.plan; projection=agent; rendered-name=spr-plan -->
```

这使得 `materialize.ts` 能够：
- 识别 OMS 拥有的文件
- 安全清理过时制品
- 避免与用户创建的文件冲突

---

## 6. 宿主适配器架构

### 6.1 宿主适配器概览

| 宿主 | 适配器文件 | 制品类型 | 集成深度 | 工作流支持 |
|------|-----------|----------|----------|-----------|
| OpenCode | `opencode.ts` | agents/*.md, commands/*.md | 插件 + 制品 | superpowers, direct |
| Codex | `codex.ts`, `codex-bootstrap.ts` | agents/*.toml, plugins/*.md | 插件 + 引导 + 制品 | superpowers, direct |
| Qwen | `qwen.ts` | agents/*.md, commands/*.md | 薄包装器 | superpowers (部分), direct |
| Claude | `claude.ts` | skills/*/SKILL.md | 薄包装器 | superpowers (仅) |

### 6.2 OpenCode 适配器

**最完整的宿主适配器**，特点：
- 原生插件入口点（`OhMySuperpowersPlugin`）
- 生成 agent 定义文件（`.opencode/agents/*.md`）
- 生成命令文件（`.opencode/commands/*.md`）
- 支持车道分割执行（lane execution units）
- 运行时代理元数据（`runtime-agent-metadata.json`）
- 控制平面命令（status/use/disable/sync/doctor）

**制品格式**：YAML frontmatter + Markdown 内容

### 6.3 Codex 适配器

**最复杂的宿主适配器**，特点：
- 需要引导层（bootstrap）创建插件骨架
- marketplace.json 注册
- 插件清单（plugin.json）
- 技能文件（SKILL.md）
- Agent TOML 文件（`.codex/agents/*.toml`）

**特殊设计**：
- `codex-bootstrap.ts` 处理初始安装引导
- 支持 `oms-no-superpowers` 临时禁用技能
- 推理努力程度映射（fast→low, balanced→medium, deep→high, max→xhigh）

### 6.4 Qwen 适配器

**薄适配器**，特点：
- 发现上游已安装技能
- 生成包装器 agent 文件
- 代理上游工作流调用
- 不支持 gstack 源路由

### 6.5 Claude 适配器

**最薄的适配器**，特点：
- 仅生成 `.claude/skills/*/SKILL.md` 包装器
- 不支持 direct 工作流
- 依赖上游 gstack 或 superpowers 安装

### 6.6 宿主能力决策矩阵

```typescript
// capabilities.ts 中的决策逻辑
getHostProjectionDecision({ host, workflowKind, sourceEntry })
```

| 宿主 | superpowers 源 | gstack 源 | direct 源 |
|------|---------------|-----------|-----------|
| OpenCode | 支持 | 支持 | 支持 |
| Codex | 支持 | 支持 | 支持 |
| Qwen | 支持 | 不支持 | 支持 |
| Claude | 支持 | 支持 | 不支持 |

---

## 7. 工作流适配器架构

### 7.1 工作流类型

**Superpowers 工作流**：
- 7 个内置阶段：brainstorming, writing-plans, subagent-driven-development, requesting-code-review, verification-before-completion, frontend-design, webapp-testing
- 映射到 7 个规范路由 ID
- 依赖上游 superpowers 技能安装

**Direct 工作流**：
- 用户自定义意图
- 规范路由 ID 格式：`intent.{意图名}`
- 不依赖上游工作流工具
- 当前仅在 OpenCode 和 Codex 上完全支持

**Gstack 源**：
- 作为 superpowers 工作流的替代源
- 4 个映射：plan-eng-review, ship, review, qa
- 主要用于 OpenCode 和 Codex

### 7.2 源解析策略

```typescript
// 默认源条目
getDefaultSourceEntries(config) → {
  "phase.brainstorm": "superpowers",
  "phase.plan": "superpowers",
  ...
}

// 显式源覆盖
effectiveSources: {
  "phase.plan": "gstack",  // 使用 gstack 替代 superpowers
}

// 最终解析
resolvedSource = { ...defaults, ...explicitSources }[canonicalRoute]
```

---

## 8. 控制平面架构

### 8.1 控制平面命令

| 命令 | 别名 | 功能 |
|------|------|------|
| `status` | `st` | 显示 OMS 状态 |
| `use` | `u` | 切换到指定预设 |
| `disable` / `off` | `o` | 禁用 OMS |
| `sync` | `sy` | 同步 OMS 制品 |
| `doctor` | `dr` | 检查 OMS 诊断信息 |

### 8.2 状态机

```
healthy ───────────────────────────────────────────────┐
  ↑                                                    │
  │  sync                                             │
missing_config ───→ artifacts_out_of_sync ─────────────┘
  ↑                                                    │
  │  sync                                             │
disabled ────────→ upstream_not_detected ──→ upstream_incompatible
                     ↑                                    │
                     │  doctor                            │
                     └────────────────────────────────────┘
```

### 8.3 诊断分离设计

OMS 有意将四个不同的问题分开：

1. **Support**（支持性）：OMS 能否投影此路由/命令组合？（来自 `capabilities.ts`，失败关闭）
2. **Availability**（可用性）：上游依赖是否可检测？（来自 `upstream-readiness.ts`）
3. **Compatibility**（兼容性）：上游安装是否在兼容矩阵内？（来自 `superpowers-compatibility.ts`）
4. **Sync State**（同步状态）：OMS 制品是否存在？（来自制品检查）

### 8.4 预设系统

```
预设 (Preset)
├── label: 显示名称
├── short: 短名称（用于 CLI）
├── extends?: 父预设（单级继承）
├── profiles: 覆盖的模型配置
├── usesLanes: 允许的车道列表
├── defaultLane: 默认车道
├── sourcePreset: 源预设引用
├── sourceRoutes: 源路由覆盖
├── routes: 阶段→模型映射
└── defaultRoute: 默认模型
```

---

## 9. 配置系统架构

### 9.1 配置加载流程

```
discoverConfigPath
    │
    ├── 检查显式路径
    ├── 检查项目配置 (./oh-my-superagents.config.jsonc)
    └── 检查全局配置 (~/.config/oh-my-superagents/config.jsonc)
         │
         ▼
    readControlPlaneSourceDocument
         │
         ├── 解析 JSONC
         ├── 检测格式 (layered vs legacy)
         └── 规范化配置
              │
              ▼
         mergeLayeredConfigs (多层合并)
              │
              ▼
         finalizeConfig (填充默认值)
              │
              ▼
         resolvePresetReuse (预设继承展开)
              │
              ▼
         validateConfig (验证完整性)
```

### 9.2 遗留配置迁移

```jsonc
// 遗留格式
{
  "profiles": { "build": { "model": "gpt-5" } },
  "routes": { "brainstorming": "build" },
  "defaultRoute": "build"
}

// 迁移为分层格式
{
  "presets": {
    "default": {
      "label": "Default",
      "short": "def",
      "profiles": { "build": { "model": "gpt-5" } },
      "routes": { "brainstorming": "build" },
      "defaultRoute": "build"
    }
  }
}
```

### 9.3 配置恢复机制

当主配置文件加载失败时：
1. 检查 `.oms/last-known-good.json` 是否存在
2. 如果存在且主配置错误可恢复，则使用 last-known-good
3. 每次成功写入配置时，同时更新 last-known-good 快照

---

## 10. 测试策略

### 10.1 测试框架

- **框架**：Vitest
- **环境**：Node.js
- **测试文件**：`test/**/*.test.ts`
- **测试数量**：45 个测试文件

### 10.2 测试模式

**1. 单元测试为主**：
每个模块都有对应的测试文件，测试重点在：
- 路由解析逻辑
- 配置加载与验证
- 制品生成
- 策略匹配

**2. 依赖注入测试**：
CLI 层通过 `CliDeps` 接口注入模拟依赖，实现纯单元测试。

**3. 类型检查测试**：
- `public-api-config-typecheck.ts`
- `public-api-context-providers-typecheck.ts`
确保公共 API 的类型契约不被破坏。

**4. 边界条件测试**：
- 未知路由 ID 拒绝
- 配置格式错误处理
- 共享代理冲突检测
- 预设循环依赖检测

### 10.3 测试覆盖率特点

- 核心路由逻辑覆盖充分
- 配置系统测试全面
- 宿主适配器有基本覆盖
- 兼容性检测有完整测试

---

## 11. 依赖分析

### 11.1 运行时依赖

| 依赖 | 用途 |
|------|------|
| `@opencode-ai/plugin` | OpenCode 插件 API 集成 |
| `jsonc-parser` | 解析带注释的 JSON 配置文件 |
| `zod` | 运行时 Schema 验证 |

### 11.2 依赖图

```
cli.ts (入口)
├── config.ts (配置)
│   ├── workflow-sources.ts
│   ├── workflow-superpowers.ts
│   ├── workflow-direct.ts
│   ├── workflow-gstack.ts
│   ├── superpowers-compatibility.ts
│   ├── policy-families.ts
│   └── config-recovery.ts
├── router.ts (路由)
│   └── workflow-*.ts
├── control-plane.ts (控制平面)
│   ├── config.ts
│   ├── router.ts
│   ├── policy-resolution.ts
│   ├── context-*.ts
│   └── lane-execution.ts
├── opencode.ts / codex.ts / qwen.ts / claude.ts (宿主适配器)
│   ├── router.ts
│   ├── config.ts
│   └── capabilities.ts
├── materialize.ts (制品协调)
│   └── opencode.ts (标记常量)
└── superpowers-detectors.ts (检测器)
    └── superpowers-compatibility.ts
```

### 11.3 依赖特点

- **零外部框架依赖**：不依赖 Express、Fastify 等 Web 框架
- **最小化依赖**：仅 3 个运行时依赖
- **无数据库依赖**：所有状态通过文件系统管理
- **纯函数优先**：核心逻辑多为纯函数，便于测试

---

## 12. 代码质量评估

### 12.1 优点

**1. 架构清晰**
- 七层架构职责分明
- 共享核心厚于宿主适配器的设计原则得到贯彻
- 规范路由模式有效解耦了工作流和宿主

**2. 类型安全**
- 全面使用 TypeScript strict mode
- Zod 运行时验证确保配置安全
- 公共 API 有类型检查测试保护

**3. 可测试性**
- 依赖注入模式使 CLI 层高度可测试
- 核心逻辑多为纯函数
- 文件系统操作通过接口抽象

**4. 错误处理**
- 自定义错误类型（`MissingControlPlaneConfigError`）
- 配置恢复机制防止配置损坏导致系统不可用
- 兼容性检测失败时优雅降级

**5. 向后兼容**
- 遗留配置自动迁移
- 预设继承系统支持渐进式配置

### 12.2 改进空间

**1. 代码复杂度**
- `cli.ts` 文件过长（约 2500+ 行），职责过多
- `control-plane.ts` 中策略匹配、压缩评估、车道状态等逻辑交织
- `materialize.ts` 的所有权解析逻辑复杂，正则表达式较多

**2. 配置系统复杂度**
- 分层配置合并逻辑复杂，特别是 `contextCompression` 的深度合并
- 遗留格式和分层格式的共存增加了认知负担
- `null` 值用于显式清除的设计不够直观

**3. 测试覆盖不均**
- 部分宿主适配器（如 Qwen、Claude）测试较少
- 集成测试不足，主要是单元测试
- 缺少端到端测试

**4. 错误信息**
- 部分错误信息不够具体，难以定位问题
- 策略匹配失败时缺少详细的调试信息

**5. 文档**
- 架构文档较好，但缺少各模块的详细 API 文档
- 中文文档（`README.zh-CN.md`）可能未与英文同步更新

---

## 13. 改进建议

### 13.1 架构层面

**1. 拆分 CLI 模块**
```
cli.ts (当前 ~2500+ 行)
├── cli/commands/
│   ├── status.ts
│   ├── use.ts
│   ├── disable.ts
│   ├── sync.ts
│   └── doctor.ts
├── cli/author/
│   ├── routing.ts
│   └── policy.ts
└── cli/utils/
    ├── compatibility.ts
    └── explain.ts
```

**2. 引入事件系统**
当前控制平面中大量使用直接函数调用，可以引入事件系统解耦：
```typescript
// 当前
const resolved = await resolveControlPlane(input)
const compression = await resolveEffectiveContextCompression(...)

// 改进后
const eventBus = createControlPlaneEventBus()
eventBus.on("config:loaded", handleConfigLoaded)
eventBus.on("route:resolved", handleRouteResolved)
```

**3. 策略引擎独立**
将策略匹配逻辑提取为独立的策略引擎模块，支持：
- 策略规则热重载
- 策略匹配性能优化（如决策树）
- 策略冲突检测

### 13.2 代码质量层面

**1. 减少正则表达式使用**
`materialize.ts` 中大量使用正则解析所有权标记，建议：
- 使用结构化解析替代正则
- 引入标记解析器模块

**2. 统一错误处理**
```typescript
// 当前：各种错误处理方式
throw new Error("Unknown preset: ...")
throw new MissingControlPlaneConfigError()
return { exitCode: 1, warnings: [...] }

// 建议：统一错误类型
class OmsError extends Error {
  constructor(
    public code: OmsErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) { super(message) }
}
```

**3. 增加集成测试**
- 模拟完整的配置加载 → 路由解析 → 制品生成流程
- 测试不同宿主适配器的端到端行为
- 测试配置恢复机制

### 13.3 功能层面

**1. 配置验证工具**
提供独立的配置验证命令：
```bash
oh-my-superagents validate --config ./oh-my-superagents.config.jsonc
```

**2. 配置 diff 工具**
```bash
oh-my-superagents diff --from ./config-a.jsonc --to ./config-b.jsonc
```

**3. 策略模拟**
```bash
oh-my-superagents simulate-policy --path src/index.ts --lifecycle-stage plan
```

### 13.4 文档层面

**1. 模块 API 文档**
为每个核心模块生成 API 文档，包括：
- 导出的类型和函数
- 使用示例
- 注意事项

**2. 扩展指南**
编写如何添加新宿主适配器、新工作流源的指南。

**3. 故障排除指南**
常见错误码和解决方案。

---

## 附录：关键文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/config.ts` | 1502 | 配置加载、验证、合并、迁移 |
| `src/cli.ts` | ~2500+ | CLI 命令实现 |
| `src/control-plane.ts` | ~1700+ | 控制平面状态解析、诊断 |
| `src/opencode.ts` | 633 | OpenCode 宿主适配器 |
| `src/codex.ts` | 197 | Codex 宿主适配器 |
| `src/codex-bootstrap.ts` | 563 | Codex 引导层 |
| `src/qwen.ts` | 424 | Qwen 宿主适配器 |
| `src/superpowers-compatibility.ts` | 526 | 兼容性评估 |
| `src/superpowers-detectors.ts` | 567 | 上游检测 |
| `src/materialize.ts` | 712 | 制品协调 |
| `src/router.ts` | 188 | 路由引擎 |
| `src/capabilities.ts` | 97 | 能力策略 |
| `src/workflow-sources.ts` | 52 | 工作流源抽象 |
| `src/workflow-superpowers.ts` | 92 | Superpowers 工作流适配 |
| `src/workflow-direct.ts` | 17 | Direct 工作流适配 |
| `src/workflow-gstack.ts` | 22 | Gstack 源适配 |
| `src/policy-resolution.ts` | 50 | 策略解析 |
| `src/policy-selectors.ts` | 110 | 策略选择器 |
| `src/policy-families.ts` | 111 | 策略族定义 |
| `src/context-compression.ts` | 224 | 上下文压缩 |
| `src/context-index.ts` | 137 | 上下文索引 |
| `src/context-artifacts.ts` | 74 | 上下文制品 |
| `src/context-lifecycle.ts` | 81 | 上下文生命周期 |
| `src/context-providers.ts` | 113 | 上下文提供者 |
| `src/context-packs.ts` | 142 | 上下文包选择 |
| `src/context-manifest.ts` | 190 | 上下文提供者清单 |
| `src/lane-execution.ts` | 85 | 车道执行 |
| `src/author-routing.ts` | 414 | 路由配置辅助 |
| `src/author-policy.ts` | 58 | 策略配置辅助 |
| `src/plugin.ts` | 261 | OpenCode 插件入口 |
| `src/bin.ts` | 15 | CLI 入口 |
| `src/index.ts` | 40 | 公共 API 导出 |
| `src/upstream-readiness.ts` | 145 | 上游就绪评估 |
| `src/config-write.ts` | 72 | 配置原子写入 |
| `src/config-recovery.ts` | 18 | 配置恢复 |
| `src/claude.ts` | 138 | Claude 宿主适配器 |
| `src/openspec.ts` | 13 | OpenSpec 制品分类 |
| `src/gstack-detectors.ts` | 80 | Gstack 可用性检测 |
| `src/authority-config.ts` | 68 | 权限配置 Schema |
| `src/docs-catalog.ts` | 56 | 文档目录 Schema |
| `src/context-events.ts` | - | 上下文事件 |

---

*报告生成日期：2026年4月22日*
*分析基于项目版本：0.1.0*
*总源文件数：43 个 TypeScript 文件*
*总测试文件数：45 个*
