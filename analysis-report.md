# oh-my-superagents 项目架构分析报告

## 一、项目概述

**oh-my-superagents** 是一个 AI CLI 路由与控制平面系统（v0.1.0，MIT 许可证），为 OpenCode、Codex (Copilot CLI)、Qwen、Claude Code 四种 AI CLI 宿主平台提供统一的**工作流路由**与**控制平面**能力。

### 核心能力

- **工作流路由**：将内置 `superpowers` phase（如 brainstorming、writing-plans）规范化为 canonical route（如 `phase.plan`），再通过 source adapter 映射到宿主原生工件。
- **控制平面命令**：`status`、`use`、`disable`、`sync`、`doctor`、`explain`、`bootstrap`。
- **直接模式（Direct Mode）**：实验性功能，允许用户定义自定义 intents，不依赖上游 `superpowers`。
- **兼容性监控**：检测上游 `superpowers` 安装版本是否在 OMS 测试矩阵内。
- **工件生成与同步**：为各宿主生成 agents、commands、skills 等工件文件。

### 核心设计原则

> 共享 OMS 核心比任何单个宿主适配层更厚，确保宿主特定代码可替换，同时保持路由、预设、兼容性检查等的一致性。

---

## 二、目录结构

| 目录/文件 | 用途 |
|---|---|
| `src/` | 43 个 TypeScript 源文件，全部核心逻辑 |
| `test/` | 45 个测试文件，使用 Vitest |
| `dist/` | TypeScript 编译输出 |
| `schemas/` | 3 个 JSON Schema 文件（配置、能力目录、入职问题图） |
| `catalogs/` | 2 个 JSON 目录文件（OMS 能力、入职问题图） |
| `docs/` | 架构说明（中英文）、AI 文档、superpowers 规格文档 |
| `scripts/` | Docker canary 脚本、AI 文档生成脚本 |
| `.agents/` | superpowers 子目录，含规格文档 |
| `node_modules/` | 依赖 |
| `.tmp/` | 临时文件 |

---

## 三、源文件架构详解（43 个文件）

### 3.1 入口与导出

| 文件 | 功能 |
|---|---|
| `src/bin.ts` | CLI 入口点，接收 `process.argv`，调用 `runCli()` |
| `src/plugin.ts` | OpenCode 插件入口，加载配置 → 检测兼容性 → 返回 `chat.params` 钩子 |
| `src/index.ts` | 库导出入口，重导出所有模块的 public API |

### 3.2 控制平面核心

| 文件 | 行数 | 功能 |
|---|---|---|
| `src/config.ts` | ~1502 | **配置系统核心**：完整的 Zod schema 体系，分层配置加载（全局 + 项目叠加），遗留配置迁移，preset 继承 |
| `src/control-plane.ts` | ~1779 | **控制平面核心逻辑**：`resolveControlPlane()` 中央协调函数，状态机构建，路由追踪，就绪度评估 |
| `src/cli.ts` | ~3500+ | **CLI 命令实现**：所有控制平面命令的实现（status/use/disable/sync/doctor/explain/bootstrap/author routing/author policy） |

### 3.3 工作流适配层

| 文件 | 行数 | 功能 |
|---|---|---|
| `src/router.ts` | 188 | **路由解析核心**：`resolveRoute()` 中央路由函数，支持 preset/lane 路由 |
| `src/workflow-superpowers.ts` | 92 | 定义 7 个内置 phase → canonicalRoute 映射 |
| `src/workflow-gstack.ts` | 22 | 4 个 canonical route 的 gstack 映射 |
| `src/workflow-sources.ts` | 52 | 工作流源抽象：`WorkflowSourceKind`、`CanonicalRouteId` |
| `src/workflow-direct.ts` | 17 | 直接模式工作流源 |

### 3.4 宿主适配层

| 文件 | 行数 | 宿主 | 生成格式 |
|---|---|---|---|
| `src/opencode.ts` | 633 | OpenCode | `.opencode/agents/*.md` + `.opencode/commands/*.md` |
| `src/codex.ts` | 197 | Codex (Copilot CLI) | `.codex/agents/*.toml` |
| `src/codex-bootstrap.ts` | 563 | Codex | 完整的 plugin bundle 引导流程 |
| `src/qwen.ts` | 424 | Qwen | `.qwen/agents/*.md` + `.qwen/commands/*.md` |
| `src/claude.ts` | 138 | Claude Code | `.claude/skills/*/SKILL.md` |

### 3.5 兼容性与检测系统

| 文件 | 行数 | 功能 |
|---|---|---|
| `src/superpowers-compatibility.ts` | 526 | 兼容性评估引擎：semver 解析/比较/范围匹配 |
| `src/superpowers-detectors.ts` | 567 | 上游检测器：从 opencode.json 插件条目和路径检测 |
| `src/upstream-readiness.ts` | 145 | 就绪度评估：支持性、可用性、兼容性分开评估 |
| `src/gstack-detectors.ts` | 80 | gstack 检测器 |

### 3.6 策略系统

| 文件 | 行数 | 功能 |
|---|---|---|
| `src/capabilities.ts` | 97 | 共享能力策略：宿主/工作流/命令能力决策 |
| `src/policy-families.ts` | 111 | 策略族定义：ModelPolicy、ContextPolicy、ToolPolicy |
| `src/policy-resolution.ts` | 50 | 策略解析：匹配并合并策略 |
| `src/policy-selectors.ts` | 110 | 策略选择器：RuntimeContextSnapshot 类型定义 |

### 3.7 上下文系统

| 文件 | 行数 | 功能 |
|---|---|---|
| `src/context-lifecycle.ts` | 81 | 10 个生命周期阶段定义 |
| `src/context-artifacts.ts` | 74 | 上下文工件模型 |
| `src/context-index.ts` | 137 | 上下文索引构建 |
| `src/context-compression.ts` | 224 | 上下文压缩 |
| `src/context-packs.ts` | 142 | 上下文包选择 |
| `src/context-events.ts` | 16 | 生命周期事件 |
| `src/context-manifest.ts` | 190 | 上下文提供者清单验证 |
| `src/context-providers.ts` | 113 | 上下文提供者解析 |
| `src/context-provider-cli.ts` | 72 | CLI 上下文提供者 |
| `src/context-provider-mcp.ts` | 344 | MCP 上下文提供者（JSON-RPC 2.0 over stdio） |

### 3.8 其他模块

| 文件 | 行数 | 功能 |
|---|---|---|
| `src/materialize.ts` | 712 | 工件物化引擎：磁盘写入、冲突检测、所有权标记、陈旧文件清理 |
| `src/author-routing.ts` | 414 | AI 辅助路由编写 |
| `src/author-policy.ts` | 58 | AI 辅助策略编写 |
| `src/authority-config.ts` | 68 | 权限配置类型 |
| `src/config-write.ts` | 72 | 原子配置写入 |
| `src/config-recovery.ts` | 18 | 配置恢复 |
| `src/lane-execution.ts` | 85 | Lane 执行单元 |
| `src/openspec.ts` | 13 | OpenSpec 分类器 |
| `src/docs-catalog.ts` | 56 | 文档目录解析 |

---

## 四、架构设计分析

### 4.1 三层架构

```
┌─────────────────────────────────────────────────────┐
│                  宿主适配层 (Thin)                    │
│  opencode.ts  codex.ts  qwen.ts  claude.ts          │
├─────────────────────────────────────────────────────┤
│                  工作流适配层                         │
│  router.ts  workflow-superpowers.ts                 │
│  workflow-gstack.ts  workflow-direct.ts              │
├─────────────────────────────────────────────────────┤
│                  控制平面核心 (Thick)                  │
│  config.ts  control-plane.ts  cli.ts                 │
│  策略系统  上下文系统  兼容性系统  物化引擎           │
└─────────────────────────────────────────────────────┘
```

### 4.2 路由流程

```
用户输入 (phase name)
    ↓
resolveRoute() → 检查 preset/lane 路由 → 确定 profileId
    ↓
resolvePhase() → phase → canonicalRouteId (phase.*)
    ↓
getWorkflowSourceEntry() → 确定 source (superpowers/gstack/direct)
    ↓
buildArtifacts() → 宿主特定工件生成
    ↓
materializeArtifacts() → 写入磁盘
```

### 4.3 配置加载流程

```
全局配置 (~/.config/oh-my-superagents/config.jsonc)
    ↓ 叠加
项目配置 (./oh-my-superagents.config.jsonc)
    ↓
loadControlPlaneConfig() → finalizeConfig() → 验证
    ↓
resolvePresetReuse() → 处理 extends 继承
    ↓
validateSourceRouting() → validateLaneTargets()
```

---

## 五、关键技术决策

### 5.1 Zod Schema 驱动配置

所有配置类型通过 Zod schema 定义，提供运行时类型安全和验证。支持复杂类型如 discriminated union、recursive types、transform/pipeline。

### 5.2 Canonical Route 抽象

引入中间抽象层 `canonicalRouteId`（`phase.*` / `intent.*`），解耦用户输入与宿主实现，使路由系统可扩展。

### 5.3 原子配置写入

通过临时文件 + rename 实现原子写入，配合 last-known-good 快照，确保配置写入失败时可恢复。

### 5.4 MCP 客户端

内置完整的 MCP (Model Context Protocol) 客户端实现，支持 JSON-RPC 2.0 over stdio，提供 tools/list 和 tools/call 能力。

---

## 六、可扩展性模式

1. **工作流源扩展**：实现 `WorkflowSourceKind` → 在 `workflow-sources.ts` 注册 → 在 `capabilities.ts` 添加分支 → 自动路由解析
2. **宿主适配扩展**：实现类似 `opencode.ts` 的适配器 → 在 `cli.ts` 集成 → 在 `capabilities.ts` 声明能力
3. **策略规则扩展**：在 `policy-families.ts` 添加策略族 → 在 `config.ts` 添加 schema → 在 `policy-selectors.ts` 添加 selector
4. **上下文提供者扩展**：在 `context-manifest.ts` 添加能力 → 在 `context-providers.ts` 添加 kind
5. **控制平面命令扩展**：在 `config.ts` 添加命令 key → 在 `cli.ts` 添加处理逻辑 → 在各适配器添加工件生成

---

## 七、依赖关系

### 生产依赖
- `@opencode-ai/plugin`（^1.2.24）：OpenCode 插件接口
- `jsonc-parser`（^3.3.1）：JSONC 格式解析
- `zod`（^3.24.2）：运行时类型验证

### 开发依赖
- `@types/node`（^22.13.10）
- `typescript`（^5.8.2）
- `vitest`（^3.1.1）

---

## 八、总结

oh-my-superagents 采用**共享核心 + 薄适配器**模式，通过 43 个源文件实现了一个完整、健壮的 AI CLI 路由与控制平面系统。代码质量高，类型安全通过 Zod + TypeScript 双重保障，测试覆盖全面（45 个测试文件）。架构设计清晰，各层职责分明，为未来扩展留下了明确的模式指引。

### 关键优势

- **分层解耦**：控制平面核心、工作流适配、宿主适配三层清晰分离
- **类型安全**：Zod schema + TypeScript 双重保障
- **测试覆盖**：45 个测试文件覆盖几乎所有模块
- **可扩展**：五种扩展模式文档化
- **容错设计**：原子写入 + 配置快照恢复
