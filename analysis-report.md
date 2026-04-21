# oh-my-superagents 项目架构分析报告

## 1. 项目概述

`oh-my-superagents` 是一个 **OMS (Oh My Superpowers) 控制面与路由系统**，为 AI 编码 CLI 工具提供跨宿主（host）路由能力。它充当 `superpowers` 工作流系统的"操作系统层"，实现统一的工作流编排、配置管理、策略控制与兼容性检测，支持四种宿主平台：**OpenCode**、**Codex**、**Qwen**、**Claude Code**。

- **语言**: TypeScript (ESM, NodeNext)
- **包管理**: pnpm 10.32+
- **构建**: `tsc` → `dist/`
- **测试**: Vitest
- **运行时依赖**: `@opencode-ai/plugin`, `jsonc-parser`, `zod`

---

## 2. 目录结构

```
oh-my-superagents/
├── src/                    # 源代码（43 文件）
│   ├── index.ts            # 库导出入口
│   ├── bin.ts              # CLI 二进制入口
│   ├── plugin.ts           # OpenCode 插件入口
│   ├── cli.ts              # CLI 命令路由与分发
│   ├── config.ts           # 分层配置加载与校验
│   ├── control-plane.ts    # OMS 控制面核心逻辑
│   ├── router.ts           # 通用路由解析器
│   ├── capabilities.ts     # 能力支持矩阵
│   ├── materialize.ts      # 安全的制品写入与清理
│   ├── superpowers-compatibility.ts  # 语义化版本兼容性评估
│   ├── superpowers-detectors.ts      # 宿主相关版本检测
│   ├── author-routing.ts   # AI 辅助路由创作
│   ├── author-policy.ts    # AI 辅助策略创作
│   ├── lane-execution.ts   # Lane 作用域的子代理执行
│   ├── upstream-readiness.ts         # 就绪状态评估
│   ├── config-write.ts     # 原子化配置写入
│   ├── config-recovery.ts  # 配置恢复
│   ├── context-lifecycle.ts          # 上下文生命周期
│   ├── context-index.ts    # 文件系统上下文索引
│   ├── context-artifacts.ts          # 上下文制品类型
│   ├── context-events.ts   # 上下文事件类型
│   ├── context-compression.ts        # 压缩就绪评估
│   ├── context-packs.ts    # 上下文包选择策略
│   ├── context-manifest.ts # 上下文提供者能力
│   ├── context-providers.ts          # 上下文提供者解析
│   ├── context-provider-cli.ts       # CLI 上下文提供者
│   ├── context-provider-mcp.ts       # MCP 上下文提供者
│   ├── policy-families.ts  # 策略类型定义
│   ├── policy-resolution.ts          # 策略解析引擎
│   ├── policy-selectors.ts # 策略选择器匹配
│   ├── authority-config.ts # 权威配置管理
│   ├── openspec.ts         # OpenSpec 制品分类器
│   ├── gstack-detectors.ts # Gstack 可用性检测
│   ├── docs-catalog.ts     # 能力目录与入职问题图
│   ├── workflow-sources.ts # 工作流来源定义
│   ├── workflow-superpowers.ts       # Superpowers 工作流映射
│   ├── workflow-gstack.ts  # Gstack 工作流映射
│   ├── workflow-direct.ts  # Direct 工作流映射
│   ├── opencode.ts         # OpenCode 宿主适配器
│   ├── codex.ts            # Codex 宿主适配器
│   ├── codex-bootstrap.ts  # Codex 引导脚手架
│   ├── qwen.ts             # Qwen 宿主适配器
│   └── claude.ts           # Claude 宿主适配器
├── test/                   # 测试（45 文件）
├── schemas/                # JSON Schema 文件
├── catalogs/               # 静态能力/入职目录
├── docs/                   # 文档
│   ├── ai/                 # AI 生成文档
│   ├── superpowers/        # Superpowers 规范与计划
│   ├── README-architecture.md
│   └── README-architecture.zh-CN.md
├── scripts/                # Docker 金丝雀脚本与文档生成
├── opencode.json           # OpenCode 插件配置
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 七层架构设计

项目采用严格的**分层架构**，核心理念是 **"共享 OMS 核心厚于任何单个宿主适配器"**。从上到下依次为：

### 第一层：控制面核心（~4,316 LOC，中等厚度）

这是整个系统的大脑，包含配置管理、路由分发、CLI 入口和核心状态管理。

| 模块 | 职责 |
|------|------|
| `cli.ts` | CLI 入口：参数解析、命令路由、宿主特定分发、兼容性检查、制品物化编排 |
| `config.ts` | 分层配置加载（全局 + 项目级），JSONC 解析，Zod Schema 校验，遗留配置迁移，Preset/Profile/Lane/Route 定义 |
| `control-plane.ts` | OMS 控制面逻辑：status/use/disable/sync/doctor 命令实现，Lane 状态解析，策略解析，上下文压缩，路由追踪 |

**核心 CLI 命令**:
- `status --host <host>` - 显示 OMS 状态
- `use <preset> --host <host>` - 切换活动预设
- `disable --host <host>` - 禁用 OMS
- `sync --host <host>` - 物化宿主制品
- `doctor --host <host>` - 诊断检查
- `explain --host <host>` - 路由追踪
- `bootstrap --host codex` - Codex 引导
- `author routing` / `author policy` - AI 辅助创作

### 第二层：工作流适配器（~371 LOC，薄层）

将用户可见的阶段名（如 `writing-plans`）规范化为内部路由 ID（如 `phase.plan`），并映射到来源本地条目。

| 模块 | 职责 |
|------|------|
| `router.ts` | 通用路由解析器：通过预设路由、Lane 路由或默认值解析阶段/意图到 Profile |
| `workflow-sources.ts` | 定义工作流来源类型（superpowers/gstack/direct），CanonicalRouteId 类型 |
| `workflow-superpowers.ts` | Superpowers 阶段（brainstorming, writing-plans 等）到规范路由的映射 |
| `workflow-gstack.ts` | Gstack 规范路由到来源条目的映射 |
| `workflow-direct.ts` | 用户定义的意图 ID 到 `intent.*` 路由的映射 |

### 第三层：共享能力策略（~97 LOC，薄层）

| 模块 | 职责 |
|------|------|
| `capabilities.ts` | 集中化支持矩阵：判断哪些宿主/来源/命令组合被支持，返回带原因码的结构化决策 |

**设计原则**：未声明的组合默认关闭（fail-closed）。

### 第四层：宿主适配器（薄到中等）

每个宿主平台一个适配器，负责从共享规范路由模型渲染宿主原生制品。

| 宿主 | 适配器 | 生成制品 |
|------|--------|----------|
| OpenCode | `opencode.ts` | `.opencode/agents/*.md`, `.opencode/commands/*.md` |
| Codex | `codex.ts` + `codex-bootstrap.ts` | `.codex/agents/*.toml`, 插件清单, 技能目录 |
| Qwen | `qwen.ts` | `.qwen/agents/*.md`, `.qwen/commands/*.md` |
| Claude | `claude.ts` | `.claude/skills/*/SKILL.md` |

### 第五层：兼容性监控（~1,093 LOC，中等）

| 模块 | 职责 |
|------|------|
| `superpowers-compatibility.ts` | 基于语义化版本的兼容性评估：解析版本，检查测试/不良范围，返回 compatible/untested/incompatible/not_detected |
| `superpowers-detectors.ts` | 宿主特定检测：读取 OpenCode 插件配置、检查 Codex 仓库克隆、解析 Git 标签/提交 |

### 第六层：制品协调（~712 LOC，薄到中等）

| 模块 | 职责 |
|------|------|
| `materialize.ts` | 安全制品写入与清理：通过标记（ownership markers）检测所有权，过期制品协调，宿主特定清理规则 |

### 第七层：支撑基础设施

上下文管理、策略引擎、配置安全等。

| 模块组 | 包含 |
|--------|------|
| 上下文子系统 | `context-lifecycle.ts`, `context-index.ts`, `context-artifacts.ts`, `context-events.ts`, `context-compression.ts`, `context-packs.ts`, `context-manifest.ts`, `context-providers.ts`, `context-provider-cli.ts`, `context-provider-mcp.ts` |
| 策略子系统 | `policy-families.ts`, `policy-resolution.ts`, `policy-selectors.ts` |
| 配置安全 | `config-write.ts`（原子写入 + 恢复快照）, `config-recovery.ts`（最近已知良好配置回退） |
| 其他 | `authority-config.ts`, `openspec.ts`, `gstack-detectors.ts`, `docs-catalog.ts`, `lane-execution.ts`, `upstream-readiness.ts` |

---

## 4. 关键设计模式

### 4.1 分层配置架构

配置从两个来源加载：
1. **全局** `~/.config/oh-my-superagents/config.jsonc`
2. **项目级** `./oh-my-superagents.config.jsonc`

项目级配置覆盖全局配置。旧版单预设配置自动迁移。

### 4.2 规范路由模型

```
用户可见阶段名 → 规范路由 ID → 来源本地条目
writing-plans  → phase.plan   → superpowers/writing-plans
                               → gstack/plan-eng-review
```

### 4.3 Preset / Profile / Lane 三级路由

- **Preset（预设）**: 工作模式（default, review 等）
- **Lane（通道）**: 技术栈路由包（frontend, backend, infra）
- **Profile（配置档）**: 叶子节点，包含可执行设置（模型、上下文策略等）

### 4.4 宿主适配器模式

每个宿主平台的适配器只负责**渲染/翻译**，不重新实现路由逻辑。适配器从共享的规范路由模型读取数据，输出宿主原生格式的制品。

### 4.5 依赖注入

CLI 模块使用 `CliDeps` 接口注入所有外部依赖（文件系统、配置加载、制品构建、兼容性检查），实现完全可测试。

### 4.6 能力策略注册表

`capabilities.ts` 集中声明每个宿主/来源/命令组合的支持状态，未声明的组合默认拒绝。

### 4.7 所有权标记

生成的制品包含 HTML 注释标记：
```html
<!-- generated-by: oh-my-superagents -->
<!-- oms-control-plane: ... -->
<!-- oms-route: ... -->
```
用于安全的清理和过期检测。

### 4.8 原子写入

配置写入通过临时文件 + 原子重命名完成，并保留最近已知良好配置的快照用于回退。

### 4.9 就绪状态分离

诊断系统刻意分离四个关注点：**支持状态**、**可用性**、**兼容性**、**同步状态**，避免将其扁平化为单一标志。

---

## 5. 工作流模式

### 5.1 Superpowers 模式

路由通过上游 `superpowers` 工作流阶段（brainstorming, writing-plans, subagent-driven-development 等），支持来源感知路由（也可通过 `gstack` 路由）。

### 5.2 Direct 模式

用户自定义意图，无上游依赖。每个意图生成 `ai-<intent>` 命令和 `rt-<intent>` 代理。

---

## 6. 入口点

| 入口 | 文件 | 用途 |
|------|------|------|
| CLI 二进制 | `dist/bin.js` → `src/bin.ts` | `npx oh-my-superagents <command>` |
| OpenCode 插件 | `dist/plugin.js` → `src/plugin.ts` | 启动诊断 + `codexFast` 钩子 |
| 库 | `dist/index.js` → `src/index.ts` | 编程接口 |
| 配置 Schema | `schemas/oh-my-superagents.schema.json` | JSON Schema 配置校验 |

---

## 7. 测试体系

- **框架**: Vitest（Node 环境）
- **测试数**: 45 个测试文件，与源文件一一对应
- **类型检查**: `public-api-config-typecheck.ts`, `public-api-context-providers-typecheck.ts`
- **运行命令**: `pnpm test` → `vitest run`

---

## 8. 构建与部署

| 命令 | 作用 |
|------|------|
| `pnpm build` | `rm -rf dist && tsc -p tsconfig.json` |
| `pnpm check` | `tsc --noEmit` + 公共 API 类型检查 |
| `pnpm test` | `vitest run` |
| `pnpm docs:ai` | AI 文档生成 |

- **输出**: `dist/` 目录，包含 `.js` + `.d.ts` 文件（ESM, NodeNext）
- **目标**: ES2022
- **发布**: npm 包

---

## 9. 架构评价

### 优势

1. **高内聚低耦合**：七层架构职责清晰，核心逻辑与宿主适配严格分离
2. **可扩展性**：新增宿主平台只需添加一个薄适配器
3. **配置灵活性**：三级路由模型（Preset/Lane/Profile）提供精细控制
4. **安全性**：原子写入、所有权标记、配置回退机制
5. **可观测性**：就绪状态分离诊断、路由追踪、兼容性评估
6. **测试覆盖**：每个源模块对应一个测试文件，依赖注入设计提升可测性

### 改进空间

1. **缺少 Copilot CLI 宿主适配器**：当前仅支持 OpenCode、Codex、Qwen、Claude 四种宿主，尚未覆盖 GitHub Copilot CLI
2. **文档分散**：AI 生成文档、架构文档、Superpowers 规范分散在多个目录
3. **上下文子系统未完全集成**：上下文压缩、上下文提供者等模块定义完整但尚未在核心流程中完全落地
4. **策略引擎为骨架实现**：策略解析和选择器框架已建立，但实际策略规则较少

---

## 10. 结论

`oh-my-superagents` 是一个设计精良的控制面系统，其分层架构、规范路由模型、宿主适配器模式使其天然具备多平台扩展能力。当前最关键的缺失是 **Copilot CLI 宿主深度支持**——这需要新增 Copilot CLI 适配器，并完善 Agent + Plugin + Hooks 架构以支持 Copilot CLI 独特的扩展机制。
