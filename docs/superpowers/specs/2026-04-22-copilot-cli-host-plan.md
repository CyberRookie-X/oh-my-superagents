# Copilot CLI 宿主深度支持 — 实施计划

## 实施任务拆解

### Phase 1: 适配器核心模块 (TDD)

#### T1.1 — 编写 `src/copilot.ts` 测试
- 测试制品生成（agent 文件、plugin.json、hooks.json、skills）
- 测试 explain 输出
- 测试 ownership marker 渲染

#### T1.2 — 实现 `src/copilot.ts`
- `renderCopilotAgentFile()` — 渲染 `.agent.md` 文件
- `renderCopilotPluginJson()` — 渲染 `plugin.json`
- `renderCopilotHooksJson()` — 渲染 `hooks.json`
- `renderCopilotSkillFile()` — 渲染 `SKILL.md`
- `buildCopilotArtifacts()` — 主构建函数
- `explainCopilotPhase()` / `explainAllCopilot()` — 诊断输出
- `PHASE_TO_COPILOT_AGENT` — 阶段到代理名映射
- Ownership marker 集成

### Phase 2: 能力策略注册 (TDD)

#### T2.1 — 更新 `capabilities.test.ts`
- 测试 copilot 宿主投影决策
- 测试 copilot 控制面命令决策

#### T2.2 — 更新 `src/capabilities.ts`
- `CapabilityHost` 新增 `"copilot"`
- 更新投影和命令决策函数

### Phase 3: 制品物化 (TDD)

#### T3.1 — 更新 `materialize.test.ts`
- 测试 copilot 插件目录清理
- 测试 copilot 制品写入

#### T3.2 — 更新 `src/materialize.ts`
- 新增 copilot 清理前缀和目录
- 新增 copilot 制品物化路径

### Phase 4: CLI 集成 (TDD)

#### T4.1 — 更新 `cli.test.ts`
- 测试 `--host copilot` 参数
- 测试 copilot sync 命令
- 测试 copilot doctor 命令
- 测试 copilot explain 命令

#### T4.2 — 更新 `src/cli.ts`
- 新增 copilot 宿主分发
- 新增 copilot 制品同步
- 新增 copilot 诊断

### Phase 5: 公共 API 导出

#### T5.1 — 更新 `src/index.ts`
- 导出 copilot 模块公共 API

### Phase 6: 文档更新

#### T6.1 — 更新项目文档
- 更新 README.zh-CN.md / README.md
- 更新 docs/ai/ 文档
