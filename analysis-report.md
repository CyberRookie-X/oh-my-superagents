# oh-my-superagents 项目架构分析报告

## 1. 整体架构概览

### 1.1 项目定位

`oh-my-superagents` (OMS) 是一个 evolving 的路由和控制平面产品，为 AI 编程助手（OpenCode、Codex、Qwen、Claude Code）提供宿主原生路由和 superpowers 工作流支持。

**核心设计目标：**
- 从 `superpowers` 优先的路由器演进为更通用的路由和控制平面产品
- 保持共享 OMS 核心比任何单个宿主适配器更厚
- 支持实验性的宿主原生直接模式（direct mode）

### 1.2 七层架构设计

```
┌─────────────────────────────────────────────────────────┐
│  Layer 7: Docs and Plans                                │
│  docs/superpowers/specs/, docs/superpowers/plans/       │
├─────────────────────────────────────────────────────────┤
│  Layer 6: Artifact Reconciliation (materialize.ts)      │
│  写生成工件、检测 OMS 所有权、清理过时工件               │
├─────────────────────────────────────────────────────────┤
│  Layer 5: Compatibility Monitor                         │
│  superpowers-compatibility.ts, superpowers-detectors.ts │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Host Adapters                                 │
│  opencode.ts, codex.ts, qwen.ts, claude.ts              │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Shared Capability Policy (capabilities.ts)    │
│  源 - 宿主 - 命令组合的支持决策                          │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Workflow Adapters                             │
│  router.ts, workflow-direct.ts, workflow-superpowers.ts │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Control Plane Core                            │
│  control-plane.ts, config.ts, cli.ts                    │
└─────────────────────────────────────────────────────────┘
```

### 1.3 代码厚度分布

| 层级 | 主要文件 | 约 LOC | 厚度 |
|------|---------|--------|------|
| OMS 控制平面核心 | control-plane.ts, config.ts, cli.ts | ~6,600 | Medium |
| Workflow 适配器 | router.ts + workflow-*.ts | ~650 | Thin |
| 共享能力策略 | capabilities.ts | 97 | Thin |
| OpenCode 适配器 | opencode.ts | 633 | Thin |
| Codex 适配器 + bootstrap | codex.ts + codex-bootstrap.ts | ~1,000 | Medium |
| Qwen 适配器 | qwen.ts | 424 | Thin |
| Claude 适配器 | claude.ts | 138 | Thin |
| 兼容性监控 | superpowers-compatibility.ts + detectors.ts | ~1,100 | Medium |
| 工件协调 | materialize.ts | 712 | Thin-to-medium |

**关键设计信号：** 共享 OMS 核心 (~6,600 LOC) 明显厚于任何单个宿主适配器，验证了"核心厚、适配器薄"的架构原则。

---

## 2. 核心模块详细分析

### 2.1 Control Plane Core (`src/control-plane.ts`, `src/config.ts`, `src/cli.ts`)

**职责：**
- 分层配置加载（全局 + 项目级 `oh-my-superagents.config.jsonc`）
- 传统配置迁移
- Preset 选择与复用解析
- 命令前缀和别名解析
- OMS CLI 命令行为（status/use/disable/sync/doctor）
- 诊断信息合成（不将支持、可用性、兼容性、同步状态合并为单一标志）

**关键数据结构：**
```typescript
type ResolvedControlPlane = {
  source: { kind: "default" | "file"; path?: string; sources: string[] }
  config: ControlPlaneConfig
  activePreset: { key: string; preset: ControlPlanePreset }
  laneState: { allowedLanes: string[]; effectiveLane?: string; mode: string }
  contextProviders: ResolvedContextProvider[]
  contextIndex?: ContextIndex
  policyResolution?: ResolvedPolicyFamilies
  contextCompression?: { policy; selection; readiness; engineBundle }
  effectiveSources: Partial<Record<CanonicalRouteId, WorkflowSourceKind>>
}
```

**设计亮点：**
- 配置加载支持多层覆盖（global → project）
- 恢复机制（recovery snapshot）确保配置安全
- 诊断系统明确区分四个问题：support、availability、compatibility、sync state

### 2.2 Router (`src/router.ts`)

**职责：**
- 将内置 OMS phase 输入（如 `writing-plans`）规范化为真规范路由 ID（如 `phase.plan`）
- 通过源适配器将规范路由映射到源原生条目（如 `superpowers/writing-plans` 或 `gstack/plan-eng-review`）
- 保持 `superpowers` 作为一等公民工作流适配器
- 支持 direct mode 解析用户定义的 intents

**路由解析流程：**
```
routeId (e.g., "writing-plans")
    ↓
resolveCanonicalRoute() → "phase.plan"
    ↓
resolveEffectiveSources() → { "phase.plan": "superpowers" }
    ↓
resolveRoute() → ResolvedRoute {
  routeId, canonicalRoute, profileId, routeSource,
  resolvedSource, sourceEntry, selection, description
}
```

**关键设计：**
- 规范路由模型使宿主适配器不依赖源原生工作流名称
- 支持 lane 维度的路由覆盖
- routeSource 追踪路由来源（preset-route / lane-route / lane-default / preset-default）

### 2.3 Workflow Sources (`src/workflow-sources.ts`, `workflow-superpowers.ts`, `workflow-gstack.ts`, `workflow-direct.ts`)

**三种工作流源：**
1. **superpowers** - 上游 superpowers 工作流
2. **gstack** - gstack 工作流适配器
3. **direct** - 用户定义的 intents（实验性）

**规范路由 ID 模式：**
- `phase.${string}` - 用于 superpowers/gstack
- `intent.${string}` - 用于 direct mode

### 2.4 Host Adapters

**OpenCode (`src/opencode.ts`):**
- 原生插件入口点
- 项目级 agents 和 commands
- 生成 `.opencode/agents/*.md` 和 `.opencode/commands/*.md`
- 支持 temporary disable helper 和 codexFast

**Codex (`src/codex.ts`, `src/codex-bootstrap.ts`):**
- 项目级 agents
- 本地插件 bundle 和市场入口
- 生成 `.codex/agents/*.toml`
- bootstrap 层独立于路由工件

**Qwen (`src/qwen.ts`):**
- 项目级 agents 和 commands
- 生成 `.qwen/agents/*.md` 和 `.qwen/commands/*.md`
- 当前支持范围窄于 OpenCode/Codex

**Claude (`src/claude.ts`):**
- 项目级 skills（`.claude/skills/*/SKILL.md`）
- 仅支持 superpowers 工作流切片
- 无 direct mode 投影

### 2.5 Capability Policy (`src/capabilities.ts`)

**职责：**
- 保持源适配器专注于定义规范路由的上游条目
- 能力注册表决定 OMS 是否支持源 - 路由 - 宿主组合
- 返回结构化的支持决策和原因代码

**原因代码：**
- `unsupported_source_route`
- `unsupported_host_source_projection`
- `unsupported_host_direct_projection`
- `unsupported_control_plane_command`
- `unsupported_workflow_mode`

**设计价值：**
- 路由解析和支持策略分离
- Fail-closed 支持规则在新源/宿主/命令添加时保持一致
- 适配器更薄，更多支持矩阵逻辑集中到单一策略表面

### 2.6 Compatibility Monitor (`src/superpowers-compatibility.ts`, `src/superpowers-detectors.ts`)

**职责：**
- 检测上游 superpowers 安装状态
- 针对本地兼容性矩阵评估
- 返回 `compatible` / `untested` / `incompatible` / `not_detected`

**兼容性矩阵：**
```typescript
const SUPERPOWERS_COMPATIBILITY = {
  opencode: {
    minimumSupportedVersion: "5.0.0",
    testedRanges: [">=5.0.0 <6.0.0"],
    knownBadRanges: [],
  },
  codex: { /* ... */ }
}
```

**为什么是 Medium 厚度：**
- 检测是宿主特定的，但策略是共享的
- 跨宿主共享的兼容性逻辑
- 包含完整的语义版本解析和范围匹配实现

### 2.7 Artifact Reconciliation (`src/materialize.ts`)

**职责：**
- 安全地写生成工件
- 检测 OMS 拥有的工件（通过 marker 注释）
- 在重命名或前缀更改后协调过时的宿主工件

**所有权标记：**
```typescript
// Control Plane 命令标记
<!-- oms-control-plane: stage=1; host=opencode; artifact=command; logical-command=status; rendered-name=oms-status -->

// Route 投影标记
<!-- oms-route: stage=1; host=opencode; source=superpowers; route=phase.plan; projection=agent; rendered-name=spr-plan -->
```

**为什么独立分层：**
- 每个宿主最终需要相同的所有权和清理保证
- 集中式清理比在每个适配器内更易推理

---

## 3. 数据流与控制流分析

### 3.1 配置加载流程

```
loadControlPlaneConfig()
    ↓
1. 读取全局配置 (~/.oh-my-superagents.config.jsonc)
2. 读取项目配置 (./oh-my-superagents.config.jsonc)
3. 合并配置（项目覆盖全局）
4. 应用传统迁移
5. 验证配置（Zod schema）
6. 返回 LoadedControlPlaneConfig
```

### 3.2 路由解析流程

```
resolveControlPlane()
    ↓
1. 加载配置 → LoadedControlPlaneConfig
2. 解析 activePreset（支持 preset 复用）
3. 解析 lane 状态（manual/suggest/auto 模式）
4. 解析 effectiveSources（规范路由 → 工作流源）
5. 解析 policy families（基于 selector）
6. 构建 context index
7. 评估 context compression readiness
8. 返回 ResolvedControlPlane
```

### 3.3 CLI 命令执行流程（以 `status` 为例）

```
oms status --host opencode
    ↓
1. resolveControlPlane() 获取控制平面状态
2. detectOpenCodeSuperpowers() 检测上游
3. evaluateSuperpowersCompatibility() 评估兼容性
4. evaluateProjectionReadiness() 评估投影就绪性
5. buildOpenCodeStatusState() 合成状态
6. buildOpenCodeNextAction() 生成下一步建议
7. 输出 JSON/人类可读格式
```

### 3.4 工件生成流程

```
buildArtifacts(config, host)
    ↓
1. 遍历所有 phase/intent 路由
2. 为每个路由解析 ResolvedRoute
3. 渲染宿主原生工件：
   - OpenCode: renderAgentFile(), renderCommandFile()
   - Codex: renderCodexAgentToml()
   - Qwen: renderQwenAgentMarkdown()
   - Claude: renderClaudeSkill()
4. 添加所有权 marker 注释
5. 返回 GeneratedArtifact[]
    ↓
materializeArtifacts()
    ↓
1. 扫描目标目录现有文件
2. 识别 OMS 拥有的文件（通过 marker）
3. 写入/更新新生成的工件
4. 删除过时的 OMS 工件
5. 返回 MaterializeArtifactsResult
```

### 3.5 插件运行时流程（OpenCode）

```
OhMySuperpowersPlugin 启动
    ↓
1. 加载 router config
2. 报告兼容性诊断（如果配置有效）
3. 注册 chat.params hook
    ↓
chat.params hook 触发
    ↓
1. 读取 runtime agent metadata
2. 如果 agent 配置了 codexFast → 设置 serviceTier="fast"
```

---

## 4. 设计模式与最佳实践

### 4.1 分层架构（Layered Architecture）

项目采用清晰的七层架构，每层职责单一：
- **核心层厚**：共享逻辑集中（控制平面、兼容性监控）
- **适配器层薄**：宿主特定代码最小化
- **边界清晰**：层与层之间通过类型化接口通信

### 4.2 规范路由模型（Canonical Route Model）

**问题：** 不同工作流源有不同的 phase 命名约定

**解决方案：**
```typescript
// 用户输入： "writing-plans"
// 规范化：   "phase.plan"
// 源映射：   "phase.plan" → "superpowers/writing-plans"
// 宿主投影： "superpowers/writing-plans" → "spr-plan.md"
```

**优势：**
- 内部路由契约与源原生名称解耦
- 添加新工作流源无需修改宿主适配器
- 支持源覆盖（source override）

### 4.3 能力策略模式（Capability Policy Pattern）

**问题：** 支持矩阵（源 × 宿主 × 命令）逻辑分散导致不一致

**解决方案：**
```typescript
// 集中式策略决策
function getHostProjectionDecision(input: {
  host: CapabilityHost
  workflowKind: WorkflowKind
  sourceEntry: WorkflowSourceEntry
}): CapabilityDecision {
  if (host === "claude" && workflowKind === "direct") {
    return { supported: false, reasonCode: "unsupported_host_direct_projection" }
  }
  return { supported: true }
}
```

**优势：**
- Fail-closed 默认行为
- 原因代码支持精确诊断
- 新宿主/源添加时易于审计

### 4.4 工件所有权标记（Artifact Ownership Markers）

**问题：** 如何区分 OMS 生成的工件和用户手动创建的工件？

**解决方案：** HTML 注释标记
```markdown
<!-- oms-route: stage=1; host=opencode; source=superpowers; route=phase.plan; projection=agent; rendered-name=spr-plan -->
```

**解析逻辑：**
```typescript
function hasArtifactOwnershipMarker(content: string): boolean {
  return getMarkerLine(content)?.includes(MARKER_TEXT) ?? false
}
```

**优势：**
- 对宿主透明（作为注释）
- 支持安全清理（只删除 OMS 拥有的文件）
- 支持重命名迁移（通过 marker 识别旧名称）

### 4.5 分层配置与恢复（Layered Config with Recovery）

**配置优先级：**
1. 项目级配置（最高优先级）
2. 全局级配置
3. 内置默认值

**恢复机制：**
- 配置写入前创建 recovery snapshot
- 写入失败时回滚到 last-known-good
- 支持手动恢复命令

### 4.6 诊断分离原则（Diagnostic Separation）

**四种诊断状态明确区分：**
| 状态 | 问题 | 来源 |
|------|------|------|
| support | OMS 能否投影此路由/命令？ | capabilities.ts |
| availability | 上游依赖是否可检测？ | upstream-readiness.ts |
| compatibility | 上游版本是否在测试矩阵内？ | superpowers-compatibility.ts |
| sync state | OMS 工件是否存在且同步？ | materialize.ts / 适配器 |

**优势：**
- 精确的错误定位
- 避免将不同问题混为一谈
- 支持渐进式修复（先解决 support，再解决 availability 等）

### 4.7 类型驱动开发（Type-Driven Development）

**Zod Schema 验证：**
```typescript
const ProfileSchema = z.object({
  model: z.string().min(1),
  variant: z.string().min(1).optional(),
  effort: z.enum(["fast", "balanced", "deep", "max"]).optional(),
  codexFast: z.boolean().optional(),
  temperature: z.number().optional(),
}).strict()
```

**优势：**
- 运行时验证与类型推断一致
- 配置错误早期发现
- 文档即代码（schema 即文档）

---

## 5. 代码质量评估

### 5.1 可维护性

**优势：**
- 清晰的层边界和职责分离
- 一致的命名约定（如 `resolve*`, `build*`, `render*` 前缀）
- 类型定义集中（主要在 `config.ts` 和 `control-plane.ts`）
- 配置驱动而非硬编码

**改进空间：**
- `cli.ts` (3,084 LOC) 过大，可进一步拆分
- 部分跨层依赖（如 `control-plane.ts` 导入 `context-*` 模块）可增加抽象层

### 5.2 可扩展性

**优势：**
- 添加新宿主只需实现 thin adapter 层
- 添加新工作流源只需扩展 `workflow-sources.ts` 和 capability policy
- 规范路由模型支持无缝集成新 phase/intent

**扩展点：**
1. 新宿主：实现 `build[Host]Artifacts()` + CLI 集成
2. 新工作流源：实现 `get[Source]SourceEntry()` + capability 规则
3. 新 CLI 命令：扩展 `CONTROL_PLANE_COMMAND_KEYS` + capability 规则

### 5.3 测试覆盖

**测试文件：**
- `test/` 目录包含公共 API 类型检查测试
- 使用 Vitest 作为测试框架

**建议：**
- 增加单元测试覆盖率（特别是 `control-plane.ts`、`router.ts`）
- 添加集成测试验证端到端工作流
- 添加 snapshot 测试验证生成工件格式

### 5.4 文档质量

**现有文档：**
- `README.md` / `README.zh-CN.md` - 项目概述和支持矩阵
- `docs/README-architecture.md` - 架构详解
- `docs/superpowers/specs/` - 设计文档（20+ 篇）
- `docs/superpowers/plans/` - 实施计划（15+ 篇）

**优势：**
- 设计文档先于实现（spec-driven development）
- 中英文双语文档
- 架构文档清晰解释分层和权衡

---

## 6. 技术债务与改进建议

### 6.1 已识别的技术债务

1. **CLI 文件过大** (`cli.ts`: 3,084 LOC)
   - 建议：按命令拆分为 `cli-status.ts`、`cli-use.ts`、`cli-sync.ts` 等

2. **宿主不对称性**
   - Claude 和 Qwen 支持范围窄于 OpenCode/Codex
   - 建议：文档化明确的路线图或标记为"community contributions welcome"

3. **实验性功能标记**
   - Direct mode 标记为 experimental
   - 建议：明确 graduation criteria 和稳定化时间表

### 6.2 架构改进建议

1. **增加抽象层**
   - 在 `control-plane.ts` 和 `context-*` 模块之间增加 facade
   - 减少核心模块的直接依赖

2. **统一错误处理**
   - 当前错误处理分散在各层
   - 建议：引入统一错误类型和错误码系统

3. **配置验证增强**
   - 当前 Zod schema 验证在加载时
   - 建议：增加跨字段验证（如 profile 引用完整性）

4. **日志系统**
   - 当前日志通过 `console.log` 和插件日志
   - 建议：引入结构化日志系统（支持级别、上下文、格式化）

### 6.3 工程实践建议

1. **CI/CD 增强**
   - 添加自动版本检测和兼容性矩阵更新
   - 添加生成工件的 snapshot 测试

2. **开发者体验**
   - 添加 `dev` 脚本支持热重载
   - 添加 `debug` 模式输出详细诊断信息

3. **用户诊断**
   - 增强 `doctor` 命令输出（如配置树、路由图）
   - 添加 `dry-run` 模式预览工件变更

### 6.4 产品路线图建议

**短期（1-2 个月）：**
- Direct mode 稳定化（明确 graduation criteria）
- Claude Code direct mode 支持
- 增强 `explain` 命令输出可视化

**中期（3-6 个月）：**
- 添加更多工作流源（如自定义 LLM 编排器）
- 支持配置热重载
- 增加图形化配置编辑器

**长期（6+ 个月）：**
- 支持多项目配置同步（可选）
- 插件生态系统（第三方工作流源）
- AI 辅助配置生成和优化

---

## 7. 总结

`oh-my-superagents` 展示了一个精心设计的多宿主路由和控制平面系统。其核心架构原则——"共享核心厚、宿主适配器薄"——得到了良好执行。规范路由模型、能力策略模式、工件所有权标记等设计模式为系统提供了良好的可扩展性和可维护性。

**关键优势：**
- 清晰的分层架构
- 类型驱动的开发方法
- 设计文档先于实现
- 诊断系统精确分离不同问题

**主要挑战：**
- CLI 模块过大需要重构
- 宿主支持不对称需要文档化或平衡
- 实验性功能需要明确稳定化路径

**推荐优先级：**
1. 重构 `cli.ts` 为模块化结构
2. 增加测试覆盖率（特别是核心模块）
3. 完善 Direct mode 文档和稳定化标准
4. 增强诊断输出和开发者工具

---

*报告生成时间：2026-04-23*
*分析基于 commit: ad76b0c*
