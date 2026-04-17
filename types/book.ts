// 书籍数据结构
export interface Concept {
  id: string;
  name: string;
  description: string;
  quotes: string[]; // 书中引用的原文
  questions: SocraticQuestion[]; // 苏格拉底式问题
  collisionTopics: CollisionTopic[]; // 思维碰撞话题
  unlockingCriteria: {
    minCorrectAnswers: number;
    requiredConcepts: string[]; // 前置概念
  };
}

export interface SocraticQuestion {
  id: string;
  question: string;
  // 多层引导：从宽到窄，逐步引导
  guidanceLevels: GuidanceLevel[];
  // 书中引用
  quote: string;
  // 完全掌握后的总结
  masterySummary: string;
}

// 引导层级：根据用户回答的深度给出不同回应
export interface GuidanceLevel {
  level: number; // 0=完全正确, 1=部分正确, 2=方向对了但不够准确, 3=需要引导
  response: string; // 针对这个层级的回应
  followUpQuestion?: string; // 接下来问的问题（如果有的话）
}

// 思维碰撞话题
export interface CollisionTopic {
  id: string;
  title: string;
  description: string;
  starterQuestion: string; // 开场问题
  perspectives: string[]; // 不同视角的引导
  quotes: string[]; // 相关引用
  challengeQuestions: string[]; // 挑战性问题
}

export interface Chapter {
  id: string;
  name: string;
  concepts: Concept[];
  isLocked: boolean;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  description?: string;
  chapters: Chapter[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isQuote?: boolean;
  isEncouragement?: boolean;
  isGuidance?: boolean;
  isMasteryMessage?: boolean; // 掌握完成的消息，需要显示"下一步"按钮
}

export interface UserProgress {
  conceptId: string;
  status: 'locked' | 'in_progress' | 'mastered';
  // 四阶段认知流程
  cognitiveStage: CognitiveStage;
  // 各阶段完成时间
  stageCompletedAt: Record<CognitiveStage, string | null>;
  // 间隔重复相关
  reviewCount: number;
  lastReviewAt: string | null;
  nextReviewAt: string | null;
  // 原有字段
  correctAnswers: number;
  totalQuestions: number;
  conversationHistory: Message[];
}

// 四阶段认知流程（基于布鲁姆分类法 + 库伯经验学习圈）
export type CognitiveStage = 'understand' | 'apply' | 'review' | 'create';

export const COGNITIVE_STAGES: { id: CognitiveStage; name: string; description: string; icon: string; color: string }[] = [
  { id: 'understand', name: '理解', description: '掌握概念的核心含义，建立初步认知框架', icon: 'Lightbulb', color: 'from-blue-500 to-cyan-500' },
  { id: 'apply', name: '应用', description: '将概念应用到新情境中，培养知识迁移能力', icon: 'Target', color: 'from-amber-500 to-orange-500' },
  { id: 'review', name: '复习', description: '通过间隔重复巩固记忆，构建知识网络', icon: 'RotateCcw', color: 'from-emerald-500 to-teal-500' },
  { id: 'create', name: '创造', description: '批判性思考与概念深化，产生新的认知洞察', icon: 'Sparkles', color: 'from-purple-500 to-pink-500' },
];

// 阶段顺序定义
export const STAGE_ORDER: CognitiveStage[] = ['understand', 'apply', 'review', 'create'];

// 获取下一个阶段
export function getNextStage(current: CognitiveStage): CognitiveStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  return idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
}

// 获取阶段索引（用于进度计算）
export function getStageIndex(stage: CognitiveStage): number {
  return STAGE_ORDER.indexOf(stage);
}
