/**
 * Agent 卡片流组件
 *
 * 概念卡 / 复习卡以卡片形式嵌入消息流（对话在前，结构以卡片按需浮现）。
 * 所有 Tailwind 类均为完整字面量（动态拼接类不会进入构建产物）。
 */
import { Trophy, Lock, RotateCcw, ArrowRight, BookOpen, Clock } from 'lucide-react';
import { Concept, Chapter, CognitiveStage, STAGE_ORDER, COGNITIVE_STAGES } from '@/types/book';

interface LearnCardProps {
  concept: Concept;
  chapter?: Chapter;
  status: 'locked' | 'in_progress' | 'mastered';
  cognitiveStage?: CognitiveStage;
  daysOverdue?: number;      // review 卡的逾期天数
  isDark: boolean;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}

export function LearnCard({ concept, chapter, status, cognitiveStage, daysOverdue, isDark, actionLabel, onAction, disabled }: LearnCardProps) {
  const isReview = daysOverdue !== undefined;
  const stageIdx = cognitiveStage ? STAGE_ORDER.indexOf(cognitiveStage) : 0;

  const statusBadge = isReview
    ? { icon: <Clock className="w-3 h-3" />, text: (daysOverdue ?? 0) > 0 ? `复习逾期 ${daysOverdue} 天` : '待复习', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' }
    : status === 'mastered'
      ? { icon: <Trophy className="w-3 h-3" />, text: '已掌握', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' }
      : status === 'locked'
        ? { icon: <Lock className="w-3 h-3" />, text: '未解锁', cls: 'bg-slate-100 text-slate-500 dark:bg-dark-surface dark:text-dark-text-muted' }
        : { icon: <BookOpen className="w-3 h-3" />, text: '学习中', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' };

  return (
    <div className={`mt-3 rounded-2xl border p-4 animate-fade-in-up ${isDark ? 'bg-dark-card border-dark-border' : 'bg-white/90 border-slate-200/70 shadow-sm'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge.cls}`}>
          {statusBadge.icon}{statusBadge.text}
        </span>
        {chapter && <span className={`text-[10px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>{chapter.name}</span>}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className={`text-sm font-bold ${isDark ? 'text-dark-text' : 'text-slate-800'}`}>{concept.name}</h4>
          <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-dark-text-secondary' : 'text-slate-500'}`}>{concept.description}</p>
        </div>
        <button onClick={onAction} disabled={disabled}
          className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-medium rounded-xl hover:shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          {actionLabel}<ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 四阶段进度点 */}
      {!isReview && status !== 'locked' && (
        <div className="flex items-center gap-1.5 mt-3">
          {STAGE_ORDER.map((stage, i) => {
            const info = COGNITIVE_STAGES[i];
            const done = i < stageIdx || status === 'mastered';
            const current = i === stageIdx && status !== 'mastered';
            return (
              <div key={stage} className="flex items-center gap-1.5">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                  done ? 'bg-emerald-500 text-white'
                    : current ? `bg-gradient-to-br ${info.color} text-white`
                    : (isDark ? 'bg-dark-surface text-dark-text-muted' : 'bg-slate-100 text-slate-400')
                }`}>{done ? '✓' : i + 1}</div>
                <span className={`text-[9px] ${current ? (isDark ? 'text-dark-text' : 'text-slate-700') : (isDark ? 'text-dark-text-muted' : 'text-slate-400')}`}>{info.name}</span>
              </div>
            );
          })}
        </div>
      )}

      {isReview && (
        <div className={`flex items-center gap-1.5 mt-3 text-[10px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>
          <RotateCcw className="w-3 h-3" />
          <span>按间隔重复计划（1/3/7/14/30 天），现在复习效果最好</span>
        </div>
      )}
    </div>
  );
}
