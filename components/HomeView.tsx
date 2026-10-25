/**
 * Agent 首页 —— 对话即入口
 *
 * 首屏 = 标题 + 主动开场 + 学习卡片 + 单个输入框 + 建议条。
 * 结构化功能（章节树/仪表盘）通过聊天视图顶部的面板开关唤起。
 */
import { useState } from 'react';
import { Brain, Send, Map, Wifi, WifiOff, Sparkles } from 'lucide-react';
import { Book, UserProgress, MessageCard } from '@/types/book';
import { LearnCard } from './AgentCards';

export interface HomeExchange {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  card?: MessageCard;
}

interface HomeViewProps {
  isDark: boolean;
  greeting: string;
  suggestions: string[];
  openingCards: MessageCard[];
  homeMessages: HomeExchange[];
  book: Book;
  progress: Record<string, UserProgress>;
  aiEnabled: boolean;
  aiProviderName: string;
  stats: { mastered: number; total: number };
  onSend: (text: string) => void;
  onOpenMap: () => void;
  onOpenSettings: () => void;
}

export default function HomeView({
  isDark, greeting, suggestions, openingCards, homeMessages, book, progress,
  aiEnabled, aiProviderName, stats, onSend, onOpenMap, onOpenSettings,
}: HomeViewProps) {
  const [input, setInput] = useState('');

  const send = () => {
    const t = input.trim();
    if (!t) return;
    setInput('');
    onSend(t);
  };

  // 卡片渲染需要概念对象；卡片动作统一回流到路由（onSend）
  const renderCard = (card: MessageCard) => {
    const loc = book.chapters.flatMap(ch => ch.concepts.map(c => ({ c, ch }))).find(x => x.c.id === card.conceptId);
    if (!loc) return null;
    const st = progress[loc.c.id]?.status || (loc.c.unlockingCriteria.requiredConcepts.length === 0 ? 'in_progress' : 'locked');
    const selectable = st !== 'locked' && loc.c.unlockingCriteria.requiredConcepts.every(id => progress[id]?.status === 'mastered');
    return (
      <LearnCard
        key={card.type + card.conceptId}
        concept={loc.c}
        chapter={loc.ch}
        status={st}
        cognitiveStage={progress[loc.c.id]?.cognitiveStage}
        daysOverdue={card.type === 'review' ? 0 : undefined}
        isDark={isDark}
        actionLabel={card.type === 'review' ? '开始复习' : (st === 'mastered' ? '深入探讨' : (st === 'in_progress' && progress[loc.c.id]?.correctAnswers ? '继续学习' : '开始学习'))}
        onAction={() => onSend(`${card.type === 'review' ? '复习' : '学习'}『${loc.c.name}』`)}
        disabled={!selectable}
      />
    );
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center px-4 py-10 relative z-10">
      <div className="w-full max-w-2xl space-y-6">
        {/* 标题区 */}
        <div className="text-center space-y-3 animate-fade-in-up">
          <div className="w-14 h-14 mx-auto bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/25 animate-float">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight gradient-text">CogniRead</h1>
          <p className={`text-sm ${isDark ? 'text-dark-text-secondary' : 'text-slate-500'}`}>
            苏格拉底式学习伙伴 · 追问到你真的懂为止
          </p>
          <div className="flex items-center justify-center gap-2 text-[11px]">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${aiEnabled ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-dark-surface dark:text-dark-text-muted'}`}>
              {aiEnabled ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {aiEnabled ? `AI 已连接 · ${aiProviderName}` : '本地模式（点击右上角连接 AI）'}
            </span>
            <button onClick={onOpenMap} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors ${isDark ? 'bg-dark-card text-dark-text-secondary hover:text-dark-text' : 'bg-slate-100 text-slate-500 hover:text-slate-700'}`}>
              <Map className="w-3 h-3" />学习地图 {stats.mastered}/{stats.total}
            </button>
          </div>
        </div>

        {/* 主动开场 */}
        <div className={`rounded-2xl p-5 border animate-fade-in-up ${isDark ? 'bg-dark-card/80 border-dark-border' : 'bg-white/80 border-slate-200/60 backdrop-blur'}`} style={{ animationDelay: '80ms' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>学习伙伴</p>
              <p className={`text-sm leading-relaxed whitespace-pre-line ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>{greeting}</p>
            </div>
          </div>
        </div>

        {/* 开场推荐卡片（常驻：即使有静态往返也保留可操作的入口） */}
        {openingCards.map(card => (
          <div key={card.type + card.conceptId} className="animate-fade-in-up" style={{ animationDelay: '160ms' }}>
            {renderCard(card)}
          </div>
        ))}

        {/* 对话式往返（本地静态回复场景） */}
        {homeMessages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} message-bubble`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line leading-relaxed ${
              msg.role === 'user'
                ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-br-lg shadow-md shadow-indigo-500/15'
                : (isDark ? 'bg-dark-card border border-dark-border text-dark-text rounded-bl-lg' : 'bg-white/90 border border-slate-200/60 text-slate-700 rounded-bl-lg shadow-sm')
            }`}>
              {msg.content}
              {msg.card && renderCard(msg.card)}
            </div>
          </div>
        ))}

        {/* 输入框 */}
        <div className="animate-fade-in-up" style={{ animationDelay: '240ms' }}>
          <div className="flex gap-2.5">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="问点什么… 比如「什么是系统1」"
              className={`flex-1 pl-4 pr-4 py-3.5 border rounded-2xl text-sm transition-all ${isDark ? 'bg-dark-card border-dark-border text-dark-text placeholder:text-dark-text-muted focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50' : 'bg-white border-slate-200/70 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 shadow-sm'} `} />
            <button onClick={send} disabled={!input.trim()}
              className="px-5 text-white rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:shadow-lg hover:shadow-indigo-500/25 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* 建议条 */}
          <div className="flex flex-wrap gap-2 mt-3">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => onSend(s)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all hover:shadow-sm ${isDark ? 'bg-dark-card border-dark-border text-dark-text-secondary hover:text-dark-text' : 'bg-white/80 border-slate-200/70 text-slate-600 hover:text-slate-900 hover:border-indigo-300'}`}>
                <Sparkles className="w-3 h-3 text-indigo-400" />{s}
              </button>
            ))}
          </div>

          <p className={`text-center text-[11px] mt-4 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>
            {aiEnabled ? 'AI 已接管对话 · 配置与记忆在右上角设置' : '当前使用本地引擎（零配置可用）· 连接 AI 后体验更完整'}
          </p>
        </div>
      </div>
    </div>
  );
}
