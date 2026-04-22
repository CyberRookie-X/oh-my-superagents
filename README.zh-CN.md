# oh-my-superagents

[English](./README.md) | [简体中文](./README.zh-CN.md)

架构说明：[English](./docs/README-architecture.md) | [简体中文](./docs/README-architecture.zh-CN.md)

`oh-my-superagents` 正在演进为一个更通用的路由与 OMS 控制平面产品，当前在 OpenCode、Codex、Qwen、Claude Code、Copilot CLI 上提供一等公民级别的 `superpowers` 支持，并包含一个覆盖 OpenCode、Codex、Qwen、Copilot CLI 的实验性、宿主原生 direct mode。

## 支持矩阵

| 能力 | OpenCode | Codex | Qwen | Claude Code | Copilot CLI |
| --- | --- | --- | --- | --- | --- |
| `superpowers` 工作流路由 | 完整支持 | 完整支持 | 部分支持 | 实验性支持 | 完整支持 |
| Direct mode | 实验性支持 | 实验性支持 | 实验性支持 | 暂未实现 | 实验性支持 |
| OMS 控制平面 | 完整支持 | 完整支持 | 完整支持 | 实验性支持 | 完整支持 |
| 宿主引导/Bootstrap | 原生插件入口 | 本地 bootstrap / plugin bundle | 暂无 | 暂无 | 暂无 |
| 上游兼容性监控 | 完整支持 | 完整支持 | 暂未实现 | 暂未实现 | 暂未实现 |
| 生成宿主工件 | Agents + Commands | Agents + Plugin/Skills | Agents + Commands | Skills | Prompts |
| 临时停用 helper | 完整支持 | 完整支持 | 暂未实现 | 暂未实现 | 暂未实现 |
| `codexFast` | 完整支持 | 完整支持 | 暂未实现 | 暂未实现 | 暂未实现 |

支持等级说明：

- `完整支持`：已实现并纳入当前支持范围
- `实验性支持`：作为首个通用切片已实现，但后续仍可能继续演进
- `部分支持`：已实现，但有明确的阶段性边界
- `暂未实现`：当前版本还没有做
- `暂不计划`：现阶段明确不做

补充说明：

- 临时停用 helper 是宿主本地、会话级的提示便捷功能，不会改变持久化的 OMS 状态。
- `codexFast` 在 OpenCode 和 Codex 上都属于完整支持；Qwen 目前还不支持。
- Direct mode 会保持宿主原生形态：OpenCode 生成 commands + agents，Codex 生成 agent TOML + 本地 bootstrap skills，Qwen 生成项目内 commands + agents，Copilot CLI 生成 `.github/prompts/*.md` prompt 文件。
- `gstack` 是一等公民级别的 first-party workflow source。当前这个切片里，gstack 路由投影支持 OpenCode、Codex、Claude Code，Qwen 和 Copilot CLI 暂不支持。

## 实现厚度

项目刻意采用“共享 OMS 核心 + 薄工作流/宿主适配层”的结构。
下面这个表用当前实现文件的源码行数来表示各层的厚薄程度，不包含测试和文档。

| 层 | 主要文件 | 大致源码行数 | 厚度 |
| --- | --- | ---: | --- |
| OMS 控制平面核心 | `src/control-plane.ts`、`src/config.ts`、`src/cli.ts` | 4316 | 中等 |
| 工作流适配层 | `src/router.ts`、`src/workflow-superpowers.ts`、`src/workflow-gstack.ts`、`src/workflow-sources.ts`、`src/workflow-direct.ts` | 371 | 薄 |
| 共享能力策略层 | `src/capabilities.ts` | 97 | 薄 |
| OpenCode 适配层 | `src/opencode.ts` | 633 | 薄 |
| Codex 适配 + bootstrap | `src/codex.ts`、`src/codex-bootstrap.ts` | 760 | 中等 |
| Qwen 适配层 | `src/qwen.ts` | 424 | 薄 |
| Claude 适配层 | `src/claude.ts` | 138 | 薄 |
| Copilot CLI 适配层 | `src/copilot.ts` | 265 | 薄 |
| 兼容性监控 | `src/superpowers-compatibility.ts`、`src/superpowers-detectors.ts` | 1093 | 中等 |
| 共享工件协调层 | `src/materialize.ts` | 712 | 薄到中等 |

理解方式：

- `薄`：以宿主特定渲染或轻量集成为主
- `薄到中等`：仍然比共享核心更窄，但已经不只是纯渲染，还承担一部分共享运行时胶水逻辑
- `中等`：包含共享策略、配置解析、生命周期、bootstrap 等逻辑
- OMS 整体设计上刻意让“共享核心”比任何单个宿主适配层更厚

## 项目边界

`oh-my-superagents` 正在演进成一个更广义的路由与控制平面产品。
当前它仍然在已支持宿主上提供一等公民级别的 `superpowers` 支持，而首个通用切片现在已经扩展为覆盖 OpenCode、Codex、Qwen 的实验性宿主原生 direct mode；Claude Code 当前只支持 `superpowers` 这条 slice。

它不是：

- 跨宿主配置同步工具
- upstream `superpowers` 的安装器或升级器
- 一个重型多 agent 编排框架

当前范围包括：

- CLI
- 生成的宿主工件
- packaged plugin entrypoints
- Stage 1 OMS control plane
- Stage 2 Qwen adapter
- OpenCode、Codex、Qwen、Copilot CLI 上的实验性 direct mode 切片
- 当前 `oh-my-superagents/library` 导出面

当前结论：

- OpenCode：支持 `superpowers` 工作流路由，也支持实验性的 direct mode 切片
- Codex：支持 `superpowers` 工作流路由，也支持实验性的 direct mode 切片
- Qwen：支持，但目前仍是有边界的 Stage 2 `superpowers` 工作流形态，同时也支持实验性的 direct mode 切片
- Claude Code：当前已经以薄宿主适配层的方式支持 `superpowers` slice，并支持 source-aware route projection，但 direct workflow 投影暂未支持
- Copilot CLI：支持 `superpowers` 工作流路由，也支持实验性的 direct mode 切片，生成 `.github/prompts/*.md` prompt 文件

## 它能做什么

- 从项目级和全局级位置读取分层的 `oh-my-superagents.config.jsonc`
- 把内置 `superpowers` phase 输入规范化成 `phase.plan` 这类 canonical route，并把用户定义的 direct intent 规范化成 `intent.plan` 这类 canonical route
- 生成 `.opencode/agents/*.md` 与 `.opencode/commands/*.md`
- 生成 `.codex/agents/*.toml`
- 生成 `.qwen/agents/*.md` 与 `.qwen/commands/*.md`
- 生成 `.claude/skills/*/SKILL.md`
- 生成 `.github/prompts/*.md`（Copilot CLI）
- 通过 `author routing` 基于仓库信号和用户提供的模型清单生成路由配置提案
- 提供 `author routing`、`status`、`use`、`disable`、`sync`、`doctor`、`explain`、`bootstrap` CLI
- 提供最小 OpenCode plugin 入口用于启动诊断

## Canonical Route 模型

- 内置 OMS phase 对外仍然保持 `writing-plans` 这类稳定名称，但共享路由核心内部会先把它们规范化成 `phase.plan` 这类真正的 canonical route id。
- Source adapter 再把 canonical route 映射成 source-native workflow entry。例如 `phase.plan` 默认映射到 `superpowers/writing-plans`，切到 gstack source 时则映射到 `gstack/plan-eng-review`。
- Host adapter 消费的是“已解析 canonical route + source entry 元数据”，然后再渲染宿主原生工件，而不是把 source-native phase 名称当成内部真相层。
- Source override、`explain` 输出和控制平面诊断都以 `phase.plan` 这类 canonical route id 为准；`phase.writing-plans` 这类旧别名不是内部路由契约。

## Direct Mode

首个通用路由切片现在已经扩展为 OpenCode、Codex、Qwen 上的实验性 direct workflow。

- 使用用户定义的 intent，并保持各宿主自己的原生文件形态，而不是强行做成完全一致。
- OpenCode 生成 `ai-<intent>` commands 与 `rt-<intent>` agents。
- Codex 生成 `rt-<intent>.toml` agents，以及位于 `plugins/oh-my-superagents-codex/skills/` 下的 repo-local `ai-<intent>` bootstrap skills。
- Qwen 生成项目内的 `.qwen/commands/ai-<intent>.md` commands 与 `.qwen/agents/rt-<intent>.md` agents。
- Copilot CLI 生成 `.github/prompts/rt-<intent>.md` prompt 文件。
- Direct intent id 只能包含小写字母、数字和 `-`，这样生成的宿主文件名才合法。
- 当前 direct mode 在 OpenCode、Codex、Qwen、Copilot CLI 上都支持 `status`、`doctor`、`sync`。
- `explain --intent` 目前只在 OpenCode 和 Codex 上支持，Qwen、Claude Code 和 Copilot CLI 还没有接上。
- `explain --host claude --phase <phase>` 当前已支持，用于当前 Claude `superpowers` slice。
- direct mode 不依赖 upstream `superpowers`；与此同时，一等公民级别的 `superpowers` 工作流支持保持不变。

## 仓库维护工作流

这个仓库自身的维护流程统一使用 `pnpm`。如果你是在维护仓库，请先执行一次 `corepack enable`，并使用 `pnpm install` 管理依赖。安装章节里给包使用者的示例仍然可以继续使用 `npx`。

这个插件仓库禁止在宿主机直接做验证。
仓库验证只能在 Debian Docker 容器中运行。

```bash
corepack enable
pnpm install
bash scripts/run-opencode-debian-canary.sh
bash scripts/run-codex-debian-canary.sh
```

## 安装

如果使用 `superpowers` workflow mode，请先单独安装 upstream `superpowers`，然后按宿主分别接入。
如果使用 OpenCode、Codex、Qwen 上的实验性 direct mode，则不要求安装 upstream `superpowers`。

按宿主的接入方式：

- OpenCode：把 `oh-my-superagents` 加到 OpenCode plugin 列表
- Codex：使用打包后的 CLI 执行 `bootstrap --host codex`
- Qwen：使用 `sync --host qwen`；当前 Stage 2 没有重型 bootstrap 流程
- Copilot CLI：使用 `sync --host copilot`；生成 `.github/prompts/*.md` prompt 文件

如果只是本地临时使用 CLI，可以用 `npx` 或 `node_modules/.bin`：

```bash
npx oh-my-superagents sync --host opencode
```

## 配置文件

项目根目录示例：

```jsonc
{
  "$schema": "./node_modules/oh-my-superagents/schemas/oh-my-superagents.schema.json",
  "settings": {
    "enabled": true,
    "activePreset": "default",
    "commandPrefix": "oms",
    "commands": {
      "status": { "name": "status", "aliases": ["st"] },
      "use": { "name": "use", "aliases": ["u"] },
      "disable": { "name": "off", "aliases": ["o"] },
      "sync": { "name": "sync", "aliases": ["sy"] },
      "doctor": { "name": "doctor", "aliases": ["dr"] }
    },
    "superpowersCompatibility": {
      "mode": "warn"
    }
  },
  "presets": {
    "default": {
      "label": "Default",
      "short": "def",
      "description": "General daily development",
      "profiles": {
        "strategy": {
          "model": "anthropic/claude-sonnet-4-5-20250929",
          "variant": "high"
        },
        "build": {
          "model": "openai/gpt-5",
          "effort": "balanced"
        }
      },
      "routes": {
        "brainstorming": "strategy"
      },
      "defaultRoute": "build"
    }
  }
}
```

如果是在现代分层配置结构里给 Codex 兼容 profile 显式开启快速层，可以这样写：

```jsonc
{
  "presets": {
    "default": {
      "profiles": {
        "build": {
          "model": "gpt-5.4",
          "effort": "balanced",
          "codexFast": true
        }
      },
      "routes": {},
      "defaultRoute": "build"
    }
  }
}
```

说明：

- 同一个配置文件里可以定义多个 preset，并通过 `status` / `use` / `disable` 切换
- 未传 `--config` 时，OMS 会读取全局配置 `~/.config/oh-my-superagents/config.jsonc`，再叠加项目级配置
- 项目级 `settings` 覆盖全局 `settings`
- 项目级同名 preset 会整体替换全局同名 preset
- 项目级同名 command entry 会整体替换全局同名 command entry，然后再补默认值
- 老的单 preset router 配置仍可读取，并会迁移到 `presets.default`
- 对于 `--host codex`，profile 里的 model id 需要本身就是 Codex 兼容值，例如 `gpt-5.4` 或 `gpt-5.3-codex-spark`。Codex 适配层不会把任意 OpenCode provider/model id 自动转换成 Codex 可用值。

## Lane 路由模型

Lane-aware 路由会继续把 `phase` 固定为 upstream `superpowers` 的工作流 key，只是在它下面增加一层路由：

- `phase` 仍然是稳定的 `superpowers` 工作流 key。
- `lane` 是一个按技术栈组织的 route bundle，例如 `frontend`、`backend`、`infra`。
- `profile` 是最终的 model/config 叶子对象，真正承载可执行设置。
- `preset` 仍然负责选择工作模式，`usesLanes` 用来限制该 preset 可使用的全局 lane。
- `settings.defaultLane` 是当前 active preset 的持久化基线 lane。
- `laneSelection.mode` 支持 `manual`、`suggest`、`auto`。
- `--lane <name>` 是 `status`、`doctor`、`explain`、`sync` 的单次运行时 lane 覆盖，不会写回配置；但 `sync` 会按这次 lane 生成工件，直到下一次 sync 再次重建。

其中 `manual` 只走持久化/默认 lane 路径，`suggest` 会把运行时 lane 作为 Stage 1 的非应用型建议暴露出来，`auto` 则可以在当前会话里直接应用一个 `effectiveLane`，但不会静默写回配置。

示例：

```bash
oh-my-superagents status --host opencode --lane frontend
oh-my-superagents explain --host opencode --phase brainstorming --lane frontend
```

紧凑示例：

```jsonc
{
  "settings": {
    "activePreset": "default",
    "defaultLane": "backend",
    "laneSelection": { "mode": "suggest" }
  },
  "profiles": {
    "frontend-build": {
      "model": "openai/gpt-5",
      "effort": "balanced"
    },
    "backend-build": {
      "model": "gpt-5.4",
      "effort": "balanced",
      "codexFast": true
    }
  },
  "lanes": {
    "frontend": {
      "label": "Frontend",
      "routes": {
        "frontend-design": "frontend-build"
      },
      "defaultRoute": "frontend-build"
    },
    "backend": {
      "label": "Backend",
      "routes": {
        "writing-plans": "backend-build"
      },
      "defaultRoute": "backend-build"
    }
  },
  "presets": {
    "default": {
      "label": "Default",
      "short": "def",
      "usesLanes": ["frontend", "backend"],
      "defaultLane": "backend",
      "routes": {},
      "defaultRoute": "backend-build"
    }
  }
}
```

## Lane 感知子代理执行

Lane-aware subagent execution 是 `superpowers` 下面的执行层增强，不是另一套工作流体系。在当前切片里，OMS 仍然把主 `/sp-execute` 路径保留在 `superpowers/subagent-driven-development` 上，并在 active preset 通过 `usesLanes` 启用 lanes 时，为 OpenCode 额外生成 `/sp-execute-frontend` 这类 lane-scoped wrapper，以及对应的 `spr-build--frontend` agents。

可通过 `settings.subagentExecution.mode` 控制拆分行为：

- `manual`：只有用户明确要求时才使用 lane-specific 执行
- `suggest`：先提出拆分方案并等待确认；这是默认值
- `auto`：在当前执行中自动把任务拆到匹配的 lane helpers 上

这些 lane-scoped helpers 仍然属于现有的 `superpowers` 执行流。它们只是把执行时使用的 lane 更明确地暴露出来，并不会引入新的顶层工作流系统。

## OMS 控制平面

Stage 1 新增了宿主本地控制平面命令：

- `oh-my-superagents status --host <opencode|codex|qwen|claude|copilot>`
- `oh-my-superagents use <preset-or-short> --host <opencode|codex|qwen|claude|copilot>`
- `oh-my-superagents disable --host <opencode|codex|qwen|claude|copilot>`
- `oh-my-superagents sync --host <opencode|codex|qwen|claude|copilot>`
- `oh-my-superagents doctor --host <opencode|codex|qwen|claude|copilot>`

行为说明：

- `status` 和 `doctor` 在没有真实配置文件时可以回退到内置默认配置
- `use` 和 `disable` 在没有配置文件时可以创建首个分层 OMS 配置
- `sync` 仍然要求存在真实配置源，除非显式传入 `--config`
- `use` 先按 preset key 匹配，再按唯一 `short` 匹配
- `disable` 和禁用状态下的 `sync` 只清理**当前宿主**的 OMS 工件，不会去动别的宿主
- `status` 与 `doctor` 的工件检查也只针对当前宿主
- `--host claude` 当前管理的工件面是项目级 `.claude/skills/*/SKILL.md`
- `--host copilot` 当前管理的工件面是项目级 `.github/prompts/*.md`

## 就绪度诊断面

OMS 现在会把四个不同问题分开暴露，而不是把一切都压成一个笼统的“是否 ready”结论：

- `support`：OMS 是否从产品能力上支持这个 host/source/route 或命令组合。它来自共享能力策略层，对外体现在 `readiness.support`。
- `availability`：当前是否能检测到该 route 所需的 upstream source。它体现在 `readiness.availability`，状态包括 `available`、`not_detected`、`error`、`not_implemented`。
- `compatibility`：如果已经检测到 upstream `superpowers`，它是否落在 OMS 当前测试过的兼容矩阵里。它会体现在宿主级顶层 `compatibility`，以及适用时的 route 级 `readiness.compatibility`。
- `sync state`：当前宿主的 OMS 管理工件是已存在、缺失还是陈旧。`status` 和 `doctor` 都会返回宿主本地的 `artifacts`；对 OpenCode 来说，`status` 还会进一步汇总成 `state`、`nextAction`、`artifactSummary`，而 `doctor` 只额外暴露 `artifactSummary`，不会带上这两个仅属于 `status` 的字段。

这些信号彼此独立。例如，Qwen 上不支持的 gstack 投影会直接停在 `support.supported: false`；Claude 上 gstack 检测器崩溃会表现为 `availability.status: "error"`；OpenCode wrapper 缺失属于 sync-state 问题，而不是 compatibility 问题。

## AI 辅助路由编写

`author routing` 是面向路由配置的 AI 辅助编写能力。它会结合仓库信号与本地模型清单，提出 lane、profile、preset 以及可选的 direct-mode intent 配置建议。它不是自动改写器，也不会静默写入你的配置。

首个切片的命令形态：

```bash
oh-my-superagents author routing --mode direct --models ./models.jsonc
```

行为说明：

- `--mode <superpowers|direct>` 为必填。
- `--models <path>` 在首个切片中为必填，指向本地 JSON 或 JSONC 模型清单。
- 默认只做预览：命令会输出摘要和 diff，并在 JSON 输出中返回提议的 patch，但不会落盘。
- 显式传入 `--write` 后，才会在输出相同摘要和 diff 之后写入提议的配置文档。
- 该切片是 CLI-first、宿主无关的辅助编写能力，用来帮助更快地引导或演进路由配置；最终的模型 id、lane 名称和写入动作仍由用户确认。

示例：

```bash
oh-my-superagents author routing --mode superpowers --models ./models.jsonc
oh-my-superagents author routing --mode direct --models ./models.jsonc --write
```

## 命令前缀与别名

OpenCode 与 Qwen 的命令文件名来自：

- `settings.commandPrefix`
- 每个逻辑命令的 `name`
- 每个逻辑命令的 `aliases`

例如：

```jsonc
{
  "settings": {
    "commandPrefix": "team",
    "commands": {
      "status": { "name": "state", "aliases": ["health"] },
      "sync": { "name": "refresh", "aliases": ["resync", "sync-now"] }
    }
  },
  "presets": {
    "default": {
      "label": "Default",
      "short": "def",
      "profiles": {
        "build": { "model": "openai/gpt-5" }
      },
      "routes": {},
      "defaultRoute": "build"
    }
  }
}
```

它会生成类似：

- `team-state.md`
- `team-health.md`
- `team-refresh.md`
- `team-resync.md`
- `team-sync-now.md`

## Qwen 支持

Stage 2 的 Qwen 支持在 `superpowers` workflow mode 下刻意保持很薄：

- 不做重型 bootstrap
- 不生成 `.qwen/skills`
- 只生成 wrapper agents：`.qwen/agents/*.md`
- 只生成 OMS 控制平面 wrapper commands：`.qwen/commands/*.md`
- upstream skills 通过已有的 `.qwen/skills` 或 `.agents/skills`（项目级或全局级）发现

固定的 Qwen wrapper agent 名称：

- `oms-brainstorm`
- `oms-plan`
- `oms-execute`
- `oms-review`
- `oms-verify`
- `oms-visual`
- `oms-web-test`

如果是 Qwen direct mode，OMS 会继续沿用项目内宿主原生形态，但改为生成 `ai-<intent>` commands 与 `rt-<intent>` agents。
这条 direct-mode 路径不要求 upstream skill discovery，当前支持 `status`、`doctor`、`sync`，但 `explain` 在 Qwen 上仍未支持。
如果是 gstack-backed 的 `superpowers` 路由，当前这个切片里 Qwen 不支持投影；请改用 OpenCode 或 Codex。

对于 Claude Code，当前这个切片里的 `sync` 会为 `superpowers` surface 生成项目级 `.claude/skills/*/SKILL.md` wrappers。Claude 上的 direct workflow 投影当前仍然故意不支持。

`explain --host claude --phase <phase>` 当前已支持，用于当前 Claude `superpowers` slice。

## Bootstrap

Codex 推荐第一次先执行：

```bash
oh-my-superagents bootstrap --host codex
```

它会：

- 在项目还没有配置时生成 starter `oh-my-superagents.config.jsonc`
- 生成 repo-local Codex marketplace entry：`.agents/plugins/marketplace.json`
- 生成本地 plugin bundle：`plugins/oh-my-superagents-codex/`
- 生成 `.codex/agents/*.toml`
- 生成 OMS Codex 控制平面 skills：`plugins/oh-my-superagents-codex/skills/*/SKILL.md`

完成后：

1. 重启 Codex
2. 打开 plugin 目录
3. 从本地 marketplace 安装 `oh-my-superagents-codex`

安装后的 Codex plugin 会提供 OMS 的五个控制平面入口：

- `status`
- `use`
- `disable`
- `sync`
- `doctor`

但真正的路由真相源仍然是：

- `oh-my-superagents.config.jsonc`
- `sync --host codex`

## Sync

```bash
npx oh-my-superagents sync --host opencode
npx oh-my-superagents sync --host copilot
```

```bash
oh-my-superagents sync --host codex
```

```bash
oh-my-superagents sync --host qwen
```

```bash
oh-my-superagents sync --host claude
```

可用 `--config /absolute/or/relative/path.jsonc` 覆盖默认配置发现。

对于 Qwen，`sync` 会根据当前工作流形态生成不同工件：

- `superpowers` workflow mode：生成 OMS wrapper commands 与 wrapper agents，并继续依赖 upstream skills。
- direct mode：生成 `ai-<intent>` commands 与 `rt-<intent>` agents，不依赖 upstream skills。

当前这个切片里，Qwen 故意不支持 gstack-backed 路由投影。

## Explain

对于 Copilot CLI，`sync` 会生成 `.github/prompts/*.md` prompt 文件，包含 phase prompts 和 control plane command prompts。

当前这个切片里，Copilot CLI 故意不支持 gstack-backed 路由投影。

## Explain

```bash
oh-my-superagents explain --host opencode --all
```

```bash
oh-my-superagents explain --host codex --all
```

```bash
oh-my-superagents explain --host claude --phase writing-plans
```

`explain` 当前在 v1 支持 `--host opencode`、`--host codex`、`--host claude` 和 `--host copilot`。

当控制平面的 explainability 可用时，`explain` 会返回 `routeSource`、`configSource`、`reuseRelationship`、`resolvedSource`、`sourceEntry` 这类 route trace 字段，并附带 route 级 `readiness`。单条输出会带顶层 `compatibility`；`--all` 会保持数组形态，并把 `compatibility` 挂到每个条目上。

## 兼容性监控

`oh-my-superagents` 内置了对 upstream `superpowers` 的宿主级兼容性监控。

当前首版支持：

- OpenCode：从 project/user `opencode.json` plugin entry 和本地安装路径中检测
- Codex：从标准 clone 路径与 skills symlink 中检测
- Qwen：当前还没有做兼容性监控
- Copilot CLI：当前还没有做兼容性监控

这个监控是**观察型**的，不负责安装或升级 upstream `superpowers`。

当前已有兼容性监控的宿主，会在 `status`、`doctor`、`sync`、`explain`、`bootstrap` 的 JSON 输出里暴露宿主级 `compatibility`。

兼容性状态包括：

- `compatible`
- `untested`
- `incompatible`
- `not_detected`

配置方式：

```jsonc
{
  "settings": {
    "superpowersCompatibility": {
      "mode": "warn"
    }
  }
}
```

## 生成的宿主工件

### OpenCode

- `.opencode/agents/*.md`
- `.opencode/commands/*.md`

### Codex

- `.codex/agents/*.toml`
- `.agents/plugins/marketplace.json`
- `plugins/oh-my-superagents-codex/.codex-plugin/plugin.json`
- `plugins/oh-my-superagents-codex/skills/*/SKILL.md`

在 `superpowers` workflow mode 下，这些 agent 是固定的 `oms-*` phase agents。
在 direct mode 下，这些 agent 会变成 `rt-<intent>.toml`，并额外生成对应的 repo-local `ai-<intent>` bootstrap skills。

### Qwen

- `.qwen/agents/*.md`
- `.qwen/commands/*.md`

在 `superpowers` workflow mode 下，这些是 OMS wrapper agents 与 wrapper commands，并依赖 upstream skills。
在 direct mode 下，这些会变成 `rt-<intent>.md` 与 `ai-<intent>.md`，不依赖 upstream skills。

### Copilot CLI

- `.github/prompts/*.md`

在 `superpowers` workflow mode 下，这些是 OMS phase prompt 文件，例如 `oms-brainstorm.md`、`oms-plan.md` 等。
在 direct mode 下，这些会变成 `rt-<intent>.md` prompt 文件。

Copilot CLI 的 prompt 文件使用 YAML frontmatter，包含 `name`、`description` 和 `model` 字段，后接 markdown 格式的 prompt 内容。

## 致谢

本项目建立在以下项目和社区的工作之上，并从中汲取灵感：

- **[superpowers](https://github.com/obra/superpowers)** — 上游工作流技能系统，`oh-my-superagents` 为其提供路由与补充。核心设计原则是补充，而非竞争。
- **[oh-my-opencode](https://github.com/anomalyco/oh-my-opencode)** — AI CLI 领域最早的 `oh-my-*` 编排框架，确立了命名规范并证明了宿主原生路由的价值。OMS 刻意采取更轻量的方式，同时共享同一生态。
- **[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)** — 同生态项目，其 Claude Code 宿主原语为本项目提供了有价值的宿主能力参考。OMS 在保持自身轻量适配架构的同时借鉴了这些能力。
- **[oh-my-codex](https://github.com/scalarian/oh-my-codex)** — 同生态项目，面向 Codex CLI 的编排层，同属 `oh-my-*` AI CLI 工具家族。
- **[OpenCode](https://github.com/anomalyco/opencode)** — 主要宿主平台，提供 OMS 优先适配的插件与 agent 系统。
- **[Codex](https://github.com/openai/codex)** — OpenAI Codex CLI，支持的宿主平台，拥有独立的 agent 与 plugin 原语。
- **[Qwen Code](https://github.com/QwenLM/qwen-code)** — 阿里 Qwen Code CLI，支持的宿主平台。
- **[Claude Code](https://github.com/anthropics/claude-code)** — Anthropic Claude Code CLI，支持的宿主平台。
- **[GitHub Copilot CLI](https://github.com/cli/cli)** — GitHub Copilot CLI (`gh copilot`)，支持的宿主平台，通过 prompt 文件提供可复用的提示模板。
- **[gstack](https://github.com/garrytan/gstack)** — 一等公民级工作流源，提供结构化的专家 agent，在 OMS 中作为工作流源适配器使用。

## 许可证

[MIT](./LICENSE)

## 切换回英文

如需英文说明，请回到：

[README.md](./README.md)
