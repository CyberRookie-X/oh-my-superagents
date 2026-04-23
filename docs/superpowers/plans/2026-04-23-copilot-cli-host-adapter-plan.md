# Copilot CLI 宿主深度支持 - 实施计划

## 任务总览

基于设计文档 `docs/superpowers/specs/2026-04-23-copilot-cli-host-adapter-design.md`，采用 TDD + subagent-driven-development 模式完成。

## 前置条件

- [x] 项目架构分析报告 (`analysis-report.md`)
- [x] Copilot CLI 宿主适配设计文档
- [ ] 了解 Copilot CLI 指令文件格式和 Agent 系统

## 任务分解

### Task 1: 添加 Copilot 宿主能力声明
**文件**: `src/capabilities.ts`
**描述**: 在宿主能力表中添加 copilot 宿主的能力声明，定义其支持的 workflow 类型和特性。
**测试**: 无（静态配置，由后续集成测试覆盖）
**验收标准**:
- [ ] `capabilities.ts` 中包含 `copilot` 宿主定义
- [ ] workflow.superpowers.stage = 1, direct = false, gstack = false
- [ ] features.hooks = false, plugin = false

### Task 2: 实现 Copilot 适配层（TDD）
**文件**: `src/copilot.ts`, `test/copilot.test.ts`
**描述**: 创建薄适配层，参考 `src/claude.ts` 模式，实现 Agent 工件生成。
**TDD 流程**:
1. 写测试：agent 文件渲染、元数据标记、路由映射
2. 实现 `PHASE_TO_COPILOT_AGENT` 映射表
3. 实现 `renderCopilotAgentFile()` 函数
4. 实现 `buildCopilotArtifacts()` 函数
5. 实现 `assertCopilotProjectionSupport()` 能力检查
**验收标准**:
- [ ] `copilot.test.ts` 测试全部通过
- [ ] 生成 `.github/agents/*.agent.md` 工件
- [ ] 工件包含正确的 OMS 元数据标记
- [ ] 支持全部 7 个内置阶段映射

### Task 3: 集成到控制平面
**文件**: `src/control-plane.ts`, `src/materialize.ts`
**描述**: 将 copilot 适配层集成到 OMS 控制平面，使其能被 `oms use`、`oms sync` 等命令调用。
**验收标准**:
- [ ] `control-plane.ts` 中 copilot 宿主的 materialize 逻辑正确
- [ ] `oms status` 显示 copilot 状态
- [ ] `oms use <preset>` 生成 copilot Agent 工件
- [ ] `oms sync` 同步 copilot 工件
- [ ] `oms doctor` 检查 copilot 兼容性

### Task 4: CLI 命令支持
**文件**: `src/cli.ts`
**描述**: 在 CLI 中添加 copilot 宿主的子命令路由支持。
**验收标准**:
- [ ] `cli.ts` 正确路由 copilot 相关命令
- [ ] 所有命令（status/use/disable/sync/doctor/explain）支持 copilot
- [ ] `oms explain` 显示 copilot 路由信息

### Task 5: 更新配置系统
**文件**: `src/config.ts`
**描述**: 添加 copilot 宿主的识别和配置加载支持。
**验收标准**:
- [ ] `detectHost()` 能识别 copilot 环境
- [ ] 配置验证包含 copilot 宿主

### Task 6: 更新文档
**文件**: `README.md`, `README.zh-CN.md`, `docs/README-architecture.zh-CN.md`
**描述**: 添加 Copilot CLI 支持说明到项目文档。
**验收标准**:
- [ ] README 中列出 Copilot CLI 为支持的宿主
- [ ] 中文 README 同步更新
- [ ] 架构文档更新 Copilot 适配层说明

## 实施顺序

1. Task 1（能力声明）→ 无依赖
2. Task 2（适配层 + TDD）→ 依赖 Task 1
3. Task 5（配置系统）→ 可与 Task 2 并行
4. Task 3（控制平面集成）→ 依赖 Task 2, Task 5
5. Task 4（CLI 命令）→ 依赖 Task 3
6. Task 6（文档）→ 最后执行

## 关键技术决策

1. **薄适配层**: copilot.ts 保持 ~150 行，仅负责 Agent 工件生成
2. **Agent 文件位置**: `.github/agents/` 项目级管理
3. **不实现 Plugin/Hooks**: Copilot CLI 当前无此概念
4. **Stage 1 支持**: superpowers 以 Stage 1 方式支持

## Subagent 分配策略

- Task 1, 5: 简单修改，一个 subagent
- Task 2: TDD 核心任务，单独 subagent（标准模型）
- Task 3, 4: 集成任务，一个 subagent
- Task 6: 文档任务，一个 subagent

## 验证命令

```bash
cd /home/adad/dev/oh-my-superagents/.worktrees/MT-15
pnpm test          # 所有测试通过
pnpm build        # 编译无错误
```
