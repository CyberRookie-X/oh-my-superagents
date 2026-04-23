# oh-my-superagents 项目架构与设计分析报告

## 一、项目概述

oh-my-superagents (OMS) 是一个 **AI 编程助手的路由与控制面系统**。它作为编排层，位于工作流技能系统（主要是 `superpowers`，也支持 `gstack`）与多个 AI CLI 宿主平台（OpenCode、Codex、Qwen Code、Claude Code）之间。

### 核心职责

- 读取分层配置文件 `oh-my-superagents.config.jsonc`
- 解析"标准路由"（如 `phase.plan`、`phase.execute`、`intent.build`），来源包括内置 superpowers 阶段和用户自定义直接意图
- 将标准路由映射到源端工作流条目（如 `superpowers/writing-plans` 或 `gstack/plan-eng-review`）
- 渲染宿主原生产物（agent 文件、command 文件、skill 文件），适配各宿主平台格式
- 提供控制面命令（`status`、`use`、`disable`、`sync`、`doctor`、`explain`）管理每个宿主的路由状态

### 核心设计原则

> "Keep the shared OMS core thicker than any single host adapter."

项目有意地将共享核心做得比任何单一宿主适配器都更厚重，确保跨宿主的一致性。

### 基本信息

| 项目 | 值 |
|---|---|
| 许可证 | MIT (2026) |
| 包管理器 | pnpm 10.32.1 (Corepack) |
| TypeScript | ES2022 target, NodeNext 模块解析, strict 模式 |
| 测试框架 | Vitest 3.1.1 (45 个测试文件) |
| 模块类型 | ESM |
| 主要依赖 | `@opencode-ai/plugin`, `jsonc-parser`, `zod` |

---

## 二、目录结构

```
oh-my-superagents/
├── .agents/
│   └── superpowers/specs/          # 实施计划文档 (5 个文件)
├── catalogs/
│   ├── oms-capabilities.json       # 模型与工具能力目录
│   └── oms-onboarding-question-graph.json  # 引导问答图
├── docs/
│   ├── README-architecture.md      # 架构文档 (英文)
│   ├── README-architecture.zh-CN.md # 架构文档 (中文)
│   ├── ai/                         # AI 生成文档
│   │   ├── llms-full.txt
│   │   ├── llms.txt
│   │   ├── oms-capability-catalog.md
│   │   └── oms-onboarding-playbooks.md
│   └── superpowers/
│       ├── plans/                  # ~20 个计划文档
│       └── specs/                  # ~20 个规格/设计文档
├── schemas/
│   ├── oh-my-superagents.schema.json    # 主配置 JSON Schema (~900 行)
│   ├── oms-capability-catalog.schema.json
│   └── oms-onboarding-question-graph.schema.json
├── scripts/
│   ├── generate-ai-docs.ts         # AI 文档生成器
│   ├── docker/                     # Docker 验证脚本
│   ├── run-opencode-debian-canary.sh
│   ├── run-opencode-local-canary.sh
│   ├── run-codex-debian-canary.sh
│   └── run-codex-local-canary.sh
├── src/                            # 43 个 TypeScript 源文件
├── test/                           # 45 个测试文件
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── opencode.json                   # 自引用插件配置
└── ...
```

---

## 三、源码模块详解

### 3.1 入口与 CLI

| 文件 | 说明 |
|---|---|
| `src/bin.ts` | CLI 入口点，调用 `runCli()`，处理 stdout/stderr 和退出码 |
| `src/index.ts` | 库导出 barrel 文件，re-export 约 30 个模块 |
| `src/plugin.ts` | OpenCode 插件入口 `OhMySuperpowersPlugin`，启动时加载配置，运行 superpowers 兼容性诊断，注入 `codexFast` 服务层级 |
| `src/cli.ts` | CLI 命令分发器 (~2000+ 行)，解析 argv，实现所有命令，使用 `CliDeps` 依赖注入 |

### 3.2 配置系统

| 文件 | 说明 |
|---|---|
| `src/config.ts` | 配置核心 (~1500 行)，Zod 模式定义，处理分层合并、预设复用、旧格式迁移、路由验证 |
| `src/config-write.ts` | 原子配置写入，先写临时文件再 rename，同时写 `.oms/last-known-good.json` 快照 |
| `src/config-recovery.ts` | 配置恢复，当 authority 配置解析失败时回退到 last-known-good |
| `src/authority-config.ts` | Authority/inventory 文档 Zod 模式定义 |

### 3.3 路由引擎

| 文件 | 说明 |
|---|---|
| `src/router.ts` | 路由解析引擎，按 preset routes → lane routes → lane default → preset default 顺序解析 |
| `src/workflow-superpowers.ts` | Superpowers 工作流适配器，定义 7 个内置阶段及标准路由 ID |
| `src/workflow-direct.ts` | 直接模式适配器，将意图 ID 转为 `intent.<id>` 格式路由 |
| `src/workflow-gstack.ts` | gstack 工作流适配器 |
| `src/workflow-sources.ts` | 工作流源类型定义，`WorkflowSourceKind` 枚举 |

### 3.4 控制面

| 文件 | 说明 |
|---|---|
| `src/control-plane.ts` | 控制面状态机 (~2200+ 行)，实现 `resolveControlPlane()`、`prepareControlPlaneStateWrite()` |
| `src/capabilities.ts` | 共享能力策略，判定宿主/源/路由组合的支持状态 |

### 3.5 宿主适配器

| 文件 | 目标平台 | 产物格式 |
|---|---|---|
| `src/opencode.ts` | OpenCode | `.opencode/agents/*.md` + `.opencode/commands/*.md` |
| `src/codex.ts` | Codex | `.codex/agents/*.toml` |
| `src/codex-bootstrap.ts` | Codex | 引导脚手架系统 |
| `src/qwen.ts` | Qwen Code | `.qwen/agents/*.md` + `.qwen/commands/*.md` |
| `src/claude.ts` | Claude Code | `.claude/skills/*/SKILL.md` |

### 3.6 兼容性与检测

| 文件 | 说明 |
|---|---|
| `src/superpowers-compatibility.ts` | Semver 版本比较与兼容性评估，支持 `>=`、`<`、`=` 等范围语法 |
| `src/superpowers-detectors.ts` | 检测上游 superpowers 安装（opencode.json 插件条目、git clone、symlink） |
| `src/upstream-readiness.ts` | 投影就绪性评估（support、availability、compatibility） |
| `src/gstack-detectors.ts` | 检测 gstack 可用性 |

### 3.7 物化与产物管理

| 文件 | 说明 |
|---|---|
| `src/materialize.ts` | 产物协调引擎 (~712 行)，原子写入、清理陈旧产物、所有权标记检测 |

### 3.8 Lane 执行

| 文件 | 说明 |
|---|---|
| `src/lane-execution.ts` | Lane 感知子代理执行，生成 lane 作用域执行单元 |

### 3.9 AI 辅助功能

| 文件 | 说明 |
|---|---|
| `src/author-routing.ts` | AI 辅助路由编排，分析仓库信号建议 lane |
| `src/author-policy.ts` | AI 辅助策略编排 |

### 3.10 上下文系统

| 文件 | 说明 |
|---|---|
| `src/context-lifecycle.ts` | 定义 10 个上下文生命周期阶段和 7 个压缩时刻 |
| `src/context-events.ts` | 定义 6 个上下文生命周期事件 |
| `src/context-artifacts.ts` | 上下文产物类型（12 种）、权威级别、新鲜度检查 |
| `src/context-index.ts` | 构建上下文索引，遍历文件系统目录并分类产物 |
| `src/context-providers.ts` | 解析上下文提供者配置（file、cli、mcp 三种类型） |
| `src/context-provider-cli.ts` | CLI 上下文提供者执行（spawn 子进程） |
| `src/context-provider-mcp.ts` | MCP 协议实现 (~344 行)，stdio 传输、JSON-RPC 2.0 |
| `src/context-packs.ts` | 上下文包选择，基于生命周期阶段和产物可用性 |
| `src/context-manifest.ts` | 上下文提供者清单解析 |
| `src/context-compression.ts` | 内置压缩引擎，按 markdown 结构标题边界截断 |

### 3.11 策略系统

| 文件 | 说明 |
|---|---|
| `src/policy-families.ts` | 策略家族类型：ModelPolicy、ContextPolicy、ToolPolicy |
| `src/policy-resolution.ts` | 策略规则匹配与合并 |
| `src/policy-selectors.ts` | 策略选择器匹配（glob 路径、生命周期、工作流源、代理角色等） |

### 3.12 其他

| 文件 | 说明 |
|---|---|
| `src/openspec.ts` | OpenSpec 产物分类 |
| `src/docs-catalog.ts` | 目录文件解析 |
| `src/superpowers-compatibility.ts` | 完整的 semver 解析器（含预发布支持） |

---

## 四、架构分层与数据流

### 4.1 七层架构模型

```
Layer 1: 控制面核心
  ├── src/config.ts          (配置加载、校验、分层)
  ├── src/control-plane.ts   (状态机、诊断、生命周期)
  └── src/cli.ts             (命令分发、用户界面)

Layer 2: 工作流适配器
  ├── src/router.ts              (通用路由解析)
  ├── src/workflow-superpowers.ts (superpowers 阶段目录)
  ├── src/workflow-direct.ts     (用户自定义意图)
  ├── src/workflow-gstack.ts     (gstack 条目目录)
  └── src/workflow-sources.ts    (共享源类型)

Layer 3: 共享能力策略
  └── src/capabilities.ts    (支持/不支持决策)

Layer 4: 宿主适配器
  ├── src/opencode.ts        (OpenCode .md 渲染)
  ├── src/codex.ts           (Codex .toml 渲染)
  ├── src/codex-bootstrap.ts (Codex 引导脚手架)
  ├── src/qwen.ts            (Qwen .md 渲染)
  └── src/claude.ts          (Claude SKILL.md 渲染)

Layer 5: 兼容性监控
  ├── src/superpowers-compatibility.ts (semver 评估)
  └── src/superpowers-detectors.ts     (上游安装检测)

Layer 6: 共享产物协调
  └── src/materialize.ts     (写入/移除/清理)

Layer 7: 上下文与策略引擎
  ├── src/context-*.ts       (生命周期、索引、压缩、提供者)
  ├── src/policy-*.ts        (家族、解析、选择器)
  └── src/authority-config.ts (权威文档模式)
```

### 4.2 核心数据流（sync 命令）

```
用户执行: oh-my-superagents sync --host opencode

1. cli.ts 解析参数，识别 command="sync", host="opencode"
2. config.ts: loadControlPlaneConfig()
   ├── 发现配置文件（项目级 → 全局级）
   ├── 读取、解析 JSONC、分层合并（全局在项目之下）
   ├── 迁移旧格式（如有）
   ├── 校验 lanes、presets、commands、source routing
   └── 解析预设复用链
3. control-plane.ts: resolveControlPlane()
   ├── 解析活跃预设、lane 状态
   ├── 构建上下文索引，解析上下文提供者
   ├── 解析策略家族
   └── 评估上下文压缩
4. superpowers-detectors.ts + superpowers-compatibility.ts
   ├── 检测上游 superpowers 安装
   └── 评估版本兼容性
5. capabilities.ts: getHostProjectionDecision()
   └── 检查每条路由对目标宿主的支持状态
6. router.ts: resolvePhase() (对每个内置阶段)
   ├── 遍历: preset.routes[phase] → lane.routes[phase] → lane.defaultRoute → preset.defaultRoute
   ├── 解析 profile (model, variant, effort, codexFast, temperature)
   └── 返回 ResolvedRoute
7. opencode.ts: buildArtifacts()
   ├── 渲染 agent .md 文件（含 YAML frontmatter）
   ├── 渲染 command .md 文件
   ├── 渲染控制面命令文件
   ├── 渲染临时禁用助手
   └── 渲染运行时 agent 元数据 JSON
8. materialize.ts: materializeArtifacts()
   ├── 原子写入产物（临时文件 + rename）
   ├── 移除陈旧 OMS 拥有的产物（所有权标记检测）
   └── 报告: { exitCode, warnings, written, removed }
```

---

## 五、关键接口/类型及其关系

### 5.1 配置类型

- **`ControlPlaneConfig`** — 完全解析的配置：workflow、settings、profiles、lanes、presets、sourcePresets、compressionPresets、contextProviders、policyRules
- **`ControlPlanePreset`** — 命名预设：{ label, short alias, profiles, routes, defaultRoute, usesLanes, extends }
- **`ControlPlaneProfile`** — 模型选择：{ model, variant?, effort?, codexFast?, temperature? }
- **`ControlPlaneLane`** — 技术栈路由包：{ label, routes, defaultRoute }
- **`RouterConfig`** — 路由器使用的子集：workflow、profiles、lanes、routes、defaultRoute、effectiveSources、effectiveLane

### 5.2 路由类型

- **`CanonicalRouteId`** — `phase.${string}` 或 `intent.${string}`
- **`WorkflowSourceKind`** — `"superpowers" | "gstack" | "direct"`
- **`WorkflowSourceEntry`** — { canonicalRoute, source, entryName? }
- **`ResolvedRoute`** — 完整解析结果：routeId、canonicalRoute、profileId、routeSource、effectiveLane、resolvedSource、sourceEntry、selection、description

### 5.3 控制面类型

- **`ResolvedControlPlane`** — 完整控制面状态
- **`OpenCodeStatusState`** — 状态码：healthy | missing_config | disabled | artifacts_out_of_sync | upstream_not_detected | upstream_incompatible
- **`ExplainTrace`** — 路由来源追踪

### 5.4 产物类型

- **`GeneratedArtifact`** — { kind: "agent"|"command", directory, fileName, ownerPrefix, content }
- **`ContextArtifact`** — { kind, path, authority, source, lifecycleStage?, updatedAt?, headCommit?, ... }

### 5.5 兼容性类型

- **`SuperpowersCompatibilityResult`** — { host, source, detectedVersion, detectedRef, status, reason, policyMode, shouldBlock }
- **`ProjectionReadiness`** — { support, availability?, compatibility? }

### 5.6 策略类型

- **`PolicyRule`** — { id?, selector: PolicySelector, policy: PolicyFamilies }
- **`PolicyFamilies`** — { modelPolicy?, contextPolicy?, toolPolicy? }
- **`RuntimeContextSnapshot`** — { cwd, relativePath, lifecycleStage, workflowSource, agentRole, workloadTags, modalityRequirements }

---

## 六、核心设计模式

### 6.1 标准路由抽象

内部路由使用 `phase.plan` / `intent.build` 风格的 ID，而非上游名称如 `writing-plans`。这将核心与任何特定上游词汇解耦，并支持多源适配。

### 6.2 分层配置与旧格式迁移

配置系统同时支持新分层格式（`settings` + `presets`）和旧的单一预设格式。旧配置自动迁移到 `presets.default`，禁止混用。

### 6.3 预设复用 (`extends`)

预设可以继承一个父预设（单层，无链式继承）。路由、profiles 和 lanes 合并，子级覆盖父级。

### 6.4 四维就绪性模型

诊断将 `support`（能力）、`availability`（上游可检测）、`compatibility`（版本已测试）和 `sync state`（产物是否存在）分离为独立信号。

### 6.5 宿主原生产物隔离

每个宿主的产物位于独立目录（`.opencode/`、`.codex/`、`.qwen/`、`.claude/`）。清理操作（`disable`）只影响调用宿主。

### 6.6 依赖注入提升可测试性

`cli.ts` 使用 `CliDeps` 对象注入所有文件系统、配置加载和检测函数。测试可以 mock 每个外部交互。

### 6.7 原子配置写入

`config-write.ts` 先写临时文件再 rename，同时写 `.oms/last-known-good.json` 快照作为权威配置损坏时的回退。

### 6.8 上下文压缩管道

多阶段系统：生命周期阶段派生 → 上下文包选择 → 压缩就绪性评估 → 内置压缩引擎（markdown 感知截断）。支持 `manual`、`suggest`、`auto` 模式。

### 6.9 策略选择器系统

规则基于运行时上下文匹配（路径 glob、生命周期阶段、工作流源、代理角色、工作负载标签、模态要求）。匹配的规则合并为统一策略。

### 6.10 自引用插件

项目自身的 `opencode.json` 引用 `superpowers` 作为插件依赖，使项目能用 superpowers 进行自身开发。

### 6.11 Lane 感知路由

在 `phase` 之下增加的路由层，按技术栈（`frontend`、`backend`、`infra`）组织路由。支持 `manual`/`suggest`/`auto` 选择模式。

### 6.12 所有权标记系统

每个生成文件包含 HTML 注释标记：

```html
<!-- generated-by: oh-my-superagents; do-not-edit: true -->
<!-- oms-route: stage=1; host=opencode; source=superpowers; route=phase.plan; projection=command; rendered-name=sp-plan -->
```

这些标记使 `materialize.ts` 能够检测所有权、避免与用户创建的文件冲突、清理孤立产物。

---

## 七、转换管道（Superpowers → 宿主原生产物）

### 7.1 标准转换流程

```
Superpowers 阶段名 (如 "writing-plans")
  │
  ├─ [workflow-superpowers.ts] toSuperpowersCanonicalRouteId()
  │  └─ 标准路由: "phase.plan"
  │
  ├─ [workflow-sources.ts] getWorkflowSourceEntry()
  │  └─ 源条目: { canonicalRoute: "phase.plan", source: "superpowers", entryName: "writing-plans" }
  │     或 { canonicalRoute: "phase.plan", source: "gstack", entryName: "plan-eng-review" }
  │
  ├─ [router.ts] resolvePhase()
  │  ├─ 遍历: preset.routes[phase] → lane.routes[phase] → lane.defaultRoute → preset.defaultRoute
  │  ├─ 解析 profile (model, variant, effort, codexFast, temperature)
  │  └─ 返回 ResolvedRoute
  │
  ├─ [宿主适配器]
  │  ├─ [opencode.ts] → .opencode/agents/spr-plan.md + .opencode/commands/sp-plan.md
  │  ├─ [codex.ts]    → .codex/agents/oms-plan.toml
  │  ├─ [qwen.ts]     → .qwen/agents/oms-plan.md
  │  └─ [claude.ts]   → .claude/skills/oms-plan/SKILL.md
  │
  └─ [materialize.ts] materializeArtifacts()
     ├─ 原子写入新产物（临时文件 + rename）
     ├─ 移除陈旧 OMS 拥有的产物（所有权标记检测）
     └─ 报告: { exitCode, warnings, written, removed }
```

### 7.2 Direct 模式转换

```
用户意图 (如 "build")
  └─ [workflow-direct.ts] toDirectCanonicalRouteId("build")
     └─ 标准路由: "intent.build"
```

宿主适配器渲染 `rt-build.md`（agent）和 `ai-build.md`（command）。

---

## 八、构建与测试

### 8.1 构建系统

```bash
# 构建脚本
rm -rf dist && tsc -p tsconfig.json

# 类型检查
tsc --noEmit

# 测试
npx vitest run
```

### 8.2 测试策略

- **45 个测试文件**，覆盖所有主要模块
- **依赖注入**使 CLI 完全可测试（mock `CliDeps`）
- **公共 API 类型检查**：`test/public-api-config-typecheck.ts` 和 `test/public-api-context-providers-typecheck.ts` 验证导出类型可编译
- **宿主本地验证已禁用**，所有验证在 Debian Docker 容器中运行

### 8.3 导出结构 (package.json)

| 导出路径 | 目标 |
|---|---|
| `.` 和 `./plugin` | `dist/plugin.js` (OpenCode 插件入口) |
| `./library` | `dist/index.js` (完整库 API) |
| `./schema` | `schemas/oh-my-superagents.schema.json` |
| `./catalogs/*` | 目录 JSON 文件 |
| `./schemas/*` | Schema JSON 文件 |

---

## 九、总结

oh-my-superagents 是一个设计精良的多宿主 AI 编程助手编排系统。其核心亮点包括：

1. **标准路由抽象**使系统与特定上游词汇解耦，支持 superpowers、gstack、direct 等多种工作流源
2. **宿主适配器模式**通过统一的内部数据结构生成各平台原生产物，新宿主只需实现渲染器
3. **分层配置系统**支持全局/项目级覆盖和预设复用，兼顾灵活性与可维护性
4. **四维就绪性诊断**将能力、可用性、兼容性、同步状态分离为独立信号，提供细粒度状态报告
5. **依赖注入与原子操作**确保系统的可测试性和数据安全
6. **上下文与策略引擎**提供了强大的生命周期管理和策略路由能力

整个系统的架构体现了清晰的关注点分离和良好的抽象层次，是一个值得参考的 AI 工具编排系统设计范例。
