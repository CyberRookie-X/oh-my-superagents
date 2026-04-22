# oh-my-superagents 项目代码架构与设计深度分析报告

## 1. 项目概述

`oh-my-superagents`（简称 OMS）是一个面向 AI CLI 宿主（OpenCode、Codex、Qwen、Claude Code）的路由与控制面（Control Plane）产品。其核心职责是将统一的配置模型投影为各宿主的本地化构件（agents、commands、skills），同时提供预设切换、兼容性监控、策略引擎、上下文管理等控制面能力。

项目遵循一条设计铁律：**共享 OMS 核心必须比任何单一宿主适配器更厚**，确保宿主可替换、语义跨宿主一致。

## 2. 技术栈与构建体系

| 维度 | 选型 |
|------|------|
| 语言 | TypeScript 5.8+，strict 模式 |
| 模块系统 | ESM（`"type": "module"`），NodeNext 模块解析 |
| 编译 | `tsc`，输出至 `dist/`，含 `.d.ts` 声明文件 |
| 包管理 | pnpm 10.32 |
| 测试 | Vitest 3.1，Node 环境，45 个测试文件 |
| 校验 | Zod 3.24（配置/清单 schema 验证） |
| 配置解析 | jsonc-parser 3.3（支持 JSONC 注释） |
| 插件集成 | `@opencode-ai/plugin` 1.2+（OpenCode 原生插件接口） |

构建流程简洁：`rm dist/ && tsc`。类型检查分为两层——主源码 `--noEmit` 和公开 API 兼容性检查（`public-api-config-typecheck.ts`、`public-api-context-providers-typecheck.ts`）。

## 3. 目录结构

```
oh-my-superagents/
├── src/                    # 全部 43 个源文件，扁平结构
├── test/                   # 45 个测试文件，1:1 对应 src/
├── schemas/                # JSON Schema（配置、能力目录、引导问题图）
├── catalogs/               # 静态目录数据（能力、引导问题图）
├── docs/
│   ├── ai/                 # AI 辅助生成的文档
│   ├── superpowers/
│   │   ├── specs/          # 规格文档
│   │   └── plans/          # 实施计划
│   ├── README-architecture.md
│   └── README-architecture.zh-CN.md
├── scripts/
│   ├── docker/             # Docker 构建脚本
│   ├── generate-ai-docs.ts # AI 文档生成器
│   └── run-*-canary.sh     # Debian Docker 金丝雀脚本
├── .agents/superpowers/
│   └── specs/              # superpowers 规格文档
├── dist/                   # 编译输出
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── opencode.json           # OpenCode 插件配置
```

## 4. 架构分层

项目采用七层架构，自底向上：

### Layer 0 — 叶子模块（无 src/ 内部依赖）

| 模块 | 职责 |
|------|------|
| `context-events.ts` | 上下文生命周期事件枚举 |
| `openspec.ts` | OpenSpec 制品分类（spec/plan） |
| `workflow-direct.ts` | Direct 工作流源：意图 ID → `intent.*` 规范路由 |
| `workflow-gstack.ts` | Gstack 工作流源：4 个静态目录条目 |
| `workflow-superpowers.ts` | Superpowers 工作流源：7 个内置阶段目录 |
| `superpowers-compatibility.ts` | Superpowers 版本兼容性矩阵与 semver 解析 |
| `config-recovery.ts` | 配置恢复状态（last-known-good 路径） |
| `docs-catalog.ts` | 能力目录与引导问题图的 Zod schema |
| `context-provider-cli.ts` | CLI 上下文提供者（子进程执行） |
| `context-provider-mcp.ts` | MCP 上下文提供者（JSON-RPC 2.0 over stdio） |

### Layer 1 — 单层依赖

| 模块 | 依赖 | 职责 |
|------|------|------|
| `workflow-sources.ts` | Layer 0 工作流源 | 统一的工作流源类型与条目解析 |
| `context-lifecycle.ts` | `workflow-sources` | 上下文生命周期阶段推导 |
| `context-manifest.ts` | `context-events` | 上下文提供者清单解析与严格校验 |
| `policy-selectors.ts` | `context-lifecycle` | 策略选择器匹配（glob 模式、多维匹配） |
| `gstack-detectors.ts` | 无内部依赖 | Claude Gstack 可用性检测 |

### Layer 2 — 跨层依赖

| 模块 | 依赖 | 职责 |
|------|------|------|
| `capabilities.ts` | config, superpowers-compatibility, 工作流源 | 能力决策引擎（支持/不支持判定） |
| `context-artifacts.ts` | `context-lifecycle` | 上下文制品类型与新鲜度检查 |
| `policy-families.ts` | `policy-selectors` | 策略族类型（model/context/tool）与合并 |
| `authority-config.ts` | config | 权威配置 Zod schema |
| `context-providers.ts` | `context-manifest` | 上下文提供者解析（file/cli/mcp） |
| `upstream-readiness.ts` | config, capabilities, workflow-sources | 上游投影就绪度评估 |

### Layer 3 — 核心基础设施

| 模块 | 依赖 | 职责 |
|------|------|------|
| `config.ts` | Layer 0-2 多模块 | 配置 schema、加载、分层合并、迁移（1502 行） |
| `context-index.ts` | context-artifacts, manifest, openspec, providers | 上下文索引构建（文件系统扫描） |
| `context-packs.ts` | config, context-artifacts/index/lifecycle/providers | 上下文包选择与压缩策略 |
| `policy-resolution.ts` | policy-families, policy-selectors | 策略规则匹配与合并 |
| `superpowers-detectors.ts` | `superpowers-compatibility` | Superpowers 安装检测（OpenCode/Codex） |

### Layer 4 — 路由与策略

| 模块 | 依赖 | 职责 |
|------|------|------|
| `router.ts` | config, 工作流源 | 路由解析引擎（phase/intent → profile） |
| `context-compression.ts` | context-artifacts/index/lifecycle/providers/packs | 上下文压缩管线 |
| `author-policy.ts` | `authority-config` | 策略创作提案构建 |
| `author-routing.ts` | `config` | 路由创作（项目检测 + 模型匹配 + 配置提案） |

### Layer 5 — 宿主适配器与编排

| 模块 | 依赖 | 职责 |
|------|------|------|
| `control-plane.ts` | Layer 0-4 多模块 | 控制面编排器（1779 行，最大模块） |
| `opencode.ts` | config, lane-execution, router, 工作流源 | OpenCode 宿主适配器 |
| `claude.ts` | capabilities, config, opencode, router, 工作流源 | Claude Code 宿主适配器 |
| `codex.ts` | config, router, opencode, 工作流源 | Codex 宿主适配器 |
| `qwen.ts` | config, capabilities, opencode, router, 工作流源 | Qwen 宿主适配器 |
| `materialize.ts` | config, opencode | 制品物化（原子写入 + 所有权标记 + 过期清理） |
| `config-write.ts` | config-recovery | 原子配置写入 |
| `codex-bootstrap.ts` | config, codex, opencode, materialize, superpowers-compatibility | Codex 引导/脚手架 |

### Layer 6 — 入口与插件

| 模块 | 依赖 | 职责 |
|------|------|------|
| `cli.ts` | Layer 0-5 多模块 | CLI 全命令实现（3084 行） |
| `plugin.ts` | config, opencode, superpowers-compatibility/detectors | OpenCode 插件入口 |

### Layer 7 — 应用入口

| 模块 | 职责 |
|------|------|
| `bin.ts` | CLI 可执行入口（`#!/usr/bin/env node`） |
| `index.ts` | 库 API 桶文件（re-export） |

## 5. 核心抽象与数据流

### 5.1 规范路由模型（Canonical Route Model）

```
用户阶段输入（如 "writing-plans"）
    ↓
规范路由 ID（phase.plan）
    ↓
工作流源映射（superpowers → "writing-plans", gstack → "plan-eng-review"）
    ↓
宿主适配器投影为宿主原生产物
```

- 规范路由 ID 格式：`phase.{name}` 或 `intent.{name}`
- 三种工作流源：`superpowers`（7 阶段）、`gstack`（4 条目）、`direct`（用户定义意图）
- 路由解析优先级：preset-route > lane-route > lane-default > preset-default

### 5.2 配置分层模型

```
全局配置（~/.config/oh-my-superagents/config.jsonc）
    ↓ 叠加
项目配置（./oh-my-superagents.config.jsonc）
    ↓ 合并规则
项目 settings 覆盖全局 settings
项目 presets 替换同名全局 presets
项目 command 条目替换同名全局条目
缺失值由内置默认值补充
```

配置核心概念：
- **Preset**：工作模式（如 "default"、"review"），含 profiles + routes + defaultRoute
- **Profile**：模型配置（model + variant/effort + codexFast + temperature）
- **Lane**：技术栈路由束（如 "frontend"、"backend"），可按 phase 覆盖路由
- **PolicyRule**：selector + policy（model/context/tool），按运行时上下文匹配并合并

### 5.3 控制面解析流

```
配置加载 → 预设选择 → Lane 选择 → 路由解析 → 上下文索引构建
    → 策略解析 → 上下文压缩 → 上游就绪度评估 → 完整控制面状态
```

`resolveControlPlane()` 是核心编排函数，产出 `ResolvedControlPlane`，包含：
- 解析后的配置与 Lane 状态
- 上下文索引与压缩策略
- 策略解析结果
- 上游就绪度与兼容性
- 可解释性追踪

### 5.4 制品物化管线

```
控制面状态 → 宿主适配器渲染 → GeneratedArtifact[]
    → 所有权标记注入 → 碰撞检测 → 原子写入 → 过期制品清理
```

所有权标记使用 HTML 注释格式：`<!-- oms-route: stage=1; host=opencode; ... -->`

## 6. 宿主适配器设计

每个宿主适配器遵循统一接口模式：接收控制面状态，输出 `GeneratedArtifact[]`。

| 宿主 | 产物格式 | 产物路径 | 特殊能力 |
|------|----------|----------|----------|
| OpenCode | YAML frontmatter + Markdown agents/commands | `.opencode/agents/`, `.opencode/commands/` | 运行时元数据 JSON、codexFast 注入 |
| Codex | TOML agents + Plugin/Skills | `.codex/agents/`, `plugins/oh-my-superagents-codex/` | 市场条目、引导流程 |
| Qwen | YAML frontmatter + Markdown agents/commands | `.qwen/agents/`, `.qwen/commands/` | 上游技能发现 |
| Claude | SKILL.md | `.claude/skills/*/SKILL.md` | Gstack 支持 |

关键设计约束：
- Claude 不支持 Direct 工作流（`getHostProjectionDecision` 返回 `unsupported_host_direct_projection`）
- Qwen 不支持 Gstack 源投影（`unsupported_host_source_projection`）
- Direct 模式下 `use`/`disable` 命令不支持

## 7. 兼容性监控系统

```
安装检测（superpowers-detectors）
    ↓
版本提取（semver 解析或 git ref 提取）
    ↓
兼容性矩阵匹配（superpowers-compatibility）
    ↓
状态判定：compatible | untested | incompatible | not_detected
    ↓
策略执行：warn（继续 + 警告）| strict（incompatible 时阻塞 sync/bootstrap）
```

当前仅支持 OpenCode 和 Codex 的兼容性监控。检测逻辑：
- **OpenCode**：读取 `opencode.json` 插件配置 + 检查标准本地安装路径
- **Codex**：检查 git clone 和 skills symlink 位置
- 冲突检测：多来源版本不一致时降级为 `not_detected`

## 8. 上下文管理子系统

### 8.1 上下文提供者

三种提供者类型：

| 类型 | 可用性判定 | 能力 |
|------|-----------|------|
| File | 目录存在 | recall, search, summarize, pack, status |
| CLI | 始终可用 | 同上 |
| MCP | JSON-RPC 会话初始化成功 | 同上（通过 tools/list 和 tools/call） |

MCP 客户端实现完整的 JSON-RPC 2.0 会话：`initialize → initialized → request → dispose`

### 8.2 上下文生命周期

5 个生命周期阶段：`spec → plan → knowledge → execute → verify`

3 个压缩时刻：`pre_execution`, `mid_execution`, `post_execution`

### 8.3 上下文压缩

- 内置压缩包（BuiltinCompressionBundle）：按生命周期阶段和时刻选取
- 增强压缩包（EnhancedCompressionBundle）：追加摘要
- Markdown 结构化截断：在标题边界处截断，保留文档结构

### 8.4 上下文包

3 种上下文包：`spec-core`、`plan-core`、`knowledge-support`

包选择基于生命周期阶段和压缩时刻。

## 9. 策略引擎

```
运行时上下文快照（cwd, relativePath, lifecycleStage, ...）
    ↓
工作负载标签推导（glob 模式匹配）
    ↓
策略规则匹配（selector 多维匹配）
    ↓
策略族合并（model + context + tool）
```

三种策略族：
- **ModelPolicy**：模型选择、变体、effort
- **ContextPolicy**：上下文包选择、压缩策略
- **ToolPolicy**：工具启用/禁用

合并策略：后匹配规则覆盖先匹配规则（数组整体替换）。

## 10. 能力决策引擎

`capabilities.ts` 实现了 fail-closed 的能力判定：

1. **源路由支持**：superpowers/gstack 是否有该规范路由的条目
2. **宿主投影决策**：宿主是否支持该工作流类型和源的组合
3. **控制面命令决策**：宿主是否支持该命令在该工作流模式下执行

每个不支持决策附带 reason code，用于诊断和日志。

## 11. CLI 命令系统

CLI（3084 行）实现以下命令：

| 命令 | 功能 |
|------|------|
| `status` | 显示当前控制面状态、兼容性、制品同步状态 |
| `use` | 切换预设（可创建首个配置） |
| `disable` | 禁用 OMS（清理宿主制品） |
| `sync` | 同步控制面状态到宿主制品 |
| `doctor` | 诊断控制面健康度 |
| `explain` | 解释路由解析过程（支持 --phase, --intent, --all） |
| `bootstrap` | Codex 专用引导流程 |
| `author routing` | AI 辅助路由配置创作 |

CLI 采用命令模式 + 依赖注入（`CliDeps`），包含 LCS diff 算法用于配置变更展示。

## 12. 设计模式总结

| 模式 | 应用位置 |
|------|----------|
| Barrel/Facade | `index.ts` 统一导出 |
| 命令模式 | CLI 命令分发 |
| 依赖注入 | `CliDeps`、MCP 传输工厂 |
| 原子写入 | `config-write.ts`（temp + rename） |
| 所有权标记 | `materialize.ts`（HTML 注释标记 OMS 管辖范围） |
| Last-known-good | 配置恢复机制 |
| 策略模式 | 兼容性矩阵可替换 |
| 观察者 | OpenCode 插件启动诊断日志 |
| 静态目录/查找表 | 工作流源目录（superpowers/gstack） |
| 多源检测 + 冲突降级 | Superpowers 安装检测 |
| 严格解析 + 防御性校验 | `context-manifest.ts`（稀疏数组检测、多余属性检测） |
| FNV-1a 哈希 | Lane 执行单元名称生成（碰撞安全） |
| JSON-RPC 客户端 | MCP 上下文提供者 |

## 13. 代码规模与厚度

| 层 | 主要文件 | 约源码行数 | 厚度 |
|---|---------|----------:|------|
| 控制面核心 | `control-plane.ts`, `config.ts`, `cli.ts` | 4316 | 中 |
| 工作流适配器 | `router.ts`, `workflow-*.ts` | 371 | 薄 |
| 能力策略 | `capabilities.ts` | 97 | 薄 |
| OpenCode 适配器 | `opencode.ts` | 633 | 薄 |
| Codex 适配器+引导 | `codex.ts`, `codex-bootstrap.ts` | 760 | 中 |
| Qwen 适配器 | `qwen.ts` | 424 | 薄 |
| Claude 适配器 | `claude.ts` | 138 | 薄 |
| 兼容性监控 | `superpowers-compatibility.ts`, `superpowers-detectors.ts` | 1093 | 中 |
| 制品协调 | `materialize.ts` | 712 | 薄-中 |

**总计约 43 个源文件，8544 行实现代码，45 个测试文件。**

## 14. 质量特征

### 优势

1. **清晰的分层架构**：七层架构，依赖方向单一，宿主适配器薄而可替换
2. **fail-closed 能力模型**：不支持即拒绝，附 reason code，便于诊断
3. **统一的规范路由模型**：跨宿主一致性由 `phase.*`/`intent.*` 路由 ID 保证
4. **完善的兼容性监控**：semver 解析、范围匹配、策略驱动的阻塞/警告
5. **原子写入与恢复**：配置写入安全，有 last-known-good 机制
6. **所有权标记系统**：OMS 管辖范围清晰，过期清理可靠
7. **高测试覆盖**：45 个测试文件，1:1 对应源文件
8. **类型安全**：strict TypeScript + Zod schema 验证

### 潜在改进方向

1. **cli.ts 过大（3084 行）**：命令分发与业务逻辑耦合，可按命令拆分
2. **control-plane.ts 过大（1779 行）**：编排逻辑集中，可按关注点拆分
3. **宿主适配器不对称**：不同宿主支持矩阵差异较大，需在 `capabilities.ts` 中维护大量硬编码规则
4. **缺少 Copilot CLI 支持**：目前 4 个宿主均不支持 Copilot CLI
5. **配置 schema 复杂度**：1502 行的 config.ts 反映了配置模型的高复杂度
6. **测试可见性**：45 个测试文件数量充足，但缺乏覆盖率报告配置

## 15. 模块依赖图

```
Layer 0 (叶子):
  context-events  openspec  workflow-direct  workflow-gstack
  workflow-superpowers  superpowers-compatibility  config-recovery
  docs-catalog  context-provider-cli  context-provider-mcp

Layer 1:
  workflow-sources ──→ Layer 0 工作流源
  context-lifecycle ──→ workflow-sources
  context-manifest ──→ context-events
  policy-selectors ──→ context-lifecycle
  gstack-detectors

Layer 2:
  capabilities ──→ config, superpowers-compatibility, 工作流源
  context-artifacts ──→ context-lifecycle
  policy-families ──→ policy-selectors
  authority-config ──→ config
  context-providers ──→ context-manifest
  upstream-readiness ──→ config, capabilities, workflow-sources

Layer 3:
  config ──→ Layer 0-2
  context-index ──→ context-artifacts, manifest, openspec, providers
  context-packs ──→ config, context-*
  policy-resolution ──→ policy-families, policy-selectors
  superpowers-detectors ──→ superpowers-compatibility

Layer 4:
  router ──→ config, 工作流源
  context-compression ──→ context-*
  author-policy ──→ authority-config
  author-routing ──→ config

Layer 5:
  control-plane ──→ Layer 0-4
  opencode/claude/codex/qwen ──→ config, router, 工作流源
  materialize ──→ config, opencode
  codex-bootstrap ──→ config, codex, opencode, materialize

Layer 6:
  cli ──→ Layer 0-5
  plugin ──→ config, opencode, superpowers-*

Layer 7:
  bin ──→ cli
  index ──→ Layer 0-6 (re-export)
```

## 16. 当前宿主支持矩阵

| 能力 | OpenCode | Codex | Qwen | Claude Code | **Copilot CLI** |
|------|----------|-------|------|-------------|-----------------|
| superpowers 工作流路由 | 完整 | 完整 | 部分 | 实验性 | **无** |
| Direct 模式 | 实验性 | 实验性 | 实验性 | 无 | **无** |
| OMS 控制面 | 完整 | 完整 | 完整 | 实验性 | **无** |
| 宿主引导 | 原生插件 | 本地引导/插件束 | 无 | 无 | **无** |
| 兼容性监控 | 完整 | 完整 | 无 | 无 | **无** |
| 生成产物 | agents + commands | agents + plugin/skills | agents + commands | skills | **无** |
| 临时禁用 | 完整 | 完整 | 无 | 无 | **无** |
| codexFast | 完整 | 完整 | 无 | 无 | **无** |

## 17. 总结

`oh-my-superagents` 是一个设计精良的多宿主 AI CLI 控制面产品。其核心优势在于：

1. **共享核心厚于单一适配器**的架构铁律，保证了跨宿主语义一致性
2. **规范路由模型**统一了不同工作流源的路径空间
3. **fail-closed 能力策略**避免了不支持路径的静默失败
4. **完善的兼容性监控**为上游依赖提供了可观测性

当前架构的最大扩展机会在于 Copilot CLI 宿主支持——需要新增 `copilot.ts` 适配器，并在 `capabilities.ts`、`superpowers-compatibility.ts`、`superpowers-detectors.ts`、`cli.ts`、`materialize.ts` 等模块中补充 Copilot 相关的类型、判定、检测和物化逻辑。
