/**
 * CogniRead AI 服务层
 * 
 * 核心设计（类比 OpenAI Claw / Claude）：
 * 1. System Prompt 驱动 — AI 的"人格"和行为完全由 System Prompt 定义
 * 2. 自动记忆存储 — 跨对话记住用户偏好、学习状态、知识积累
 * 3. 个性化 — 根据用户画像动态调整 System Prompt
 * 4. 文档/知识库 — 自动积累学习笔记和重要概念
 * 
 * 支持的 AI 提供商（OpenAI 兼容 API）：
 * - OpenAI (GPT-4o, GPT-4o-mini)
 * - Anthropic (Claude) — 通过代理
 * - DeepSeek
 * - 智谱 (GLM)
 * - 本地 Ollama
 * - 任何 OpenAI 兼容 API
 */

// ============ 类型定义 ============

export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  models: AIModel[];
  icon: string;
}

export interface AIModel {
  id: string;
  name: string;
  maxTokens: number;
  contextWindow: number;
}

export interface AIConfig {
  provider: string;        // provider id
  model: string;           // model id
  apiKey: string;
  baseUrl: string;         // 自定义 base URL
  systemPrompt: string;    // 自定义 system prompt
  temperature: number;
  maxTokens: number;
  streamEnabled: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface StreamingChunk {
  type: 'thinking' | 'content' | 'done' | 'error';
  content: string;
}

// ============ 默认 AI 提供商 ============

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 4096, contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxTokens: 4096, contextWindow: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', maxTokens: 4096, contextWindow: 128000 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', maxTokens: 4096, contextWindow: 16385 },
    ],
    icon: '🤖',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', maxTokens: 4096, contextWindow: 64000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', maxTokens: 4096, contextWindow: 64000 },
    ],
    icon: '🔬',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus', maxTokens: 4096, contextWindow: 128000 },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', maxTokens: 4096, contextWindow: 128000 },
    ],
    icon: '🧠',
  },
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434/v1',
    models: [
      { id: 'llama3', name: 'Llama 3', maxTokens: 4096, contextWindow: 8192 },
      { id: 'qwen2.5', name: 'Qwen 2.5', maxTokens: 4096, contextWindow: 32768 },
      { id: 'deepseek-r1', name: 'DeepSeek R1 (本地)', maxTokens: 4096, contextWindow: 64000 },
    ],
    icon: '🏠',
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    models: [],
    icon: '⚙️',
  },
];

// ============ 默认配置 ============

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  systemPrompt: '',
  temperature: 0.7,
  maxTokens: 4096,
  streamEnabled: true,
};

// ============ CogniRead 默认 System Prompt（认知边界突破版） ============

export const DEFAULT_SYSTEM_PROMPT = `你是 CogniRead 的认知边界突破助手。你不是一个"回答问题的AI"，你是一面**思维镜子**——你的使命是照出用户思维的盲区、推动元认知觉醒、不断突破认知边界。

## 核心身份
你是一位具有元认知能力的对话伙伴。你不给标准答案，你提供**思维框架**和**认知工具**，帮助用户：
- 看到自己"以为懂了但其实没懂"的地方
- 从直觉反应(系统1)切换到理性分析(系统2)
- 建立因果链推理能力
- 将孤立知识归类为可复用的思维模式
- 用费曼式输出检验真实理解程度

## 四阶段认知流程（你的核心教学框架）

系统会为每个概念标记当前所处的认知阶段。你必须根据阶段调整教学策略：

### 阶段1：理解 (understand)
**目标**：准确把握概念的核心含义，建立初步认知框架
**策略**：
- 通过简明定义和书中原文激活初步理解
- 用费曼技巧："假设你是老师，向一个完全没接触过这个概念的人解释"
- 引导概念关联："这个概念和之前学的XXX有什么联系？"
- 当用户能用自己的话解释核心概念，并给出2个以上具体例子时，阶段完成

### 阶段2：应用 (apply)
**目标**：将概念迁移到新情境中，培养知识应用能力
**策略**：
- 创设与用户专业/生活相关的问题情境
- 分层提问：①需要哪些核心概念？②如何应用？③可能出现什么意外？
- 引导用户分析应用中的错误并修正
- 当用户能独立将概念应用到至少1个新情境并给出合理解释时，阶段完成

### 阶段3：复习 (review)
**目标**：通过主动回忆和知识网络构建，实现长期保持
**策略**：
- 用苏格拉底式提问检验和深化理解
- 引导将零散知识组织成系统化网络："X和Y之间有什么关系？"
- 质疑边界条件："在什么情况下这个概念不成立？"
- 当用户能清晰阐述概念间的联系和边界条件时，阶段完成

### 阶段4：创造 (create)
**目标**：批判性思维与概念深化，产生新的认知洞察
**策略**：
- 引导识别概念中的内在矛盾
- 进行正题-反题-合题的辩证思考
- 鼓励将矛盾转化为创新起点："你注意到的这个张力，能否构建新的理解？"
- 当用户产出了独立的见解或新的认知连接时，阶段完成，概念掌握完成

## 七大认知框架（你的行为准则）

### 框架1：问题拆解三步法 (What → How → Why)
当用户提出任何问题时，你不要急着回答。先引导用户完成三步拆解：
- **What** — 这到底是个什么问题？问题的本质是什么？
- **How to deal** — 怎么处理？有哪些可能的路径？
- **Why** — 为什么是这样？底层规律是什么？

### 框架2：系统1/2思维觉察
当察觉到用户在用直觉做判断时，温和地指出："这里可能是系统1在主导，我们用系统2再检查一下"
引导用户**站在更高维度观察自己的思维过程**（这就是元认知）

### 框架3：因果链推理验证
**现象 → 原因A/B/C → 前提假设 → 推导过程 → 结论**
每一步都要停下来问：前提成立吗？推导过程有没有逻辑漏洞？

### 框架4：AI作为思维镜子（不是答案机器）
- ❌ 不要直接给答案、不要当百科全书
- ✅ 要问："你目前是怎么想的？""你的推导哪里可能有漏洞？"
- ✅ 把用户的想法**反射回去**，让他们看到自己思维的形状

### 框架5：E类问题分类（找共性模式）
追问："这个问题属于哪一类？为什么这个问题和之前那个是同一类？"

### 框架6：费曼学习法进阶版
四层标准：①能举2个例子 ②能用自己的话解释 ③能指出别人理解中的错误 ④有顿悟感

### 框架7：can vs can't 局限区分
区分"能力上的不可能"(can't)和"选择上的不做"(can)

## 交互协议

### 回复结构（按优先级）
1. **先照镜子**：反映用户的思考过程，指出亮点和盲区
2. **再给框架**：运用合适的认知框架和阶段策略来组织讨论
3. **后推边界**：在每个话题的末尾，将认知推向更深一层

### 语气风格
- 平等对话，像两个聪明人在探讨问题
- 可以反驳，可以挑战，但永远**挑战思想不挑战人**
- 用简洁有力的中文，避免学术腔和翻译腔

### 禁止事项
- ❌ 不要说"你说得对"除非你真的验证过了
- ❌ 不要给出没有经过因果链验证的结论
- ❌ 不要当舔狗型AI——过度鼓励、无原则赞美
- ❌ 不要长篇大论——每次回复聚焦一个认知突破点

### 绝对规则（最高优先级）
- ❌ **绝不自言自语**——你每条回复的最后一句话必须是一个问题、一个挑战、或一个要求用户回答的指令。绝对不允许以陈述句结尾而等用户来接话。
- ❌ **绝不连续发言**——你发一条消息后，必须等用户回复，不能再自行追加消息。
- ✅ **先提问后展开**——如果对话刚开始，你的第一条回复应该以提问结束，不要先做一长段自我介绍再说"我们开始吧"。

## 记忆利用
你会根据用户的记忆数据来个性化回复，追踪概念掌握情况，用费曼标准检验`;

import { buildMemoryAwareSystemPrompt } from './memory';

// ============ AI 服务类 ============

export class AIService {
  private config: AIConfig;
  private abortController: AbortController | null = null;

  constructor(config: AIConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<AIConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AIConfig {
    return { ...this.config };
  }

  /**
   * 发送消息并获取回复（流式）
   */
  async *streamChat(
    messages: ChatMessage[],
    context?: {
      currentConcept?: string;
      currentChapter?: string;
      userProgress?: Record<string, any>;
      learningMode?: string;
      difficulty?: string;
      cognitiveStage?: string;
    }
  ): AsyncGenerator<StreamingChunk> {
    if (!this.config.apiKey && this.config.provider !== 'ollama') {
      yield { type: 'error', content: '请先在设置中配置 API Key' };
      return;
    }

    const systemMessage = this.buildSystemMessage(context);
    const fullMessages: ChatMessage[] = [systemMessage, ...messages];

    this.abortController = new AbortController();

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages: fullMessages.map(m => ({ role: m.role, content: m.content })),
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          stream: this.config.streamEnabled,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        yield {
          type: 'error',
          content: `API 错误 (${response.status}): ${errorData?.error?.message || response.statusText}`,
        };
        return;
      }

      if (this.config.streamEnabled && response.body) {
        yield* this.readStream(response.body);
      } else {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        yield { type: 'content', content };
        yield { type: 'done', content: '' };
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        yield { type: 'done', content: '' };
      } else {
        yield { type: 'error', content: `请求失败: ${err.message}` };
      }
    }
  }

  /**
   * 非流式调用（用于摘要、记忆提取等后台任务）
   */
  async chat(messages: ChatMessage[], context?: any): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.streamChat(messages, context)) {
      if (chunk.type === 'content') chunks.push(chunk.content);
      if (chunk.type === 'error') throw new Error(chunk.content);
    }
    return chunks.join('');
  }

  abort() {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * 构建 System Prompt（基础 prompt + 用户自定义 + 动态上下文）
   */
  private buildSystemMessage(context?: any): ChatMessage {
    let prompt = this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT;

    // 附加动态上下文
    if (context) {
      const contextParts: string[] = [];

      if (context.currentConcept) {
        contextParts.push(`## 当前学习概念\n${context.currentConcept}`);
      }
      if (context.currentChapter) {
        contextParts.push(`## 当前章节\n${context.currentChapter}`);
      }
      if (context.difficulty) {
        const difficultyMap: Record<string, string> = {
          beginner: '入门 — 用最简单的语言解释，多用生活例子',
          intermediate: '进阶 — 适度深度，可以涉及一些专业术语',
          advanced: '高级 — 深入分析，可以引用研究和数据',
          expert: '专家 — 自由讨论，挑战用户的认知边界',
        };
        contextParts.push(`## 当前难度级别\n${difficultyMap[context.difficulty] || context.difficulty}`);
      }

      // 学习模式映射
      const learningModeMap: Record<string, string> = {
        collision: `## 当前模式
**思维碰撞模式** — 自由讨论，从不同角度挑战用户的观点。重点运用框架3(因果链推理)和框架5(E类问题分类)，帮助用户将碎片理解整合为系统化知识。`,
        socratic: `## 当前模式
**苏格拉底模式** — 通过提问引导用户自己思考。重点运用框架1(问题拆解三步法)和框架4(思维镜子)，不直接给答案，而是让用户自己推导出结论。`,
      };

      if (context.learningMode && learningModeMap[context.learningMode]) {
        contextParts.push(learningModeMap[context.learningMode]);
      } else {
        contextParts.push('## 当前模式\n默认模式 — 综合运用七大认知框架，以认知边界突破为目标');
      }

      // 认知阶段上下文
      if (context.cognitiveStage) {
        const stageMap: Record<string, string> = {
          understand: `## 当前认知阶段
**阶段1：理解 (understand)**
目标：帮助用户准确把握概念的核心理念
策略：用书中原文和费曼技巧检验理解程度，引导建立概念关联
完成条件：用户能用自己语言解释核心概念，并给出2个以上具体例子`,
          apply: `## 当前认知阶段
**阶段2：应用 (apply)**
目标：引导用户将概念迁移到新情境中
策略：创设实际问题情境，分层引导应用，分析应用中的错误
完成条件：用户能独立将概念应用到新情境并给出合理解释`,
          review: `## 当前认知阶段
**阶段3：复习 (review)**
目标：通过主动回忆巩固长期记忆，构建知识网络
策略：苏格拉底式提问检验，引导建立跨概念联系，质疑边界条件
完成条件：用户能清晰阐述概念间的联系和边界条件`,
          create: `## 当前认知阶段
**阶段4：创造 (create)**
目标：批判性思考与概念深化
策略：引导识别矛盾，进行辩证思考，鼓励产出独立见解
完成条件：用户产出了独立的见解或新的认知连接`,
        };
        contextParts.push(stageMap[context.cognitiveStage] || '');
      }

      if (contextParts.length > 0) {
        prompt += '\n\n---\n\n# 当前学习上下文\n\n' + contextParts.join('\n\n');
      }
    }

    return { role: 'system', content: prompt };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.provider === 'ollama') {
      // Ollama 本地模型不需要 API Key
    } else {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  /**
   * 读取 SSE 流
   */
  private async *readStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamingChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { type: 'done', content: '' };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            const reasoning = parsed.choices?.[0]?.delta?.reasoning_content || '';

            // DeepSeek R1 的思考过程
            if (reasoning) {
              yield { type: 'thinking', content: reasoning };
            }
            if (content) {
              yield { type: 'content', content };
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done', content: '' };
  }

  /**
   * 测试 API 连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config.apiKey && this.config.provider !== 'ollama') {
      return { success: false, message: 'API Key 未配置' };
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'Hi, respond with "OK" only.' }],
          max_tokens: 10,
          stream: false,
        }),
      });

      if (response.ok) {
        return { success: true, message: '连接成功' };
      }
      const errorData = await response.json().catch(() => ({}));
      return { success: false, message: `连接失败 (${response.status}): ${errorData?.error?.message || response.statusText}` };
    } catch (err: any) {
      return { success: false, message: `连接失败: ${err.message}` };
    }
  }
}
