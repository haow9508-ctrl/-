import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Book, Concept, Chapter, Message, MessageCard, UserProgress, CognitiveStage, STAGE_ORDER, getNextStage, COGNITIVE_STAGES } from '@/types/book';
import { bookData } from '@/data/bookData';
import { SocraticEngine, CollisionEngine } from '@/utils/socraticEngine';
import { getStoredProgress, saveProgress, getLearningStats, recordReview, calculateNextReview, recordSession, recordActivity, getActivityData, getConceptsNeedingReview } from '@/utils/storage';
import { routeAgentInput, buildHomeOpening, RouteResult, AgentCardRef } from '@/utils/agentHome';
import { AIService, StreamingChunk } from '@/utils/aiService';
import { recordConversation, buildMemoryAwareSystemPrompt, migrateOpenClawMemory } from '@/utils/memory';
import SettingsPanel, { loadAIConfig } from '@/components/SettingsPanel';
import CognitiveVisualization from '@/components/CognitiveVisualization';
import HomeView, { HomeExchange } from '@/components/HomeView';
import { LearnCard } from '@/components/AgentCards';
import { AI_PROVIDERS } from '@/utils/aiService';
import {
  BookOpen, Brain, Lock, Unlock, ChevronRight, ChevronDown, Sparkles,
  RotateCcw, Trophy, MessageCircle, Lightbulb, Clock, Flame, Zap,
  Send, ArrowRight, GraduationCap, Target, Users, Star,
  PanelLeftClose, PanelLeftOpen, Sun, Moon, BarChart3,
  GitBranch, Award, Calendar, Activity, Dumbbell, Eye, BookMarked, Network,
  Settings, Wifi, WifiOff, Radio
} from 'lucide-react';

type LearningMode = 'socratic' | 'collision';
type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
type RightPanelView = 'dashboard' | 'knowledge-graph' | 'cognitive';
type AppView = 'home' | 'chat';

const LOCAL_CHAT_REPLY = `我是《思考，快与慢》的学习伙伴，不是通用聊天助手。我能做三件事：\n\n① 用提问带你走完一个概念（比如输入「什么是系统1」）\n② 掌握概念后和你进行思维碰撞、辩论\n③ 按艾宾浩斯遗忘曲线安排复习\n\n想从哪个开始？`;
const LOCAL_FREE_REPLY = `好问题——但比起我直接给你答案，不如先检验你已有的理解。\n\n先说说你自己的看法？或者输入一个概念名（比如「锚定效应」），我们从源头开始推。`;

const COLLISION_STORAGE_KEY = 'cogniread_collision_messages';
const SOCRATIC_STORAGE_KEY = 'cogniread_socratic_messages';
const THEME_KEY = 'cogniread_theme';
const DIFFICULTY_KEY = 'cogniread_difficulty';

function loadCollisionMessages(): Record<string, Message[]> {
  try { const d = localStorage.getItem(COLLISION_STORAGE_KEY); return d ? JSON.parse(d) : {}; } catch { return {}; }
}
function saveCollisionMessagesMap(map: Record<string, Message[]>) {
  try { localStorage.setItem(COLLISION_STORAGE_KEY, JSON.stringify(map)); } catch { /* */ }
}
function loadSocraticMessages(): Record<string, Message[]> {
  try { const d = localStorage.getItem(SOCRATIC_STORAGE_KEY); return d ? JSON.parse(d) : {}; } catch { return {}; }
}
function saveSocraticMessagesMap(map: Record<string, Message[]>) {
  try { localStorage.setItem(SOCRATIC_STORAGE_KEY, JSON.stringify(map)); } catch { /* */ }
}

const chapterIcons: Record<string, React.ReactNode> = {
  'dual-system': <Brain className="w-4 h-4" />,
  'cognitive-biases': <Target className="w-4 h-4" />,
  'prospect-theory': <Users className="w-4 h-4" />,
  'behavioral': <Star className="w-4 h-4" />,
};

const chapterColors: Record<string, { bg: string; text: string; gradient: string; light: string; darkBg: string; darkText: string }> = {
  'dual-system': { bg: 'bg-blue-50', text: 'text-blue-700', gradient: 'from-blue-500 to-indigo-600', light: 'from-blue-50 to-indigo-50', darkBg: 'dark:bg-blue-950/40', darkText: 'dark:text-blue-300' },
  'cognitive-biases': { bg: 'bg-amber-50', text: 'text-amber-700', gradient: 'from-amber-500 to-orange-600', light: 'from-amber-50 to-orange-50', darkBg: 'dark:bg-amber-950/40', darkText: 'dark:text-amber-300' },
  'prospect-theory': { bg: 'bg-rose-50', text: 'text-rose-700', gradient: 'from-rose-500 to-pink-600', light: 'from-rose-50 to-pink-50', darkBg: 'dark:bg-rose-950/40', darkText: 'dark:text-rose-300' },
  'behavioral': { bg: 'bg-emerald-50', text: 'text-emerald-700', gradient: 'from-emerald-500 to-teal-600', light: 'from-emerald-50 to-teal-50', darkBg: 'dark:bg-emerald-950/40', darkText: 'dark:text-emerald-300' },
};

const difficultyLabels: Record<DifficultyLevel, { label: string; color: string; bgColor: string }> = {
  beginner: { label: '入门', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  intermediate: { label: '进阶', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  advanced: { label: '高级', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  expert: { label: '专家', color: 'text-rose-600', bgColor: 'bg-rose-100' },
};
const difficulties: DifficultyLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];
const heatmapColors = ['bg-transparent', 'bg-emerald-200 dark:bg-emerald-900/40', 'bg-emerald-300 dark:bg-emerald-700/60', 'bg-emerald-500 dark:bg-emerald-500/70', 'bg-emerald-600 dark:bg-emerald-400', 'bg-emerald-700 dark:bg-emerald-300'];

function App() {
  const [book] = useState<Book>(bookData);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(book.chapters[0]);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(book.chapters[0]?.concepts[0] || null);
  const [progress, setProgress] = useState<Record<string, UserProgress>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [engine, setEngine] = useState<SocraticEngine | null>(null);
  const [collisionEngine, setCollisionEngine] = useState<CollisionEngine | null>(null);
  const [showUnlockAnimation, setShowUnlockAnimation] = useState(false);
  const [unlockedChapter, setUnlockedChapter] = useState<string | null>(null);
  const [learningStats, setLearningStats] = useState(getLearningStats());
  const [learningMode, setLearningMode] = useState<LearningMode>('socratic');
  const [collisionTopic, setCollisionTopic] = useState('');
  const [collisionMessagesMap, setCollisionMessagesMap] = useState<Record<string, Message[]>>(() => loadCollisionMessages());
  const [socraticMessagesMap, setSocraticMessagesMap] = useState<Record<string, Message[]>>(() => loadSocraticMessages());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set([book.chapters[0]?.id || '']));
  const [isTyping, setIsTyping] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [isDark, setIsDark] = useState(() => localStorage.getItem(THEME_KEY) === 'dark');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(() => (localStorage.getItem(DIFFICULTY_KEY) as DifficultyLevel) || 'intermediate');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>('cognitive');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // AI 相关状态
  const [aiConfig, setAiConfig] = useState(() => loadAIConfig());
  const [aiEnabled, setAiEnabled] = useState(() => !!(loadAIConfig().apiKey || loadAIConfig().provider === 'ollama'));
  const [streamingText, setStreamingText] = useState('');
  // Agent 视图状态
  const [view, setView] = useState<AppView>('home');
  const [homeMessages, setHomeMessages] = useState<HomeExchange[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const aiServiceRef = useRef<AIService | null>(null);
  // Agent 流转控制：首页发起的对话切换概念时，跳过概念切换 effect 的消息重建
  const suppressConceptReloadRef = useRef(false);
  // 复习会话：记录由复习卡打开的概念，首次答对后写入复习记录
  const reviewSessionRef = useRef<string | null>(null);

  useEffect(() => { document.documentElement.classList.toggle('dark', isDark); localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light'); }, [isDark]);
  useEffect(() => { localStorage.setItem(DIFFICULTY_KEY, difficulty); }, [difficulty]);

  useEffect(() => {
    // 迁移 OpenClaw 长期记忆（仅首次执行）
    migrateOpenClawMemory();
    // 加载存储的学习进度（仅加载已保存的，不强制解锁）
    const stored = getStoredProgress();
    if (Object.keys(stored.concepts).length > 0) {
      setProgress(stored.concepts);
    }
    // 初始化所有概念进度为 locked（仅第一个概念 system1 为 in_progress）
    const initProgress: Record<string, UserProgress> = {};
    book.chapters.forEach(ch => ch.concepts.forEach(c => {
      if (!initProgress[c.id]) {
        const saved = stored.concepts[c.id];
        if (saved) {
          initProgress[c.id] = saved;
        } else if (c.id === 'system1') {
          // 第一个概念自动解锁，从"理解"阶段开始
          initProgress[c.id] = {
            conceptId: c.id, status: 'in_progress', cognitiveStage: 'understand',
            stageCompletedAt: { understand: null, apply: null, review: null, create: null },
            reviewCount: 0, lastReviewAt: null, nextReviewAt: null,
            correctAnswers: 0, totalQuestions: c.questions.length, conversationHistory: [],
          };
        } else {
          initProgress[c.id] = {
            conceptId: c.id, status: 'locked', cognitiveStage: 'understand',
            stageCompletedAt: { understand: null, apply: null, review: null, create: null },
            reviewCount: 0, lastReviewAt: null, nextReviewAt: null,
            correctAnswers: 0, totalQuestions: c.questions.length, conversationHistory: [],
          };
        }
      }
    }));
    setProgress(initProgress); saveProgress(initProgress); recordSession(); setLearningStats(getLearningStats());
  }, []);

  useEffect(() => { saveCollisionMessagesMap(collisionMessagesMap); }, [collisionMessagesMap]);
  useEffect(() => { saveSocraticMessagesMap(socraticMessagesMap); }, [socraticMessagesMap]);

  // ref 同步 map 最新值，供 effect 读取
  const socraticMapRef = useRef(socraticMessagesMap);
  socraticMapRef.current = socraticMessagesMap;
  const collisionMapRef = useRef(collisionMessagesMap);
  collisionMapRef.current = collisionMessagesMap;

  // 自动同步当前对话到对应模式的 map（每次 messages 变化时）
  const switchingRef = useRef(false);
  const prevCidRef = useRef(selectedConcept?.id || '');
  useEffect(() => {
    if (switchingRef.current) { switchingRef.current = false; return; }
    const cid = selectedConcept?.id || '';
    if (cid === prevCidRef.current && messages.length > 0) {
      if (learningMode === 'collision') {
        setCollisionMessagesMap(p => {
          if (p[cid] === messages) return p;
          return { ...p, [cid]: messages };
        });
      } else {
        setSocraticMessagesMap(p => {
          if (p[cid] === messages) return p;
          return { ...p, [cid]: messages };
        });
      }
    }
    prevCidRef.current = cid;
  }, [messages, learningMode, selectedConcept?.id]);

  // 章节解锁：只在「锁定→解锁」状态真正变化时播放动画，避免老用户每次打开都看到解锁动画
  const knownUnlockedRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (Object.keys(progress).length === 0) return;
    const unlockedNow = new Set(book.chapters.filter(canUnlockChapter).map(ch => ch.id));
    if (knownUnlockedRef.current === null) {
      // 首次执行：只记录基线，不播动画
      knownUnlockedRef.current = unlockedNow;
      return;
    }
    unlockedNow.forEach(id => {
      if (!knownUnlockedRef.current!.has(id)) unlockChapter(id);
    });
    knownUnlockedRef.current = unlockedNow;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const chapterIndex = (ch: Chapter) => book.chapters.findIndex(c => c.id === ch.id);
  const canUnlockChapter = (ch: Chapter) => {
    if (book.chapters.findIndex(c => c.id === ch.id) === 0) return true;
    const ids = [...new Set(ch.concepts.flatMap(c => c.unlockingCriteria.requiredConcepts))];
    return ids.length === 0 || ids.every(id => progress[id]?.status === 'mastered');
  };
  const isConceptSelectable = (c: Concept) => {
    // 概念自身状态必须是 in_progress 或 mastered 才可选
    const myStatus = progress[c.id]?.status;
    if (myStatus === 'locked' || !myStatus) return false;
    // 检查前置概念是否已掌握
    const r = c.unlockingCriteria.requiredConcepts;
    if (r.length === 0) return true;
    return r.every(id => progress[id]?.status === 'mastered');
  };

  const getNextConcept = useCallback((): { concept: Concept; chapter: Chapter } | null => {
    if (!selectedConcept || !selectedChapter) return null;
    const cs = selectedChapter.concepts;
    const idx = cs.findIndex(c => c.id === selectedConcept.id);
    if (idx < cs.length - 1) { const n = cs[idx + 1]; if (isConceptSelectable(n)) return { concept: n, chapter: selectedChapter }; }
    const chIdx = book.chapters.findIndex(c => c.id === selectedChapter.id);
    for (let i = chIdx + 1; i < book.chapters.length; i++) {
      const nch = book.chapters[i];
      if (canUnlockChapter(nch) && nch.concepts.length > 0) { const fc = nch.concepts[0]; if (isConceptSelectable(fc)) return { concept: fc, chapter: nch }; }
    }
    return null;
  }, [selectedConcept, selectedChapter, progress]);

  const goToNextConcept = () => { const n = getNextConcept(); if (n) { setSelectedChapter(n.chapter); setSelectedConcept(n.concept); setLearningMode('socratic'); } };
  const unlockChapter = (id: string) => { if (unlockedChapter === id) return; setUnlockedChapter(id); setShowUnlockAnimation(true); setTimeout(() => { setShowUnlockAnimation(false); setUnlockedChapter(null); }, 2500); };
  const toggleChapter = (id: string) => { setExpandedChapters(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

  useEffect(() => {
    if (!selectedConcept) return;
    const cid = selectedConcept.id;
    const conceptProgress = progress[cid];
    const stage = conceptProgress?.cognitiveStage || 'understand';
    // 传入引擎快照，保证「恢复的对话记录」与「引擎内部进度（题号/答对数/阶段计数）」一致
    const newEngine = new SocraticEngine(selectedConcept.questions, selectedConcept.unlockingCriteria.minCorrectAnswers, selectedConcept, stage, conceptProgress?.socraticEngineState);
    setEngine(newEngine);
    setCollisionEngine(new CollisionEngine(selectedConcept));
    setLearningMode('socratic');

    // 首页 Agent 发起的对话：消息已由 openAgentConversation 准备好，这里只重建引擎
    if (suppressConceptReloadRef.current) {
      suppressConceptReloadRef.current = false;
      return;
    }

    // 切换概念时，恢复对应概念的已保存对话
    const saved = socraticMapRef.current[cid];
    if (saved?.length) {
      switchingRef.current = true;
      setMessages(saved);
      setTimeout(() => { switchingRef.current = false; }, 50);
    } else {
      const ep = progress[cid];
      if (ep?.status === 'mastered') {
        setMessages([{ id: 'welcome', role: 'assistant', timestamp: new Date(),
          content: `欢迎回到「${selectedConcept.name}」！\n\n你已经掌握了这个概念 ✨\n\n${selectedConcept.quotes[0]}`,
          isEncouragement: true
        }]);
      } else {
        // 用 SocraticEngine 的第一个问题作为开场提问，而非自言自语
        const firstQ = newEngine.getNextQuestionText();
        const stageIntro = newEngine.getStageIntro();
        setMessages([{ id: 'welcome', role: 'assistant', timestamp: new Date(),
          content: stageIntro ? `${stageIntro}\n\n${firstQ}` : (firstQ || `欢迎来到「${selectedConcept.name}」！`),
        }]);
      }
    }
  }, [selectedConcept]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingText]);

  /**
   * AI 流式对话 — 核心方法
   * 当 AI 已配置时调用真实 API（System Prompt + 记忆注入），否则回退到本地引擎。
   * opts 供 Agent 首页发起的对话使用：显式指定概念与消息基线，避免闭包读到旧状态。
   */
  const sendAIMessage = useCallback(async (
    userInput: string,
    mode: LearningMode,
    opts?: { concept?: Concept; chapter?: Chapter; baseMessages?: Message[] }
  ) => {
    const concept = opts?.concept ?? selectedConcept;
    const chapter = opts?.chapter ?? selectedChapter;
    if (!userInput.trim() || !concept) return;
    // 检查是否可用 AI
    const canUseAI = aiEnabled && (aiConfig.apiKey || aiConfig.provider === 'ollama');
    if (!canUseAI) {
      if (!opts) {
        if (mode === 'socratic') handleLocalSocratic(userInput);
        else handleLocalCollision(userInput);
      }
      return;
    }

    // === 真实 AI 模式 ===
    const base = opts?.baseMessages ?? messages;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userInput, timestamp: new Date() };
    if (opts) setMessages([...base, userMsg]);
    else setMessages(p => [...p, userMsg]);
    setInputValue('');
    setIsTyping(true);
    setShowThinking(true);
    setStreamingText('');

    recordConversation(concept.id);
    recordActivity(1);

    // 注意：messages 是闭包里的旧值（尚未包含本次输入），必须显式追加当前用户消息，否则 AI 收不到刚说的话
    const historyMessages = [
      ...base
        .filter(m => !['welcome', 'cw', 'sw', 'r'].includes(m.id))
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: userInput },
    ];

    const conceptContext = `当前学习概念「${concept.name}」，属于章节「${chapter?.name}」。
概念描述：${concept.description}
${concept.quotes.length > 0 ? `书中原文引用：${concept.quotes.join('\n')}` : ''}
${mode === 'collision' && concept.collisionTopics?.length > 0 ? `碰撞话题：${concept.collisionTopics.map(t => t.title).join(', ')}` : ''}
难度级别：${difficultyLabels[difficulty].label} (${difficulty})
${progress[concept.id]?.status === 'mastered' ? '注意：用户已经掌握了这个概念，可以深入探讨。' : ''}`;

    aiServiceRef.current = new AIService(aiConfig);

    try {
      setTimeout(() => setShowThinking(false), 800);
      let fullContent = '';
      const assistantMsgId = (Date.now() + 1).toString();

      for await (const chunk of aiServiceRef.current.streamChat(historyMessages, {
        currentConcept: conceptContext,
        currentChapter: chapter?.name,
        userProgress: progress as unknown as Record<string, any>,
        learningMode: mode,
        difficulty,
        cognitiveStage: progress[concept.id]?.cognitiveStage || 'understand',
      })) {
        if (chunk.type === 'content') {
          fullContent += chunk.content;
          setStreamingText(fullContent);
        }
        if (chunk.type === 'thinking') {
          if (!showThinking) setShowThinking(true);
        }
        if (chunk.type === 'error') {
          setIsTyping(false); setShowThinking(false); setStreamingText('');
          setMessages(p => p.filter(m => m.id !== userMsg.id));
          setInputValue(userInput);
          if (mode === 'socratic') handleLocalSocratic(userInput);
          else handleLocalCollision(userInput);
          return;
        }
      }

      const finalMsg: Message = { id: assistantMsgId, role: 'assistant', content: fullContent, timestamp: new Date() };
      setMessages(p => [...p.filter(m => m.id !== assistantMsgId), finalMsg]);
      setStreamingText(''); setIsTyping(false); setShowThinking(false);
    } catch (err) {
      console.error('AI stream error:', err);
      setIsTyping(false); setShowThinking(false); setStreamingText('');
      setMessages(p => [...p, { id: (Date.now()+99).toString(), role: 'assistant', content: `连接出现问题：${err instanceof Error ? err.message : String(err)}\n\n已切换回本地模式继续对话。`, timestamp: new Date() }]);
    }
  }, [aiEnabled, aiConfig, messages, selectedConcept, selectedChapter, learningMode, difficulty, progress]);

  /** 本地苏格拉底回退（原有关键词匹配引擎） */
  const handleLocalSocratic = (userInput: string) => {
    if (!engine || !selectedConcept) return;
    if (progress[selectedConcept.id]?.status === 'mastered') {
      setMessages(p => [...p, { id: Date.now().toString(), role: 'user', content: userInput, timestamp: new Date() }]); setInputValue('');
      const next = getNextConcept();
      setTimeout(() => { setMessages(p => [...p, { id: (Date.now() + 1).toString(), role: 'assistant', timestamp: new Date(), content: `你已经掌握了这个概念！想深入讨论可以切换到「思维的碰撞」模式。${next ? `\n\n或点击下方按钮：${next.concept.name}` : '\n\n🏆 恭喜完成所有学习！'}`, isMasteryMessage: !!next }]); }, 500);
      return;
    }
    setMessages(p => [...p, { id: Date.now().toString(), role: 'user', content: userInput, timestamp: new Date() }]); setInputValue(''); setIsTyping(true); setShowThinking(true);
    setTimeout(() => setShowThinking(false), 600);
    const result = engine.evaluateAnswer(userInput);
    const res: Message[] = [];
    if (result.quote) res.push({ id: (Date.now() + 1).toString(), role: 'assistant', content: result.quote, timestamp: new Date(), isQuote: true });
    res.push({ id: (Date.now() + 2).toString(), role: 'assistant', content: result.feedback, timestamp: new Date(), isEncouragement: result.isEncouragement, isGuidance: result.isGuidance });

    // 持久化引擎快照，下次进入同一概念时可恢复到当前题目
    const snap = engine.getSnapshot();

    // 复习会话：首次答对即写入间隔重复记录
    if (result.isCorrect && reviewSessionRef.current === selectedConcept.id) {
      reviewSessionRef.current = null;
      const reviewed = recordReview(selectedConcept.id);
      if (reviewed?.nextReviewAt) {
        res.push({ id: (Date.now() + 4).toString(), role: 'assistant', timestamp: new Date(), content: `✅ 复习已记录。下次复习安排在 ${new Date(reviewed.nextReviewAt).toLocaleDateString('zh-CN')}。` });
      }
    }

    // 阶段推进时更新进度
    if (result.stageAdvanced && result.newStage) {
      const cp = progress[selectedConcept.id];
      if (cp) {
        const newProgress: Record<string, UserProgress> = { ...progress, [selectedConcept.id]: {
          ...cp,
          cognitiveStage: result.newStage,
          stageCompletedAt: { ...cp.stageCompletedAt, [STAGE_ORDER[STAGE_ORDER.indexOf(result.newStage) - 1]]: new Date().toISOString() },
          socraticEngineState: snap,
        }};
        setProgress(newProgress); saveProgress(newProgress);
      }
    } else if (!result.isMastered) {
      const cp = progress[selectedConcept.id];
      if (cp && cp.status !== 'mastered') {
        const newProgress: Record<string, UserProgress> = { ...progress, [selectedConcept.id]: { ...cp, socraticEngineState: snap } };
        setProgress(newProgress); saveProgress(newProgress);
      }
    }

    if (result.isCorrect && result.shouldContinue && engine.getNextQuestionText()) {
      setTimeout(() => { res.push({ id: (Date.now() + 3).toString(), role: 'assistant', content: `下一个问题：\n\n${engine.getNextQuestionText()}`, timestamp: new Date() }); setMessages(p => [...p, ...res]); setIsTyping(false); }, 1000);
    } else { setTimeout(() => { setMessages(p => [...p, ...res]); setIsTyping(false); }, 1000); }
    if (result.isMastered) {
      setTimeout(() => {
        const cp = progress[selectedConcept.id] || {
          conceptId: selectedConcept.id, status: 'mastered' as const, cognitiveStage: 'create' as CognitiveStage,
          stageCompletedAt: { understand: new Date().toISOString(), apply: new Date().toISOString(), review: new Date().toISOString(), create: new Date().toISOString() },
          reviewCount: 0, lastReviewAt: null, nextReviewAt: calculateNextReview(0).toISOString(),
          correctAnswers: engine.getCorrectAnswers(), totalQuestions: selectedConcept.questions.length, conversationHistory: [],
        };
        const np: Record<string, UserProgress> = { ...progress, [selectedConcept.id]: {
          ...cp, status: 'mastered', cognitiveStage: 'create',
          stageCompletedAt: { understand: cp.stageCompletedAt.understand || new Date().toISOString(), apply: cp.stageCompletedAt.apply || new Date().toISOString(), review: cp.stageCompletedAt.review || new Date().toISOString(), create: new Date().toISOString() },
          correctAnswers: engine.getCorrectAnswers(),
          nextReviewAt: calculateNextReview(0).toISOString(),
          conversationHistory: engine.getConversationHistory(),
        }};
        // 自动解锁下一个概念（将 locked 改为 in_progress）
        const next = getNextConcept();
        if (next && next.concept.id !== selectedConcept.id) {
          const nextStatus = np[next.concept.id]?.status;
          if (nextStatus === 'locked' || !nextStatus) {
            np[next.concept.id] = {
              conceptId: next.concept.id, status: 'in_progress', cognitiveStage: 'understand',
              stageCompletedAt: { understand: null, apply: null, review: null, create: null },
              reviewCount: 0, lastReviewAt: null, nextReviewAt: null,
              correctAnswers: 0, totalQuestions: next.concept.questions.length, conversationHistory: [],
            };
          }
        }
        setProgress(np); saveProgress(np); setLearningStats(getLearningStats());
        setMessages(p => [...p, { id: (Date.now() + 10).toString(), role: 'assistant', timestamp: new Date(), content: `🎉 掌握了「${selectedConcept.name}」！\n\n你完成了四阶段认知旅程：理解 → 应用 → 复习 → 创造\n\n${selectedConcept.quotes[0] || ''}${next ? `\n\n下一步：${next.concept.name}` : '\n\n🏆 恭喜完成所有学习！'}`, isEncouragement: true, isMasteryMessage: !!next }]);
      }, 1800);
    }
  };

  /** 本地思维碰撞回退 */
  const handleLocalCollision = (userInput: string) => {
    if (!collisionEngine || !selectedConcept) return;
    // 使用入参而非闭包里的 inputValue：AI 出错回退时 inputValue 可能已被清空
    const um: Message = { id: Date.now().toString(), role: 'user', content: userInput, timestamp: new Date() };
    setMessages(p => [...p, um]); const cid = selectedConcept.id;
    setCollisionMessagesMap(p => ({ ...p, [cid]: [...(p[cid] || []), um] })); setInputValue(''); setIsTyping(true); setShowThinking(true);
    setTimeout(() => setShowThinking(false), 800);
    const r = collisionEngine.generateResponse(userInput);
    setTimeout(() => {
      const am: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: r.content, timestamp: new Date(), isQuote: r.isQuote };
      setMessages(p => [...p, am]); setCollisionMessagesMap(p => ({ ...p, [cid]: [...(p[cid] || []), am] })); setIsTyping(false);
    }, 1500);
  };

  const handleSendSocraticMessage = () => { if (!inputValue.trim()) return; sendAIMessage(inputValue, 'socratic'); };
  const handleSendCollisionMessage = () => { if (!inputValue.trim()) return; sendAIMessage(inputValue, 'collision'); };

  const switchMode = useCallback((mode: LearningMode) => {
    if (mode === learningMode) return;
    const cid = selectedConcept?.id || '';

    // 先用 functional updater 保存当前模式的对话（保证读到最新 state）
    if (messages.length > 0) {
      if (learningMode === 'collision') {
        setCollisionMessagesMap(p => ({ ...p, [cid]: messages }));
      } else {
        setSocraticMessagesMap(p => ({ ...p, [cid]: messages }));
      }
    }

    setLearningMode(mode);

    // 标记正在切换，防止自动同步 effect 用当前 messages 覆盖旧对话
    switchingRef.current = true;

    // 延迟一帧恢复目标模式的对话（确保 setState 已提交）
    requestAnimationFrame(() => {
      if (mode === 'collision') {
        setCollisionMessagesMap(currentMap => {
          const saved = currentMap[cid];
          if (saved?.length) { setMessages(saved); }
          else {
            const sm: Message = { id: 'cw', role: 'assistant', content: collisionEngine?.getStarterMessage() || `让我们讨论「${selectedConcept?.name}」！`, timestamp: new Date() };
            setMessages([sm]);
            return { ...currentMap, [cid]: [sm] };
          }
          return currentMap;
        });
        setCollisionTopic(selectedConcept?.collisionTopics[0]?.title || '');
      } else {
        setSocraticMessagesMap(currentMap => {
          const saved = currentMap[cid];
          if (saved?.length) { setMessages(saved); }
          else {
            const ep = selectedConcept ? progress[selectedConcept.id] : null;
            setMessages([{ id: 'sw', role: 'assistant', timestamp: new Date(), content: ep?.status === 'mastered' ? `欢迎回到「${selectedConcept?.name}」！` : `苏格拉底模式。\n\n${engine?.getNextQuestionText() || '开始第一个问题...'}` }]);
          }
          return currentMap;
        });
      }
      // 下一轮 effect 才恢复正常同步
      setTimeout(() => { switchingRef.current = false; }, 50);
    });
  }, [learningMode, messages, selectedConcept, collisionEngine, engine, progress]);

  const clearCurrentChat = () => {
    if (!selectedConcept) return;
    const cid = selectedConcept.id;
    if (learningMode === 'socratic') {
      const stage = progress[cid]?.cognitiveStage || 'understand';
      setEngine(new SocraticEngine(selectedConcept.questions, selectedConcept.unlockingCriteria.minCorrectAnswers, selectedConcept, stage));
      const resetMsg: Message = { id: 'r', role: 'assistant', content: '对话已重置！', timestamp: new Date() };
      setMessages([resetMsg]);
      setSocraticMessagesMap(p => ({ ...p, [cid]: [resetMsg] }));
    } else {
      setCollisionMessagesMap(p => { const m = { ...p }; delete m[cid]; return m; });
      setMessages([{ id: 'r', role: 'assistant', content: `对话已重置。继续探讨「${selectedConcept.name}」！`, timestamp: new Date() }]);
    }
  };

  const getConceptStatus = (id: string) => progress[id]?.status || 'locked';

  // ============ Agent 首页逻辑 ============

  const homeOpening = useMemo(() => buildHomeOpening(progress, book), [progress]);
  const canUseAI = aiEnabled && (aiConfig.apiKey || aiConfig.provider === 'ollama');
  const aiProviderName = AI_PROVIDERS.find(p => p.id === aiConfig.provider)?.name || aiConfig.provider;

  /** 为目标概念构建欢迎消息（苏格拉底开场 / 已掌握欢迎 / 复习开场） */
  const buildWelcomeFor = (r: RouteResult, target: Concept, st: UserProgress | undefined, eng: SocraticEngine): Message[] => {
    if (r.intent === 'review') {
      return [{ id: 'welcome', role: 'assistant', timestamp: new Date(),
        content: `开始复习——『${target.name}』。别看笔记，凭记忆回答。\n\n${eng.getNextQuestionText() || eng.getStageIntro()}`,
        card: { type: 'review', conceptId: target.id } }];
    }
    if (r.intent === 'learn') {
      if (st?.status === 'mastered') {
        return [{ id: 'welcome', role: 'assistant', timestamp: new Date(),
          content: `欢迎回到『${target.name}』！你已经掌握了这个概念 ✨\n\n${target.quotes[0]}`,
          isEncouragement: true, card: { type: 'concept', conceptId: target.id } }];
      }
      const intro = eng.getStageIntro();
      const firstQ = eng.getNextQuestionText();
      return [{ id: 'welcome', role: 'assistant', timestamp: new Date(),
        content: intro ? `${intro}\n\n${firstQ}` : (firstQ || `欢迎来到『${target.name}』！`),
        card: { type: 'concept', conceptId: target.id } }];
    }
    return [];
  };

  /** 由 Agent 首页/卡片动作打开一段对话（学习/复习/带上下文的自由探讨） */
  const openAgentConversation = (r: RouteResult, userText: string) => {
    const target = r.concept ?? selectedConcept;
    const targetChapter = r.chapter ?? selectedChapter;
    if (!target || !targetChapter) return;
    const cid = target.id;
    const switching = selectedConcept?.id !== cid;
    const st = progress[cid];
    const eng = new SocraticEngine(target.questions, target.unlockingCriteria.minCorrectAnswers, target, st?.cognitiveStage || 'understand', st?.socraticEngineState);

    // 同概念且有历史对话时保留历史，避免卡片重复点击清空记录
    let base: Message[] = [];
    if (!switching) {
      const existing = socraticMapRef.current[cid];
      if (existing?.length && r.intent !== 'review') base = existing;
      else base = buildWelcomeFor(r, target, st, eng);
    } else {
      base = buildWelcomeFor(r, target, st, eng);
    }

    reviewSessionRef.current = r.intent === 'review' ? cid : null;

    if (switching) {
      suppressConceptReloadRef.current = true;
      setSelectedChapter(targetChapter);
      setSelectedConcept(target);
      setEngine(eng);
      setCollisionEngine(new CollisionEngine(target));
      setLearningMode('socratic');
      if (base.length) setSocraticMessagesMap(p => ({ ...p, [cid]: base }));
    } else if (base.length) {
      setSocraticMessagesMap(p => ({ ...p, [cid]: base }));
    }

    setMessages(base);
    setStreamingText(''); setIsTyping(false); setShowThinking(false);
    setView('chat');

    if (canUseAI && userText.trim()) {
      void sendAIMessage(userText, 'socratic', { concept: target, chapter: targetChapter, baseMessages: base });
    }
  };

  /** 首页输入统一入口：路由 → 打开对话 或 本地静态回复（留在首页） */
  const handleHomeSend = (text: string) => {
    const r = routeAgentInput(text, book, progress);

    // 可直接进入的意图：学习(可进入)、复习、或 AI 模式（自由提问/闲聊交给 AI）
    if ((r.intent === 'learn' && r.conceptSelectable) || r.intent === 'review' || canUseAI) {
      setHomeMessages([]); // 进入正式对话后清空首页临时往返
      openAgentConversation(r, text);
      return;
    }

    // 本地模式的静态回复：留在首页继续
    const reply = r.reply || (r.intent === 'chat' ? LOCAL_CHAT_REPLY : LOCAL_FREE_REPLY);
    setHomeMessages(p => [...p,
      { id: `u${Date.now()}`, role: 'user', content: text },
      { id: `a${Date.now() + 1}`, role: 'assistant', content: reply, card: r.card },
    ]);
  };

  /** 学习地图按钮：直接进入聊天视图（保留当前对话或生成开场） */
  const openChatMap = () => {
    const cid = selectedConcept?.id;
    if (!cid) { setView('chat'); return; }
    const existing = socraticMapRef.current[cid];
    if (!messages.length && !existing?.length && selectedConcept && engine) {
      const firstQ = engine.getNextQuestionText();
      const stageIntro = engine.getStageIntro();
      const welcome: Message = { id: 'welcome', role: 'assistant', timestamp: new Date(),
        content: stageIntro ? `${stageIntro}\n\n${firstQ}` : (firstQ || `欢迎来到「${selectedConcept.name}」！`) };
      setMessages([welcome]);
      setSocraticMessagesMap(p => ({ ...p, [cid]: [welcome] }));
    } else if (existing?.length && !messages.length) {
      setMessages(existing);
    }
    setView('chat');
  };

  /** 消息流中的学习卡片 */
  const renderChatCard = (card: MessageCard) => {
    const loc = book.chapters.flatMap(ch => ch.concepts.map(c => ({ c, ch }))).find(x => x.c.id === card.conceptId);
    if (!loc) return null;
    const st = progress[loc.c.id]?.status || (loc.c.unlockingCriteria.requiredConcepts.length === 0 ? 'in_progress' : 'locked');
    const selectable = st !== 'locked' && loc.c.unlockingCriteria.requiredConcepts.every(id => progress[id]?.status === 'mastered');
    const dueInfo = card.type === 'review' ? getConceptsNeedingReview().find(d => d.conceptId === card.conceptId) : undefined;
    return (
      <LearnCard
        concept={loc.c}
        chapter={loc.ch}
        status={st}
        cognitiveStage={progress[loc.c.id]?.cognitiveStage}
        daysOverdue={card.type === 'review' ? (dueInfo?.daysOverdue ?? 0) : undefined}
        isDark={isDark}
        actionLabel={card.type === 'review' ? '开始复习' : (st === 'mastered' ? '深入探讨' : '继续学习')}
        onAction={() => handleHomeSend(`${card.type === 'review' ? '复习' : '学习'}『${loc.c.name}』`)}
        disabled={!selectable}
      />
    );
  };


  const stats = useMemo(() => ({ mastered: Object.values(progress).filter(p => p.status === 'mastered').length, total: book.chapters.flatMap(c => c.concepts).length }), [progress]);
  const currentChapterColor = chapterColors[selectedChapter?.id || ''] || chapterColors['dual-system'];
  const heatmapData = useMemo(() => getActivityData(), [progress]);
  const totalInteractions = useMemo(() => heatmapData.reduce((a, b) => a + b, 0), [heatmapData]);

  const formatDate = (ds: string) => {
    const diff = Math.floor((Date.now() - new Date(ds).getTime()) / 86400000);
    if (diff === 0) return '今天'; if (diff === 1) return '昨天'; if (diff < 7) return `${diff}天前`;
    return new Date(ds).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className={`min-h-screen h-screen flex flex-col relative overflow-hidden ${isDark ? 'bg-dark-bg text-dark-text' : 'bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 text-slate-800'}`}>
      {/* BG */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {!isDark ? (<><div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-100/25 rounded-full blur-3xl" /><div className="absolute top-1/3 -left-40 w-80 h-80 bg-purple-100/20 rounded-full blur-3xl" /><div className="absolute -bottom-40 right-1/3 w-96 h-96 bg-rose-100/15 rounded-full blur-3xl" /></>)
        : (<><div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-900/20 rounded-full blur-3xl" /><div className="absolute top-1/3 -left-40 w-80 h-80 bg-purple-900/15 rounded-full blur-3xl" /><div className="absolute -bottom-40 right-1/3 w-96 h-96 bg-violet-900/10 rounded-full blur-3xl" /></>)}
      </div>

      {/* HEADER */}
      <header className={`glass border-b relative z-50 flex-shrink-0 ${isDark ? 'border-dark-border' : 'border-slate-200/60'}`}>
        <div className="h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {view === 'chat' && (
              <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-dark-hover text-dark-text-secondary' : 'hover:bg-slate-100 text-slate-500'}`}>
                {sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <button onClick={() => setView('home')} title="回到 Agent 首页"
                className="w-8 h-8 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95 transition-transform">
                <Brain className="w-4 h-4 text-white" />
              </button>
              <div className="hidden sm:block"><h1 className="text-base font-bold tracking-tight gradient-text leading-tight">CogniRead</h1><p className={`text-[10px] font-medium ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>AI 阅读辅助</p></div>
            </div>
          </div>

          {/* Center mode tabs */}
          {view === 'chat' && (
          <div className="hidden md:flex items-center gap-1 bg-slate-100/80 dark:bg-dark-card rounded-xl p-1">
            {selectedConcept && (<>
              <button onClick={() => switchMode('socratic')} className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${learningMode === 'socratic' ? 'bg-white dark:bg-dark-hover text-indigo-600 dark:text-indigo-400 shadow-sm' : isDark ? 'text-dark-text-secondary hover:text-dark-text' : 'text-slate-500 hover:text-slate-700'}`}>
                <MessageCircle className="w-3.5 h-3.5" /> 苏格拉底
              </button>
              <button onClick={() => switchMode('collision')} className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${learningMode === 'collision' ? 'bg-white dark:bg-dark-hover text-purple-600 dark:text-purple-400 shadow-sm' : isDark ? 'text-dark-text-secondary hover:text-dark-text' : 'text-slate-500 hover:text-slate-700'}`}>
                <Zap className="w-3.5 h-3.5" /> 思维碰撞
              </button>
            </>)}
          </div>
          )}

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {view === 'chat' && (
              <div className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${isDark ? 'bg-dark-card text-dark-text-secondary' : 'bg-slate-100 text-slate-500'}`}>
                <Dumbbell className="w-3 h-3" /><span>{difficultyLabels[difficulty].label}</span>
              </div>
            )}
            <div className={`hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl text-xs font-medium ${isDark ? 'bg-dark-card text-dark-text-secondary' : 'bg-slate-100/80 text-slate-500'}`}>
              <div className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5 text-emerald-500" /><span>{stats.mastered}/{stats.total}</span></div>
              <div className="w-px h-3.5 bg-slate-200 dark:bg-dark-border" />
              <div className="flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-400" /><span>{learningStats.totalSessions}</span></div>
            </div>
            <div className={`w-px h-6 ${isDark ? 'bg-dark-border' : 'bg-slate-200'}`} />
            <button onClick={() => setIsDark(!isDark)} className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-dark-hover text-dark-text-secondary' : 'hover:bg-slate-100 text-slate-500'}`}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {view === 'chat' && (
              <button onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)} className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-dark-hover text-dark-text-secondary' : 'hover:bg-slate-100 text-slate-500'}`}>
                <BarChart3 className="w-4 h-4" />
              </button>
            )}
            {/* AI 设置按钮 */}
            <button onClick={() => setSettingsOpen(true)} className={`p-2 rounded-xl transition-colors ${aiEnabled ? 'text-indigo-500' : (isDark ? 'hover:bg-dark-hover text-dark-text-secondary' : 'hover:bg-slate-100 text-slate-400')}`} title="AI 设置">
              {aiEnabled ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT / AGENT HOME */}
      {view === 'chat' ? (
      <div className="flex flex-1 min-h-0 relative z-10">
        {/* LEFT SIDEBAR */}
        <aside className={`sidebar-transition flex-shrink-0 border-r overflow-y-auto overflow-x-hidden ${sidebarCollapsed ? 'w-0 min-w-0 border-r-0 opacity-0' : 'w-[280px] min-w-[280px] opacity-100'} ${isDark ? 'border-dark-border bg-dark-bg/80' : 'bg-white/50'}`}>
          <div className="p-3 space-y-3">
            {/* Progress card */}
            <div className={`rounded-2xl p-4 ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white/80 border border-slate-200/60'} shadow-sm`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>学习进度</h2>
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-full">{Math.round((stats.mastered / stats.total) * 100)}%</span>
              </div>
              <div className={`w-full rounded-full h-2 ${isDark ? 'bg-dark-border' : 'bg-slate-100'}`}>
                <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-2 rounded-full progress-bar-animated" style={{ width: `${(stats.mastered / stats.total) * 100}%` }} />
              </div>
              <div className="flex justify-between mt-2"><span className={`text-[11px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>{stats.mastered}/{stats.total} 概念</span><span className={`text-[11px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>{book.chapters.length} 章节</span></div>
            </div>

            {/* Chapters */}
            <div className={`rounded-2xl overflow-hidden ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white/80 border border-slate-200/60'} shadow-sm`}>
              <div className="px-4 pt-4 pb-2"><h2 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>章节目录</h2></div>
              <div className="px-2 pb-2 space-y-0.5">
                {book.chapters.map((chapter) => {
                  const isUnlocked = canUnlockChapter(chapter);
                  const isSelected = selectedChapter?.id === chapter.id;
                  const isExpanded = expandedChapters.has(chapter.id);
                  const colors = chapterColors[chapter.id] || chapterColors['dual-system'];
                  const chapterMastered = chapter.concepts.every(c => progress[c.id]?.status === 'mastered');
                  const pct = Math.round((chapter.concepts.filter(c => progress[c.id]?.status === 'mastered').length / chapter.concepts.length) * 100);
                  return (
                    <div key={chapter.id}>
                      <button onClick={() => { if (isUnlocked) { setSelectedChapter(chapter); if (!isExpanded) toggleChapter(chapter.id); } }} disabled={!isUnlocked}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all group ${isSelected ? (isDark ? 'bg-dark-hover' : `${colors.light} shadow-sm`) : isUnlocked ? (isDark ? 'hover:bg-dark-hover' : 'hover:bg-slate-50') : 'opacity-35 cursor-not-allowed'}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? `bg-gradient-to-br ${colors.gradient} text-white shadow-sm` : isUnlocked ? (isDark ? 'bg-dark-surface ' + colors.darkText : colors.bg + ' ' + colors.text) : (isDark ? 'bg-dark-surface text-dark-text-muted' : 'bg-slate-100 text-slate-400')}`}>
                          {isUnlocked ? (chapterMastered ? <Trophy className="w-4 h-4" /> : chapterIcons[chapter.id]) : <Lock className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <span className={`text-[13px] font-medium block truncate ${isSelected ? (isDark ? colors.darkText : colors.text) : ''}`}>{chapter.name}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className={`flex-1 h-1 rounded-full ${isDark ? 'bg-dark-border' : 'bg-slate-100'}`}>
                              <div className={`h-1 rounded-full ${pct === 100 ? 'bg-emerald-500' : `bg-gradient-to-r ${colors.gradient}`} progress-bar-animated`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={`text-[10px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>{pct}%</span>
                          </div>
                        </div>
                        {isUnlocked && <ChevronDown className={`w-4 h-4 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'} transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />}
                      </button>
                      {isExpanded && isUnlocked && (
                        <div className="ml-4 mt-0.5 mb-1 space-y-0.5 animate-fade-in">
                          {chapter.concepts.map(concept => {
                            const status = getConceptStatus(concept.id); const sel = isConceptSelectable(concept); const cs = selectedConcept?.id === concept.id;
                            return (
                              <button key={concept.id} onClick={() => sel && setSelectedConcept(concept)} disabled={!sel}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] transition-all ${cs ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20' : sel ? (status === 'mastered' ? (isDark ? 'text-emerald-300 hover:bg-dark-hover' : 'text-emerald-700 hover:bg-emerald-50/80') : (isDark ? 'text-dark-text-secondary hover:bg-dark-hover' : 'text-slate-600 hover:bg-slate-50')) : (isDark ? 'text-dark-text-muted opacity-50' : 'opacity-40 text-slate-400')}`}>
                                {cs ? <Sparkles className="w-3.5 h-3.5" /> : status === 'mastered' ? <Trophy className="w-3.5 h-3.5 text-emerald-500" /> : sel ? <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-dark-text-muted" /> : <Lock className="w-3 h-3" />}
                                <span className="truncate">{concept.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN CHAT */}
        <main className="flex-1 min-w-0 flex flex-col">
          {selectedConcept && selectedChapter && (<>
            {/* Concept bar */}
            <div className={`flex-shrink-0 px-6 py-3 border-b flex items-center justify-between gap-4 ${isDark ? 'border-dark-border bg-dark-bg/50' : 'border-slate-100 bg-white/50'}`}>
              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${currentChapterColor.bg} ${currentChapterColor.text} ${currentChapterColor.darkBg} ${currentChapterColor.darkText}`}>
                  {chapterIcons[selectedChapter.id]}<span className="hidden sm:inline">{selectedChapter.name}</span><ChevronRight className="w-3 h-3 opacity-60" /><span className={isDark ? 'text-dark-text' : 'text-slate-700'}>{selectedConcept.name}</span>
                </div>
                {progress[selectedConcept.id]?.status === 'mastered' && <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold rounded-full"><Trophy className="w-3 h-3" />已掌握</span>}
                <div className="hidden lg:flex items-center gap-1.5 ml-1">
                  {difficulties.map(d => (<button key={d} onClick={() => setDifficulty(d)} className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all ${difficulty === d ? `${difficultyLabels[d].bgColor} ${difficultyLabels[d].color}` : (isDark ? 'text-dark-text-muted hover:text-dark-text-secondary' : 'text-slate-400 hover:text-slate-600')}`}>{difficultyLabels[d].label}</button>))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* 认知阶段进度指示器 */}
                {progress[selectedConcept.id]?.status !== 'locked' && (
                  <div className="hidden sm:flex items-center gap-1">
                    {STAGE_ORDER.map((stage, idx) => {
                      const currentStage = progress[selectedConcept.id]?.cognitiveStage || 'understand';
                      const stageIdx = STAGE_ORDER.indexOf(currentStage);
                      const isCompleted = progress[selectedConcept.id]?.stageCompletedAt?.[stage];
                      const isCurrent = stage === currentStage;
                      const stageInfo = COGNITIVE_STAGES[idx];
                      return (
                        <div key={stage} className={`relative group`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold transition-all ${
                            isCompleted
                              ? 'bg-emerald-500 text-white'
                              : isCurrent
                                ? `bg-gradient-to-br ${stageInfo.color} text-white ring-2 ring-offset-1 ${isDark ? 'ring-offset-dark-bg ring-indigo-400/50' : 'ring-offset-white ring-indigo-300/50'}`
                                : (isDark ? 'bg-dark-surface text-dark-text-muted' : 'bg-slate-100 text-slate-400')
                          }`}>
                            {isCompleted ? '✓' : idx + 1}
                          </div>
                          {/* Tooltip */}
                          <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-lg text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 ${isDark ? 'bg-dark-card text-dark-text border border-dark-border' : 'bg-white text-slate-700 border border-slate-200 shadow-sm'}`}>
                            {stageInfo.name}
                            {isCompleted && ' ✓'}
                            {isCurrent && ' ← 当前'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {learningMode === 'socratic' && engine && progress[selectedConcept.id]?.status !== 'mastered' && (
                  <div className="hidden sm:flex items-center gap-1">
                    {Array.from({ length: engine.getProgress().total }).map((_, i) => (<div key={i} className={`w-2 h-2 rounded-full transition-all ${i < engine.getProgress().correct ? 'bg-emerald-500' : i === engine.getProgress().current - 1 ? 'bg-indigo-400 animate-pulse-soft' : (isDark ? 'bg-dark-border' : 'bg-slate-200')}`} />))}
                  </div>
                )}
                <button onClick={clearCurrentChat} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-dark-hover text-dark-text-muted' : 'hover:bg-slate-100 text-slate-400'}`}><RotateCcw className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Quote banner */}
            {progress[selectedConcept.id]?.status === 'mastered' && (
              <div className={`flex-shrink-0 mx-6 mt-4 p-4 rounded-2xl border animate-fade-in-up ${isDark ? 'bg-amber-950/20 border-amber-900/30' : 'bg-gradient-to-r from-amber-50/80 to-orange-50/80 border-amber-200/60'}`}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-sm"><BookOpen className="w-4 h-4 text-white" /></div>
                  <div><p className={`text-xs font-semibold mb-1 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>书中原文</p><blockquote className={`text-sm italic leading-relaxed ${isDark ? 'text-dark-text-secondary' : 'text-slate-600'}`}>&ldquo;{selectedConcept.quotes[0]}&rdquo;</blockquote></div>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
              <div className="max-w-3xl mx-auto space-y-4">
                {/* 迷你认知可视化（嵌入聊天区） */}
                {messages.length > 1 && (streamingText || messages.length > 2) && (
                  <CognitiveVisualization
                    isDark={isDark}
                    compact
                    isStreaming={!!streamingText}
                    currentMessage={streamingText || messages[messages.length - 1]?.content || ''}
                    messagesCount={messages.length}
                  />
                )}

                {messages.map((msg, idx) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} message-bubble`} style={{ animationDelay: `${idx * 30}ms` }}>
                    <div className={`flex items-end gap-2.5 max-w-[88%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : msg.isQuote ? 'bg-gradient-to-br from-amber-400 to-orange-500' : msg.isEncouragement ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : learningMode === 'collision' ? 'bg-gradient-to-br from-purple-500 to-pink-500' : 'bg-gradient-to-br from-slate-500 to-slate-600'}`}>
                        {msg.role === 'user' ? <GraduationCap className="w-4 h-4 text-white" /> : msg.isQuote ? <BookMarked className="w-4 h-4 text-white" /> : <Brain className="w-4 h-4 text-white" />}
                      </div>
                      <div className={`rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-br-lg shadow-md shadow-indigo-500/15' : msg.isQuote ? (isDark ? 'bg-amber-950/30 border border-amber-900/30 text-dark-text rounded-bl-lg' : 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/60 text-slate-700 rounded-bl-lg') : msg.isEncouragement ? (isDark ? 'bg-emerald-950/30 border border-emerald-900/30 text-dark-text rounded-bl-lg' : 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200/60 text-slate-700 rounded-bl-lg') : learningMode === 'collision' ? (isDark ? 'bg-purple-950/20 border border-purple-900/30 text-dark-text rounded-bl-lg' : 'bg-gradient-to-br from-purple-50 to-pink-50/50 border border-purple-200/60 text-slate-700 rounded-bl-lg') : (isDark ? 'bg-dark-card border border-dark-border text-dark-text rounded-bl-lg' : 'bg-slate-50 border border-slate-100 text-slate-700 rounded-bl-lg')}`}>
                        {msg.isQuote && <div className="flex items-center gap-1.5 mb-2 text-amber-600 dark:text-amber-400"><BookOpen className="w-3 h-3" /><span className="text-[10px] font-semibold uppercase tracking-wider">书中原文</span></div>}
                        <div className="text-sm whitespace-pre-line leading-relaxed">{msg.content}</div>
                        {msg.isMasteryMessage && getNextConcept() && (
                          <button onClick={goToNextConcept} className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white text-sm font-medium rounded-xl hover:shadow-lg hover:shadow-purple-500/25 active:scale-[0.98] transition-all"><ArrowRight className="w-4 h-4" />进入下一个概念：{getNextConcept()?.concept.name}</button>
                        )}
                        {msg.card && renderChatCard(msg.card)}
                      </div>
                    </div>
                  </div>
                ))}

                {showThinking && (
                  <div className="flex justify-start message-bubble">
                    <div className="flex items-end gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shadow-sm"><Brain className="w-4 h-4 text-white" /></div>
                      <div className={`${isDark ? 'bg-dark-card border border-dark-border' : 'bg-slate-50 border border-slate-100'} rounded-2xl rounded-bl-lg px-4 py-3`}>
                        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" style={{ animation: 'typing-bounce 1.4s ease-in-out infinite', animationDelay: '0ms' }} /><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" style={{ animation: 'typing-bounce 1.4s ease-in-out infinite', animationDelay: '150ms' }} /><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" style={{ animation: 'typing-bounce 1.4s ease-in-out infinite', animationDelay: '300ms' }} /><span className={`text-[11px] ml-1 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>思考中...</span></div>
                      </div>
                    </div>
                  </div>
                )}

                {isTyping && !showThinking && !streamingText && (
                  <div className="flex justify-start message-bubble">
                    <div className="flex items-end gap-2.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ${learningMode === 'collision' ? 'bg-gradient-to-br from-purple-500 to-pink-500' : 'bg-gradient-to-br from-slate-500 to-slate-600'}`}><Brain className="w-4 h-4 text-white" /></div>
                      <div className={`${isDark ? 'bg-dark-card border border-dark-border' : 'bg-slate-50 border border-slate-100'} rounded-2xl rounded-bl-lg px-4 py-3`}>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} /><div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 流式输出文本（AI 实时回复） */}
                {streamingText && (
                  <div className="flex justify-start message-bubble">
                    <div className="flex items-end gap-2.5 max-w-[88%]">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ${learningMode === 'collision' ? 'bg-gradient-to-br from-purple-500 to-pink-500' : 'bg-gradient-to-br from-indigo-500 to-blue-600'}`}>
                        <Brain className="w-4 h-4 text-white" />
                      </div>
                      <div className={`rounded-2xl rounded-bl-lg px-4 py-3 ${isDark ? 'bg-dark-card border border-dark-border text-dark-text' : 'bg-slate-50 border border-slate-200 text-slate-700'}`}>
                        <div className="text-sm whitespace-pre-line leading-relaxed">{streamingText}<span className="inline-block w-1 h-4 bg-indigo-400 ml-0.5 animate-pulse" /></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className={`flex-shrink-0 px-4 sm:px-6 py-4 border-t ${isDark ? 'border-dark-border' : 'border-slate-100/60'}`}>
              <div className="max-w-3xl mx-auto">
                <div className="flex gap-2.5">
                  <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isTyping) { learningMode === 'socratic' ? handleSendSocraticMessage() : handleSendCollisionMessage(); } }}
                    placeholder={learningMode === 'socratic' ? '输入你的回答...' : '输入你的观点或问题...'} disabled={isTyping}
                    className={`w-full pl-4 pr-4 py-3 border rounded-xl text-sm transition-all ${isDark ? 'bg-dark-card border-dark-border text-dark-text placeholder:text-dark-text-muted focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50' : 'bg-white border-slate-200/60 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400'} ${isTyping ? 'opacity-60 cursor-wait' : ''}`} />
                  <button onClick={learningMode === 'socratic' ? handleSendSocraticMessage : handleSendCollisionMessage} disabled={!inputValue.trim() || isTyping}
                    className={`px-4 text-white rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 ${learningMode === 'collision' ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:shadow-lg hover:shadow-purple-500/25' : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:shadow-lg hover:shadow-indigo-500/25'}`}>
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-1.5 px-1"><p className={`text-[11px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>{learningMode === 'socratic' ? '通过提问检验你对概念的理解深度' : '自由讨论区，对话记录自动保存'}</p><p className={`text-[11px] ${isDark ? 'text-dark-text-muted' : 'text-slate-300'}`}>Enter 发送</p></div>
              </div>
            </div>
          </>)}

          {/* Empty state */}
          {!selectedConcept && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className={`max-w-md w-full rounded-3xl p-12 text-center animate-scale-in ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white/80 border border-slate-200/60'} shadow-sm`}>
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-float"><BookOpen className="w-10 h-10 text-indigo-500 dark:text-indigo-400" /></div>
                <h3 className={`text-xl font-bold mb-2 ${isDark ? 'text-dark-text' : 'text-slate-800'}`}>选择一个概念开始学习</h3>
                <p className={`text-sm mb-8 ${isDark ? 'text-dark-text-secondary' : 'text-slate-400'}`}>从左侧选择章节和概念，开启学习之旅</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: <MessageCircle className="w-5 h-5 text-white" />, title: '苏格拉底式追问', desc: '通过提问检验认知', gradient: 'from-indigo-500 to-purple-600', container: 'bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100/60', containerDark: 'bg-indigo-950/20 border-indigo-900/30', titleCls: 'text-indigo-700', titleClsDark: 'text-indigo-300', descCls: 'text-indigo-500/70', descClsDark: 'text-indigo-400/60' },
                    { icon: <Zap className="w-5 h-5 text-white" />, title: '思维的碰撞', desc: '自由讨论深入探讨', gradient: 'from-purple-500 to-pink-600', container: 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-100/60', containerDark: 'bg-purple-950/20 border-purple-900/30', titleCls: 'text-purple-700', titleClsDark: 'text-purple-300', descCls: 'text-purple-500/70', descClsDark: 'text-purple-400/60' },
                  ].map((item, i) => (
                    <div key={i} className={`p-5 rounded-2xl border hover-lift ${isDark ? item.containerDark : item.container}`}>
                      <div className={`w-10 h-10 bg-gradient-to-br ${item.gradient} rounded-xl flex items-center justify-center mx-auto mb-3 shadow-sm`}>{item.icon}</div>
                      <p className={`font-semibold text-sm ${isDark ? item.titleClsDark : item.titleCls}`}>{item.title}</p>
                      <p className={`text-xs mt-1 ${isDark ? item.descClsDark : item.descCls}`}>{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT PANEL */}
        <aside className={`sidebar-transition flex-shrink-0 border-l overflow-y-auto ${rightPanelCollapsed ? 'w-0 min-w-0 border-l-0 opacity-0' : 'w-[300px] min-w-[300px] opacity-100'} ${isDark ? 'border-dark-border bg-dark-bg/80' : 'bg-white/50'}`}>
          <div className="p-3 space-y-3">
            {/* Panel tabs */}
            <div className={`flex gap-1 p-1 rounded-xl ${isDark ? 'bg-dark-card' : 'bg-slate-100/80'}`}>
              {([ { id: 'cognitive' as RightPanelView, icon: <Radio className="w-3.5 h-3.5" />, label: '认知' }, { id: 'dashboard' as RightPanelView, icon: <Activity className="w-3.5 h-3.5" />, label: '仪表盘' }, { id: 'knowledge-graph' as RightPanelView, icon: <Network className="w-3.5 h-3.5" />, label: '知识图谱' } ]).map(tab => (
                <button key={tab.id} onClick={() => setRightPanelView(tab.id)} className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all ${rightPanelView === tab.id ? `bg-white dark:bg-dark-hover ${isDark ? 'text-dark-text' : 'text-slate-700'} shadow-sm` : (isDark ? 'text-dark-text-muted hover:text-dark-text-secondary' : 'text-slate-500 hover:text-slate-700')}`}>
                  {tab.icon}<span className="hidden xl:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {rightPanelView === 'cognitive' && (
              <div className={`rounded-2xl p-4 ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white/80 border border-slate-200/60'} shadow-sm animate-fade-in-up`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>
                  <Radio className="w-3.5 h-3.5 text-indigo-500" />
                  认知边界可视化
                </h3>
                <CognitiveVisualization
                  isDark={isDark}
                  isStreaming={!!streamingText}
                  currentMessage={streamingText || messages[messages.length - 1]?.content || ''}
                  messagesCount={messages.length}
                />
              </div>
            )}

            {rightPanelView === 'dashboard' && (<>
              {/* Stats grid */}
              <div className={`rounded-2xl p-4 ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white/80 border border-slate-200/60'} shadow-sm animate-fade-in-up`}>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { icon: <Flame className="w-5 h-5" />, value: learningStats.totalSessions, label: '学习次数', color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/30' },
                    { icon: <Trophy className="w-5 h-5" />, value: learningStats.mastered, label: '已掌握', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
                    { icon: <Award className="w-5 h-5" />, value: Math.round((stats.mastered / stats.total) * 100) + '%', label: '完成率', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
                  ].map((s, i) => (
                    <div key={i} className="text-center animate-count-up" style={{ animationDelay: `${i * 80}ms` }}>
                      <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mx-auto mb-1.5`}><span className={s.color}>{s.icon}</span></div>
                      <p className={`text-lg font-bold ${isDark ? 'text-dark-text' : 'text-slate-800'}`}>{s.value}</p>
                      <p className={`text-[10px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className={`h-px ${isDark ? 'bg-dark-border' : 'bg-slate-100'}`} />
                <div className="flex items-center justify-between mt-3"><span className={`text-xs ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>上次学习</span><span className={`text-xs font-medium ${isDark ? 'text-dark-text-secondary' : 'text-slate-600'}`}>{formatDate(learningStats.lastVisit)}</span></div>
              </div>

              {/* Heatmap */}
              <div className={`rounded-2xl p-4 ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white/80 border border-slate-200/60'} shadow-sm animate-fade-in-up`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-dark-text-muted' : 'text-slate-400'} flex items-center gap-1.5`}><Calendar className="w-3.5 h-3.5" />学习活跃度</h3>
                  <span className={`text-[10px] font-medium ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>{totalInteractions} 次互动</span>
                </div>
                <div className="grid grid-cols-12 gap-[3px]">
                  {Array.from({ length: 12 }).map((_, wi) => (
                    <div key={wi} className="flex flex-col gap-[3px]">
                      {Array.from({ length: 7 }).map((_, di) => {
                        const idx = wi * 7 + di; const val = heatmapData[idx] || 0;
                        return <div key={di} className={`heatmap-cell w-full aspect-square rounded-[3px] ${heatmapColors[Math.min(val, 5)]} cursor-pointer`} title={`${val} 次互动`} />;
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-1 mt-2">
                  <span className={`text-[9px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>少</span>
                  {heatmapColors.slice(1).map((c, i) => <div key={i} className={`w-2.5 h-2.5 rounded-[2px] ${c}`} />)}
                  <span className={`text-[9px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>多</span>
                </div>
              </div>

              {/* Chapter progress */}
              <div className={`rounded-2xl p-4 ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white/80 border border-slate-200/60'} shadow-sm animate-fade-in-up`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>章节进度</h3>
                <div className="grid grid-cols-2 gap-3">
                  {book.chapters.map(chapter => {
                    const m = chapter.concepts.filter(c => progress[c.id]?.status === 'mastered').length; const t = chapter.concepts.length; const p = (m / t) * 100; const colors = chapterColors[chapter.id] || chapterColors['dual-system'];
                    return (
                      <div key={chapter.id} className={`p-3 rounded-xl ${isDark ? 'bg-dark-surface' : 'bg-slate-50/80'}`}>
                        <div className="flex items-center gap-2 mb-2"><div className={`w-5 h-5 rounded-md flex items-center justify-center bg-gradient-to-br ${colors.gradient} text-white`}>{chapterIcons[chapter.id]}</div><span className={`text-[11px] font-medium truncate ${isDark ? 'text-dark-text-secondary' : 'text-slate-600'}`}>{chapter.name}</span></div>
                        <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-dark-border' : 'bg-slate-200/60'}`}><div className={`h-1.5 rounded-full ${p === 100 ? 'bg-emerald-500' : `bg-gradient-to-r ${colors.gradient}`} progress-bar-animated`} style={{ width: `${p}%` }} /></div>
                        <div className="flex justify-between mt-1.5"><span className={`text-[10px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>{m}/{t}</span><span className={`text-[10px] font-medium ${p === 100 ? 'text-emerald-500' : (isDark ? 'text-dark-text-muted' : 'text-slate-500')}`}>{Math.round(p)}%</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tips */}
              <div className={`rounded-2xl p-4 ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white/80 border border-slate-200/60'} shadow-sm animate-fade-in-up`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'} flex items-center gap-1.5`}><Lightbulb className="w-3.5 h-3.5 text-amber-400" />学习技巧</h3>
                <div className="space-y-2">
                  {[
                    { icon: <Eye className="w-3.5 h-3.5" />, title: '主动回忆', desc: '不看笔记，尝试回忆学过的内容', color: 'text-blue-500', bg: isDark ? 'bg-blue-950/30' : 'bg-blue-50/80' },
                    { icon: <GitBranch className="w-3.5 h-3.5" />, title: '思维碰撞', desc: '用不同视角审视同一概念', color: 'text-purple-500', bg: isDark ? 'bg-purple-950/30' : 'bg-purple-50/80' },
                    { icon: <Activity className="w-3.5 h-3.5" />, title: '间隔重复', desc: '定期回顾，巩固长期记忆', color: 'text-emerald-500', bg: isDark ? 'bg-emerald-950/30' : 'bg-emerald-50/80' },
                  ].map((tip, i) => (
                    <div key={i} className={`p-3 rounded-xl ${tip.bg} border ${isDark ? 'border-dark-border/50' : 'border-transparent'}`}>
                      <div className="flex items-center gap-2 mb-1"><span className={tip.color}>{tip.icon}</span><p className={`text-xs font-semibold ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>{tip.title}</p></div>
                      <p className={`text-[11px] ${isDark ? 'text-dark-text-muted' : 'text-slate-500'} leading-relaxed`}>{tip.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Book card */}
              <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-5 text-white shadow-lg shadow-indigo-500/15 animate-fade-in-up">
                <div className="flex items-center gap-2 mb-3"><BookOpen className="w-4 h-4 text-white/80" /><span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">当前书目</span></div>
                <h4 className="font-bold text-base mb-1">思考，快与慢</h4><p className="text-sm text-white/70 mb-3">丹尼尔·卡尼曼</p><p className="text-xs text-white/50 leading-relaxed">诺贝尔经济学奖得主揭示影响决策的两大思维系统</p>
              </div>
            </>)}

            {rightPanelView === 'knowledge-graph' && (
              <div className={`rounded-2xl p-4 ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white/80 border border-slate-200/60'} shadow-sm animate-fade-in-up`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-1.5 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}><Network className="w-3.5 h-3.5" />概念知识图谱</h3>
                <div className="space-y-1">
                  {book.chapters.map((chapter, chIdx) => (
                    <div key={chapter.id}>
                      <div className={`flex items-center gap-2 py-2 px-2 rounded-lg ${isDark ? 'hover:bg-dark-hover' : 'hover:bg-slate-50'}`}>
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center bg-gradient-to-br ${chapterColors[chapter.id]?.gradient} text-white text-[10px] font-bold`}>{chIdx + 1}</div>
                        <span className={`text-xs font-semibold ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>{chapter.name}</span>
                      </div>
                      <div className="ml-6 space-y-1 mb-2">
                        {chapter.concepts.map((concept, cIdx) => {
                          const mastered = getConceptStatus(concept.id) === 'mastered';
                          const deps = concept.unlockingCriteria.requiredConcepts;
                          return (
                            <div key={concept.id} className="relative">
                              {cIdx > 0 && <div className={`absolute -top-1 left-[11px] w-px h-3 ${isDark ? 'bg-dark-border' : 'bg-slate-200'}`} />}
                              {cIdx < chapter.concepts.length - 1 && <div className={`absolute top-4 left-[11px] w-px h-3 ${isDark ? 'bg-dark-border' : 'bg-slate-200'}`} />}
                              <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all ${selectedConcept?.id === concept.id ? (isDark ? 'bg-indigo-950/40 ring-1 ring-indigo-500/30' : 'bg-indigo-50 ring-1 ring-indigo-200') : (isDark ? 'hover:bg-dark-hover' : 'hover:bg-slate-50')}`}>
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${mastered ? 'bg-emerald-500 text-white' : selectedConcept?.id === concept.id ? 'bg-indigo-500 text-white' : (isDark ? 'bg-dark-surface text-dark-text-muted' : 'bg-slate-100 text-slate-400')}`}>
                                  {mastered ? <Trophy className="w-3 h-3" /> : <span className="font-bold">{cIdx + 1}</span>}
                                </div>
                                <button onClick={() => isConceptSelectable(concept) && setSelectedConcept(concept)} className={`text-[11px] font-medium truncate ${mastered ? 'text-emerald-600 dark:text-emerald-400' : (isDark ? 'text-dark-text-secondary' : 'text-slate-600')} hover:underline`}>{concept.name}</button>
                                {deps.length > 0 && <span className={`text-[9px] px-1.5 py-0.5 rounded ${isDark ? 'bg-dark-surface text-dark-text-muted' : 'bg-slate-100 text-slate-400'}`}>需 {deps.length} 前置</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {chIdx < book.chapters.length - 1 && <div className="flex justify-center py-1"><ChevronDown className={`w-4 h-4 ${isDark ? 'text-dark-text-muted' : 'text-slate-300'}`} /></div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
      ) : (
      <HomeView
        isDark={isDark}
        greeting={homeOpening.greeting}
        suggestions={homeOpening.suggestions}
        openingCards={homeOpening.cards}
        homeMessages={homeMessages}
        book={book}
        progress={progress}
        aiEnabled={aiEnabled}
        aiProviderName={aiProviderName}
        stats={{ mastered: stats.mastered, total: stats.total }}
        onSend={handleHomeSend}
        onOpenMap={openChatMap}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      )}

      {/* UNLOCK ANIMATION */}
      {showUnlockAnimation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in">
          <div className="bg-white dark:bg-dark-card rounded-3xl p-10 text-center animate-unlock shadow-2xl max-w-sm mx-4">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-500/30 animate-float"><Unlock className="w-10 h-10 text-white" /></div>
            <h3 className={`text-2xl font-bold mb-2 ${isDark ? 'text-dark-text' : 'text-slate-800'}`}>新章节已解锁！</h3>
            <p className={isDark ? 'text-dark-text-secondary' : 'text-slate-500'}>继续你的学习之旅</p>
          </div>
        </div>
      )}
      {/* SETTINGS PANEL */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onConfigChange={(config) => { setAiConfig(config); setAiEnabled(!!(config.apiKey || config.provider === 'ollama')); }}
        isDark={isDark}
      />
    </div>
  );
}

export default App;
