# oh-my-superagents 项目架构深度分析报告

## 1. 项目概述

**oh-my-superagents**（OMS）是一个面向 AI 编程助手的路由与控制平面工具。它为多个 AI CLI 平台提供宿主原生产物生成和工作流路由，当前支持的宿主包括：

- **OpenCode**（主要宿主，同时也是插件载体）
- **Codex**（OpenAI）
- **Qwen Code**（阿里巴巴）
- **Claude Code**（Anthropic）

核心能力：
- 读取分层配置（`oh-my-superagents.config.jsonc`），支持全局和项目级配置合并
- 将 `superpowers` 工作流阶段解析为规范路由（如 `phase.brainstorm`、`phase.plan`）
- 支持实验性的 **direct 模式**，允许用户自定义意图路由（无需上游 superpowers 依赖）
- 为各宿主生成原生产物：OpenCode 的 agents/commands、Codex 的 TOML agents、Qwen 的 agents/commands、Claude 的 SKILL.md
- 提供 CLI 工具：`status`、`use`、`disable`、`sync`、`doctor`、`explain`、`bootstrap`、`author routing`
- 包含上游 superpowers 兼容性监控

技术栈：TypeScript（严格模式，ES2022）+ ESM + Node.js + pnpm + Vitest + Zod

版本：0.1.0，MIT 许可证

---

## 2. 目录结构

```
oh-my-superagents/
├── src/                        # 43 个 TypeScript 源文件
│   ├── bin.ts                  # CLI 二进制入口
│   ├── plugin.ts               # OpenCode 插件入口
│   ├── index.ts                # 库 barrel 导出
│   ├── cli.ts                  # CLI 命令实现（~3084 行）
│   ├── config.ts               # 配置加载与验证（~1502 行）
│   ├── control-plane.ts        # OMS 控制平面核心（~1779 行）
│   ├── router.ts               # 路由解析（~188 行）
│   ├── materialize.ts          # 宿主产物物化（~712 行）
│   ├── capabilities.ts         # 能力策略
│   ├── opencode.ts             # OpenCode 宿主适配器（~633 行）
│   ├── codex.ts                # Codex 宿主适配器（~197 行）
│   ├── qwen.ts                 # Qwen 宿主适配器（~424 行）
│   ├── claude.ts               # Claude Code 宿主适配器（~138 行）
│   ├── workflow-*.ts           # 工作流源抽象
│   ├── lane-execution.ts       # 通道感知子代理执行
│   ├── context-*.ts            # 上下文子系统（10 个文件）
│   ├── policy-*.ts             # 策略子系统（3 个文件）
│   ├── superpowers-*.ts        # 上游兼容性检测
│   ├── author-*.ts             # AI 辅助路由/策略编写
│   ├── authority-config.ts     # 权威配置处理
│   └── openspec.ts             # OpenSpec 工件分类
├── test/                       # 45 个测试文件
├── docs/                       # 文档（含架构文档、AI 可读文档、计划/规格文档）
├── schemas/                    # JSON Schema 定义
├── catalogs/                   # 能力目录和引导问题图数据
├── scripts/                    # Docker canary 和文档生成脚本
├── dist/                       # 编译输出
└── package.json                # 包配置
```

---

## 3. 核心架构分析

### 3.1 分层架构

OMS 采用清晰的四层架构：

```
┌─────────────────────────────────────────────┐
│           CLI / Plugin 入口层                │
│   bin.ts / plugin.ts / index.ts             │
├─────────────────────────────────────────────┤
│           编排与控制平面层                    │
│   control-plane.ts / cli.ts                 │
├─────────────────────────────────────────────┤
│           解析与路由层                        │
│   config.ts / router.ts / workflow-sources  │
├─────────────────────────────────────────────┤
│           产物生成与物化层                    │
│   opencode.ts / codex.ts / qwen.ts /        │
│   claude.ts / materialize.ts                │
└─────────────────────────────────────────────┘
```

### 3.2 控制平面（`control-plane.ts`）

控制平面是整个系统的核心编排器。`resolveControlPlane()` 函数执行以下流程：

1. **加载配置** — 调用 `loadControlPlaneConfig()` 加载并合并全局/项目配置
2. **验证与解析** — 验证配置有效性，解析活跃预设
3. **计算有效源** — 确定各规范路由的工作流源映射
4. **解析上下文提供者** — 解析文件/CLI/MCP 三种类型的上下文提供者
5. **构建上下文索引** — 遍历工作区目录，分类发现的工件文件
6. **解析策略族** — 从规则选择器中解析模型/上下文/工具策略
7. **评估上下文压缩** — 确定哪些上下文包应在生命周期边界被压缩
8. **组装结果** — 返回完整的 `ResolvedControlPlane` 对象

设计模式：**Facade 模式**（编排多个子系统）+ **依赖注入**（可测试性）+ **优雅降级**（无配置时使用默认值）

### 3.3 配置系统（`config.ts`）

采用两层分层配置模型：

- **全局配置**：`~/.config/oh-my-superagents/config.jsonc`
- **项目配置**：`<cwd>/oh-my-superagents.config.jsonc`

项目配置覆盖全局配置。支持：
- **遗留配置自动迁移** — 扁平格式自动转换为分层格式
- **预设继承** — 通过 `extends` 字段实现单级继承（无链式继承）
- **Zod schema 验证** — 所有配置形状都有严格的 schema 定义
- **恢复机制** — 权威配置损坏时回退到上次已知良好的配置

### 3.4 路由系统（`router.ts`）

路由解析采用四层优先级策略：

```
预设路由 > 通道路由 > 通道默认路由 > 预设默认路由
```

`resolveRoute()` 函数将阶段/意图 ID 解析为完整的 `ResolvedRoute`，包含：
- 规范路由 ID（`phase.brainstorm` 或 `intent.<id>`）
- 工作流源（superpowers/gstack/direct）
- 模型、变体、努力级别
- 源条目元数据

### 3.5 产物物化（`materialize.ts`）

负责将生成的产物同步到磁盘：

- **原子写入** — 通过临时文件 + 重命名实现
- **所有权标记系统** — 每个生成的文件包含 HTML 注释标记（如 `<!-- generated-by: oh-my-superagents -->`）
- **安全清理** — 仅清理 OMS 拥有的过期产物，不会误删用户文件
- **感知宿主约定** — 了解各宿主的文件路径约定

---

## 4. 宿主适配器模式

四个宿主适配器遵循统一模式：

| 适配器 | 产物格式 | 产物位置 | 特殊能力 |
|--------|----------|----------|----------|
| OpenCode | Markdown（YAML front matter）| `.opencode/agents/`、`.opencode/commands/` | 通道分割执行、直接模式、运行时元数据 |
| Codex | TOML | `.codex/agents/` | `reasoning_effort`、`service_tier: "fast"` |
| Qwen | Markdown（YAML front matter）| `.qwen/agents/`、`.qwen/commands/` | 上游技能发现、`{{args}}` 替换 |
| Claude Code | Markdown SKILL.md | `.claude/skills/<name>/SKILL.md` | 仅技能（无命令/代理）|

共同模式：
1. 接收 `RouterConfig`
2. 遍历内建阶段（或直接模式的意图）
3. 调用 `resolvePhase()` / `resolveRoute()` 获取解析结果
4. 生成宿主特定的产物文件（嵌入所有权标记）
5. 返回 `GeneratedArtifact[]` 供 `materializeArtifacts()` 同步到磁盘

---

## 5. 工作流系统

### 5.1 Superpowers 工作流（`workflow-superpowers.ts`）

定义了 7 个内建阶段：

| 阶段 | 规范路由 | 代理名称 | 命令名称 |
|------|---------|---------|---------|
| brainstorming | `phase.brainstorm` | `spr-strategy` | `/sp-brainstorm` |
| writing-plans | `phase.plan` | `spr-plan` | `/sp-plan` |
| subagent-driven-development | `phase.execute` | `spr-build--<lane>` | `/sp-execute-<lane>` |
| requesting-code-review | `phase.review` | `spr-review` | `/sp-review` |
| verification-before-completion | `phase.verify` | `spr-verify` | `/sp-verify` |
| frontend-design | `phase.visual` | `spr-visual` | `/sp-visual` |
| webapp-testing | `phase.web-test` | `spr-visual` | `/sp-web-test` |

### 5.2 Direct 模式（`workflow-direct.ts`）

用户在配置中自定义意图，规范路由遵循 `intent.<id>` 格式。无需上游 superpowers 依赖。

### 5.3 工作流源抽象（`workflow-sources.ts`）

统一的 `CanonicalRouteId` 类型：`phase.${string}` | `intent.${string}`

源种类：`superpowers`、`gstack`、`direct`

用户可通过 `sourcePresets` 配置覆盖各规范路由的工作流源。

---

## 6. 上下文子系统

上下文子系统是 OMS 的一个重要子系统，管理 AI 代理推理时所需的上下文工件的全生命周期。

### 6.1 上下文工件（`context-artifacts.ts`）

核心领域实体 `ContextArtifact`，包含：
- `kind`（spec、plan、decision、knowledge、summary 等 12 种类型）
- `authority`（authoritative/derived/advisory，信任级别）
- `source`（oms/superpowers/gstack/gsd/external，来源标识）
- 新鲜度评估：基于提交分歧、时间戳的过期判断
- 恢复包构建：在压缩边界捕获生命周期状态和未解决决策

### 6.2 上下文生命周期（`context-lifecycle.ts`）

10 个生命周期阶段：`bootstrap` → `design` → `prepare_workspace` → `plan` → `execute_task` → `review` → `verify` → `integrate_branch` → `checkpoint` → `resume`

7 个压缩触发点：`subagent-handoff`、`plan-checkpoint`、`review-checkpoint`、`verification-checkpoint`、`session-resume`、`source-switch`、`branch-integration`

### 6.3 上下文提供者

支持三种提供者类型：
- **文件提供者** — 直接读取文件系统中的工件
- **CLI 提供者** — 通过子进程执行命令获取上下文
- **MCP 提供者** — 通过 JSON-RPC 2.0 协议与 MCP 服务器通信

每种提供者声明其能力（recall/search/summarize/pack/status）和订阅的生命周期事件。

### 6.4 上下文压缩（`context-compression.ts`）

三层安全评估：
- **safe** — 权威工件存在且新鲜度通过
- **conditional** — 新鲜度失败但允许条件执行，附带恢复包
- **unsafe** — 无权威工件或新鲜度失败且不允许条件执行

压缩采用结构化 Markdown 截断（尊重标题边界）。

---

## 7. 策略子系统

### 7.1 策略选择器（`policy-selectors.ts`）

运行时上下文快照包含：`cwd`、`relativePath`、`lifecycleStage`、`workflowSource`、`agentRole`、`workloadTags`、`modalityRequirements`

选择器匹配采用 AND 逻辑（所有指定维度必须匹配）。路径匹配使用 glob-to-regex 转换。

### 7.2 策略族（`policy-families.ts`）

三类策略：
- **模型策略** — 偏好配置文件、努力级别、窗口类、必需能力
- **上下文策略** — 压缩预设、包优先标志、最大字符数
- **工具策略** — 允许/阻止的技能/MCP/工具标签

### 7.3 策略解析（`policy-resolution.ts`）

按声明顺序遍历规则，匹配当前快照，合并匹配的策略。后声明的规则覆盖先声明的规则。支持溯源追踪（provenance tracking）。

---

## 8. 兼容性与上游监控

### 8.1 超能力兼容性（`superpowers-compatibility.ts`）

完整的 semver 解析/比较/范围匹配引擎（无外部依赖）。兼容性矩阵按宿主维护：
- 最低支持版本：>=5.0.0
- 测试范围：>=5.0.0 <6.0.0
- 策略模式：`warn`（仅警告）或 `strict`（不兼容时阻止）

### 8.2 超能力检测器（`superpowers-detectors.ts`）

多源检测 + 冲突解决：
- OpenCode：搜索项目/用户配置文件和插件目录
- Codex：搜索符号链接路径和克隆目录，检查 git 状态

所有检测结果包含 `failures[]` 用于诊断（不短路，收集所有失败）。

---

## 9. CLI 架构

`cli.ts` 实现了 9 个命令：

| 命令 | 用途 |
|------|------|
| `status` | 显示 OMS 状态 |
| `doctor` | 检查诊断信息 |
| `explain` | 解释阶段/意图的路由 |
| `use <preset>` | 切换活跃预设，启用 OMS，物化产物 |
| `disable` | 禁用 OMS，删除产物 |
| `sync` | 为当前配置物化产物 |
| `bootstrap` | Codex 特定的引导 |
| `author routing` | 从模型清单生成路由配置 |
| `config author` | 生成权威/策略配置 |

架构特点：
- **自定义参数解析**（无框架依赖）
- **依赖注入**（所有 I/O 操作可注入测试）
- stdout 输出 JSON（机器消费），stderr 输出人类可读文本

---

## 10. 插件系统

`plugin.ts` 导出一个符合 `@opencode-ai/plugin` 接口的插件：

- 启动时：加载路由配置，运行兼容性诊断
- 注册 `chat.params` 钩子：读取运行时代理元数据，为标记 `codexFast: true` 的代理设置 `serviceTier: "fast"`
- 支持工作区感知的配置解析

---

## 11. 扩展点

### 添加新宿主
1. 创建适配器模块（遵循 codex.ts/claude.ts 模式）
2. 在 `capabilities.ts` 中添加宿主和投影规则
3. 在 `cli.ts` 中添加 `--host` 验证和产物分发
4. 在 `materialize.ts` 中添加所有权检测

### 添加新工作流源
1. 创建工作流模块（定义路由目录和源条目查找）
2. 在 `workflow-sources.ts` 中注册源种类
3. 在 `capabilities.ts` 中添加能力检查
4. 添加检测/兼容性逻辑（如需要）

### 添加新阶段
1. 在 `workflow-superpowers.ts` 中添加目录条目
2. 在各宿主适配器中添加阶段到产物的映射
3. 在 `SUPERPOWERS_SOURCE_ENTRIES` 中添加规范路由

### Direct 模式作为扩展机制
用户可在配置中定义任意意图，无需修改代码。意图通过相同的管道（router → adapter → materialization）处理。

---

## 12. 测试基础设施

- **框架**：Vitest 3.1.1（Node 环境）
- **测试文件**：45 个，位于 `test/` 目录
- **覆盖范围**：config、router、control-plane、各宿主适配器、context 子系统、policy 子系统、compatibility、capabilities 等核心模块
- **公共 API 类型检查**：2 个类型检查文件确保公共 API 签名不变
- **Docker canary**：OpenCode 和 Codex 的 Debian 容器验证脚本

---

## 13. 设计模式总结

| 模式 | 应用位置 |
|------|---------|
| Facade | `control-plane.ts`（编排多子系统） |
| Strategy | 宿主适配器、工作流源、生命周期阶段路由 |
| Dependency Injection | 所有 provider/detector 模块 |
| Builder | 路由提案构建、压缩包构建 |
| Rule Chain | 策略解析（有序评估+累积） |
| Discriminated Union | 提供者配置、投影就绪状态、工作流配置 |
| Value Object | 上下文工件、恢复包（不可变） |
| Multi-source Detection | 超能力检测器（冲突解决） |
| Three-state Readiness | 压缩安全评估 |
| Ownership Contract | 产物物化（嵌入标记实现安全清理） |
| Path-based Classification | 上下文索引、OpenSpec 分类 |

---

## 14. 总结

oh-my-superagents 是一个设计精良的多宿主 AI 编程助手路由系统。其核心优势在于：

1. **清晰的分层架构** — 配置、路由、控制平面、适配器、物化各层职责分明
2. **可扩展的宿主适配器模式** — 新增宿主只需实现一个适配器模块
3. **灵活的工作流抽象** — superpowers/gstack/direct 三种工作流源通过规范路由统一
4. **完善的上下文管理** — 10 个文件组成的上下文子系统提供全生命周期管理
5. **强大的策略系统** — 基于多维选择器的规则链，支持模型/上下文/工具策略
6. **健壮的兼容性监控** — 完整的 semver 引擎和多源检测机制
7. **全面的测试覆盖** — 45 个测试文件覆盖核心模块

当前的扩展方向（在 task.md 中描述）是增加 **Copilot CLI 宿主的深度支持**，这将需要实现新的宿主适配器、更新能力系统、以及可能的工作流适配。
