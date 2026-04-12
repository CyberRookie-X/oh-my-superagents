# oh-my-superagents

[English](./README.md) | [简体中文](./README.zh-CN.md)

架构说明：[English](./docs/README-architecture.md) | [简体中文](./docs/README-architecture.zh-CN.md)

`oh-my-superagents` 正在演进为一个更通用的路由与 OMS 控制平面产品，当前在 OpenCode、Codex、Qwen 上提供一等公民级别的 `superpowers` 支持，并包含一个实验性的 OpenCode 优先 direct mode 切片。

## 支持矩阵

| 能力 | OpenCode | Codex | Qwen | Claude Code |
| --- | --- | --- | --- | --- |
| `superpowers` 工作流路由 | 完整支持 | 完整支持 | 部分支持 | 暂不计划 |
| Direct mode | 实验性支持 | 暂未实现 | 暂未实现 | 暂不计划 |
| OMS 控制平面 | 完整支持 | 完整支持 | 完整支持 | 暂不计划 |
| 宿主引导/Bootstrap | 原生插件入口 | 本地 bootstrap / plugin bundle | 暂无 | 暂不计划 |
| 上游兼容性监控 | 完整支持 | 完整支持 | 暂未实现 | 暂不计划 |
| 生成宿主工件 | Agents + Commands | Agents + Plugin/Skills | Agents + Commands | 无 |
| 临时停用 helper | 完整支持 | 完整支持 | 暂未实现 | 暂不计划 |
| `codexFast` | 部分支持 | 完整支持 | 暂未实现 | 暂不计划 |

支持等级说明：

- `完整支持`：已实现并纳入当前支持范围
- `实验性支持`：作为首个通用切片已实现，但后续仍可能继续演进
- `部分支持`：已实现，但有明确的阶段性边界
- `暂未实现`：当前版本还没有做
- `暂不计划`：现阶段明确不做

补充说明：

- 临时停用 helper 是宿主本地、会话级的提示便捷功能，不会改变持久化的 OMS 状态。
- `codexFast` 在 Codex 上是完整支持，在 OpenCode 上仍属于分阶段/部分支持；Qwen 目前还不支持。

## 实现厚度

项目刻意采用“共享 OMS 核心 + 薄工作流/宿主适配层”的结构。
下面这个表用当前实现文件的源码行数来表示各层的厚薄程度，不包含测试和文档。

| 层 | 主要文件 | 大致源码行数 | 厚度 |
| --- | --- | ---: | --- |
| OMS 控制平面核心 | `src/control-plane.ts`、`src/config.ts`、`src/cli.ts` | 3213 | 中等 |
| 工作流适配层 | `src/router.ts`、`src/workflow-superpowers.ts` | 152 | 薄 |
| OpenCode 适配层 | `src/opencode.ts` | 399 | 薄 |
| Codex 适配 + bootstrap | `src/codex.ts`、`src/codex-bootstrap.ts` | 624 | 中等 |
| Qwen 适配层 | `src/qwen.ts` | 220 | 薄 |
| 兼容性监控 | `src/superpowers-compatibility.ts`、`src/superpowers-detectors.ts` | 1051 | 中等 |
| 共享工件协调层 | `src/materialize.ts` | 429 | 薄到中等 |

理解方式：

- `薄`：以宿主特定渲染或轻量集成为主
- `中等`：包含共享策略、配置解析、生命周期、bootstrap 等逻辑
- OMS 整体设计上刻意让“共享核心”比任何单个宿主适配层更厚

## 项目边界

`oh-my-superagents` 正在演进成一个更广义的路由与控制平面产品。
当前它仍然在已支持宿主上提供一等公民级别的 `superpowers` 支持，而首个通用切片则是实验性的 OpenCode direct mode。

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
- 实验性的 OpenCode direct mode 切片
- 当前 `oh-my-superagents/library` 导出面

当前结论：

- OpenCode：支持 `superpowers` 工作流路由，也支持实验性的 direct mode 切片
- Codex：支持 `superpowers` 工作流路由
- Qwen：支持，但目前仍是有边界的 Stage 2 `superpowers` 工作流形态
- Claude Code：暂不计划，因为原生能力已经足够强

## 它能做什么

- 从项目级和全局级位置读取分层的 `oh-my-superagents.config.jsonc`
- 在已支持宿主上解析内置 `superpowers` phase 路由，并在 OpenCode 上解析用户定义的 direct intent 路由
- 生成 `.opencode/agents/*.md` 与 `.opencode/commands/*.md`
- 生成 `.codex/agents/*.toml`
- 生成 `.qwen/agents/*.md` 与 `.qwen/commands/*.md`
- 提供 `status`、`use`、`disable`、`sync`、`doctor`、`explain`、`bootstrap` CLI
- 提供最小 OpenCode plugin 入口用于启动诊断

## OpenCode Direct Mode

首个通用路由切片是 OpenCode 上的实验性 direct workflow。

- 使用用户定义的 intent，并生成 OpenCode 原生的 `ai-<intent>` commands 与 `rt-<intent>` agents。
- 当前只适用于 `--host opencode`。
- 当前 direct mode 的控制平面支持面为 `status`、`doctor`、`explain`、`sync`。
- 渲染或解释 direct mode 的 OpenCode 工件时，不依赖 upstream `superpowers`。

## 安装

如果使用 `superpowers` workflow mode，请先单独安装 upstream `superpowers`，然后按宿主分别接入。
如果使用实验性的 OpenCode direct mode，则不要求安装 upstream `superpowers`。

按宿主的接入方式：

- OpenCode：把 `oh-my-superagents` 加到 OpenCode plugin 列表
- Codex：使用打包后的 CLI 执行 `bootstrap --host codex`
- Qwen：使用 `sync --host qwen`；当前 Stage 2 没有重型 bootstrap 流程

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
- `--lane <name>` 是 `status`、`doctor`、`explain`、`sync` 的单次运行时 lane 覆盖，不会被持久化。

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

## OMS 控制平面

Stage 1 新增了宿主本地控制平面命令：

- `oh-my-superagents status --host <opencode|codex|qwen>`
- `oh-my-superagents use <preset-or-short> --host <opencode|codex|qwen>`
- `oh-my-superagents disable --host <opencode|codex|qwen>`
- `oh-my-superagents sync --host <opencode|codex|qwen>`
- `oh-my-superagents doctor --host <opencode|codex|qwen>`

行为说明：

- `status` 和 `doctor` 在没有真实配置文件时可以回退到内置默认配置
- `use` 和 `disable` 在没有配置文件时可以创建首个分层 OMS 配置
- `sync` 仍然要求存在真实配置源，除非显式传入 `--config`
- `use` 先按 preset key 匹配，再按唯一 `short` 匹配
- `disable` 和禁用状态下的 `sync` 只清理**当前宿主**的 OMS 工件，不会去动别的宿主
- `status` 与 `doctor` 的工件检查也只针对当前宿主

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

Stage 2 的 Qwen 支持刻意保持很薄：

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
oh-my-superagents sync --host opencode
```

```bash
oh-my-superagents sync --host codex
```

```bash
oh-my-superagents sync --host qwen
```

可用 `--config /absolute/or/relative/path.jsonc` 覆盖默认配置发现。

## 兼容性监控

`oh-my-superagents` 内置了对 upstream `superpowers` 的宿主级兼容性监控。

当前首版支持：

- OpenCode：从 project/user `opencode.json` plugin entry 和本地安装路径中检测
- Codex：从标准 clone 路径与 skills symlink 中检测
- Qwen：当前还没有做兼容性监控

这个监控是**观察型**的，不负责安装或升级 upstream `superpowers`。

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

### Qwen

- `.qwen/agents/*.md`
- `.qwen/commands/*.md`

## 切换回英文

如需英文说明，请回到：

[README.md](./README.md)
