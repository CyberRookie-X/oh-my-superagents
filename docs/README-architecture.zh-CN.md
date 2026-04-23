# 架构说明

本文说明 `oh-my-superagents` 当前的架构形态。
它刻意只讨论结构与权衡，不展开安装步骤或命令参考。

## 仓库工作流

这个仓库的维护工作流使用 `pnpm`。处理仓库本身时，请先执行一次 `corepack enable`，并使用 `pnpm install` 管理依赖。面向包使用者的示例仍然可以保留 `npx` 形式，因为发布后的 CLI 用法并不依赖 pnpm。

这个插件仓库禁止在宿主机直接做验证。
仓库验证只能在 Debian Docker 容器中运行。

```bash
corepack enable
pnpm install
bash scripts/run-opencode-debian-canary.sh
bash scripts/run-codex-debian-canary.sh
```

## 设计目标

`oh-my-superagents` 的存在目的，是补上某个宿主在运行 `superpowers` 时仍然缺失的那一层能力。

它不是：

- upstream `superpowers` 的替代品
- 跨宿主配置同步系统
- 重型多 agent 编排框架

项目遵循一条简单规则：

> 让共享 OMS 核心比任何单个宿主适配层都更厚。

这样可以让宿主特定代码保持可替换，同时继续维持一致的路由模型、preset、兼容性检查，以及 OMS 控制平面行为。

## 分层

当前架构可以分成五层。

### 1. 控制平面核心

主要文件：

- `src/control-plane.ts`
- `src/config.ts`
- `src/cli.ts`

职责：

- 分层配置加载
- 旧配置迁移
- preset 选择
- 命令前缀与别名解析
- OMS `status/use/disable/sync/doctor` 行为

为什么这一层更厚：

- 这里承载的是产品语义
- 所有已支持宿主都依赖它
- 配置与生命周期规则必须跨宿主保持一致

### 2. 宿主适配层

主要文件：

- `src/opencode.ts`
- `src/codex.ts`
- `src/codex-bootstrap.ts`
- `src/qwen.ts`

职责：

- 渲染宿主原生工件
- 把 OMS phase 和命令映射成宿主原生入口
- 在不改变 OMS 语义的前提下处理宿主约束

为什么这些层保持更薄：

- 它们应当主要是渲染和翻译层
- 除非无法避免，宿主差异不应该反向渗透进核心模型

### 3. 兼容性监控

主要文件：

- `src/superpowers-compatibility.ts`
- `src/superpowers-detectors.ts`

职责：

- 检测 upstream `superpowers` 的安装状态
- 对照本地兼容矩阵进行评估
- 返回 `compatible`、`untested`、`incompatible` 或 `not_detected`

为什么它是中等厚度：

- 它是跨宿主共享的
- 检测本身带有宿主差异，但策略判断是共享的

### 4. 工件协调层

主要文件：

- `src/materialize.ts`

职责：

- 安全写入生成工件
- 识别 OMS 拥有的工件
- 在重命名或前缀变化后协调清理陈旧宿主工件

为什么它单独存在：

- 每个宿主最终都需要相同的 ownership 和 cleanup 保证
- 集中处理清理逻辑，比把清理分散在各适配层里更容易推理

### 5. 文档与计划

关键位置：

- `docs/superpowers/specs/`
- `.agents/superpowers/specs/`

职责：

- 在实现前记录决策
- 让阶段性工作保持显式
- 保持不同 phase 与宿主之间的边界清晰

## 宿主差异

各宿主适配层并不对称，因为宿主本身就不对称。

### OpenCode

主要特征：

- 原生 plugin 入口
- 项目内 agents 与 commands
- 很适合薄生成包装层

架构后果：

- OpenCode 采用薄 plugin 加生成工件
- 宿主集成相对直接

### Codex

主要特征：

- 项目内 agents
- 本地 plugin bundle 与 marketplace entry
- plugin/bootstrap 面与路由工件面彼此分离

架构后果：

- Codex 同时需要路由工件和便利型 bootstrap 层
- 这让 Codex 在宿主侧比 OpenCode 更厚一些

### Qwen

主要特征：

- 项目内 agents 与 commands
- 当前 OMS 范围内不做重型 bootstrap 层
- 现阶段使用 wrapper 型集成就足够

架构后果：

- Qwen 目前实现为薄适配层
- 当前支持范围刻意比 OpenCode/Codex 更窄

### Copilot CLI

主要特征：

- 项目内 `.github/copilot/agents/*.md` agents、`.github/copilot/skills/*/SKILL.md` skills 和 `.github/copilot/hooks/*.sh` hooks
- 当前切片内不做 direct workflow 投影
- 采用 Agent + Plugin + Hooks 方案实现深度宿主集成

架构后果：

- Copilot CLI 保持为薄适配层
- Copilot CLI 使用与其他宿主相同的规范路由和源条目模型
- 当前支持集中在 `superpowers` 工作流切片加控制平面工件管理

## 用源码规模表示厚度

下面的统计是实现文件的大致源码行数。
不包含测试和文档。

| 层 | 主要文件 | 大致源码行数 | 厚度 |
| --- | --- | ---: | --- |
| OMS 控制平面核心 | `src/control-plane.ts`、`src/config.ts`、`src/cli.ts` | 1853 | 中等 |
| OpenCode 适配层 | `src/opencode.ts` | 242 | 薄 |
| Codex 适配 + bootstrap | `src/codex.ts`、`src/codex-bootstrap.ts` | 565 | 中等 |
| Qwen 适配层 | `src/qwen.ts` | 220 | 薄 |
| 兼容性监控 | `src/superpowers-compatibility.ts`、`src/superpowers-detectors.ts` | 1051 | 中等 |
| 共享工件协调层 | `src/materialize.ts` | 345 | 薄到中等 |

解释方式：

- `薄`：主要是渲染或宿主特定胶水层
- `中等`：包含共享策略、配置、生命周期或 bootstrap 行为
- `薄到中等`：被多个适配层共享，但仍以运维式职责为主

真正重要的不是精确数字。
真正重要的是：共享 OMS 核心被刻意设计得比任何单个宿主适配层都更厚。

## 为什么采用这种形状

这种结构给项目带来三点价值：

1. 宿主适配层可以保持可替换。
2. OMS 语义可以在所有支持宿主上保持一致。
3. 新宿主是否值得支持，可以用一个问题来判断：

> 这个宿主是否仍然存在一个真实缺口，而且 OMS 能在不把自己做成宿主专用框架的前提下补上它？

这也是为什么有些宿主被支持，有些只做部分支持，还有一些被明确排除在当前范围之外。
