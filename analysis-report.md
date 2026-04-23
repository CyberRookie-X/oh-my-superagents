# oh-my-superagents 项目架构与设计分析报告

## 1. 项目概述

`oh-my-superagents`（简称 OMS）是一个 AI 工作流路由与控制平面产品，为 OpenCode、Codex、Qwen 和 Claude Code 等 AI CLI 宿主提供原生路由支持和 OMS 控制平面功能。项目以 `superpowers` 工作流为核心，同时支持实验性的宿主原生直接模式（Direct Mode）。

### 1.1 核心定位

- **不是**上游 `superpowers` 的替代品
- **不是**跨宿主配置同步工具
- **不是**重量级多智能体编排框架
- **是**一个路由和控制平面产品，保持共享 OMS 核心比任何单个宿主适配器更"厚"

### 1.2 支持矩阵

| 能力 | OpenCode | Codex | Qwen | Claude Code |
|------|----------|-------|------|-------------|
| `superpowers` 工作流路由 | 完整 | 完整 | 部分 | 实验性 |
| 直接模式 | 实验性 | 实验性 | 实验性 | 暂无 |
| OMS 控制平面 | 完整 | 完整 | 完整 | 实验性 |
| 宿主引导 | 原生插件入口 | 本地引导/插件包 | 无 | 无 |
| 兼容性监控 | 完整 | 完整 | 暂无 | 暂无 |
| 生成的宿主产物 | Agents + Commands | Agents + Plugin/Skills | Agents + Commands | Skills |

## 2. 架构分层

项目采用七层架构设计，每层职责明确，边界清晰。

### 2.1 控制平面核心层（Control Plane Core）

**主要文件：**
- `src/control-plane.ts`（1779 行）- 控制平面核心逻辑
- `src/config.ts`（1502 行）- 配置加载与验证
- `src/cli.ts`（3084 行）- CLI 命令实现

**职责：**
- 分层配置加载（全局 + 项目级）
- 遗留配置迁移
- 预设选择与切换
- 命令前缀和别名解析
- OMS `status/use/disable/sync/doctor` 行为
- 构建 `status`、`doctor` 和 `explain` 诊断信息

**设计特点：**
这是最"厚"的一层，因为产品语义集中在此，所有支持的宿主都依赖它。配置和生命周期规则必须在宿主间保持一致。

### 2.2 工作流适配器层（Workflow Adapters）

**主要文件：**
- `src/router.ts`（188 行）- 路由解析核心
- `src/workflow-direct.ts` - 直接模式工作流
- `src/workflow-superpowers.ts` - superpowers 工作流
- `src/workflow-gstack.ts` - gstack 工作流
- `src/workflow-sources.ts` - 工作流源定义

**职责：**
- 将工作流特定的路由词汇保持在通用路由解析器之外
- 将内置 OMS 阶段输入规范化为真正的规范路由 ID（如 `phase.plan`）
- 通过源适配器将规范路由映射到源原生条目（如 `writing-plans` 或 `plan-eng-review`）
- 保持 `superpowers` 作为一等公民工作流适配器
- 让 OpenCode 直接模式切片解析用户定义的意图

**规范路由模型：**
- 内置 OMS 阶段输入保持为用户可见的稳定阶段名称（如 `writing-plans`），但共享路由器将它们规范化为真正的规范路由 ID（如 `phase.plan`）
- 源适配器将这些规范路由映射到源原生工作流条目
- 宿主适配器消费解析后的规范路由及其源条目元数据

### 2.3 共享能力策略层（Shared Capability Policy）

**主要文件：**
- `src/capabilities.ts`（97 行）

**职责：**
- 让源适配器专注于定义规范路由存在哪些上游条目
- 让能力注册表决定 OMS 是否支持源-路由、宿主-源投影或控制平面命令组合
- 返回结构化的支持决策和原因代码

**设计特点：**
路由解析和支持策略是不同的关注点，需要不同的扩展点。失败关闭的支持规则在添加新源、宿主或命令时保持一致。

### 2.4 宿主适配器层（Host Adapters）

**主要文件：**
- `src/opencode.ts`（633 行）- OpenCode 适配器
- `src/codex.ts`（197 行）+ `src/codex-bootstrap.ts` - Codex 适配器
- `src/qwen.ts`（424 行）- Qwen 适配器
- `src/claude.ts`（138 行）- Claude 适配器

**职责：**
- 从解析后的规范路由和源条目渲染宿主原生产物
- 将 OMS 阶段和命令映射到宿主原生入口点
- 应用宿主特定约束而不改变 OMS 语义

**各宿主特点：**

#### OpenCode
- 原生插件入口点
- 项目本地代理和命令
- 第一个通用直接模式切片的宿主
- 适合薄生成包装器

#### Codex
- 项目本地代理
- 本地插件包和市场入口
- 插件/引导表面与路由产物分离
- 需要路由产物和便捷引导层

#### Qwen
- 项目本地代理和命令
- 当前 OMS 范围内无重量级引导层
- 基于包装器的集成足够

#### Claude Code
- 项目范围 `.claude/skills/*/SKILL.md` 包装器
- 当前切片中无直接工作流投影
- 无重量级引导或 CLAUDE.md 接管流程

### 2.5 兼容性监控层（Compatibility Monitor）

**主要文件：**
- `src/superpowers-compatibility.ts`
- `src/superpowers-detectors.ts`

**职责：**
- 检测上游 `superpowers` 安装状态
- 根据本地兼容性矩阵进行评估
- 返回 `compatible`、`untested`、`incompatible` 或 `not_detected`

**检测结果：**
- `compatible`：检测到的版本在测试范围内
- `untested`：可解析但不在测试范围内
- `incompatible`：低于最低支持版本或在已知问题范围内
- `not_detected`：无法检测到可解析的上游版本

### 2.6 产物协调层（Artifact Reconciliation）

**主要文件：**
- `src/materialize.ts`（712 行）

**职责：**
- 安全写入生成的产物
- 检测 OMS 拥有的产物
- 在重命名或前缀更改后协调过时的宿主产物

**设计特点：**
每个宿主最终都需要相同的拥有权和清理保证。集中推理比在每个适配器内部更容易。

### 2.7 文档与计划层（Docs and Plans）

**关键位置：**
- `docs/superpowers/specs/` - 设计规范
- `docs/superpowers/plans/` - 实施计划
- `.agents/superpowers/specs/` - 代理规范

**职责：**
- 在实施前捕获决策
- 保持分阶段工作明确
- 保留阶段和宿主之间的边界

## 3. 核心设计模式

### 3.1 规范路由模型

项目的核心创新是规范路由模型：

1. **阶段（Phase）**：稳定的 `superpowers` 工作流键（如 `writing-plans`）
2. **规范路由（Canonical Route）**：内部真实层（如 `phase.plan`）
3. **源条目（Source Entry）**：源原生工作流条目（如 `superpowers/writing-plans`）
4. **宿主产物（Host Artifact）**：宿主原生文件（如 `.opencode/agents/spr-plan.md`）

这种分层确保了：
- 宿主适配器可以保持可替换
- `superpowers` 保持一等公民而不拥有整个产品身份
- OMS 语义在支持的宿主和模式间保持一致

### 3.2 就绪表面（Readiness Surfaces）

OMS 诊断有意分离四个不同的问题：

1. **支持（Support）**：OMS 是否能投影此路由或命令组合？来自 `src/capabilities.ts`，失败关闭。
2. **可用性（Availability）**：如果解析的源依赖上游安装，OMS 能否检测到该依赖？来自 `src/upstream-readiness.ts`。
3. **兼容性（Compatibility）**：如果 OMS 能检测到上游 `superpowers`，该安装是否在本地测试矩阵内？来自 `src/superpowers-compatibility.ts`。
4. **同步状态（Sync State）**：OMS 拥有的产物是否为调用宿主存在？来自产物检查和协调。

### 3.3 分层配置

配置支持全局和项目级分层：
- 全局配置：`~/.config/oh-my-superagents/config.jsonc`
- 项目配置：项目根目录的 `oh-my-superagents.config.jsonc`
- 项目设置覆盖全局设置
- 项目预设替换同名全局预设

### 3.4 车道感知路由（Lane-Aware Routing）

车道感知路由在 `phase` 固定到上游 `superpowers` 工作流键的基础上添加一个路由层：

- `phase` 保持为稳定的 `superpowers` 工作流键
- `lane` 是技术栈路由束（如 `frontend`、`backend`、`infra`）
- `profile` 是携带可执行设置的叶模型/配置对象
- `preset` 仍然选择工作模式

## 4. 关键工作流

### 4.1 同步流程（Sync）

```
用户命令 → CLI 解析 → 配置加载 → 路由解析 → 宿主适配器渲染 → 产物协调
```

### 4.2 状态检查（Status）

```
用户命令 → CLI 解析 → 配置加载 → 路由解析 → 诊断构建 → 就绪表面评估
```

### 4.3 解释流程（Explain）

```
用户命令 → CLI 解析 → 配置加载 → 路由追踪 → 源条目解析 → 诊断输出
```

## 5. 代码组织特点

### 5.1 模块化设计

- 每个文件单一职责
- 通过 TypeScript 导入/导出明确接口
- 依赖注入模式（如 `MaterializeFs` 接口）

### 5.2 类型安全

- 广泛使用 TypeScript 类型系统
- Zod 运行时验证
- 严格的类型守卫

### 5.3 测试覆盖

- 45 个测试文件
- 单元测试覆盖核心逻辑
- 集成测试验证端到端流程

### 5.4 文档驱动

- 设计规范先行
- 实施计划详细
- AI 可读文档栈

## 6. 扩展性考虑

### 6.1 新宿主支持

添加新宿主需要：
1. 创建宿主适配器文件
2. 实现产物渲染逻辑
3. 更新能力策略
4. 添加 CLI 支持
5. 编写测试

### 6.2 新工作流源

添加新工作流源需要：
1. 创建工作流源文件
2. 定义源条目
3. 更新路由解析器
4. 更新能力策略

### 6.3 控制平面扩展

控制平面支持：
- 命令前缀自定义
- 别名系统
- 预设管理
- 车道配置

## 7. 当前限制与未来方向

### 7.1 当前限制

- Claude Code 仅支持 `superpowers` 工作流切片
- Qwen 支持比 OpenCode/Codex 更窄
- 直接模式在所有宿主上都是实验性的

### 7.2 未来方向

- 完善 Claude Code 宿主深度支持
- 扩展控制平面诊断
- 增强兼容性监控
- 支持更多工作流源

## 8. 总结

`oh-my-superagents` 通过精心设计的七层架构，实现了：

1. **宿主适配器可替换**：共享 OMS 核心比任何单个宿主适配器更厚
2. **`superpowers` 一等公民**：保持核心支持而不定义整个产品身份
3. **语义一致性**：OMS 语义在支持的宿主和模式间保持一致

项目展示了如何在保持架构清晰的同时，支持多个 AI CLI 宿主的复杂集成需求。规范路由模型、就绪表面和分层配置等核心设计模式，为类似的多宿主集成项目提供了有价值的参考。
