# Copilot CLI (Codex) 宿主深度支持 — Agent + Plugin + Hooks 设计方案

## 概述

本文档定义了对 Copilot CLI（Codex 宿主）的深度支持方案，采用 **Agent + Plugin + Hooks** 三层架构，在现有 Codex 支持基础上补齐缺失能力，实现与 OpenCode 宿主同等级的功能完整度。

## 现有状态

| 维度 | OpenCode | Codex (当前) |
|---|---|---|
| Agent 生成 | `.opencode/agents/*.md`，含 lane-scoped agents | `.codex/agents/*.toml`，仅基本 phase agents |
| Plugin | `@opencode-ai/plugin` 入口点 | Bootstrap plugin（marketplace.json + plugin.json + skills） |
| Hooks | `chat.params` 运行时 hook | 无 Codex 专用 hooks |
| 控制平面命令 | 7 命令（status/use/disable/sync/doctor/explain/bootstrap） | 7 命令（通过 skills 包装） |
| 运行时元数据 | `runtime-agent-metadata.json` 生成 + plugin 加载 | 无 |
| Lane 支持 | 完整 lane-scoped 执行单元 | 无 |

## 架构设计

### Agent 层

在现有 `codex.ts` 基础上增强：

1. **Lane-scoped agents**：为 subagent-driven-development phase 生成 lane 级 agent TOML 文件
2. **运行时元数据**：生成 `runtime-agent-metadata.json`（Codex 版本），记录每个 agent 的 profile、codexFast 状态
3. **增强的 developer instructions**：加入更完整的路由上下文、lane 分割指引

### Plugin 层

在现有 `codex-bootstrap.ts` 基础上增强：

1. **MCP Server 集成**：在 plugin 中添加 MCP server 注册，提供控制平面命令的 MCP 接口
2. **App-level 集成**：生成 Codex app 清单，提供更丰富的 UI 集成
3. **插件技能增强**：增加更多辅助技能（上下文压缩、lane 管理等）

### Hooks 层

新增 Codex 专用 hooks 系统：

1. **Skill-based hooks**：增强现有 SKILL.md 生成，加入生命周期事件响应
2. **命令执行 hooks**：`command.execute.before` 的 Codex 适配
3. **工具执行 hooks**：`tool.execute.before/after` 的 Codex 适配
4. **Provider hooks**：模型提供者级别的 hook 支持（参数修改、请求拦截）

## 实现计划

### Phase 1: Agent 增强

1. 在 `codex.ts` 中添加 lane-scoped agent 生成
2. 添加运行时元数据生成
3. 增强 developer instructions

### Phase 2: Plugin 增强

1. 在 `codex-bootstrap.ts` 中添加 MCP server 集成
2. 添加 app 级清单生成
3. 增强技能集

### Phase 3: Hooks 实现

1. 实现 Codex 专用 `chat.params` hook（通过 OpenCode plugin 兼容路径）
2. 实现命令执行 hooks
3. 实现工具执行 hooks
4. 实现 provider hooks
