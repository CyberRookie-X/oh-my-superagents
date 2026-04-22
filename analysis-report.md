# oh-my-superagents 代码架构分析报告

## 1. 项目概述

`oh-my-superagents`（简称 OMS）是一个多宿主 AI CLI 路由与控制平面产品，为 OpenCode、Codex、Qwen、Claude Code 等宿主平台提供工作流路由、配置管理和工件生成能力。项目采用 TypeScript 编写，核心设计理念是"共享 OMS 核心 + 薄工作流/宿主适配层"。

## 2. 整体架构

### 2.1 架构分层

项目采用清晰的分层架构，从下到上分为：

| 层级 | 职责 | 主要模块 |
|------|------|----------|
| **工作流源层** | 定义上游工作流入口 | `workflow-superpowers`, `workflow-gstack`, `workflow-direct`, `workflow-sources` |
| **路由核心层** | 路由解析、配置管理 | `router`, `config`, `control-plane` |
| **能力策略层** | 宿主能力决策、兼容性检查 | `capabilities`, `superpowers-compatibility`, `superpowers-detectors` |
| **宿主适配层** | 各宿主平台的工件渲染 | `opencode`, `codex`, `qwen`, `claude` |
| **上下文管理层** | 上下文索引、压缩、生命周期 | `context-*` 系列模块 |
| **策略治理层** | 策略族、选择器、解析 | `policy-families`, `policy-selectors`, `policy-resolution` |
| **CLI/Plugin 层** | 命令行接口和插件入口 | `cli`, `bin`, `plugin` |
| **工件物化层** | 工件写入、清理、冲突检测 | `materialize` |

### 2.2 核心数据流

```
配置文件 → config.ts → control-plane.ts → router.ts → 宿主适配层 → materialize.ts → 文件系统
                ↓              ↓
         上下文系统      策略系统
         (context-*)     (policy-*)
```

## 3. 核心模块详解

### 3.1 配置系统 (`config.ts`)

- **职责**: 分层配置加载、验证、合并
- **关键特性**:
  - 支持项目级和全局级配置叠加
  - 向后兼容 legacy 单 preset 配置
  - 使用 Zod 进行严格的运行时类型验证
  - 配置恢复机制（last-known-good）
  - 支持 preset 继承（单级 extends）
- **核心类型**: `ControlPlaneConfig`, `LayeredControlPlaneConfigInput`, `RouterConfig`

### 3.2 路由核心 (`router.ts`)

- **职责**: 将 phase/intent 解析为具体的 profile 和模型配置
- **关键概念**:
  - **Canonical Route**: 规范化路由 ID（如 `phase.plan`, `intent.build`）
  - **Workflow Source**: 工作流来源（superpowers/gstack/direct）
  - **Lane**: 技术栈路由分组（frontend/backend/infra）
  - **Route Source**: 路由来源（preset-route/lane-route/lane-default/preset-default）
- **核心函数**: `resolveRoute()`, `resolvePhase()`, `explainPhase()`

### 3.3 控制平面 (`control-plane.ts`)

- **职责**: 整合配置、上下文、策略，提供统一的控制平面状态
- **关键特性**:
  - 状态机管理（healthy/missing_config/disabled/artifacts_out_of_sync/upstream_not_detected）
  - Lane 状态解析和验证
  - 上下文压缩策略评估
  - 策略族运行时解析
  - 工件摘要生成
- **核心类型**: `ResolvedControlPlane`, `OpenCodeStatusState`

### 3.4 能力策略 (`capabilities.ts`)

- **职责**: 决定特定宿主/源/路由组合是否受支持
- **决策维度**:
  - 源路由支持（`isSourceRouteSupported`）
  - 宿主投影支持（`getHostProjectionDecision`）
  - 控制平面命令支持（`getControlPlaneCommandDecision`）
- **原因码**: `unsupported_source_route`, `unsupported_host_source_projection`, `unsupported_host_direct_projection`, `unsupported_control_plane_command`, `unsupported_workflow_mode`

### 3.5 宿主适配层

#### OpenCode (`opencode.ts`)
- 生成 `.opencode/agents/*.md` 和 `.opencode/commands/*.md`
- 支持 superpowers 和 direct 两种工作流模式
- 实现 lane-aware 子代理执行单元
- 运行时元数据管理（`runtime-agent-metadata.json`）

#### Codex (`codex.ts` + `codex-bootstrap.ts`)
- 生成 `.codex/agents/*.toml`
- 提供 bootstrap 流程，创建本地 plugin bundle
- 支持 marketplace 集成
- 实现 temporary-disable helper

#### Qwen (`qwen.ts`)
- 生成 `.qwen/agents/*.md` 和 `.qwen/commands/*.md`
- Stage 2 设计，保持薄适配层
- 上游 skill 发现机制

#### Claude (`claude.ts`)
- 生成 `.claude/skills/*/SKILL.md`
- 当前仅支持 superpowers 工作流
- Direct mode 故意不支持

### 3.6 上下文系统

#### 上下文索引 (`context-index.ts`)
- 扫描项目中的文档、规格、计划等工件
- 支持 OpenSpec、GSD、Planning 等格式
- 生成 `ContextArtifact` 列表

#### 上下文工件 (`context-artifacts.ts`)
- 定义工件类型：spec, plan, decision, knowledge, checkpoint 等
- 支持权威性分级（authoritative/derived/advisory）
- 新鲜度检查机制

#### 上下文压缩 (`context-compression.ts`)
- 内置压缩引擎（结构化的 Markdown 截断）
- 安全策略评估（safe/conditional/unsafe）
- Resume packet 生成

#### 上下文包 (`context-packs.ts`)
- Pack 选择策略：spec-core, plan-core, knowledge-support
- 基于生命周期阶段和策略配置动态选择

### 3.7 策略治理系统

#### 策略族 (`policy-families.ts`)
- ModelPolicy: 模型偏好、effort、窗口大小
- ContextPolicy: 压缩预设、packet-first、最大字符数
- ToolPolicy: skill/MCP 标签白名单/黑名单

#### 策略选择器 (`policy-selectors.ts`)
- 运行时上下文快照（路径、生命周期阶段、工作流源、角色等）
- Glob 模式匹配（支持 `**/` 等高级模式）

#### 策略解析 (`policy-resolution.ts`)
- 规则匹配和策略合并
- 匹配规则溯源（provenance）

### 3.8 工件物化 (`materialize.ts`)

- **职责**: 将生成的工件安全地写入文件系统
- **关键特性**:
  - 所有权标记系统（OMS 生成标记）
  - 冲突检测（非 OMS 拥有的文件不会被覆盖）
  - 清理过时工件
  - 支持多种宿主目录结构
- **标记类型**: control-plane, route, auxiliary, direct-skill

### 3.9 兼容性监控

#### 兼容性评估 (`superpowers-compatibility.ts`)
- 语义化版本解析和比较
- 兼容性矩阵（OpenCode/Codex）
- 状态：compatible, untested, incompatible, not_detected

#### 检测器 (`superpowers-detectors.ts`)
- OpenCode: 从 `opencode.json` plugin entry 和本地安装路径检测
- Codex: 从标准 clone 路径与 skills symlink 检测
- 详细的故障阶段追踪

## 4. 工作流系统

### 4.1 Superpowers 工作流
- 使用上游 `superpowers` 技能系统
- 固定 phase: brainstorming, writing-plans, subagent-driven-development, requesting-code-review, verification-before-completion, frontend-design, webapp-testing
- 通过 canonical route 映射到上游工作流入口

### 4.2 Direct 工作流
- 用户自定义 intent
- 不依赖上游 superpowers
- 生成 `ai-<intent>` commands 和 `rt-<intent>` agents
- 支持 OpenCode、Codex、Qwen

### 4.3 Gstack 工作流源
- 一等公民级工作流源
- 映射: plan-eng-review, ship, review, qa
- 支持 OpenCode、Codex、Claude Code（Qwen 不支持）

## 5. 扩展机制

### 5.1 Lane 系统
- 按技术栈组织路由（frontend/backend/infra）
- 支持 lane-aware 子代理执行
- 模式：manual/suggest/auto

### 5.2 Context Provider
- 文件型、CLI 型、MCP 型三种提供者
- 能力标签：recall, search, summarize, pack, status
- 生命周期事件集成

### 5.3 Author Routing
- AI 辅助路由配置生成
- 基于仓库信号（package.json、文件结构）
- 模型清单驱动的 profile 建议

## 6. 代码质量特征

### 6.1 类型安全
- 全面使用 TypeScript 严格模式
- Zod 运行时验证与静态类型推导结合
- 详尽的类型定义（如 `CanonicalRouteId`, `WorkflowSourceKind`）

### 6.2 错误处理
- 自定义错误类（`MissingControlPlaneConfigError`）
- 配置恢复机制
- 详细的错误上下文（检测失败阶段追踪）

### 6.3 测试友好
- 依赖注入模式（CliDeps, MaterializeFs 等接口）
- 纯函数设计（路由解析、策略评估）
- 文件系统操作抽象化

### 6.4 模块化
- 单一职责原则（每个模块聚焦一个领域）
- 清晰的依赖关系（避免循环依赖）
- 可组合的函数设计

## 7. 项目边界与限制

### 7.1 明确不做
- 跨宿主配置同步
- upstream superpowers 的安装器或升级器
- 重型多 agent 编排框架

### 7.2 当前限制
- Claude Code 仅支持 superpowers slice
- Qwen 不支持 gstack 投影
- Direct mode 的 `explain` 在 Qwen 和 Claude 上未支持
- 单级 preset 继承（不支持链式 extends）

## 8. 总结

`oh-my-superagents` 展现了优秀的中大型 TypeScript 项目架构设计：

1. **清晰的分层**: 共享核心与薄适配层分离，便于扩展新宿主
2. **强大的配置系统**: 分层、验证、恢复、迁移一应俱全
3. **灵活的上下文管理**: 从索引到压缩的完整上下文生命周期
4. **严谨的策略治理**: 基于运行时上下文的动态策略应用
5. **安全的工件管理**: 所有权标记和冲突检测防止意外覆盖
6. **全面的兼容性监控**: 版本检测、兼容性评估、故障诊断

项目刻意保持"薄适配层"设计，让共享核心承担主要复杂度，这使得新增宿主支持的成本相对较低，同时保证了行为一致性。
