# MediaTrack 采集流程 Token 优化调研报告

> 调研日期：2026-08-16
> 项目：mediary-scout（packages/workflow/src/acquisition-v2）
> 目标：7×24 常驻巡逻工具，减少对 LLM 的依赖、省 token，同时保住"真正需要 AI 判断"的能力

---

## 1. 背景

MediaTrack 的资源采集走 **Acquisition V2** 架构：一个"强 agent"在系统搭好的沙箱（sandbox）里自驱 observe-act-verify 循环，通过工具调用完成搜索 → 选片 → 转存 → 改名 → 归位 → 标记的全流程。

该设计把"判断"几乎全部押在 LLM 上。而这是一个**每天定时巡逻全部追剧清单**的 7×24 工具——每部剧每天跑一个 agent 任务、每任务最多 60 步工具循环，token 消耗随剧集数线性放大。**能省则省**是合理诉求。

---

## 2. 现状架构全景（一条采集任务的完整链路）

```
worker.runScheduledType3Monitoring（定时巡逻，遍历所有 tracked season）
  └─ syncSeasonMetadata：TMDB 刷新已播出集数（确定性）
  └─ sync-need：DB 已获得 vs 应得 → 缺哪些集（确定性）
  └─ runTvAcquisitionV2 → workflow-v2 → orchestrator.runAcquisitionV2
       ├─ CandidateRegistry：候选注册表（系统旁路，agent 不见原始链接）
       ├─ RealResourceProviderV2：PanSou 搜索适配器
       │    └─ deadLinkStore 前置过滤（已知死链直接剔除，agent 都看不到）
       ├─ RealStorageV2：转存适配器（按 id 从 registry 解析真实链接）
       ├─ TaskSandbox：权限笼（预算 / 标题门控 / dedup / 源健康）
       └─ runTvAnimeTaskAgent → runAcquisitionAgent（AI SDK generateText）
            ├─ system prompt：buildTvAnimeSystemPrompt（超长，见 §4.1）
            ├─ tools：13~17 个沙箱工具（含描述 + zod schema，超长）
            ├─ stopWhen：5 路停止（步数上限 60 / 重复 / 系统性阻塞 / no-coverage / finish）
            └─ 每步：模型自己决定调哪个工具、传什么参数
```

关键点：**系统层已经做了大量"确定性护栏"**（预算、dedup、标题门控、死链过滤、源健康告警），但"每一步该怎么走"仍然全部由 LLM 决定。

---

## 3. LLM 参与度盘点：哪些真需要 AI，哪些是"拿 LLM 当计算器"

| 步骤 | 现在由谁做 | 真需要 LLM？ | 说明 |
|---|---|---|---|
| 缺集计算（need） | 代码 | ❌ 不需要 | sync-need 已是确定性 |
| 初始搜索词（裸标题） | 代码预搜索 | ❌ 不需要 | 系统已预搜，agent 免费看 |
| **关键词升级决策** | LLM（searchResources） | ⚠️ 部分需要 | 配方其实已代码化（search-profile.ts），LLM 只是"执行者" |
| **候选筛选（选片）** | LLM | ✅ **核心价值** | 同名异作 / remake / 中字判断，模糊度高 |
| 转存 | 代码执行 | ❌ 不需要 | 纯执行 |
| **落盘分析（inspectStaging）** | LLM 看原始文件树 | ⚠️ 可大幅代码化 | 文件树全量进上下文，重复/缺失/集数解析可先由代码做 |
| **改名（renameVideo）** | LLM 逐文件决定 | ⚠️ **最大浪费点** | 规范名规则已存在（episode-code.ts），LLM 只该兜底异常 |
| 归位（moveToSeason） | 代码执行 | ❌ 不需要 | 纯执行 |
| **去重（keep-larger）** | LLM 判断 | ❌ 不需要 | 纯规则：按文件大小保留 |
| markObtained | LLM 声明 | ⚠️ 可代码化 | 落盘文件已可推出集数 |
| finish / reportNoCoverage | 代码 | ❌ 不需要 | 终止逻辑 |

**结论：真正非 LLM 不可的只有"候选身份判断"和"异常诊断"，其余都能用代码表达。**

---

## 4. Token 消耗画像（为什么这么贵）

### 4.1 每次请求的固定开销（system + tools）

- **system prompt（buildTvAnimeSystemPrompt）**：SANDBOX_BOUNDARY + skillMandate + 长段操作指令（Target matching / Coverage / Multi-season / Patrol / Provider-ahead / Dead links / SYSTEMIC BLOCK / Black-box）+ languageLine + transferModelLine + searchHints + qualityGuidance + LOOP_GUIDANCE。粗估 **4k–6k tokens/请求**。
- **工具定义（buildSandboxToolSet）**：13~17 个工具，每个 description 都是长文本 + zod schema。粗估 **4k–8k tokens/请求**。

→ 单次请求固定开销 **~10k tokens**，且**每步循环都重发**（AI SDK 工具循环的每次模型调用都带完整 system + tools）。

### 4.2 随步数放大的开销（对话历史）

- 每次工具结果都进上下文：一次 PanSou 搜索返回的**全量快照**（几十到几百候选，id+title）全部塞进历史。
- `DEFAULT_MAX_STEPS = 60`，典型任务 20–40 步，历史越滚越长。

### 4.3 粗估

| 场景 | 粗估 token/任务 |
|---|---|
| 单集补缺（巡逻常态） | 100k–300k |
| 多季整季首次采集 | 500k–2M+ |

× 每天巡逻 N 部剧 → **月度 token 账单非常可观**。这就是"AI 依赖太重"的量化来源。

---

## 5. 已存在的确定性资产（优化时直接复用，不用重新发明）

代码里已经埋了不少"确定性智能"，只是没有串成一条非 LLM 通路：

| 资产 | 位置 | 说明 |
|---|---|---|
| 搜索配方（10 种 profile） | `search-profile.ts` | UNIVERSAL_LAWS + PROFILE_RECIPES：按 type+origin 定关键词策略，**纯代码** |
| 标题门控 / 规范化 | `planning-search-gate.ts` | keywordReferencesTitle / normalizeSearchKeyword / decideSearchGate |
| 预算 / dedup | 同上 + sandbox | 8 次硬顶、同词缓存不重复打 PanSou |
| 集数解析 | `episode-code.ts` | episodeCodeFromFileName / canonicalEpisodeFileName / canonicalMovieFileName |
| 规范名清洗 | `episode-code.ts` | cleanTitleForCanonicalName——注释明确写了 **"future system-generated naming mode"**（作者预留了系统生成名字的方向！） |
| 死链记忆 | `dead-links.ts` | 已知死链前置过滤，agent 都看不到（#15） |
| 源健康告警 | `sandbox.ts` | 源挂了 ≠ 没资源，代码区分 |
| 批量烧死链 | `transferUntilLanded`（movie） | 按序尝试、首个落地即停——可推广到 TV |
| keep-larger 去重 | 规则（skill §1.3） | 纯规则，无歧义 |

**启示：架构师其实已经铺好了"确定性优先"的路，缺的是把 fast path 真正实现出来。**

---

## 6. 优化方案（按性价比排序）

### 6.1 落盘分析代码化（省最多，风险最低）

**现状**：`inspectStaging` 把原始文件树全量返回，LLM 逐文件判断身份/重复/集数。
**改法**：代码先解析（复用 `episodeCodeFromFileName`）：输出结构化摘要——落了哪些集、重复哪些、缺哪些、疑似异物（非目标作品）、大小排序。LLM 只看摘要，不再读原始树。
**收益**：大包（77 集）场景上下文从"整个树"降到"几十行摘要"，省 1 个数量级。
**风险**：无——纯只读，不改护栏。

### 6.2 确定性改名预填（最大浪费点）

**现状**：LLM 逐文件决定规范名（`Title.SxxExx.ext` / `Title (Year).ext`）。
**改法**：代码先用 `episodeCodeFromFileName` + `canonicalEpisodeFileName` 生成**建议改名表**，LLM 只需"确认或纠正异常项"；甚至可以完全跳过 LLM（解析成功的文件直接改名，失败的才升级）。
**注**：`cleanTitleForCanonicalName` 注释里已经埋了 "future system-generated naming mode" 伏笔，方向完全吻合。
**收益**：省掉改名环节大部分 LLM 轮次。

### 6.3 候选预筛 + 评分（减少"从 50 个里挑"）

**现状**：PanSou 快照全量进上下文（可能几百条），LLM 从头筛。
**改法**：代码先做粗筛+评分：
- 标题归一化匹配（复用 normalize）命中度
- 中字/画质标记检测（正则，规则已在 prompt 里存在，抽出来给代码）
- 已知死链过滤（已有）
- 是否透明标题（vs black-box，规则可表达）
产出 **Top-N 候选表 + 系统推荐**，LLM 从"选 A/B/C"而非"筛 300 条"。
**收益**：上下文 + 推理量双降。

### 6.4 搜索序列规则化（把 LLM 的执行性工作拿走）

**现状**：LLM 自己决定换什么关键词（搜繁体/英文/原名）。
**改法**：`search-profile.ts` 配方已存在——代码按配方顺序自动搜（裸标题 → 繁体 → 英文/原名 → 兜底），**只在"所有配方词都搜过仍不够"时才问 LLM 想新词**。
**收益**：8 次预算里大部分搜索不经 LLM。

### 6.5 异常驱动主路径（fast path / slow path 分离，终极形态）

把整条流程拆成两条路：

```
FAST PATH（代码直通，零 LLM）：
预搜索 → 候选预筛 → 唯一高分匹配？→ 转存 → 代码解析落盘 → 代码改名归位 → markObtained → finish
                        └─ 模糊/失败 ↓
SLOW PATH（LLM 仲裁兜底）：
候选多选一 / 同名异作 / 解析失败 / 死链诊断 / 落盘与预期不符 → LLM 决策 → 回到 FAST PATH 执行
```

**触发 slow path 的信号**（都是可判定的）：
1. 候选评分表里无"唯一高分"（top1 与 top2 差距小、或标题模糊）
2. 落盘解析失败率高于阈值（脏文件名多）
3. 转存失败（死链后重试仍失败、systemic block）
4. 存在明显异物（解析出多个不同作品名）

**收益**：巡逻常态（单集补缺、资源唯一）大概率走零 LLM 通道，**只有模糊案例才花钱**。

### 6.6 历史决策缓存（让巡逻越跑越便宜）

- dead-links 已有"死链记忆"；对称地加"**成功资源记忆**"：某标题上次选中并成功落地的候选/关键词，下次巡逻优先复用，跳过重搜。
- 同标题任务的 need 只是"多一集"，候选集高度相似——缓存命中时可以直接快进。

### 6.7 Prompt 瘦身 + 模型分层

- **瘦身**：把 system prompt 里的大段指令挪进按需 `readSkill`（本来就是为此设计的 progressive disclosure），静态 system 只留骨架。粗估每次请求省 2–4k tokens。
- **分层**：fast path 判定 + 简单执行用小/便宜模型；只有 slow path 仲裁才用强模型。

---

## 7. 保留 LLM 的理由（别全代码化，这三个点必须留人味）

1. **同名异作 / remake 判断**：候选标题撞车（蝙蝠侠系列、El Camino 混进 Breaking Bad 包）——纯规则易翻车，LLM 做身份仲裁。
2. **中字判断的模糊地带**：release naming 是玄学——不过注意，现在这判断靠 prompt 里的规则教 LLM 做，**规则既然可表达，就能先抽给代码**（§6.3），LLM 只兜边角。
3. **脏数据 / 异常诊断**：真实世界文件名啥都有；死链后"换策略"的推理目前 LLM 最可靠。

**原则：规则能表达的走代码，代码判定不了才升级 LLM（exception-driven）。**

---

## 8. 实施路线图

| 阶段 | 内容 | 收益 | 风险 |
|---|---|---|---|
| **P1** | 落盘分析代码化（inspectStaging 摘要） | 上下文省 1 数量级 | 极低（只读） |
| **P1** | 候选预筛+评分（Top-N 表） | 上下文+推理双降 | 低 |
| **P2** | 确定性改名预填（确认制） | 省改名轮次 | 低（保留确认） |
| **P2** | 搜索序列规则化（配方自动搜） | 省搜索轮次 | 中（可能漏升级词） |
| **P3** | fast/slow path 分离（异常驱动） | 常态任务零 LLM | 中（需充分 fallback） |
| **P3** | 成功资源记忆缓存 | 巡逻越跑越便宜 | 低 |
| **P4** | prompt 瘦身 + 模型分层 | 每次请求固定省 2–4k | 低 |

每阶段都加**可观测指标**：任务 token 用量、成功率、补缺率、slow path 触发率——用数据决定要不要继续推。

---

## 9. 附录：关键代码位置

| 文件 | 职责 |
|---|---|
| `acquisition-v2/orchestrator.ts` | 组合根：registry + 适配器 + sandbox |
| `acquisition-v2/agent-loop.ts` | 工具定义（buildSandboxToolSet）+ 主循环（runAcquisitionAgent） |
| `acquisition-v2/task-agents.ts` | system prompt 构建（TV/电影）+ 任务入口 |
| `acquisition-v2/sandbox.ts` | TaskSandbox：护栏 + 工具实现（1196 行） |
| `acquisition-v2/skill.ts` | 按需读的技能手册（394 行） |
| `acquisition-v2/search-profile.ts` | 搜索配方（**确定性资产**） |
| `episode-code.ts` | 集数解析 / 规范名（**确定性资产**，含 future system-generated naming 伏笔） |
| `acquisition-v2/dead-links.ts` | 死链记忆（**确定性资产**） |
| `acquisition-v2/real-provider-adapter.ts` | PanSou 适配：死链过滤 + registry 记录 |
| `acquisition-v2/planning-search-gate.ts` | 标题门控 / 预算 / dedup |
| `worker.ts` | 定时巡逻调度（Type3 monitoring） |
| `acquisition-v2/agent-loop-guards.ts` | DEFAULT_MAX_STEPS=60 / 重复停止 / 预算提醒 |
