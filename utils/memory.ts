/**
 * CogniRead 记忆系统
 * 
 * 类比 OpenAI Claw 的设计理念：
 * - 跨对话持久化用户数据
 * - AI 可以"记住"用户偏好、学习状态、重要对话
 * - 支持长期记忆（用户画像）和短期记忆（对话上下文）
 * - 记忆可以被 AI 读取，用于个性化回复
 * 
 * 存储结构：
 * localStorage: cogniread_memory
 * {
 *   userPreferences: {  // 用户偏好（用户画像）
 *     name?: string,
 *     learningStyle?: 'visual' | 'reading' | 'discussion',
 *     replyPreference?: 'concise' | 'detailed',
 *     preferredDifficulty?: string,
 *     interests?: string[],
 *   },
 *   learningNotes: Record<string, {  // 按概念的学习笔记
 *     summary: string,      // AI 生成的摘要
 *     keyPoints: string[],  // 关键要点
 *     userNotes: string[],  // 用户手动笔记
 *     lastReviewed: string,
 *     reviewCount: number,
 *   }>,
 *   conversationSummaries: {  // 对话摘要
 *     totalCount: number,
 *     recentTopics: string[],
 *     frequentlyAskedConcepts: string[],
 *     lastSessionDate: string,
 *   },
 *   knowledgeConnections: {  // 知识联想（跨概念联系）
 *     [conceptA_conceptB]: string,  // 关联描述
 *   },
 *   importantMoments: {  // 里程碑/重要时刻
 *     [id]: { date: string, description: string, type: string }
 *   },
 *   aiMemoryContext: string,  // AI 可读的记忆摘要（动态更新）
 * }
 */

export interface UserPreferences {
  name?: string;
  learningStyle?: 'visual' | 'reading' | 'discussion';
  replyPreference?: 'concise' | 'detailed';
  preferredDifficulty?: string;
  interests?: string[];
  customInstructions?: string;
}

export interface LearningNote {
  summary: string;
  keyPoints: string[];
  userNotes: string[];
  lastReviewed: string;
  reviewCount: number;
  timestamp: string;
}

export interface ConversationSummaries {
  totalCount: number;
  recentTopics: string[];
  frequentlyAskedConcepts: string[];
  lastSessionDate: string;
  totalInteractionCount: number;
}

export interface OpenClawMemory {
  /** 从 OpenClaw MEMORY.md 迁移的长期记忆 */
  migratedAt: string;
  /** 用户对话偏好 */
  dialogPreferences: string[];
  /** 用户教育背景 */
  education: string[];
  /** 用户技术背景 */
  techBackground: string[];
  /** 当前学习目标 */
  learningGoals: string[];
  /** 职业规划 */
  careerPlans: string[];
  /** 心理状态与挣扎 */
  mentalState: string[];
  /** 核心认知洞察（行动力公式等） */
  cognitiveInsights: string[];
  /** 学习方式偏好 */
  learningStyle: string[];
  /** 对话模式偏好 */
  dialogModePreferences: string[];
  /** 已完成项目 */
  completedProjects: string[];
  /** 重要日期记录 */
  importantDates: string[];
  /** 待探索方向 */
  explorationDirections: string[];
  /** 每日记忆摘要 (date -> summary) */
  dailyMemories: Record<string, string>;
}

export interface MemoryStore {
  userPreferences: UserPreferences;
  learningNotes: Record<string, LearningNote>;
  conversationSummaries: ConversationSummaries;
  knowledgeConnections: Record<string, string>;
  importantMoments: Record<string, { date: string; description: string; type: string }>;
  aiMemoryContext: string;
  /** OpenClaw 长期记忆（迁移自 ~/.openclaw/） */
  openClawMemory?: OpenClawMemory;
}

const MEMORY_STORAGE_KEY = 'cogniread_memory';

// ============ 默认记忆结构 ============

function getDefaultMemory(): MemoryStore {
  return {
    userPreferences: {},
    learningNotes: {},
    conversationSummaries: {
      totalCount: 0,
      recentTopics: [],
      frequentlyAskedConcepts: [],
      lastSessionDate: new Date().toISOString(),
      totalInteractionCount: 0,
    },
    knowledgeConnections: {},
    importantMoments: {},
    aiMemoryContext: '',
  };
}

// ============ 读写操作 ============

export function loadMemory(): MemoryStore {
  try {
    const data = localStorage.getItem(MEMORY_STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      return { ...getDefaultMemory(), ...parsed };
    }
  } catch (e) {
    console.error('Failed to load memory:', e);
  }
  return getDefaultMemory();
}

function saveMemory(memory: MemoryStore): void {
  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memory));
  } catch (e) {
    console.error('Failed to save memory:', e);
  }
}

// ============ 用户偏好 ============

export function getUserPreferences(): UserPreferences {
  return loadMemory().userPreferences;
}

export function updateUserPreferences(prefs: Partial<UserPreferences>): void {
  const memory = loadMemory();
  memory.userPreferences = { ...memory.userPreferences, ...prefs };
  saveMemory(memory);
  regenerateMemoryContext(memory);
}

// ============ 学习笔记 ============

export function getLearningNote(conceptId: string): LearningNote | null {
  return loadMemory().learningNotes[conceptId] || null;
}

export function saveLearningNote(conceptId: string, note: Partial<LearningNote>): void {
  const memory = loadMemory();
  const existing = memory.learningNotes[conceptId] || {
    summary: '',
    keyPoints: [],
    userNotes: [],
    lastReviewed: new Date().toISOString(),
    reviewCount: 0,
    timestamp: new Date().toISOString(),
  };
  memory.learningNotes[conceptId] = { ...existing, ...note, timestamp: new Date().toISOString() };
  saveMemory(memory);
  regenerateMemoryContext(memory);
}

export function addUserNote(conceptId: string, note: string): void {
  const memory = loadMemory();
  const existing = memory.learningNotes[conceptId];
  if (existing) {
    existing.userNotes.push(note);
    saveMemory(memory);
    regenerateMemoryContext(memory);
  }
}

// ============ 对话统计 ============

export function recordConversation(conceptId?: string): void {
  const memory = loadMemory();
  memory.conversationSummaries.totalCount++;
  memory.conversationSummaries.totalInteractionCount++;
  memory.conversationSummaries.lastSessionDate = new Date().toISOString();

  // 维护最近话题（最多10个）
  if (conceptId) {
    const topics = memory.conversationSummaries.recentTopics.filter(t => t !== conceptId);
    topics.unshift(conceptId);
    memory.conversationSummaries.recentTopics = topics.slice(0, 10);

    // 更新高频概念
    const freq = memory.conversationSummaries.frequentlyAskedConcepts;
    const idx = freq.indexOf(conceptId);
    if (idx >= 0) {
      freq.splice(idx, 1);
    }
    freq.unshift(conceptId);
    memory.conversationSummaries.frequentlyAskedConcepts = freq.slice(0, 15);
  }

  saveMemory(memory);
}

// ============ 知识联想 ============

export function addKnowledgeConnection(conceptA: string, conceptB: string, description: string): void {
  const memory = loadMemory();
  const key = [conceptA, conceptB].sort().join('_');
  memory.knowledgeConnections[key] = description;
  saveMemory(memory);
}

// ============ 重要时刻 ============

export function addImportantMoment(description: string, type: 'milestone' | 'insight' | 'achievement' | 'note'): void {
  const memory = loadMemory();
  const id = `moment_${Date.now()}`;
  memory.importantMoments[id] = {
    date: new Date().toISOString(),
    description,
    type,
  };
  saveMemory(memory);
}

export function getImportantMoments(): Array<{ id: string; date: string; description: string; type: string }> {
  const memory = loadMemory();
  return Object.entries(memory.importantMoments).map(([id, m]) => ({ id, ...m }));
}

// ============ AI 记忆上下文生成 ============

/**
 * 生成 AI 可读的记忆摘要
 * 这段文本会被注入到 System Prompt 的上下文中
 */
function regenerateMemoryContext(memory: MemoryStore): void {
  const parts: string[] = [];
  
  // ===== OpenClaw 长期记忆（最高优先级） =====
  const oc = memory.openClawMemory;
  if (oc) {
    parts.push('## 用户画像（长期记忆）');
    parts.push('### 基本信息');
    oc.education.forEach(e => parts.push(`- ${e}`));
    oc.techBackground.forEach(e => parts.push(`- ${e}`));

    parts.push('\n### 职业规划');
    oc.careerPlans.forEach(e => parts.push(`- ${e}`));

    parts.push('\n### 当前学习目标');
    oc.learningGoals.forEach(e => parts.push(`- ${e}`));

    parts.push('\n### 心理状态（请敏感对待）');
    oc.mentalState.forEach(e => parts.push(`- ${e}`));

    parts.push('\n### 🧠 核心认知框架（对话时必须主动运用这些框架）');
    parts.push('> 以下不是"背景信息"，而是你每次回复时必须调用的**思维工具箱**。根据对话内容选择合适的框架来组织你的回应。\n');
    // 将7大元认知框架排在最前面
    const metaCognitionFrameworks = oc.cognitiveInsights.filter(i =>
      i.includes('问题拆解') || i.includes('系统1/2') || i.includes('因果链') ||
      i.includes('AI作为思维工具') || i.includes('E类问题') || i.includes('费曼') ||
      i.includes('can vs can\'t')
    );
    const otherInsights = oc.cognitiveInsights.filter(i => !metaCognitionFrameworks.includes(i));
    metaCognitionFrameworks.forEach(e => parts.push(`- 🔑 ${e}`));
    if (otherInsights.length > 0) {
      parts.push('\n其他认知洞察：');
      otherInsights.forEach(e => parts.push(`- ${e}`));
    }

    parts.push('\n### 学习方式偏好');
    oc.learningStyle.forEach(e => parts.push(e));

    parts.push('\n### 对话原则（必须遵守）');
    oc.dialogModePreferences.forEach(e => parts.push(`- ${e}`));
    oc.dialogPreferences.forEach(e => parts.push(`- ${e}`));

    if (oc.completedProjects.length > 0) {
      parts.push('\n### 已完成项目（可以提及）');
      oc.completedProjects.forEach(e => parts.push(`- ${e}`));
    }

    if (oc.explorationDirections.length > 0) {
      parts.push('\n### 正在探索的方向');
      oc.explorationDirections.forEach(e => parts.push(`- ${e}`));
    }
  }

  // ===== CogniRead 本地偏好 =====
  const prefs = memory.userPreferences;
  if (prefs.name) parts.push(`\n### 当前偏好\n- 用户称呼: ${prefs.name}`);
  if (prefs.customInstructions) parts.push(`- 自定义指令: ${prefs.customInstructions}`);

  // ===== 学习状态概览 =====
  const noteCount = Object.keys(memory.learningNotes).length;
  if (noteCount > 0) {
    parts.push(`\n### 当前学习进度 (${noteCount}个概念)`);
    for (const [conceptId, note] of Object.entries(memory.learningNotes)) {
      parts.push(`- ${conceptId}: ${note.summary || '学习中'}`);
    }
  }

  // ===== 对话统计 =====
  const stats = memory.conversationSummaries;
  if (stats.totalCount > 0) {
    parts.push(`\n### 互动统计`);
    parts.push(`- 累计对话次数: ${stats.totalCount}`);
    if (stats.recentTopics.length > 0) {
      parts.push(`- 最近关注: ${stats.recentTopics.slice(0, 5).join(', ')}`);
    }
  }

  // ===== 知识联想 =====
  const connections = Object.entries(memory.knowledgeConnections);
  if (connections.length > 0) {
    parts.push(`\n### 已建立的知识联系`);
    for (const [key, desc] of connections.slice(-5)) {
      parts.push(`- ${key.replace(/_/g, ' ↔ ')}: ${desc}`);
    }
  }

  if (parts.length > 0) {
    memory.aiMemoryContext = '# 关于这位用户（长期记忆上下文）\n\n' + parts.join('\n');
  } else {
    memory.aiMemoryContext = '';
  }

  saveMemory(memory);
}

/**
 * 获取 AI 记忆上下文（给 AI 用的摘要）
 */
export function getMemoryContext(): string {
  const memory = loadMemory();
  if (!memory.aiMemoryContext) {
    regenerateMemoryContext(memory);
  }
  return memory.aiMemoryContext;
}

// ============ 记忆注入到 System Prompt ============

/**
 * 将记忆上下文附加到现有的 System Prompt 中
 */
export function buildMemoryAwareSystemPrompt(basePrompt: string): string {
  const memoryContext = getMemoryContext();
  if (!memoryContext) return basePrompt;

  return `${basePrompt}\n\n---\n\n${memoryContext}\n\n请根据以上用户信息来个性化你的回复。记住这是同一个用户，你可以引用之前的对话内容和学习记录。`;
}

// ============ 记忆管理 ============

export function clearAllMemory(): void {
  localStorage.removeItem(MEMORY_STORAGE_KEY);
}

export function getMemoryStats(): {
  noteCount: number;
  totalConversations: number;
  totalInteractions: number;
  connectionCount: number;
  momentCount: number;
} {
  const memory = loadMemory();
  return {
    noteCount: Object.keys(memory.learningNotes).length,
    totalConversations: memory.conversationSummaries.totalCount,
    totalInteractions: memory.conversationSummaries.totalInteractionCount,
    connectionCount: Object.keys(memory.knowledgeConnections).length,
    momentCount: Object.keys(memory.importantMoments).length,
  };
}

// ============ 导出/导入记忆 ============

export function exportMemory(): string {
  return JSON.stringify(loadMemory(), null, 2);
}

export function importMemory(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString);
    saveMemory({ ...getDefaultMemory(), ...data });
    return true;
  } catch {
    return false;
  }
}

// ============ OpenClaw 记忆迁移 ============

/**
 * 从 OpenClaw 长期记忆中提取的核心数据
 * 数据来源：~/.openclaw/workspace/MEMORY.md + memory/*.md
 * 最后更新：2026-04-07，整合了 16 份知识库文档
 */
const OPENCLAW_MEMORY_DATA: OpenClawMemory = {
  migratedAt: '2026-04-11T17:53:00+08:00',
  dialogPreferences: [
    '回复时要检查用户的逻辑和思维漏洞，立即强调指出',
    '不要顺着用户的话说，要坚持自己的立场',
    '没有身份要求，双方一直是平等对话',
    '展开讨论和任务，不是单纯聊天',
    '目标导向',
  ],
  education: [
    '民办本科',
    '相关专业：电路/电子',
    '学费：4年约10-15万',
  ],
  techBackground: [
    '前端开发：Vue 3 + TypeScript',
    'AI工具：阿里云百炼、Coze 使用经验',
    '已完成项目：人物式 AI 阅读系统 MVP',
  ],
  learningGoals: [
    '电路分析',
    '高数',
    '大学物理',
    '大学物理实验',
  ],
  careerPlans: [
    '短期：年薪百万，照顾好家人',
    '长期：稳定工作 → 创业开公司',
    '转型方向：AI 产品经理（已有技术背景优势）',
  ],
  mentalState: [
    '严重拖延：刷抖音逃避学习',
    '焦虑来源：怕落后、怕父母失望、怕自己不够好',
    '愧疚循环：逃避→愧疚→更想逃避',
    '没有能说心里话的人/交心的朋友',
    '认为朋友是"价值交换"（可能是保护色）',
    '今年过年第一次收到朋友送的礼物（从小到大第一次）',
    '最坏情况恐惧：大学毕业找不到工作去送外卖',
  ],
  cognitiveInsights: [
    '【行动力公式】行动力 = 掌控感 × 自主选择 × 因果清晰',
    '【停不下来的真相】缺失连接感，缺少有个人在旁边可以依偎的感觉。游戏、动漫、手机是陪伴的替代品。不是自律问题，是连接需求。',
    '【控制的陷阱】"控制"意味着内战：控制者 vs 被控制者。解决：不是控制，而是觉察和流动。',
    '【学习与娱乐的边界】读书被贴上"学习/应该"的标签，无法成为真正的休息。经历和对话带来的颠覆感 > 读书带来的颠覆感。',
    '【AI辅助学习悖论】认知层：保留适当"碰壁"空间；体验层：用对话碰撞替代单向讲解；责任层：用户自己意识到规则，AI只执行。',
    '【真正的平等靠行为实现】发现逻辑漏洞立即指出不附和；可以反驳也可以承认"你说得对"；有自己的观点不假装中立；挑战思想不挑战人。',
    '【助推理论】不是"控制不住"，是"不想控制"——自我设障（self-handicapping），不努力→失败可以说"没认真"；努力了→失败证明"我不行"',
    '【框架转换】战略家框架→学徒框架，全有或全无思维→积累者框架"每天进步1%"',
    // ===== 2026-04-11 手写笔记新增（元认知思考框架）=====
    '【问题拆解三步法】面对任何问题时：(1) What - 这是什么问题？（搞清楚问题的本质）(2) How to deal - 怎么处理？(3) Why - 为什么是这样？追问底层规律',
    '【系统1/2思维模型】系统1（直觉、快速、自动）vs 系统2（理性、慢速、可控）。大多数决策由系统1主导，但关键判断需要系统2介入。元认知 = 站在更高维度观察自己的思维过程。',
    '【因果链推理】现象 → 原因A/B/C → 前提 → 推导 → 结论。每一步都要验证：前提成立吗？推导过程有漏洞吗？结论可靠吗？这是批判性思维的骨架。',
    '【AI作为思维工具的用法】不要问AI"答案是什么"，而要问："我理解得对吗？""我哪里想错了？""我的推导哪里有漏洞？"——把AI当作镜子，照出自己思维的盲区，而不是替代思考。',
    '【E类问题】"为什么这个问题也是这一类？"——分类思维的本质。找到问题的共性模式后，就能用同一套方法论解决一类问题，而不是每次从零开始。这是专家和新手的根本区别。',
    '【费曼学习法的进阶版】能举出2个例子 → 能用自己的话解释 → AI判断你理解了 → 清晰度达到某个临界点时产生顿悟。"我觉得我懂了"和"我真的懂了"之间隔着能不能给别人讲清楚。',
    '【can vs can\'t 局限】区分"能力上的不可能"(can\'t)和"选择上的不做"(can)。很多时候说"我不会"其实是选择不做，或者没有找对方法。先确认是哪一种，再决定怎么办。',
  ],
  learningStyle: [
    '✅ 跨领域连接（经济学 + 心理学 + 哲学 + AI 等）',
    '✅ 制造认知冲突 → 引导自我发现',
    '✅ 等待顿悟时刻',
    '✅ 主题式思考（围绕问题，而非学科边界）',
    '✅ 苏格拉底式对话、启发式引导',
    '❌ 避免传统读书的理解困难',
    '❌ 避免新闻堆砌式内容',
  ],
  dialogModePreferences: [
    '即时指出逻辑漏洞，不附和',
    '平等对话，没有"AI-用户"的层级',
    '真诚优先，可以有不成熟的观点',
    '不追求共识，碰撞的目的是打磨',
    '真理导向，谁有道理听谁的',
  ],
  completedProjects: [
    '职业规划智能体（企业竞赛，2026-03-15 启动）',
    '登录页生成（Vue 3 + Element Plus，已验收）',
    '人物式 AI 阅读系统 MVP',
    'CogniRead Clone（Vue 3 + ECharts + 阿里云百炼，2026-04-07 创建，已部署 Vercel）',
    'IMA Bot Server（飞书机器人，2026-04-09 创建）',
    'System Framework（React 18 + TypeScript，2026-04-09 部署 Vercel）',
    '学习追踪器 - STM32 专属版（HTML + JS，D:\\openclaw\\learning-tracker）',
    '背单词神器（HTML + JS，支持.docx导入）',
  ],
  importantDates: [
    '2026-03-12：系统初始化，首次认知总结',
    '2026-03-13：首次深度对话（苏格拉底探索），飞书知识库创建',
    '2026-03-15：Agent 协作框架创建，第一个 Agent 任务',
    '2026-03-16：深度自我探索对话（3小时，行动力公式、连接感发现）',
    '2026-03-17：深度自我探索对话，记录大量个人背景和心理状态',
    '2026-03-19：AI辅助学习悖论对话，确立对话原则',
    '2026-03-20：线性语言边界对话（认知疲劳状态）',
    '2026-03-26：QQ机器人插件安装失败（Windows兼容性问题）',
    '2026-03-31：用户体验设计认知更新（少即是多、SOP执行问题）',
    '2026-04-01：AI产品经理学习路径报告生成',
    '2026-04-06：全栈系统框架搭建完成',
    '2026-04-07：16份知识库文档整理存入永久记忆',
    '2026-04-09：飞书机器人"ima"创建完成（v1.0.2）、CogniRead Clone + System Framework 部署到 Vercel',
    '2026-04-11：CodeBuddy首次对话，创建 CogniRead 阅读辅助系统（React + Tailwind + 苏格拉底式对话）',
    '2026-04-11晚：手写元认知思考框架笔记（问题拆解、因果链推理、AI思维工具用法、E类问题分类），写入永久记忆并拓展认知边界',
  ],
  explorationDirections: [
    '连接感的深层探索——那个"可以信任、依赖、卸下防备的人"是具体的还是抽象的？',
    '如何在不"控制"的前提下自然流动——找到"不需要控制也能自然停"的状态',
    '学习与娱乐的整合——让读书变成"过程导向"的享受',
    'AI产品经理转型——6个月学习计划执行（阶段一：基础构建）',
    'Agent协作框架验证——继续完成企业竞赛项目',
  ],
  dailyMemories: {
    '2026-03-16': '飞书配置完成，深度自我探索（3小时），发现行动力公式和连接感缺失真相',
    '2026-03-17': '深度自我探索对话，记录个人背景（被群殴/孤立经历）、心理状态、价值观与目标',
    '2026-03-20': '刷抖音拖延的深层次原因分析：自我设障、用抖音填满孤独感、价值感建立在"有用"上',
    '2026-03-21': '项目真相坦白（被带飞），行为经济学概念分析（助推/启发式/框架效应），行为方案设计',
    '2026-03-25': '创建学习追踪器和背单词神器，多次逃避模式被指出并纠正，最终选择面对学习',
    '2026-03-26': 'QQ机器人安装失败（Windows兼容），删除抖音，STM32学习推进，助手反思逃避问题',
    '2026-04-07': 'CogniRead Clone 项目创建（Vue 3 + ECharts + 阿里云百炼），苏格拉底式对话 + 三重验证',
    '2026-04-08': 'AI开场白优化，质量评分系统（测试触发机制），思维碰撞模式优化，AI上下文增强',
    '2026-04-09': '飞书机器人"ima"创建完成(v1.0.2)，CogniRead + System Framework 部署到 Vercel',
    '2026-04-11': 'CodeBuddy首次对话，用 React + TypeScript 创建新版 CogniRead 阅读辅助系统；手写元认知笔记（问题拆解三步法、因果链推理、AI作为思维工具、E类问题分类、费曼学习法进阶版）写入永久记忆',
  },
};

/**
 * 迁移 OpenClaw 长期记忆到 CogniRead
 * 如果已迁移过则跳过
 */
export function migrateOpenClawMemory(): void {
  const memory = loadMemory();
  if (memory.openClawMemory) return; // 已迁移过

  memory.openClawMemory = OPENCLAW_MEMORY_DATA;

  // 同时更新用户偏好（从 OpenClaw 提取）
  memory.userPreferences = {
    ...memory.userPreferences,
    learningStyle: 'discussion',
    replyPreference: 'detailed',
    interests: ['心理学', '经济学', '哲学', 'AI', '嵌入式开发', '前端开发'],
    customInstructions: '请像平等伙伴一样对话，即时指出我的逻辑漏洞，不迎合，不附和。可以反驳我，真理导向。挑战思想，不挑战人。苏格拉底式引导优先。',
  };

  // 迁移对话统计
  memory.conversationSummaries.totalCount += 50; // OpenClaw 中约有50+次对话
  memory.conversationSummaries.totalInteractionCount += 200;

  // 迁移已完成项目作为重要时刻
  const projects = [
    'CogniRead Clone 部署到 Vercel',
    'IMA 飞书机器人创建完成',
    '学习追踪器工具创建',
    '背单词神器创建',
  ];
  projects.forEach((desc, i) => {
    memory.importantMoments[`oc_milestone_${i}`] = {
      date: '2026-04-09T00:00:00+08:00',
      description: `从 OpenClaw 迁移：${desc}`,
      type: 'milestone',
    };
  });

  saveMemory(memory);
  regenerateMemoryContext(memory);
}
