// 本地存储工具 - 用户进度持久化
import { UserProgress, CognitiveStage } from '@/types/book';

const STORAGE_KEY = 'cogniread_progress';
const DATA_VERSION_KEY = 'cogniread_data_version';
const CURRENT_DATA_VERSION = 3; // v2→v3: 修复解锁逻辑，强制重置旧进度

export interface StoredProgress {
  concepts: Record<string, UserProgress>;
  lastVisit: string;
  totalSessions: number;
  // 每日活跃度（日期 -> 当日互动次数），用于学习热力图
  activity: Record<string, number>;
}

// 本地日期键（YYYY-MM-DD），统一用本地时区
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 创建默认的 UserProgress（兼容旧数据）
function createDefaultProgress(conceptId: string, status: UserProgress['status']): UserProgress {
  return {
    conceptId,
    status,
    cognitiveStage: status === 'mastered' ? 'create' : status === 'in_progress' ? 'understand' : 'understand',
    stageCompletedAt: {
      understand: status === 'mastered' ? new Date().toISOString() : null,
      apply: status === 'mastered' ? new Date().toISOString() : null,
      review: status === 'mastered' ? new Date().toISOString() : null,
      create: status === 'mastered' ? new Date().toISOString() : null,
    },
    reviewCount: 0,
    lastReviewAt: null,
    nextReviewAt: null,
    correctAnswers: 0,
    totalQuestions: 0,
    conversationHistory: [],
  };
}

// 无 localStorage 环境（SSR / 单测）的兜底
function emptyProgress(): StoredProgress {
  return { concepts: {}, lastVisit: new Date().toISOString(), totalSessions: 0, activity: {} };
}

// 获取存储的数据
export function getStoredProgress(): StoredProgress {
  if (typeof localStorage === 'undefined') return emptyProgress();
  // 检查数据版本，不匹配时自动重置
  const storedVersion = localStorage.getItem(DATA_VERSION_KEY);
  if (storedVersion && parseInt(storedVersion) !== CURRENT_DATA_VERSION) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('cogniread_socratic_messages');
    localStorage.removeItem('cogniread_collision_messages');
    localStorage.removeItem('cogniread_memory');
    localStorage.setItem(DATA_VERSION_KEY, String(CURRENT_DATA_VERSION));
    return { concepts: {}, lastVisit: new Date().toISOString(), totalSessions: 0, activity: {} };
  }
  // 首次使用时标记版本
  if (!storedVersion) {
    localStorage.setItem(DATA_VERSION_KEY, String(CURRENT_DATA_VERSION));
  }
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      // 兼容旧数据：为缺少新字段的 UserProgress 补充默认值
      const concepts: Record<string, UserProgress> = {};
      for (const [id, p] of Object.entries(parsed.concepts || {})) {
        const up = p as UserProgress;
        // 检查是否有新字段
        if (!up.cognitiveStage) {
          concepts[id] = createDefaultProgress(id, up.status);
          // 保留原有数据
          concepts[id].correctAnswers = up.correctAnswers || 0;
          concepts[id].totalQuestions = up.totalQuestions || 0;
          concepts[id].conversationHistory = up.conversationHistory || [];
        } else {
          concepts[id] = up;
        }
      }
      return {
        concepts,
        lastVisit: parsed.lastVisit || new Date().toISOString(),
        totalSessions: parsed.totalSessions || 0,
        activity: parsed.activity || {},
      };
    }
  } catch (e) {
    console.error('Failed to parse stored progress:', e);
  }
  return {
    concepts: {},
    lastVisit: new Date().toISOString(),
    totalSessions: 0,
    activity: {},
  };
}

// 保存用户进度（不改变 totalSessions，会话数由 recordSession 单独记录）
export function saveProgress(concepts: Record<string, UserProgress>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = getStoredProgress();
    const data: StoredProgress = {
      concepts: {
        ...current.concepts,
        ...concepts
      },
      lastVisit: new Date().toISOString(),
      totalSessions: current.totalSessions,
      activity: current.activity,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save progress:', e);
  }
}

// 记录一次学习会话（每次打开应用调用一次）
export function recordSession(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = getStoredProgress();
    const data: StoredProgress = { ...current, totalSessions: current.totalSessions + 1, lastVisit: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to record session:', e);
  }
}

// 记录一次学习互动（回答问题/发送消息）
export function recordActivity(count: number = 1): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const current = getStoredProgress();
    const key = dateKey(new Date());
    current.activity[key] = (current.activity[key] || 0) + count;
    const data: StoredProgress = { ...current, lastVisit: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to record activity:', e);
  }
}

// 获取最近 84 天的活跃度数据（与热力图 12x7 网格对应，末位是今天）
export function getActivityData(): number[] {
  const stored = getStoredProgress();
  const out: number[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(stored.activity[dateKey(d)] || 0);
  }
  return out;
}

// 更新单个概念的进度
export function updateConceptProgress(conceptId: string, progress: UserProgress): void {
  if (typeof localStorage === 'undefined') return;
  const current = getStoredProgress();
  current.concepts[conceptId] = progress;
  current.lastVisit = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Failed to update concept progress:', e);
  }
}

// 获取特定概念的进度
export function getConceptProgress(conceptId: string): UserProgress | null {
  const stored = getStoredProgress();
  return stored.concepts[conceptId] || null;
}

// 清除所有进度
export function clearProgress(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear progress:', e);
  }
}

// 获取学习统计
export function getLearningStats() {
  const progress = getStoredProgress();
  const mastered = Object.values(progress.concepts).filter(p => p.status === 'mastered').length;
  const inProgress = Object.values(progress.concepts).filter(p => p.status === 'in_progress').length;
  
  return {
    totalSessions: progress.totalSessions,
    mastered,
    inProgress,
    lastVisit: progress.lastVisit
  };
}

// ============ 间隔重复复习调度（艾宾浩斯遗忘曲线简化版） ============

/**
 * 计算下次复习时间
 * 基于 SM-2 算法的简化版间隔：
 * 第1次复习：1天后
 * 第2次复习：3天后
 * 第3次复习：7天后
 * 第4次复习：14天后
 * 第5次复习：30天后
 * 之后每30天一次
 */
export function calculateNextReview(reviewCount: number): Date {
  const intervals = [1, 3, 7, 14, 30]; // 天
  const days = reviewCount < intervals.length ? intervals[reviewCount] : 30;
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * 检查哪些已掌握的概念需要复习
 */
export function getConceptsNeedingReview(): Array<{ conceptId: string; daysOverdue: number }> {
  const stored = getStoredProgress();
  const now = new Date();
  const result: Array<{ conceptId: string; daysOverdue: number }> = [];

  for (const [conceptId, progress] of Object.entries(stored.concepts)) {
    if (progress.status === 'mastered' && progress.nextReviewAt) {
      const reviewDate = new Date(progress.nextReviewAt);
      if (reviewDate <= now) {
        const daysOverdue = Math.floor((now.getTime() - reviewDate.getTime()) / 86400000);
        result.push({ conceptId, daysOverdue });
      }
    }
  }

  return result.sort((a, b) => b.daysOverdue - a.daysOverdue); // 最 overdue 的排前面
}

/**
 * 记录一次复习完成
 */
export function recordReview(conceptId: string): UserProgress | null {
  const stored = getStoredProgress();
  const current = stored.concepts[conceptId];
  if (!current) return null;

  current.reviewCount++;
  current.lastReviewAt = new Date().toISOString();
  current.nextReviewAt = calculateNextReview(current.reviewCount).toISOString();

  saveProgress(stored.concepts);
  return current;
}
