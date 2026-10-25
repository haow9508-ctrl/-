/**
 * Agent 首页 · 意图路由与主动开场
 *
 * P0 采用纯规则路由（零配置可用、可单测）；
 * AI 模式的结构化意图分类（一次 JSON 调用）列入 P1。
 *
 * 四类意图：
 * - learn          命中概念名 → 打开/继续该概念的苏格拉底对话（锁定则给出入口概念）
 * - review         复习关键词 → 定位到期概念；无到期则引导继续学习
 * - free_question  疑问句但不指向具体概念 → AI 自由探讨 / 本地引导回概念学习
 * - chat           闲聊 → AI 接管 / 本地能力说明
 */
import { Book, Concept, Chapter, COGNITIVE_STAGES } from '@/types/book';
import { UserProgress } from '@/types/book';
import { getConceptsNeedingReview } from '@/utils/storage';

export type AgentIntent = 'learn' | 'review' | 'free_question' | 'chat';

export interface AgentCardRef {
  type: 'concept' | 'review';
  conceptId: string;
}

export interface RouteResult {
  intent: AgentIntent;
  /** 命中/指定的目标概念（review 时为到期概念或用户点名概念） */
  concept?: Concept;
  chapter?: Chapter;
  /** learn 意图下目标概念是否可直接进入 */
  conceptSelectable?: boolean;
  /** 本地模式可直接展示的回复（AI 模式通常为空，交给 AI 说话） */
  reply: string;
  card?: AgentCardRef;
}

const REVIEW_KEYWORDS = ['复习', '巩固', '回顾', '温习', '记不记得', '忘了没', '测验我', '考考我'];

/** 概念别名表（含常见口语写法），匹配时按数组顺序，先长后短 */
const CONCEPT_ALIASES: Record<string, string[]> = {
  'system1': ['系统 1', '系统1', '系统一', 'system 1', 'system1'],
  'system2': ['系统 2', '系统2', '系统二', 'system 2', 'system2'],
  'anchoring': ['锚定效应', '锚定'],
  'availability': ['可得性启发', '可得性'],
  'loss-aversion': ['损失厌恶'],
  'framing': ['框架效应', '框架'],
  'overconfidence': ['过度自信'],
  'peak-end': ['峰终定律', '峰终'],
  'endowment': ['禀赋效应', '禀赋'],
};

export interface ConceptLocation {
  concept: Concept;
  chapter: Chapter;
}

function locateAll(book: Book): ConceptLocation[] {
  return book.chapters.flatMap(ch => ch.concepts.map(c => ({ concept: c, chapter: ch })));
}

export function findConceptById(id: string, book: Book): ConceptLocation | null {
  return locateAll(book).find(x => x.concept.id === id) || null;
}

/** 在用户输入中找概念提及（别名匹配，返回书中定义顺序的第一个命中） */
export function findConceptMention(text: string, book: Book): ConceptLocation | null {
  const lower = text.toLowerCase();
  for (const loc of locateAll(book)) {
    const aliases = CONCEPT_ALIASES[loc.concept.id] || [loc.concept.name];
    if (aliases.some(a => lower.includes(a.toLowerCase()))) return loc;
  }
  return null;
}

/** 概念的默认解锁状态：无前置要求的概念视为天然解锁（如「系统1」） */
function resolveStatus(concept: Concept, progress: Record<string, UserProgress>): 'locked' | 'in_progress' | 'mastered' {
  const raw = progress[concept.id]?.status;
  if (raw) return raw;
  return concept.unlockingCriteria.requiredConcepts.length === 0 ? 'in_progress' : 'locked';
}

function isSelectable(concept: Concept, progress: Record<string, UserProgress>): boolean {
  const status = resolveStatus(concept, progress);
  if (status === 'locked') return false;
  return concept.unlockingCriteria.requiredConcepts.every(id => progress[id]?.status === 'mastered');
}

/**
 * 沿解锁链向下找第一个「可进入」的概念：
 * 用户点名了未解锁的「禀赋效应」时，给出真正可以马上开始的起点（如「系统2」）
 */
function firstEntryConcept(conceptIds: string[], book: Book, progress: Record<string, UserProgress>): ConceptLocation | null {
  for (const id of conceptIds) {
    const loc = findConceptById(id, book);
    if (!loc) continue;
    if (isSelectable(loc.concept, progress)) return loc;
    const entry = firstEntryConcept(loc.concept.unlockingCriteria.requiredConcepts, book, progress);
    if (entry) return entry;
  }
  return null;
}

export function routeAgentInput(input: string, book: Book, progress: Record<string, UserProgress>): RouteResult {
  const text = input.trim();
  const lower = text.toLowerCase();
  const found = findConceptMention(text, book);
  const wantsReview = REVIEW_KEYWORDS.some(k => lower.includes(k));

  // ===== 复习意图 =====
  if (wantsReview) {
    if (found && resolveStatus(found.concept, progress) === 'mastered') {
      return {
        intent: 'review', concept: found.concept, chapter: found.chapter, conceptSelectable: true,
        reply: `好，那就测测『${found.concept.name}』你还记得多少——不看笔记，凭记忆回答。`,
        card: { type: 'review', conceptId: found.concept.id },
      };
    }
    const due = getConceptsNeedingReview();
    if (due.length > 0) {
      const target = findConceptById(due[0].conceptId, book);
      if (target) {
        return {
          intent: 'review', concept: target.concept, chapter: target.chapter, conceptSelectable: true,
          reply: `你有 ${due.length} 个概念到了复习时间，先从逾期 ${due[0].daysOverdue} 天的『${target.concept.name}』开始，看看还记得多少？`,
          card: { type: 'review', conceptId: target.concept.id },
        };
      }
    }
    // 无到期复习：引导继续学习
    const inProgress = locateAll(book).find(x => resolveStatus(x.concept, progress) === 'in_progress');
    if (inProgress) {
      return {
        intent: 'review',
        reply: `今天还没有到期的复习（复习节奏：掌握后第 1/3/7/14/30 天）。不如继续『${inProgress.concept.name}』？`,
        card: { type: 'concept', conceptId: inProgress.concept.id },
      };
    }
    return { intent: 'review', reply: '今天还没有到期的复习（复习节奏：掌握后第 1/3/7/14/30 天）。先去掌握一个新概念吧！' };
  }

  // ===== 学习意图：命中概念 =====
  if (found) {
    const status = resolveStatus(found.concept, progress);
    const selectable = isSelectable(found.concept, progress);
    if (!selectable) {
      const missing = found.concept.unlockingCriteria.requiredConcepts.filter(id => progress[id]?.status !== 'mastered');
      const entry = firstEntryConcept(missing, book, progress);
      const missingNames = missing
        .map(id => `『${findConceptById(id, book)?.concept.name || id}』`)
        .join('、');
      const entryHint = entry ? (entry.concept.id === found.concept.id ? '' : `建议从『${entry.concept.name}』开始。`) : '';
      return {
        intent: 'learn', concept: found.concept, chapter: found.chapter, conceptSelectable: false,
        reply: `『${found.concept.name}』还处于锁定状态——需要先掌握：${missingNames}。${entryHint}`,
        card: entry ? { type: 'concept', conceptId: entry.concept.id } : undefined,
      };
    }
    const mastered = status === 'mastered';
    return {
      intent: 'learn', concept: found.concept, chapter: found.chapter, conceptSelectable: true,
      reply: mastered
        ? `你已经掌握过『${found.concept.name}』✨ 我们可以做更深入的探讨，或者用几个问题帮你唤回记忆。`
        : `好，那我们开始『${found.concept.name}』。`,
      card: { type: 'concept', conceptId: found.concept.id },
    };
  }

  // ===== 自由提问 vs 闲聊 =====
  // 能力咨询类问句归入 chat（回复能力说明），不当作知识提问
  const isCapabilityAsk = ['你能做什么', '你会什么', '怎么用', '如何使用', '帮助'].some(p => text.includes(p));
  if (isCapabilityAsk) {
    return {
      intent: 'chat',
      reply: '我是《思考，快与慢》的学习伙伴，不是通用聊天助手。我能做三件事：\n\n① 用提问带你走完一个概念（比如输入「什么是系统1」）\n② 掌握概念后和你进行思维碰撞、辩论\n③ 按艾宾浩斯遗忘曲线安排复习\n\n想从哪个开始？',
    };
  }

  const isQuestion = /[?？]/.test(text)
    || ['为什么', '怎么', '如何', '什么', '是不是', '能不能', '会不会', '为什么会'].some(p => text.startsWith(p));

  if (isQuestion) return { intent: 'free_question', reply: '' };
  return { intent: 'chat', reply: '' };
}

// ============ 主动开场 ============

export interface HomeOpening {
  greeting: string;
  suggestions: string[];
  cards: AgentCardRef[];
}

export function buildHomeOpening(progress: Record<string, UserProgress>, book: Book): HomeOpening {
  const all = locateAll(book);
  const due = getConceptsNeedingReview();
  const inProgress = all.find(x => resolveStatus(x.concept, progress) === 'in_progress');

  // 1) 到期复习最优先
  if (due.length > 0) {
    const target = findConceptById(due[0].conceptId, book);
    if (target) {
      return {
        greeting: `欢迎回来。『${target.concept.name}』的复习已经逾期 ${due[0].daysOverdue} 天——先花两分钟，看看你还记得多少？`,
        suggestions: [`复习『${target.concept.name}』`, ...(inProgress ? [`继续『${inProgress.concept.name}』`] : []), '你能做什么？'],
        cards: [{ type: 'review', conceptId: target.concept.id }],
      };
    }
  }

  // 2) 未完成的概念
  if (inProgress) {
    const stage = progress[inProgress.concept.id]?.cognitiveStage || 'understand';
    const stageName = COGNITIVE_STAGES.find(s => s.id === stage)?.name || '理解';
    return {
      greeting: `欢迎回来。上次我们停在『${inProgress.concept.name}』的「${stageName}」阶段——接着往下走？`,
      suggestions: [`继续『${inProgress.concept.name}』`, '复习到期概念', '你能做什么？'],
      cards: [{ type: 'concept', conceptId: inProgress.concept.id }],
    };
  }

  // 3) 新用户
  const first = all[0];
  return {
    greeting: `你好，我是 CogniRead 学习伙伴。真正搞懂一个概念没有捷径，但有路径：我提问，你回答，直到你能把它讲清楚。我们从《思考，快与慢》的『${first.concept.name}』开始？`,
    suggestions: [`开始『${first.concept.name}』`, '你能做什么？'],
    cards: [{ type: 'concept', conceptId: first.concept.id }],
  };
}
