# dsh-context-continuity — 一个上下文，跨越多个物理 Session

[English](README.md) | 简体中文

[![npm](https://img.shields.io/npm/v/@wowyuarm/dsh-context-continuity?style=flat-square)](https://www.npmjs.com/package/@wowyuarm/dsh-context-continuity)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

**一个主体的上下文，在多个物理 Session 之间活成一条连续的时间线。**

`dsh-context-continuity` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的上下文连续性引擎：一个*主体*（Agent Team 的 Member、Loom 的 Individual、长期运行的编码 agent）可以向前 rollover 到全新的 Session 而仍是同一个身份，埋下一个可恢复的锚点再回到它，并把自己的 lineage 当作一条时间线来走查——而它在物理上活在许多个 Session 文件里。

引擎拥有的是连续性的*语义*。它底下的一切都是 Harness 的原生能力：session fork/seed、session header 的 lineage、以 Session log 作为唯一持久存储，以及 session projection 框架。host 通过一份契约把引擎接到自己的主体与自己的领域上。

## 状态

引擎核心——projection unit、coordinator、lineage 读取、面向模型的工具工厂、retrieval 阶梯，以及上下文压力策略——已经抽出，并有单元测试覆盖；目前尚无 host 消费它。Team 侧接入是之后的独立一步（`dsh-agent-team` 目前仍带着自己的一份该机制副本）。

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `src/host.ts` | `ContextContinuityHost<SubjectId>` —— 引擎向 host 索取的一切，外加那条唯一共享的 ephemeral notice 规则 |
| `src/types.ts` | Subject、transition plan、rollover identity、trigger 词表 |
| `src/projection-state.ts` | 一个 Session 从自己的持久日志折叠出的只读状态，外加由 host 贡献的 `DomainBoundary` 锚点 |
| `src/projection.ts` | 折叠本身，即 Harness 的 `ProjectionDefinition` `contextContinuity`：对已提交事件的一次纯 transition，一份注册服务每个 Session |
| `src/anchor.ts` | 唯一的 return-anchor 策略——候选枚举、保留成本估算、拒绝原因——由 timeline 读取与搜索命中的补充共用，两者因此永远不会给出不一致的答案 |
| `src/timeline.ts` | lineage 读取：把一个主体的各代走一遍、去重，并计价成一份有界的 return anchor 列表 |
| `src/search.ts` | 检索引擎：授权、provenance 折叠、有界搜索，以及一个 `contextRef` 展开成的邻域读取 |
| `src/search-tools.ts` | `context_search` 与 `context_read`——面向模型的阶梯，含其描述、参数规则、输出 schema 与渲染 |
| `src/context-ref.ts` | 不透明的规范 `contextRef` 编解码：记录该事件的那一代的 `(sessionId, seq)`，别无其他 |
| `src/pressure.ts` | 上下文压力策略：两个阈值、每代一次的 handoff 通知，以及触及硬上限时 fail-closed 的 reduction 证明 |
| `src/tools.ts` | 三个面向模型的工具——`context_rollover`、`context_checkpoint`、`context_timeline`——作为 host adapter 之上的一个工厂 |
| `src/message-codec.ts` | 持久的 handoff 与 checkpoint 续接消息，经由随包发布的 `plugin` snapshot 形式写入与读取 |
| `src/coordinator.ts` | rollover 生命周期：durable-result 闸门、turn 结束与空闲边界、swap、携带输入、checkpoint 续接、崩溃恢复 |
| `src/stored-session-reader.ts` | 读取已存储 Session 的唯一接缝，带五类有类型的失败 |

## Host 契约

host 只提供引擎无从知道的东西：

- 把主体解析到它活着的 Agent，以及反向解析；
- 为 coordinator 读取一个 Session 的连续性状态（`ContextProjectionState`）——手工折叠，或注册引擎自带的 projection unit 再读回；
- 读取已归档祖先的存储日志，并度量一个来源的 token 数，这就是 `readContextTimeline`（lineage 走查）需要你做的全部；
- 为召回授权：一个主体默认可以搜索哪些 Session、可以选哪些具名 scope、一个来源的成本是多少——以及查询能力本身（`ctx.sessionQuery`），引擎通过 `ContextSearchPort` 使用它，但从不自己去够；
- 执行三个工具的副作用——判断某个 `checkpointRef` 是否是该主体记录过的锚点、请求 rollover、记录 checkpoint、读取 timeline——并改写面向主体的文案；引擎保留校验、防伪造闸门、`concludeTurn()` 的时机与渲染；
- 贡献其领域视为 timeline 锚点的东西，并为其持久 ref 命名（`ContextProjectionHost`：`checkpointRefFor`、`boundaryRefFor`、`tracksCall`、`domainBoundaryOf`）；
- 度量压力并削减它：某个主体所在 route 的有效预算、一个单调的 surface 观测、reduction 能力、steer，以及该主体所持之物对应的标签——何时动手由引擎决定，证明不了的 reduction 它拒绝继续；
- 在它自己的生命周期里执行一次预备好的换代 swap；
- 推导一次 rollover 的持久、抗碰撞身份（`RolloverIdentity`）——Session id 方案是 host 的事，不是引擎的；
- 说明哪些排队消息是后继者会重新推导的 ephemeral 领域通知，并记录诊断日志。

## 设计决策

1. **领域锚点是 host 的折叠贡献，不是一个打标签器。** 像「一个 boundary 恰好可归因于一个 topic 时，它才是可选的默认锚点」这样的规则需要事件语义，所以由 host 贡献带 `kind`/`label`/`attributions` 的 boundary，而引擎拥有 checkpoint、待决 transition、续接、携带输入与 turn cursor。
2. **命名属于 host。** Session id 方案与幂等请求 id 是持久的领域事务；引擎自己不推导任何东西。
3. **codec 只由 plugin id 与两行文案参数化。** 段落名是固定的，因为每一代都要从更早的代写下的日志里把它们读回来：改过它们的 host 将无法解码自己的历史。
4. **coordinator 不关心折叠如何实现。** 它通过 `host.projectionForSubject()` 读状态，所以 host 可以手工折叠，也可以走 Harness 的 projection 框架。引擎同时也*发布*那套折叠：`createContextProjectionDefinition()` 返回 host-only 的 unit `contextContinuity`（state version 2），每个 host 注册一次——框架对每个 projection key 只保留一个 unit，并为每个 Session 驱动它。闭包装不下的东西改放在 state 里：给每个派生 ref 定键的 Session 身份，以及继承而来的 cut——在这条 cut 之下的事件属于本 Session 所延续的祖先代。对不关心的事件，折叠返回同一个 state 引用，并且不读日志之外的任何东西：每个持久 ref 都是 host 给出的答案。
5. **召回是一条阶梯，而且每一级都有界。** `createSearchTools()` 拥有参数面（没有 cursor、没有 page size、没有 Session id、没有 event type）、规范的 `contextRef`、跨 lineage 的 provenance 折叠、邻域预算与渲染形状；host 授权 scope 并提供查询能力。`contextRef` 不携带任何权限——它只命名 `(sessionId, seq)`，并在每次读取时按 host 的授权重新校验——命中的 `checkpointRef` 只从 timeline 所用的同一套锚点策略给出，绝不凭空合成。
6. **工具就是产品面，所以它们的安全由引擎负责。** `createContinuityTools()` 拥有参数契约、对传入 `checkpointRef` 的防伪造闸门、`concludeTurn()` 的时机与渲染形状；host 的 adapter 执行每个副作用，可改写的文案仅限于面向主体的词汇。伪造的 ref 在每个 host 里都按构造成为模型可见的错误，而不是静默地做一次全新 rollover。
7. **压力是策略，不是阈值。** `ContextPressurePolicy` 拥有两个上限的次序、每代一次的通知闩锁，以及一次 reduction 在请求得以继续之前必须挣到的证明——持久的 surface 前进了，或压力可测量地下降了，否则该请求会被挡下并给出可恢复的诊断，而不是明知越限仍提交。闩锁读取的是持久的 Session 证据，绝不是进程状态：重启后保持安静，rollover 后重新武装，失败的 steer 会被重试。host 拥有度量器、reduction 能力、steer，以及通知里用来描述主体所持之物的措辞。

## 开发

```bash
npm install
npm test          # 包边界检查 + 单元测试
npm run typecheck # 严格 TypeScript，不产出
npm run build     # 产出 lib/
```

测试跑在已发布的 `@deepseek-ai/dsh-*` 包之上——不需要兄弟 Harness checkout，也不需要 path mapping，所以整套用例跑完远不到一秒。
