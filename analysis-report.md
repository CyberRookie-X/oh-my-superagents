# Oh-My-Superagents 项目架构分析报告

> 生成时间：2026年4月22日  
> 分析分支：MT-5  
> 项目版本：0.1.0

---

## 1. 项目概述

### 1.1 项目定位

`oh-my-superagents` (OMS) 是一个**AI 工作流路由与控制平面**产品，为多宿主 AI CLI 环境（OpenCode、Codex、Qwen、Claude Code）提供统一的配置管理、路由决策和工件生成功能。

核心设计原则：

> **让共享 OMS 核心比任何单个宿主适配层都更厚**

这意味着：
- 宿主适配层保持可替换性
- OMS 语义在所有支持宿主上保持一致
- 新宿主支持只需补上一个真实的缺口

### 1.2 支持矩阵

| 能力 | OpenCode | Codex | Qwen | Claude Code |
|------|----------|-------|------|-------------|
| `superpowers` 工作流路由 | 完整 | 完整 | 部分 | 实验性 |
| Direct Mode | 实验性 | 实验性 | 实验性 | 暂无 |
| OMS 控制平面 | 完整 | 完整 | 完整 | 实验性 |
| 宿主引导 | 原生插件入口 | 本地引导/插件包 | 无 | 无 |
| 兼容性监控 | 完整 | 完整 | 暂无 | 暂无 |
| 临时禁用助手 | 完整 | 完整 | 暂无 | 暂无 |
| `codexFast` | 完整 | 完整 | 暂无 | 暂无 |

---

## 2. 架构分层

### 2.1 五层架构模型

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: 文档与计划层 (docs/superpowers/)                   │
│  - 实现前记录决策                                             │
│  - 阶段性工作保持显式                                         │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: 工件协调层 (materialize.ts)                        │
│  - 安全写入生成工件                                           │
│  - OMS 拥有的工件识别与清理                                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: 兼容性监控 (superpowers-compatibility.ts)          │
│  - upstream superpowers 安装状态检测                         │
│  - 兼容矩阵评估                                               │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: 宿主适配层 (opencode.ts, codex.ts, qwen.ts,        │
│                       claude.ts, codex-bootstrap.ts)         │
│  - 渲染宿主原生工件                                           │
│  - OMS phase 和命令映射                                       │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: 控制平面核心 (control-plane.ts, config.ts,         │
│                         cli.ts)                              │
│  - 分层配置加载                                               │
│  - preset 选择与管理                                          │
│  - OMS 命令行为实现                                           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 源码规模分析

| 层级 | 主要文件 | 大致源码行数 | 厚度 |
|------|----------|-------------:|------|
| OMS 控制平面核心 | `control-plane.ts`, `config.ts`, `cli.ts` | ~4,300 | 中等 |
| 工作流适配器 | `router.ts`, `workflow-*.ts` | ~371 | 薄 |
| 共享能力策略 | `capabilities.ts` | ~97 | 薄 |
| OpenCode 适配层 | `opencode.ts` | ~633 | 薄 |
| Codex 适配 + 引导 | `codex.ts`, `codex-bootstrap.ts` | ~760 | 中等 |
| Qwen 适配层 | `qwen.ts` | ~424 | 薄 |
| Claude 适配层 | `claude.ts` | ~138 | 薄 |
| 兼容性监控 | `superpowers-compatibility.ts`, `superpowers-detectors.ts` | ~1,093 | 中等 |
| 共享工件协调 | `materialize.ts` | ~712 | 薄到中等 |

**总计**：~13,582 行 TypeScript 源码（不含测试和文档）

---

## 3. 核心模块分析

### 3.1 控制平面核心 (control-plane.ts)

**职责范围**：
- 解析控制平面状态（`resolveControlPlane`）
- 准备控制平面状态写入
- 构建状态快照
- 处理 Lane 感知路由
- 上下文生命周期管理
- 压缩策略评估

**关键类型定义**：
```typescript
export type ResolvedControlPlane = {
  source: { kind: "default" | "file"; hasRealSource: boolean; sources: string[] }
  effective: { config: ControlPlaneConfig; provenance: ResolvedConfigProvenance }
  // ... 路由、预设、profile 等
}
```

### 3.2 配置系统 (config.ts)

**核心功能**：
- 分层配置加载（全局 + 项目级）
- JSONC 解析与校验（Zod schema）
- 旧配置迁移支持
- 预设（Preset）模型
- Profile 定义（模型、effort、codexFast 等）
- Lane 配置（laneSelection、usesLanes）

**配置结构**：
```typescript
interface ControlPlaneConfig {
  settings: {
    enabled: boolean
    activePreset: string
    commandPrefix: string
    commands: Record<string, CommandConfig>
    superpowersCompatibility: { mode: "warn" | "strict" }
    laneSelection: { mode: "manual" | "suggest" | "auto" }
    subagentExecution: { mode: "manual" | "suggest" | "auto" }
  }
  presets: Record<string, PresetConfig>
  profiles: Record<string, ProfileConfig>
  lanes?: Record<string, LaneConfig>
}
```

### 3.3 路由器 (router.ts)

**路由解析流程**：
1. 解析 canonical route ID
2. 确定工作流类型（superpowers vs direct）
3. 解析 effective sources
4. 匹配 preset/lane 路由
5. 返回 ResolvedRoute

**路由源类型**：
- `superpowers`: upstream superpowers 工作流
- `gstack`: Garry Tan 的 gstack 工作流源
- `direct`: 用户自定义意图

### 3.4 工作流源管理

| 源类型 | 文件 | 功能 |
|--------|------|------|
| superpowers | `workflow-superpowers.ts` | upstream superpowers 路由目录 |
| gstack | `workflow-gstack.ts` | gstack 工作流源适配 |
| direct | `workflow-direct.ts` | 直接工作流意图管理 |
| sources | `workflow-sources.ts` | 通用源抽象与规范化 |

---

## 4. 宿主适配层详解

### 4.1 OpenCode 适配层 (opencode.ts)

**特点**：
- 原生插件入口支持
- 项目内 agents 与 commands
- 适合薄生成包装层

**生成工件**：
- `.opencode/agents/*.md` - OMS wrapper agents
- `.opencode/commands/*.md` - OMS 控制平面命令

### 4.2 Codex 适配层 (codex.ts + codex-bootstrap.ts)

**特点**：
- 项目内 agents（TOML 格式）
- 本地 plugin bundle 与 marketplace entry
- Bootstrap 流程较重

**生成工件**：
- `.codex/agents/*.toml` - OMS phase agents
- `.agents/plugins/marketplace.json` - 市场入口
- `plugins/oh-my-superagents-codex/` - 本地插件包

### 4.3 Qwen 适配层 (qwen.ts)

**特点**：
- Stage 2 支持（故意窄范围）
- 无重型 bootstrap 层
- wrapper 型集成

**生成工件**：
- `.qwen/agents/*.md` - wrapper agents
- `.qwen/commands/*.md` - 控制平面命令包装器

### 4.4 Claude Code 适配层 (claude.ts)

**当前状态**：
- 实验性支持
- 仅支持 superpowers 工作流 slice
- Direct workflow 投影暂未实现

**生成工件**：
- `.claude/skills/*/SKILL.md` - 项目级 Claude skills

**技能映射**：
```typescript
const PHASE_TO_CLAUDE_SKILL = {
  brainstorming: "oms-brainstorm",
  "writing-plans": "oms-plan",
  "subagent-driven-development": "oms-execute",
  "requesting-code-review": "oms-review",
  "verification-before-completion": "oms-verify",
  "frontend-design": "oms-visual",
  "webapp-testing": "oms-web-test",
}
```

---

## 5. 关键设计模式

### 5.1 Canonical Route Model

```
用户输入 phase (如 "writing-plans")
    ↓
规范化到 canonical route ID (如 "phase.plan")
    ↓
源适配器映射到源原生入口
    ↓
宿主适配器消费 canonical route 渲染宿主原生工件
```

### 5.2 Lane-Aware Routing

```
phase (固定 superpowers 工作流键)
    ↓
lane (技术栈路由包，如 frontend/backend/infra)
    ↓
profile (携带可执行设置的叶子模型/配置)
```

### 5.3 Readiness Surfaces

OMS 诊断分离四个独立问题：

1. **support**: 是否支持该宿主/源/路由组合
2. **availability**: 所需上游源当前是否可检测
3. **compatibility**: 检测到的 upstream 版本是否在测试矩阵内
4. **sync state**: OMS 管理工件的存在/缺失/陈旧状态

---

## 6. 扩展性分析

### 6.1 添加新宿主

**评估标准**：
> 这个宿主是否仍然存在一个真实缺口，而且 OMS 能在不把自己做成宿主专用框架的前提下补上它？

**需要实现**：
1. 宿主适配模块（`src/{host}.ts`）
2. 工件渲染函数
3. 能力报告函数
4. CLI 集成（`--host {host}` 支持）

### 6.2 添加新工作流源

1. 在 `workflow-sources.ts` 定义源类型
2. 创建 `workflow-{source}.ts` 模块
3. 在 `capabilities.ts` 注册宿主-源支持矩阵
4. 在适配层实现源特定渲染逻辑

---

## 7. 现存 Gap 与改进机会

### 7.1 Copilot CLI 支持缺失

**现状**：项目当前未提供对 **GitHub Copilot CLI** 的宿主支持。

**Gap 分析**：
- Copilot CLI 是广泛使用的 AI CLI 工具
- 存在与其他宿主类似的缺口：需要统一的路由决策和配置管理
- 可参考现有宿主适配模式实现

**建议实现方向**：
1. **Agent + Plugin + Hooks 方案**：
   - Agent：OMS 路由决策 Copilot agent
   - Plugin：Copilot CLI 扩展入口
   - Hooks：工作流生命周期钩子

2. **工件投影**：
   - Copilot CLI 命令包装器
   - OMS 配置文件集成

### 7.2 其他改进机会

| 领域 | 机会 | 优先级 |
|------|------|--------|
| Claude Code | 实现 Direct Mode 投影 | 中 |
| Qwen | 扩展至完整 superpowers 支持 | 中 |
| 兼容性监控 | 添加 Gemini CLI 支持 | 低 |
| Context Providers | 扩展 MCP 集成 | 中 |

---

## 8. 技术债务与质量

### 8.1 代码质量指标

- **类型安全**：全面使用 TypeScript 严格模式 + Zod 运行时校验
- **模块化**：清晰的层次边界，单向依赖
- **可测试性**：依赖注入模式支持 mock

### 8.2 潜在技术债务

1. **Claude direct mode**: 当前抛出异常未实现
2. **Codex bootstrap**: 较重的本地插件包管理
3. **gstack Qwen 支持**: 明确标记为不支持

---

## 9. 总结

### 9.1 架构优势

1. **清晰的层次分离**：控制平面核心厚实，宿主适配层单薄
2. **一致的跨宿主语义**：路由、源、profile 概念统一
3. **可扩展的设计模式**：新宿主/源添加有明确路径
4. **类型安全**：从配置到工件的端到端类型保障

### 9.2 下一步建议

1. **高优先级**：实施 Copilot CLI 宿主深度支持（Agent + Plugin + Hooks 方案）
2. **中优先级**：完善 Claude Code Direct Mode 实现
3. **低优先级**：扩展兼容性监控至更多宿主

---

*报告结束*
