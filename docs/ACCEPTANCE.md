# CogniRead 验收文档

| | |
|---|---|
| 验收轮次 | R1 · v0.2.1（bug 修复 + 工程配置补齐）· R2 · v0.3-P0（Agent 首页） |
| 日期 | 2026-10-25 |
| 关联文档 | `docs/PRD.md` v2.0 |
| 验收方式 | `npm run build`（tsc 严格模式）+ `npm run test`（vitest 13 例）为门槛；功能项按下列标准逐条核对，R2 另经真实浏览器走查 |

---

## 一、Bug 修复验收清单

### A. 严重级（阻断核心流程）

| # | 问题 | 修复 | 验收标准 | 状态 |
|---|---|---|---|---|
| A1 | AI 模式下当前用户输入从未发送给模型（`sendAIMessage` 只传历史消息），AI 无法针对用户刚说的话回复 | 构造 `historyMessages` 时显式追加 `{ role: 'user', content: userInput }` | 配置任一 API 后，发送「什么是系统1」，AI 回复必须针对该问题；多轮对话中 AI 能引用上一轮内容 | ✅ 已修，待真机回归 |
| A2 | 暗色模式切换无效：index.css 为 Tailwind v4 语法但未声明 class 策略的 dark 变体，所有 `dark:` 类跟随系统偏好而非应用内开关 | index.css 头部增加 `@custom-variant dark (&:where(.dark, .dark *));` | 点击月亮/太阳按钮，含 `dark:` 前缀的区域（侧边栏、右面板、卡片）全部随之切换 | ✅ 已修，待真机回归 |
| A3 | 认知雷达图数据点/连线把 Tailwind 类名（如 `blue-500`）当 SVG 色值使用，图形渲染为默认黑色 | `CognitiveFramework` 新增 `hex` 字段（真实色值），雷达图改用 `fw.hex` | 雷达图 7 个数据点及连线呈现各自框架色；标签数值正常 | ✅ 已修，待真机回归 |
| A4 | AI 流式输出时框架激活检测逐字触发，单条回复被放大成几十次激活，激活度/次数虚高 | `CognitiveVisualization` 新增 `isStreaming` 属性，流式期间跳过检测，结束后对完整消息判定一次 | AI 回复一条消息后，单个框架 usageCount 增量 ≤ 2；流式过程中激活条不狂涨 | ✅ 已修，待真机回归 |

### B. 功能级

| # | 问题 | 修复 | 验收标准 | 状态 |
|---|---|---|---|---|
| B1 | 老用户每次打开应用都重放「新章节已解锁」动画（解锁判定在每次 progress 变化时无差别触发） | 引入 `knownUnlockedRef` 基线，仅当章节从锁定变为可解锁时播放动画 | 已掌握前置概念的账号连续刷新 3 次，解锁动画只在新达成解锁条件那一次出现 | ✅ 已修 |
| B2 | 切换概念再返回时，对话记录恢复但引擎从第 1 题重新开始，答题主谓错位 | `SocraticEngine` 支持快照（`getSnapshot()` + 构造函数 `snapshot` 参数）；`UserProgress` 新增 `socraticEngineState`；每次作答后持久化快照 | 答对 1 题后切走再切回，进度点显示与离开时一致；下一题正确衔接 | ✅ 已修 |
| B3 | 「学习次数」在每次保存进度时 +1（一次回答可 +3），数字虚高 | `saveProgress` 不再递增；新增 `recordSession()` 仅在应用启动时调用一次 | 完整回答 10 题，「学习次数」仅 +1（本次会话）；重开应用再 +1 | ✅ 已修 |
| B4 | 热力图为随机假数据（`generateHeatmapData`） | storage 新增 `activity` 每日互动记录 + `recordActivity()`；App 改用 `getActivityData()` | 发送 N 条消息后，热力图当日格子对应深浅；刷新后数据不漂移 | ✅ 已修 |
| B5 | 思维碰撞本地回退使用闭包旧值 `inputValue` 而非入参 `userInput`，AI 出错回退时可能提交空/错消息 | 改用入参 | AI 请求失败回退后，碰撞模式气泡内容与用户输入一致 | ✅ 已修 |
| B6 | 切换 AI 提供商后模型 ID 保留旧值（如切到 DeepSeek 仍是 gpt-4o-mini），请求必 404 | `updateConfig` 切换提供商时，若当前模型不在新提供商列表中则重置为其默认模型 | 切到 DeepSeek 后模型自动变为 deepseek-chat | ✅ 已修 |
| B7 | 空状态卡片、框架卡片使用模板字符串动态拼接 Tailwind 类名，构建产物中不存在，样式缺失 | 全部改为完整字面量类（框架数据新增 `activeLight/activeDark/barGradient/borderSoft`） | 暗色/亮色下空状态两张卡片有完整底色与文字色；框架卡片激活时有渐变背景与激活条 | ✅ 已修 |
| B8 | 框架卡片文本色写了不存在的类 `dark-text-secondary`（缺 `text-` 前缀） | 修正为 `text-dark-text-secondary` | 暗色模式下未激活框架名可读 | ✅ 已修 |
| B9 | 聊天区在流式输出期间不自动滚动 | 滚动 effect 依赖加入 `streamingText` | AI 长回复时视图跟随到底部 | ✅ 已修 |
| B10 | `data/bookData.js` 编译产物与 `bookData.ts` 并存，Vite 解析 `.js` 优先会遮蔽源码修改 | 删除 `bookData.js` 与 `bookData.d.ts` | `import '@/data/bookData'` 解析到 `.ts`；修改 bookData.ts 后构建产物随之变化 | ✅ 已修 |
| B11 | 死代码：引擎中 `nextQ` 变量（`followUpQuestion` 从未生效） | 移除；`followUpQuestion` 的产品化使用列入 PRD 遗留清单 | 构建无该变量 | ✅ 已修 |

### C. 工程级

| # | 问题 | 修复 | 验收标准 | 状态 |
|---|---|---|---|---|
| C1 | 无 package.json / 构建脚本，项目不可运行 | 新增 package.json（react 18.3 / vite 6 / tailwindcss 4.1 / typescript 5.7 / lucide-react） | `npm install && npm run dev` 可启动 | ✅ |
| C2 | 无 index.html、入口未挂载 | 新增 index.html（`#root` + `/main.tsx`） | dev/构建均正常挂载 | ✅ |
| C3 | 无 TS 配置与 `@/` 别名解析 | 新增 tsconfig.json（strict + paths）与 vite.config.ts（react + tailwindcss 插件 + alias） | `npm run build`（tsc --noEmit && vite build）零错误 | ✅ |
| C4 | 无 .gitignore | 新增（node_modules/dist） | — | ✅ |

## 二、构建验证记录

- `npm install`：✅ 通过（87 packages；本机访问 npm registry 需走代理 127.0.0.1:7897）。
- `npm run build`：✅ 通过 —— tsc --noEmit 零错误；Vite 产出：JS 350KB（gzip 108KB）、CSS 88KB（gzip 13KB），满足 PRD 首屏 < 300KB gzip 目标。
- 产物抽检：框架卡片全部渐变/描边类（`from-blue-950\/40` 等）、`gap-2.5`、`dark\:bg-dark-card` 均存在；dark 变体正确编译为 `.dark, .dark *` 作用域。
- `vite preview` 冒烟测试：✅ 页面 200，标题与 JS 资源加载正常。

## 三、v0.3（Agent 首页）验收标准预告

1. 新用户打开首页 3 秒内可发出第一句话（无任何必须先点的按钮）。
2. 未配置 API Key 时完成一次完整四阶段对话流程（零配置回退）。
3. 意图路由：同一句话「什么是锚定效应」在未掌握/已掌握/待复习三种状态下得到不同开场。
4. 卡片流：阶段推进时消息流出现可点击的进度卡。
5. 回归：`docs/ACCEPTANCE.md` R1 全部 A 级项仍通过。

## 三A、R2 · v0.3-P0（Agent 首页）验收记录 —— 2026-10-25

**门槛**：`npm run build` ✅（tsc 零错误，JS gzip 113.6KB）· `npm run test` ✅（vitest 13/13）。

### P0 功能项

| # | 功能 | 验收标准 | 结果 |
|---|---|---|---|
| P0-1 | 对话首页 | 首屏 = 标题 + 问候 + 单输入框 + 建议条；header 隐藏模式切换/难度/面板开关；logo 可点击回首页 | ✅ 浏览器走查通过（截图留存） |
| P0-2 | 意图路由 | 学习/复习/自由提问/闲聊四类；锁定概念沿解锁链给出可进入的起点；「你能做什么」归入能力说明 | ✅ vitest 13 例覆盖（别名/空格变体/锁定链/到期复习/无到期/疑问句/闲聊/开场三态） |
| P0-3 | 学习卡片流 | 概念卡（状态徽章+四阶段进度点+CTA）/复习卡（逾期天数）嵌入消息流与首页；静态往返后卡片常驻 | ✅ 浏览器走查通过 |
| P0-4 | 主动开场 | 到期复习 > 未完成概念（含阶段名）> 新用户推荐，三态由单测覆盖 | ✅ |
| P0-5 | 零配置回退 | 未配置 API：首页本地静态回复留在首页；学习/复习意图直接以本地引擎开场进对话 | ✅ 浏览器走查通过 |

### 端到端走查（真实浏览器，构建产物 preview）

1. 打开首页 → 问候语与概念卡（系统1 · 学习中 · 理解阶段）正确渲染 ✅
2. 点「继续『系统1』」→ 进入对话视图，苏格拉底开场白（阶段引导 + 第一题）✅
3. 回答第一题 → 本地引擎评估为「部分正确」档，反馈 + 追问 + 下一题 ✅
4. 迷你/完整认知可视化渲染彩色雷达图（SVG 色值修复经真实渲染验证）✅
5. 「你能做什么？」→ 首页显示能力说明，卡片仍可操作 ✅
6. 点卡片「开始学习」→ 进入对话且保留历史；点 logo → 回首页 ✅
7. 对话历史按概念持久化，刷新后恢复 ✅

### R2 范围说明（诚实边界）

- 意图路由为**纯规则引擎**；PRD 中「AI 模式一次结构化分类调用」移至 P1（规则路由对 AI 模式同样生效，通过 conceptContext 注入）。
- 「抽屉化」当前以 header 面板开关实现（默认展开），完整 overlay 抽屉交互列入 v0.3 收尾。
- AI 模式的复习记录写入（recordReview）暂只接本地引擎路径，AI 路径列入 P1-2。

## 四、遗留与风险移交

- AI 模式进度推进（P1-1/P1-2）——当前 AI 模式聊再久也不会解锁概念，属已知设计缺口，勿当 bug 报。
- `OPENCLAW_MEMORY_DATA` 为用户自编的虚构数据（已确认非真实隐私），P1-5 改为首次引导自填。
- 移动端断点仅做了基础隐藏，v0.3 需真机走查。
