import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// storage 依赖 localStorage，单测环境没有 —— mock 到期复习数据
vi.mock('@/utils/storage', () => ({
  getConceptsNeedingReview: vi.fn(() => []),
}));

import { routeAgentInput, buildHomeOpening, findConceptMention } from '@/utils/agentHome';
import { getConceptsNeedingReview } from '@/utils/storage';
import { bookData } from '@/data/bookData';
import { UserProgress } from '@/types/book';

const mockedDue = getConceptsNeedingReview as unknown as Mock;
const book = bookData;

/** 构造最小可用进度（路由只读 status / cognitiveStage） */
function makeProgress(entries: Record<string, { status: 'locked' | 'in_progress' | 'mastered'; stage?: any }>): Record<string, UserProgress> {
  const out: Record<string, UserProgress> = {};
  for (const [id, v] of Object.entries(entries)) {
    out[id] = {
      conceptId: id, status: v.status,
      cognitiveStage: v.stage || 'understand',
      stageCompletedAt: { understand: null, apply: null, review: null, create: null },
      reviewCount: 0, lastReviewAt: null, nextReviewAt: null,
      correctAnswers: 0, totalQuestions: 0, conversationHistory: [],
    } as unknown as UserProgress;
  }
  return out;
}

beforeEach(() => { mockedDue.mockReturnValue([]); });

describe('findConceptMention', () => {
  it('按标准名命中', () => {
    expect(findConceptMention('讲讲锚定效应', book)?.concept.id).toBe('anchoring');
  });
  it('按别名命中（系统一）', () => {
    expect(findConceptMention('系统一是什么', book)?.concept.id).toBe('system1');
  });
  it('带空格的写法命中', () => {
    expect(findConceptMention('系统 2 有什么特点', book)?.concept.id).toBe('system2');
  });
});

describe('routeAgentInput', () => {
  it('新用户问「什么是系统1」→ learn 且可直接进入', () => {
    const r = routeAgentInput('什么是系统1？', book, {});
    expect(r.intent).toBe('learn');
    expect(r.concept?.id).toBe('system1');
    expect(r.conceptSelectable).toBe(true);
  });

  it('未解锁概念 → learn 不可进入，卡片指向解锁链上第一个可进入的概念', () => {
    const progress = makeProgress({ system1: { status: 'in_progress' } });
    const r = routeAgentInput('我想学禀赋效应', book, progress);
    expect(r.intent).toBe('learn');
    expect(r.concept?.id).toBe('endowment');
    expect(r.conceptSelectable).toBe(false);
    // 系统1 尚未掌握 → 解锁链的最深可进入点是系统1 自己
    expect(r.card?.conceptId).toBe('system1');
    expect(r.reply).toContain('锁定');
  });

  it('已掌握概念 + 复习关键词 → review 该概念', () => {
    const progress = makeProgress({ system1: { status: 'mastered' } });
    const r = routeAgentInput('复习一下系统1', book, progress);
    expect(r.intent).toBe('review');
    expect(r.concept?.id).toBe('system1');
  });

  it('复习关键词但无到期 → 引导继续未完成概念', () => {
    const progress = makeProgress({ system1: { status: 'in_progress', stage: 'apply' } });
    const r = routeAgentInput('帮我安排复习', book, progress);
    expect(r.intent).toBe('review');
    expect(r.reply).toContain('还没有到期的复习');
    expect(r.card?.conceptId).toBe('system1');
  });

  it('有到期复习时 → review 逾期最久的概念', () => {
    mockedDue.mockReturnValue([{ conceptId: 'system1', daysOverdue: 3 }]);
    const r = routeAgentInput('该复习了吧', book, {});
    expect(r.intent).toBe('review');
    expect(r.concept?.id).toBe('system1');
    expect(r.reply).toContain('3 天');
  });

  it('疑问句但不指向概念 → free_question', () => {
    const r = routeAgentInput('为什么人会高估自己？', book, {});
    expect(r.intent).toBe('free_question');
  });

  it('闲聊 → chat', () => {
    const r = routeAgentInput('你好呀', book, {});
    expect(r.intent).toBe('chat');
  });
});

describe('buildHomeOpening', () => {
  it('新用户 → 推荐系统1 + 概念卡', () => {
    const o = buildHomeOpening({}, book);
    expect(o.cards[0]).toEqual({ type: 'concept', conceptId: 'system1' });
    expect(o.suggestions.some(s => s.includes('系统1'))).toBe(true);
  });

  it('有进行中概念 → 问候包含概念名与阶段', () => {
    // 无前置要求的概念默认视为进行中，因此这里把系统1标记为已掌握
    const progress = makeProgress({ system1: { status: 'mastered' }, system2: { status: 'in_progress', stage: 'apply' } });
    const o = buildHomeOpening(progress, book);
    expect(o.greeting).toContain('系统2');
    expect(o.greeting).toContain('应用');
    expect(o.cards[0].conceptId).toBe('system2');
  });

  it('有到期复习 → 复习优先，卡片为复习卡', () => {
    mockedDue.mockReturnValue([{ conceptId: 'system1', daysOverdue: 5 }]);
    const o = buildHomeOpening({}, book);
    expect(o.cards[0]).toEqual({ type: 'review', conceptId: 'system1' });
    expect(o.greeting).toContain('5 天');
  });
});
