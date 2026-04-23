# oh-my-superagents 项目架构分析报告

## 项目概述

`oh-my-superagents` 是一个面向 AI CLI 工具的路由与控制平面产品，为 OpenCode、Codex、Qwen、Claude Code 等宿主提供一等公民级别的 `superpowers` 工作流支持，并包含覆盖多个宿主的实验性 direct mode。

## 核心定位

项目遵循一条核心设计原则：**让共享 OMS 核心比任何单个宿主适配层都更厚**。

它不是：
- upstream `superpowers` 的替代品
- 跨宿主配置同步系统
- 重型多 agent 编排框架

## 支持矩阵

| 能力 | OpenCode | Codex | Qwen | Claude Code |
| --- | --- | --- | --- | --- |
| `superpowers` 工作流路由 | 完整支持 | 完整支持 | 部分支持 | 实验性支持 |
| Direct mode | 实验性支持 | 实验性支持 | 实验性支持 | 暂未实现 |
| OMS 控制平面 | 完整支持 | 完整支持 | 完整支持 | 实验性支持 |
| 宿主引导/Bootstrap | 原生插件入口 | 本地 bootstrap/plugin bundle | 暂无 | 暂无 |
| 上游兼容性监控 | 完整支持 | 完整支持 | 暂未实现 | 暂未实现 |
| 生成宿主工件 | Agents + Commands | Agents + Plugin/Skills | Agents + Commands | Skills |
| 临时停用 helper | 完整支持 | 完整支持 | 暂未实现 | 暂未实现 |
| `codexFast` | 完整支持 | 完整支持 | 暂未实现 | 暂未实现 |

## 架构分层

### 1. 控制平面核心（中等厚度）

核心文件：
- `src/control-plane.ts` - OMS 状态管理
- `src/config.ts` - 配置加载与解析
- `src/cli.ts` - CLI 命令入口

职责：
- 分层配置加载（全局 + 项目级）
- 旧配置迁移
- preset 选择与管理
- 命令前缀与别名解析
- `status/use/disable/sync/doctor` 命令行为

### 2. 宿主适配层（薄）

| 适配层 | 文件 | 源码行数 | 厚度 |
| --- | --- | --- | --- |
| OpenCode | `src/opencode.ts` | 633 | 薄 |
| Codex | `src/codex.ts`, `src/codex-bootstrap.ts` | 760 | 中等 |
| Qwen | `src/qwen.ts` | 424 | 薄 |
| Claude Code | `src/claude.ts` | 138 | 薄 |

职责：
- 渲染宿主原生工件
- OMS phase/command 到宿主原生入口的映射
- 处理宿主特定约束

### 3. 工作流适配层（薄）

- `src/workflow-superpowers.ts` - superpowers 工作流路由
- `src/workflow-gstack.ts` - gstack 工作流源适配
- `src/workflow-direct.ts` - direct mode 工作流
- `src/workflow-sources.ts` - 工作流源管理
- `src/router.ts` - 通用路由核心

### 4. 兼容性监控（中等厚度）

- `src/superpowers-compatibility.ts` - 兼容性评估
- `src/superpowers-detectors.ts` - upstream 检测

### 5. 工件协调层（薄到中等）

- `src/materialize.ts` - 工件生成与清理

### 6. 策略与能力层

- `src/capabilities.ts` - 能力定义
- `src/policy-resolution.ts` - 策略解析
- `src/policy-selectors.ts` - 策略选择
- `src/policy-families.ts` - 策略族
- `src/author-routing.ts` - AI 辅助路由编写

### 7. 上下文管理

- `src/context-providers.ts` - 上下文提供者
- `src/context-packs.ts` - 上下文包
- `src/context-lifecycle.ts` - 上下文生命周期
- `src/context-index.ts` - 上下文索引
- `src/context-compression.ts` - 上下文压缩

### 8. 其他核心模块

- `src/authority-config.ts` - 权威配置
- `src/author-policy.ts` - 创作策略
- `src/config-recovery.ts` - 配置恢复
- `src/config-write.ts` - 配置写入
- `src/lane-execution.ts` - Lane 感知执行
- `src/upstream-readiness.ts` - 上游就绪度
- `src/openspec.ts` - OpenSpec 支持

## Canonical Route 模型

- 内置 OMS phase 保持 `writing-plans` 等稳定名称
- 内部规范化为 `phase.plan` 这类 canonical route id
- Source adapter 映射到 source-native workflow entry
- Source override、explain 输出以 canonical route id 为准

## Lane 路由模型

- `phase` - 稳定的 superpowers 工作流 key
- `lane` - 技术栈组织的 route bundle
- `profile` - 最终的 model/config 叶子
- `preset` - 工作模式选择

Lane-aware 执行模式：
- `manual` - 仅用户明确要求时使用
- `suggest` - 先提出方案等待确认
- `auto` - 自动拆分到匹配 lane

## Direct Mode

实验性功能，保持宿主原生形态：
- OpenCode: `ai-<intent>` commands + `rt-<intent>` agents
- Codex: `rt-<intent>.toml` + `ai-<intent>` bootstrap skills
- Qwen: `ai-<intent>.md` + `rt-<intent>.md`

## OMS 控制平面命令

- `oh-my-superagents status --host <host>`
- `oh-my-superagents use <preset> --host <host>`
- `oh-my-superagents disable --host <host>`
- `oh-my-superagents sync --host <host>`
- `oh-my-superagents doctor --host <host>`

## 就绪度诊断维度

- `support` - 产品能力支持
- `availability` - upstream source 检测
- `compatibility` - 兼容性矩阵评估
- `sync state` - 工件同步状态

## 技术栈

- 语言: TypeScript
- 包管理: pnpm
- 测试: vitest
- 依赖:
  - `@opencode-ai/plugin` - OpenCode 插件接口
  - `jsonc-parser` - JSONC 解析
  - `zod` - 数据校验

## 配置文件结构

```jsonc
{
  "settings": {
    "enabled": true,
    "activePreset": "default",
    "commandPrefix": "oms"
  },
  "presets": {
    "default": {
      "label": "Default",
      "profiles": { ... },
      "routes": { ... }
    }
  }
}
```

## 总结

项目采用「共享核心 + 薄适配层」的架构，刻意保持核心比任何单个适配层更厚。这种设计确保了：
1. 宿主适配层可替换
2. OMS 语义跨宿主一致
3. 新宿主支持决策有据可依
