# oh-my-superagents 代码架构深度分析报告

## 项目概述

`oh-my-superagents` 是一个面向多宿主平台的 AI 工作流路由和控制平面系统。该项目为核心 AI CLI 工具（OpenCode、Codex、Qwen、Claude Code）提供统一的路由机制、配置管理和产物生成能力，同时保持对上游 `superpowers` 工作流的一流支持。

**核心设计原则**：保持共享 OMS 核心比任何单一宿主适配器更厚，确保宿主特定代码可替换，同时为路由、预设、兼容性检查、共享能力策略和 OMS 控制平面行为保持一致的模型。

## 架构分层

项目采用七层架构设计，各层职责清晰，边界明确：

### 第一层：控制平面核心 (Control Plane Core)

**主要文件**：
- `src/control-plane.ts` (~1500+ 行)
- `src/config.ts` (~1500+ 行)
- `src/cli.ts` (~2000+ 行)

**职责**：
- 分层配置加载与迁移
- 预设选择与命令前缀/别名解析
- OMS `status/use/disable/sync/doctor` 行为实现
- 状态、诊断和解释信息的组合输出
- 配置和生命周期规则的宿主一致性保证

**厚度**：中等（约4300行源码）

**设计考量**：此层承载产品语义，所有支持的宿主都依赖它。配置和生命周期规则必须跨宿主保持一致。

### 第二层：工作流适配器 (Workflow Adapters)

**主要文件**：
- `src/router.ts` (~188 行)
- `src/workflow-direct.ts`
- `src/workflow-superpowers.ts`
- `src/workflow-gstack.ts`
- `src/workflow-sources.ts` (~52 行)

**职责**：
- 将工作流特定路由词汇与通用路由解析器分离
- 将内置 OMS 阶段输入规范化为真正的规范路由 ID（如 `phase.plan`）
- 通过源适配器将规范路由映射到源原生条目（如 `writing-plans` 或 `plan-eng-review`）
- 保持 `superpowers` 作为一等工作流适配器
- 支持 OpenCode 直连模式解析用户定义的意图

**厚度**：薄（约371行源码）

**设计考量**：路由核心比单一上游阶段目录更广泛；`superpowers` 支持保持一流但不再定义整个产品身份。

### 第三层：共享能力策略 (Shared Capability Policy)

**主要文件**：
- `src/capabilities.ts` (~97 行)

**职责**：
- 保持源适配器专注于定义上游条目存在性
- 让能力注册表决定 OMS 是否支持源路由、宿主-源投影或控制平面命令组合
- 返回结构化的支持决策和原因代码

**厚度**：薄

**设计考量**：路由解析和支持策略是不同的关注点，需要不同的扩展点。失败封闭的支持规则在添加新源、宿主或命令时保持一致。

### 第四层：宿主适配器 (Host Adapters)

**主要文件**：
- `src/opencode.ts` (~633 行)
- `src/codex.ts` (~197 行)
- `src/codex-bootstrap.ts`
- `src/qwen.ts` (~424 行)
- `src/claude.ts` (~138 行)

**职责**：
- 从解析的规范路由和源条目渲染宿主原生产物
- 将 OMS 阶段和命令映射到宿主原生入口点
- 应用宿主特定约束而不改变 OMS 语义

**厚度**：
- OpenCode：薄
- Codex + Bootstrap：中等
- Qwen：薄
- Claude：薄

**设计考量**：宿主适配器应主要是渲染和翻译层；规范路由模型位于共享路由代码中，不在宿主特定文件名或工作流条目约定中。

### 第五层：兼容性监控 (Compatibility Monitor)

**主要文件**：
- `src/superpowers-compatibility.ts`
- `src/superpowers-detectors.ts`

**职责**：
- 检测上游 `superpowers` 安装状态
- 对照本地兼容性矩阵评估
- 返回 `compatible`、`untested`、`incompatible` 或 `not_detected` 状态

**厚度**：中等（约1093行源码）

**设计考量**：此层跨宿主共享；检测是宿主特定的，但策略是共享的。

### 第六层：产物协调 (Artifact Reconciliation)

**主要文件**：
- `src/materialize.ts` (~712 行)

**职责**：
- 安全写入生成的产物
- 检测 OMS 拥有的产物
- 在重命名或前缀更改后协调过时的宿主产物

**厚度**：薄到中等

**设计考量**：每个宿主最终都需要相同的所有权和清理保证；集中推理清理比在每个适配器内部更容易。

### 第七层：文档与计划 (Docs and Plans)

**关键位置**：
- `docs/superpowers/specs/`
- `docs/superpowers/plans/`
- `.agents/superpowers/specs/`

**职责**：
- 在实现前捕获决策
- 保持分阶段工作明确
- 保持阶段和宿主之间的边界

## 核心数据模型

### 规范路由模型 (Canonical Route Model)

项目采用规范路由 ID 作为内部路由契约：

- **格式**：`phase.{name}` 或 `intent.{name}`
- **示例**：`phase.plan`、`phase.brainstorm`、`intent.deploy`

内置 OMS 阶段输入保持用户友好的稳定阶段名称（如 `writing-plans`），但共享路由器将它们规范化为真正的规范路由 ID。源适配器将这些规范路由映射到源原生工作流条目。

### 配置结构

配置采用分层 JSONC 格式（`oh-my-superagents.config.jsonc`），支持：

- **Workflow 配置**：`superpowers` 或 `direct` 模式
- **Settings**：启用状态、活动预设、车道选择、命令前缀等
- **Profiles**：模型配置（model、effort、variant、temperature、codexFast）
- **Presets**：工作模式定义（routes、defaultRoute、usesLanes）
- **Lanes**：技术栈路由包（frontend、backend、infra）
- **Policy Rules**：权威策略规则（selector + policy）

### 工作流源类型

项目支持三种工作流源：

1. **superpowers**：上游 superpowers 工作流技能系统
2. **gstack**：Garry Tan 的结构化专家代理工作流
3. **direct**：用户定义的直连意图模式

## 宿主支持矩阵

| 能力 | OpenCode | Codex | Qwen | Claude Code |
|------|----------|-------|------|-------------|
| superpowers 工作流路由 | 完全 | 完全 | 部分 | 实验 |
| Direct 模式 | 实验 | 实验 | 实验 | 无 |
| OMS 控制平面 | 完全 | 完全 | 完全 | 实验 |
| 宿主引导 | 原生插件 | 本地引导/插件包 | 无 | 无 |
| 兼容性监控 | 完全 | 完全 | 无 | 无 |
| 生成的产物 | Agents + Commands | Agents + Plugin/Skills | Agents + Commands | Skills |

### 宿主特性差异

**OpenCode**：
- 原生插件入口点
- 项目本地 agents 和 commands
- 直连模式的第一个宿主
- 适合薄生成包装器

**Codex**：
- 项目本地 agents（TOML 格式）
- 本地插件包和 marketplace 条目
- 需要 routing artifacts 和便捷引导层

**Qwen**：
- 项目本地 agents 和 commands
- Stage 2 限制范围
- 包装器集成足够

**Claude Code**：
- 项目范围 `.claude/skills/*/SKILL.md` 包装器
- 无直连工作流投影
- 薄宿主适配器

## 就绪状态面 (Readiness Surfaces)

OMS 诊断有意分离四个不同问题：

1. **support**：OMS 是否能投影此路由或命令组合？（来自 `src/capabilities.ts`，失败封闭）
2. **availability**：如果解析的源依赖上游安装，OMS 能否检测该依赖？（来自 `src/upstream-readiness.ts`）
3. **compatibility**：如果 OMS 能检测上游 superpowers，该安装是否在本地测试矩阵内？（来自 `src/superpowers-compatibility.ts`）
4. **sync state**：调用宿主的 OMS 拥有产物是否存在？（来自产物检查和协调）

## 关键模块详解

### 路由解析 (Router)

`src/router.ts` 提供核心路由解析逻辑：

- `resolveRoute()`：解析单个路由到 ResolvedRoute 结构
- `resolvePhase()`：解析内置阶段到 ResolvedRoute
- `resolveEffectiveSources()`：合并默认和显式源配置
- `explainPhase()`/`explainAll()`：生成路由解释输出

**ResolvedRoute 结构**：
```typescript
{
  routeId: string
  canonicalRoute: CanonicalRouteId
  profileId: string
  routeSource: "preset-route" | "lane-route" | "lane-default" | "preset-default"
  effectiveLane?: string
  resolvedSource: WorkflowSourceKind
  sourceEntry: WorkflowSourceEntry
  selection: { model, variant, effort, codexFast, temperature }
}
```

### 产物生成 (Artifact Building)

每个宿主适配器将解析的路由转换为宿主原生产物：

**OpenCode** (`src/opencode.ts`)：
- `buildArtifacts()` 生成 `.opencode/agents/*.md` 和 `.opencode/commands/*.md`
- YAML frontmatter + Markdown 内容格式
- 支持车道分割子代理执行

**Codex** (`src/codex.ts`)：
- `buildCodexArtifacts()` 生成 `.codex/agents/*.toml`
- TOML 格式，支持 reasoningEffort 和 serviceTier

### 产物协调 (Materialization)

`src/materialize.ts` 负责产物的安全写入和清理：

- `materializeArtifacts()`：原子写入产物文件
- `hasArtifactOwnershipMarker()`：检测 OMS 拥有的产物
- `isOmsOwnedArtifactFile()`/`isOmsOwnedSkillFile()`：判断产物归属

**所有权标记**：
- `<!-- generated-by: oh-my-superagents; do-not-edit: true -->`
- `<!-- oms-control-plane: ... -->`
- `<!-- oms-route: ... -->`

### 插件系统 (Plugin)

`src/plugin.ts` 实现 OpenCode 插件入口点：

- 启动时加载路由配置
- 报告 superpowers 兼容性诊断
- 提供 `chat.params` 钩子支持 `codexFast` 服务层

## 车道路由系统 (Lane Routing)

车道感知路由在阶段之下添加一个路由层：

- **phase**：稳定的 superpowers 工作流键
- **lane**：技术栈路由包（frontend、backend、infra）
- **profile**：携带可执行设置的叶子模型/配置对象
- **preset**：选择工作模式，`usesLanes` 限制可用车道

**车道选择模式**：
- `manual`：仅使用持久化/默认车道
- `suggest`：将运行时车道显示为 Stage 1 建议
- `auto`：可能应用会话范围的 `effectiveLane`

## 子代理执行 (Subagent Execution)

车道感知子代理执行是在 `superpowers` 下的执行层增强：

- 主 `/sp-execute` 路径保持在 `superpowers/subagent-driven-development`
- 添加车道范围包装器如 `/sp-execute-frontend`
- 配合 `spr-build--frontend` 代理

**执行模式**：
- `manual`：仅在用户明确请求时使用车道特定执行
- `suggest`：先提议分割，等待确认
- `auto`：自动应用分割

## 上下文压缩系统 (Context Compression)

项目包含上下文压缩功能：

- `src/context-compression.ts`：压缩策略实现
- `src/context-packs.ts`：上下文包选择
- `src/context-index.ts`：上下文索引构建

**压缩配置**：
- `mode`：manual、suggest、auto
- `engine`：builtin、external、hybrid
- `inlineLevel`：minimal、standard、full
- `moments`：压缩时机配置

## 权威策略平面 (Authority Policy Plane)

`src/policy-resolution.ts` 和 `src/policy-selectors.ts` 实现权威策略系统：

- **Workload Mappings**：路径到工作负载标签的映射
- **Policy Rules**：选择器 + 策略组合
- **Runtime Snapshot**：运行时上下文快照

**策略选择器字段**：
- `path`：Glob 路径模式
- `lifecycleStage`：生命周期阶段
- `workflowSource`：工作流源类型
- `agentRole`：primary 或 subagent
- `workloadTags`：工作负载标签
- `modalityRequirements`：模态需求

## 依赖关系

**生产依赖**：
- `@opencode-ai/plugin`：OpenCode 插件 API
- `jsonc-parser`：JSONC 配置解析
- `zod`：配置验证

**开发依赖**：
- `typescript`：TypeScript 编译
- `vitest`：测试框架

## 测试覆盖

项目拥有完整的测试套件（`test/*.test.ts`）：

- 配置加载和验证测试
- 路由解析测试
- 宿主适配器测试
- 产物协调测试
- 兼容性监控测试
- 策略解析测试

## 设计决策与权衡

### 为什么选择这种架构形状？

1. **宿主适配器可替换**：薄适配器层便于添加/修改宿主支持
2. **superpowers 保持一流**：不再拥有整个产品身份，但保持完整支持
3. **OMS 语义跨宿主一致**：共享核心确保行为一致性

### 新宿主支持评估问题

> 该宿主是否仍有 OMS 可以填补的真正缺口，而不将 OMS 变成宿主特定框架？

这个问题决定了为什么某些宿主是完全支持，某些是部分支持，某些有意排除。

## 总结

`oh-my-superagents` 是一个精心设计的多宿主 AI 工作流路由系统，其架构分层清晰，核心与适配器职责分离，扩展性强。项目遵循"共享核心比单一适配器更厚"的设计原则，确保了跨宿主的一致性和可维护性。

**架构优势**：
- 分层清晰，职责明确
- 配置系统灵活，支持分层和继承
- 规范路由模型统一内部契约
- 产物协调系统安全可靠
- 兼容性监控完善

**适用场景**：
- 多宿主 AI CLI 工具统一管理
- 工作流路由和预设切换
- 团队协作中的模型策略管理
- 跨项目 AI 配置标准化