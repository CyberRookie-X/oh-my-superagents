# oh-my-superagents 代码架构分析报告

## 项目概述

`oh-my-superagents` 是一个 AI 编码助手路由和控制平面项目，支持多个主机平台（OpenCode、Codex、Qwen、Claude Code），并提供一流的 `superpowers` 工作流支持。

## 架构层次

项目采用分层架构，共有七个主要层次：

### 1. 控制平面核心 (Control Plane Core)

**主要文件：**
- `src/control-plane.ts`
- `src/config.ts`
- `src/cli.ts`

**职责：**
- 分层配置加载
- 遗留配置迁移
- 预设选择
- 命令前缀和别名解析
- OMS `status/use/disable/sync/doctor` 行为
- 组合状态、诊断和解释输出，不将支持、可用性、兼容性和同步状态折叠为单一标志

**为什么较厚：**
- 这里是产品语义所在
- 所有支持的主机都依赖它
- 配置和生命周期规则必须在所有主机间保持一致

### 2. 工作流适配器 (Workflow Adapters)

**主要文件：**
- `src/router.ts`
- `src/workflow-direct.ts`
- `src/workflow-superpowers.ts`
- `src/workflow-gstack.ts`
- `src/workflow-sources.ts`

**职责：**
- 保持工作流特定的路由词汇表不在通用路由解析器中
- 将内置 OMS 阶段输入规范化为真正的 canonical route ids，如 `phase.plan`
- 通过源适配器将 canonical routes 映射到源原生条目，如 `writing-plans` 或 `plan-eng-review`
- 保留 `superpowers` 作为第一方工作流适配器
- 让 OpenCode 直接模式解析用户定义的意图，而无需上游工作流工具依赖

**为什么存在此层：**
- 路由器核心比一个上游阶段目录更广泛
- `superpowers` 支持保持一流，但不再必须定义整个产品身份
- 直接模式可以在适配器假设明确时保持精简

### 3. 共享能力策略 (Shared Capability Policy)

**主要文件：**
- `src/capabilities.ts`

**职责：**
- 让源适配器专注于为 canonical route 定义上游条目
- 让能力注册表决定 OMS 是否支持源路由、主机源投影或控制平面命令组合
- 返回结构化的支持决策和原因代码，供 CLI 和迁移的主机适配器直接使用
- 保持当前剩余的主机本地命令过滤和 CLI 投影护栏明确，直到稍后清理将它们折叠到相同的共享策略路径中

### 4. 主机适配器 (Host Adapters)

**主要文件：**
- `src/opencode.ts` (OpenCode 适配器)
- `src/codex.ts`, `src/codex-bootstrap.ts` (Codex 适配器 + 引导)
- `src/qwen.ts` (Qwen 适配器)
- `src/claude.ts` (Claude 适配器)

**职责：**
- 为每个主机平台提供特定的渲染和集成逻辑
- 生成主机原生的代理、命令和技能文件
- 处理主机特定的引导和插件入口点

### 5. 兼容性监控 (Compatibility Monitor)

**主要文件：**
- `src/superpowers-compatibility.ts`
- `src/superpowers-detectors.ts`

**职责：**
- 监控和确保与 `superpowers` 的兼容性
- 检测主机能力和工作流支持

### 6. 共享工件协调 (Shared Artifact Reconciliation)

**主要文件：**
- `src/materialize.ts`

**职责：**
- 协调和生成共享工件
- 处理工件的材质化和同步

### 7. 工作流源 (Workflow Sources)

**主要文件：**
- `src/workflow-sources.ts`

**职责：**
- 定义和管理工作流源
- 提供源条目解析和映射

## 核心概念

### Canonical Route 模型

- 内置 OMS 阶段输入保持用户可见为稳定的阶段名称，如 `writing-plans`，但共享路由器将它们规范化为真正的 canonical route ids，如 `phase.plan`
- 源适配器将这些 canonical routes 映射到源原生工作流条目。例如，`phase.plan` 默认映射到 `superpowers/writing-plans`，当选择 `gstack` 源时可以映射到 `gstack/plan-eng-review`
- 主机适配器消耗已解析的 canonical route 及其源条目元数据，然后从该结果渲染主机原生工件，而不是将源原生阶段名称视为内部真实层
- 源覆盖、解释输出和控制平面诊断使用 canonical route ids，如 `phase.plan`；旧版别名如 `phase.writing-plans` 不是内部路由合同

### 直接模式 (Direct Mode)

- 第一个通用路由切片现在是 OpenCode、Codex 和 Qwen 上的实验性直接工作流
- 它使用用户定义的意图，并保持渲染形状主机原生，而不是强制所有地方相同的文件
- OpenCode 渲染 `ai-<intent>` 命令和 `rt-<intent>` 代理

## 技术栈

- **语言：** TypeScript
- **包管理器：** pnpm
- **测试框架：** Vitest
- **配置格式：** JSONC (JSON with Comments)

## 支持矩阵

| 能力 | OpenCode | Codex | Qwen | Claude Code |
|------|----------|-------|------|-------------|
| `superpowers` 工作流路由 | 完整 | 完整 | 部分 | 实验性 |
| 直接模式 | 实验性 | 实验性 | 实验性 | 暂无 |
| OMS 控制平面 | 完整 | 完整 | 完整 | 实验性 |
| 主机引导 | 原生插件入口 | 本地引导/插件包 | 无 | 无 |
| 兼容性监控 | 完整 | 完整 | 暂无 | 暂无 |
| 生成的主机工件 | 代理 + 命令 | 代理 + 插件/技能 | 代理 + 命令 | 技能 |
| 临时禁用助手 | 完整 | 完整 | 暂无 | 暂无 |
| `codexFast` | 完整 | 完整 | 暂无 | 暂无 |

## 项目结构

```
oh-my-superagents/
├── src/                    # 源代码
│   ├── control-plane.ts    # 控制平面核心
│   ├── config.ts           # 配置管理
│   ├── cli.ts              # CLI 接口
│   ├── router.ts           # 路由器
│   ├── workflow-*.ts       # 工作流适配器
│   ├── capabilities.ts     # 能力策略
│   ├── opencode.ts         # OpenCode 适配器
│   ├── codex.ts            # Codex 适配器
│   ├── qwen.ts             # Qwen 适配器
│   ├── claude.ts           # Claude 适配器
│   ├── copilot.ts          # Copilot 适配器
│   └── ...
├── test/                   # 测试文件
├── docs/                   # 文档
├── scripts/                # 脚本
└── ...
```

## 设计原则

1. **共享核心较厚：** 共享 OMS 核心比任何单个主机适配器都厚，以保持主机特定代码可替换，同时保留一致的路由、预设、兼容性检查、共享能力策略和 OMS 控制平面行为模型。

2. **模块化设计：** 每个层次都有明确的职责和边界，便于维护和扩展。

3. **主机原生渲染：** 主机适配器生成主机原生的工件，而不是强制所有地方相同的文件格式。

4. **Canonical Route 模型：** 使用规范路由 ID 作为内部路由合同，而不是源原生阶段名称。

## 总结

`oh-my-superagents` 采用分层架构，核心控制平面较厚，工作流适配器和主机适配器较薄。这种设计使得项目能够支持多个主机平台，同时保持一致的路由和控制平面行为。项目使用 TypeScript 开发，支持多种工作流源（superpowers、gstack、direct），并提供实验性的直接模式支持。
