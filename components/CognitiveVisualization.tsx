/**
 * 认知可视化组件
 * 
 * 核心设计理念：
 * 将用户在对话中的思维过程"可视化"出来，让元认知变得可见。
 * 包含三大可视化模块：
 * 1. 认知雷达图 — 7大思维维度的实时能力图谱
 * 2. 框架激活追踪 — AI 使用了哪些认知框架来引导对话
 * 3. 因果链视图 — 当前讨论问题的因果推理链路
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Brain, Target, Zap, Eye, GitBranch, Lightbulb, Shield,
  ChevronRight, AlertCircle, CheckCircle2, TrendingUp,
  Radio, Sparkles, ArrowRight, Minus, Plus
} from 'lucide-react';

// ============ 类型定义 ============

/** 7大认知框架 */
export interface CognitiveFramework {
  id: string;
  name: string;
  shortName: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  /** 0-100 的激活值 */
  activation: number;
  /** 本次对话中被使用的次数 */
  usageCount: number;
}

/** 因果链节点 */
interface CausalNode {
  id: string;
  label: string;
  type: 'phenomenon' | 'cause' | 'premise' | 'deduction' | 'conclusion';
  status: 'active' | 'verified' | 'weak' | 'pending';
  content?: string;
}

/** 认知事件（框架被触发时记录） */
interface CognitiveEvent {
  timestamp: number;
  frameworkId: string;
  type: 'activate' | 'deepen' | 'breakthrough';
  description: string;
}

/** 维度数据用于雷达图 */
interface RadarDimension {
  label: string;
  value: number;       // 0-100
  target: number;      // 目标值（动画目标）
  color: string;
}

type VisualizationMode = 'radar' | 'frameworks' | 'causal-chain' | 'timeline';

// ============ 默认数据 ============

const DEFAULT_FRAMEWORKS: CognitiveFramework[] = [
  {
    id: 'what-how-why',
    name: '问题拆解三步法',
    shortName: '拆解',
    icon: <Target className="w-4 h-4" />,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
    borderColor: 'border-blue-500',
    description: 'What → How → Why，层层追问问题本质',
    activation: 0,
    usageCount: 0,
  },
  {
    id: 'system1-2',
    name: '系统1/2觉察',
    shortName: '觉察',
    icon: <Brain className="w-4 h-4" />,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500',
    borderColor: 'border-purple-500',
    description: '识别直觉陷阱，切换到理性分析模式',
    activation: 0,
    usageCount: 0,
  },
  {
    id: 'causal-chain',
    name: '因果链推理',
    shortName: '推理',
    icon: <GitBranch className="w-4 h-4" />,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500',
    borderColor: 'border-emerald-500',
    description: '现象→原因→前提→推导→结论，步步验证',
    activation: 0,
    usageCount: 0,
  },
  {
    id: 'thinking-mirror',
    name: '思维镜子',
    shortName: '镜子',
    icon: <Eye className="w-4 h-4" />,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500',
    borderColor: 'border-amber-500',
    description: '照出思维盲区，不替代思考',
    activation: 0,
    usageCount: 0,
  },
  {
    id: 'e-classify',
    name: 'E类问题分类',
    shortName: '归类',
    icon: <Zap className="w-4 h-4" />,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500',
    borderColor: 'border-rose-500',
    description: '找共性模式，从零开始→调用方法论',
    activation: 0,
    usageCount: 0,
  },
  {
    id: 'feynman',
    name: '费曼检验',
    shortName: '费曼',
    icon: <Lightbulb className="w-4 h-4" />,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500',
    borderColor: 'border-indigo-500',
    description: '举例→解释→判断→顿悟，四层检验',
    activation: 0,
    usageCount: 0,
  },
  {
    id: 'cant-can',
    name: 'can vs can\'t',
    shortName: '突破',
    icon: <Shield className="w-4 h-4" />,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500',
    borderColor: 'border-cyan-500',
    description: '区分能力不可能和选择不做',
    activation: 0,
    usageCount: 0,
  },
];

// ============ 子组件：SVG 雷达图 ============

function CognitiveRadarChart({ 
  dimensions, 
  isDark,
  size = 220 
}: { 
  dimensions: RadarDimension[]; 
  isDark: boolean;
  size?: number;
}) {
  const center = size / 2;
  const radius = size * 0.38;
  const levels = 5; // 5个同心圆层级

  // 计算多边形顶点
  const getPoint = (index: number, value: number, max: number = 100) => {
    const angle = (Math.PI * 2 * index) / dimensions.length - Math.PI / 2;
    const r = (radius * value) / max;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // 背景网格路径
  const gridPaths = useMemo(() => {
    const paths: string[] = [];
    for (let level = 1; level <= levels; level++) {
      const points = dimensions.map((_, i) => {
        const p = getPoint(i, (level / levels) * 100);
        return `${p.x},${p.y}`;
      });
      paths.push(`M ${points.join(' L ')} Z`);
    }
    // 辐射线
    for (let i = 0; i < dimensions.length; i++) {
      paths.push(`M ${center},${center} L ${getPoint(i, 100).x},${getPoint(i, 100).y}`);
    }
    return paths;
  }, [dimensions, center, radius]);

  // 数据区域路径
  const dataPath = useMemo(() => {
    const points = dimensions.map((d, i) => {
      const p = getPoint(i, d.value);
      return `${p.x},${p.y}`;
    });
    return `M ${points.join(' L ')} Z`;
  }, [dimensions]);

  // 目标区域路径（虚线）
  const targetPath = useMemo(() => {
    const points = dimensions.map((d, i) => {
      const p = getPoint(i, d.target);
      return `${p.x},${p.y}`;
    });
    return `M ${points.join(' L ')} Z`;
  }, [dimensions]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      {/* 背景圆 */}
      <circle cx={center} cy={center} r={radius + 20} fill="none"
        className={isDark ? 'stroke-dark-border/30' : 'stroke-slate-200/60'} strokeWidth={1} />
      
      {/* 同心网格 */}
      {gridPaths.slice(0, levels).map((path, i) => (
        <path key={`grid-${i}`} d={path} fill="none"
          className={isDark ? 'stroke-dark-border/40' : 'stroke-slate-200'}
          strokeWidth={0.5}
          strokeDasharray={i === levels - 1 ? 'none' : '3 3'} />
      ))}
      
      {/* 辐射线 */}
      {gridPaths.slice(levels).map((path, i) => (
        <path key={`axis-${i}`} d={path} fill="none"
          className={isDark ? 'stroke-dark-border/25' : 'stroke-slate-200/60'}
          strokeWidth={0.5} />
      ))}

      {/* 目标区域（虚线） */}
      <path d={targetPath} fill="none" stroke="#6366f1" strokeWidth={1}
        strokeDasharray="4 4" opacity={0.3} />

      {/* 数据填充区域 */}
      <path d={dataPath} fill="url(#cognitiveGradient)" opacity={0.2}
        className="transition-all duration-700 ease-out" />
      
      {/* 数据边框线 */}
      <path d={dataPath} fill="none" stroke="url(#cognitiveStroke)" strokeWidth={2}
        strokeLinejoin="round" className="transition-all duration-700 ease-out" />

      {/* 数据点 + 标签 */}
      {dimensions.map((d, i) => {
        const p = getPoint(i, d.value);
        const labelP = getPoint(i, 125); // 标签位置稍远
        return (
          <g key={i}>
            {/* 连接线 */}
            <line x1={center} y1={center} x2={p.x} y2={p.y}
              stroke={d.color} strokeWidth={1.5} opacity={0.3}
              className="transition-all duration-700 ease-out" />
            {/* 数据点 */}
            <circle cx={p.x} cy={p.y} r={4 + d.value / 30} fill={d.color}
              className="transition-all duration-700 ease-out"
              style={{ filter: `drop-shadow(0 0 4px ${d.color}40)` }} />
            {/* 外圈光晕 */}
            <circle cx={p.x} cy={p.y} r={6 + d.value / 20} fill="none"
              stroke={d.color} strokeWidth={1} opacity={0.4}
              className="animate-pulse-soft" />
            {/* 标签 */}
            <text x={labelP.x} y={labelP.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={9} fontWeight={600} fill={isDark ? '#9494a8' : '#64748b'}
              className="select-none">
              {d.label}
            </text>
            {/* 数值 */}
            <text x={labelP.x} y={labelP.y + 11} textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fontWeight={700} fill={d.color}
              className="select-none">
              {Math.round(d.value)}
            </text>
          </g>
        );
      })}

      {/* 渐变定义 */}
      <defs>
        <linearGradient id="cognitiveGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
          <stop offset="50%" stopColor="#a855f7" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#ec4899" stopOpacity={0.2} />
        </linearGradient>
        <linearGradient id="cognitiveStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ============ 子组件：框架激活卡片 ============

function FrameworkCard({
  framework,
  isDark,
  isCompact = false,
}: {
  framework: CognitiveFramework;
  isDark: boolean;
  isCompact?: boolean;
}) {
  const isActive = framework.activation > 0;
  
  return (
    <div
      className={`
        group relative overflow-hidden rounded-xl border transition-all duration-300 cursor-default
        ${isActive
          ? `${framework.borderColor}/30 bg-gradient-to-br ${isDark ? 'from-' + framework.bgColor.split('-')[1] + '-950/40 to-transparent' : 'from-' + framework.bgColor.split('-')[1] + '-50/30 to-transparent'}`
          : isDark ? 'border-dark-border bg-dark-card/50' : 'border-slate-200/60 bg-slate-50/50'
        }
        hover:shadow-md ${isCompact ? 'p-2' : 'p-3'}
      `}
    >
      {/* 激活指示条 */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 transition-all duration-500 ${
        isActive ? `bg-gradient-to-r ${framework.borderColor.replace('border-', 'from-')}` : ''
      }`} style={{ width: `${framework.activation}%` }} />

      <div className={`flex items-center gap-${isCompact ? '2' : '2.5'}`}>
        {/* 图标 */}
        <div className={`
          w-${isCompact ? '7' : '8'} h-${isCompact ? '7' : '8'} rounded-lg flex items-center justify-center flex-shrink-0
          transition-all duration-300
          ${isActive
            ? `${framework.bgColor} text-white shadow-sm`
            : isDark ? 'bg-dark-surface text-dark-text-muted' : 'bg-slate-200 text-slate-400'
          }
        `}>
          {framework.icon}
        </div>

        {!isCompact && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold truncate ${
                isActive ? framework.color : (isDark ? 'dark-text-secondary' : 'text-slate-600')
              }`}>{framework.name}</span>
              {framework.usageCount > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  isDark ? 'bg-dark-hover text-dark-text-secondary' : 'bg-white text-slate-500'
                } shadow-sm`}>×{framework.usageCount}</span>
              )}
            </div>
            <p className={`text-[10px] mt-0.5 leading-relaxed line-clamp-1 ${
              isDark ? 'text-dark-text-muted' : 'text-slate-400'
            }`}>{framework.description}</p>
          </div>
        )}

        {isCompact && (
          <span className={`text-[10px] font-bold ${isActive ? framework.color : (isDark ? 'text-dark-text-muted' : 'text-slate-400')}`}>
            {framework.shortName}
          </span>
        )}
      </div>

      {/* 激活度条（非紧凑模式） */}
      {!isCompact && (
        <div className={`mt-2 h-1 rounded-full overflow-hidden ${
          isDark ? 'bg-dark-border' : 'bg-slate-200/60'
        }`}>
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r ${framework.borderColor.replace('border-', 'from-')}`}
            style={{ width: `${framework.activation}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ============ 子组件：因果链视图 ============

function CausalChainView({ nodes, isDark }: { nodes: CausalNode[]; isDark: boolean }) {
  const nodeTypeConfig: Record<string, { label: string; color: string; dotColor: string }> = {
    phenomenon: { label: '现象', color: 'text-rose-500', dotColor: 'bg-rose-500' },
    cause: { label: '原因', color: 'text-amber-500', dotColor: 'bg-amber-500' },
    premise: { label: '前提', color: 'text-blue-500', dotColor: 'bg-blue-500' },
    deduction: { label: '推导', color: 'text-emerald-500', dotColor: 'bg-emerald-500' },
    conclusion: { label: '结论', color: 'text-purple-500', dotColor: 'bg-purple-500' },
  };

  const statusIcon: Record<string, React.ReactNode> = {
    active: <Radio className="w-3 h-3 text-indigo-400 animate-pulse-soft" />,
    verified: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
    weak: <AlertCircle className="w-3 h-3 text-amber-400" />,
    pending: <Minus className="w-3 h-3 text-slate-400" />,
  };

  if (nodes.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 rounded-xl border border-dashed ${
        isDark ? 'border-dark-border text-dark-text-muted' : 'border-slate-200 text-slate-400'
      }`}>
        <GitBranch className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-xs">对话开始后，因果链将在此可视化呈现</p>
        <p className="text-[10px] mt-1 opacity-60">AI 引导你走过：现象 → 原因 → 前提 → 推导 → 结论</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {nodes.map((node, index) => {
        const config = nodeTypeConfig[node.type];
        return (
          <div key={node.id} className="relative flex items-start gap-3">
            {/* 时间线和节点 */}
            <div className="flex flex-col items-center flex-shrink-0 pt-1">
              <div className={`w-3.5 h-3.5 rounded-full ${config.dotColor} flex items-center justify-center shadow-sm`}>
                {statusIcon[node.status]}
              </div>
              {index < nodes.length - 1 && (
                <div className={`w-0.5 h-8 mt-1 rounded-full ${
                  node.status === 'verified' ? config.dotColor.replace('bg-', 'bg-/40') :
                  isDark ? 'bg-dark-border' : 'bg-slate-200'
                }`} />
              )}
            </div>

            {/* 内容卡片 */}
            <div className={`flex-1 pb-4 group`}>
              <div className={`
                p-3 rounded-xl border transition-all duration-300
                ${node.status === 'active' ? (isDark ? 'ring-1 ring-indigo-500/30 border-indigo-900/30 bg-indigo-950/20' : 'ring-1 ring-indigo-200 border-indigo-100 bg-indigo-50/30') :
                  node.status === 'verified' ? (isDark ? 'border-emerald-900/30 bg-emerald-950/10' : 'border-emerald-100 bg-emerald-50/30') :
                  isDark ? 'border-dark-border bg-dark-card/50' : 'border-slate-200/60 bg-white/50'}
              `}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
                    {config.label}
                  </span>
                  {node.content && (
                    <ChevronRight className="w-3 h-3 text-slate-300 dark:text-dark-text-muted" />
                  )}
                </div>
                {node.content && (
                  <p className={`text-xs leading-relaxed ${
                    isDark ? 'text-dark-text-secondary' : 'text-slate-600'
                  }`}>{node.content}</p>
                )}
                {!node.content && (
                  <p className={`text-[11px] italic ${
                    isDark ? 'text-dark-text-muted' : 'text-slate-400'
                  }`}>等待对话中触发...</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============ 主组件 ============

interface CognitiveVisualizationProps {
  isDark: boolean;
  compact?: boolean;         // 迷你模式（嵌入聊天区域）
  currentMessage?: string;   // 当前 AI 回复文本（用于自动解析框架）
  messagesCount?: number;    // 对话轮次
}

export default function CognitiveVisualization({
  isDark,
  compact = false,
  currentMessage = '',
  messagesCount = 0,
}: CognitiveVisualizationProps) {
  const [mode, setMode] = useState<VisualizationMode>('radar');
  const [frameworks, setFrameworks] = useState<CognitiveFramework[]>(DEFAULT_FRAMEWORKS);
  const [causalNodes, setCausalNodes] = useState<CausalNode[]>([]);
  const [events, setEvents] = useState<CognitiveEvent[]>([]);
  const [totalBreakthroughs, setTotalBreakthroughs] = useState(0);

  // 从 AI 回复中自动检测框架使用情况
  useEffect(() => {
    if (!currentMessage.trim()) return;

    const msgLower = currentMessage.toLowerCase();
    const newEvents: CognitiveEvent[] = [];
    let breakthrough = false;

    // 检测每个框架的关键词
    const frameworkKeywords: Record<string, string[]> = {
      'what-how-why': ['这是什么问题', '本质是什么', '怎么处理', '为什么是这样', 'what', 'how to deal', 'why'],
      'system1-2': ['系统1', '系统2', '直觉', '理性分析', '元认知', '站在更高维度', '直觉陷阱', '系统一', '系统二'],
      'causal-chain': ['因为', '所以', '原因', '推导', '前提', '结论', '验证', '因果', '逻辑链条', '现象'],
      'thinking-mirror': ['你理解得对吗', '你的想法', '我哪里想错了', '盲区', '镜子', '照出', '反射'],
      'e-classify': ['这一类', '归类', '共性模式', '方法论', '专家', '新手', '同一类'],
      'feynman': ['举例子', '用自己的话解释', '顿悟', '真的懂了', '讲清楚', '给别人讲'],
      "cant-can": ["不会", '不行', '不可能', '能力', '选择', '方法不对', 'can\'t', 'can'],
    };

    setFrameworks(prev => prev.map(fw => {
      const keywords = frameworkKeywords[fw.id] || [];
      const matched = keywords.some(kw => msgLower.includes(kw));
      
      if (matched) {
        newEvents.push({
          timestamp: Date.now(),
          frameworkId: fw.id,
          type: 'activate',
          description: `框架「${fw.name}」被触发`,
        });

        if (msgLower.includes('边界') || msgLower.includes('更深') || msgLower.includes('突破')) {
          breakthrough = true;
        }

        return {
          ...fw,
          activation: Math.min(100, fw.activation + 12 + Math.random() * 15),
          usageCount: fw.usageCount + 1,
        };
      }
      return fw;
    }));

    // 自动衰减：未触发的框架缓慢降低激活度
    setFrameworks(prev => prev.map(fw => {
      const wasTriggered = newEvents.some(e => e.frameworkId === fw.id);
      if (!wasTriggered && fw.activation > 0) {
        return { ...fw, activation: Math.max(0, fw.activation - 3) };
      }
      return fw;
    }));

    if (newEvents.length > 0) {
      setEvents(prev => [...prev.slice(-20), ...newEvents]);
    }
    if (breakthrough) {
      setTotalBreakthroughs(prev => prev + 1);
    }
  }, [currentMessage]);

  // 初始化默认因果链结构
  useEffect(() => {
    setCausalNodes([
      { id: 'n1', label: '现象', type: 'phenomenon', status: 'active', content: '' },
      { id: 'n2', label: '原因A/B/C', type: 'cause', status: 'pending', content: '' },
      { id: 'n3', label: '前提假设', type: 'premise', status: 'pending', content: '' },
      { id: 'n4', label: '推导过程', type: 'deduction', status: 'pending', content: '' },
      { id: 'n5', label: '结论', type: 'conclusion', status: 'pending', content: '' },
    ]);
  }, []);

  // 计算雷达图维度
  const radarDimensions: RadarDimension[] = useMemo(
    () => frameworks.map(fw => ({
      label: fw.shortName,
      value: fw.activation,
      target: Math.min(80, 40 + fw.usageCount * 10),
      color: fw.color.replace('text-', ''),
    })),
    [frameworks]
  );

  // 统计
  const activeFrameworks = frameworks.filter(f => f.activation > 20).length;
  const avgActivation = Math.round(frameworks.reduce((a, b) => a + b.activation, 0) / frameworks.length);
  const maxActivation = Math.max(...frameworks.map(f => f.activation));

  // 视图切换按钮配置
  const modeTabs: { id: VisualizationMode; icon: React.ReactNode; label: string }[] = [
    { id: 'radar', icon: <Radio className="w-3.5 h-3.5" />, label: '认知图谱' },
    { id: 'frameworks', icon: <Sparkles className="w-3.5 h-3.5" />, label: '框架追踪' },
    { id: 'causal-chain', icon: <GitBranch className="w-3.5 h-3.5" />, label: '因果链' },
  ];

  if (compact) {
    // ====== 紧凑模式（嵌入聊天区域）======
    return (
      <div className={`
        rounded-xl border p-3 space-y-2.5 animate-fade-in-up
        ${isDark ? 'border-dark-border bg-dark-card/60' : 'border-slate-200/60 bg-white/60'}
      `}>
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-indigo-500" />
            <span className={`text-[11px] font-bold ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>认知实时</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] font-bold text-emerald-500">{avgActivation}</span>
          </div>
        </div>

        {/* 迷你雷达图 + 框架条 */}
        <div className="flex items-center gap-3">
          <CognitiveRadarChart dimensions={radarDimensions} isDark={isDark} size={120} />
          
          <div className="flex-1 space-y-1.5">
            {frameworks.filter(f => f.activation > 0 || f.usageCount > 0)
              .sort((a, b) => b.activation - a.activation)
              .slice(0, 4)
              .map(fw => (
                <FrameworkCard key={fw.id} framework={fw} isDark={isDark} isCompact />
              ))
            }
            {frameworks.every(f => f.activation === 0 && f.usageCount === 0) && (
              <p className={`text-[10px] italic ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>
                对话开始后，认知框架将在这里实时激活...
              </p>
            )}
          </div>
        </div>

        {/* 突破计数 */}
        {totalBreakthroughs > 0 && (
          <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg ${
            isDark ? 'bg-indigo-950/30 border border-indigo-900/20' : 'bg-indigo-50 border border-indigo-100/60'
          }`}>
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
              本轮已推动 {totalBreakthroughs} 次认知边界突破
            </span>
          </div>
        )}
      </div>
    );
  }

  // ====== 完整面板模式 ======
  return (
    <div className="space-y-3">
      {/* 头部统计 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: <Sparkles className="w-4 h-4" />, value: activeFrameworks, label: '活跃框架', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
          { icon: <TrendingUp className="w-4 h-4" />, value: `${avgActivation}`, label: '平均激活', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { icon: <Zap className="w-4 h-4" />, value: totalBreakthroughs, label: '边界突破', color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/30' },
        ].map((stat, i) => (
          <div key={i} className={`${stat.bg} rounded-xl p-2.5 text-center`}>
            <div className={`${stat.color} mx-auto mb-1`}>{stat.icon}</div>
            <p className={`text-base font-bold ${isDark ? 'text-dark-text' : 'text-slate-800'}`}>{stat.value}</p>
            <p className={`text-[9px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 视图切换 */}
      <div className={`flex gap-1 p-1 rounded-xl ${isDark ? 'bg-dark-card' : 'bg-slate-100/80'}`}>
        {modeTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
              mode === tab.id
                ? `bg-white dark:bg-dark-hover ${isDark ? 'text-dark-text shadow-sm' : 'text-slate-800 shadow-sm'}`
                : isDark ? 'text-dark-text-muted hover:text-dark-text-secondary' : 'text-slate-500 hover:text-slate-600'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="min-h-[280px]">
        {mode === 'radar' && (
          <div className="flex flex-col items-center space-y-4">
            <CognitiveRadarChart dimensions={radarDimensions} isDark={isDark} size={220} />
            
            {/* 图例 */}
            <div className="flex flex-wrap gap-2 justify-center">
              {frameworks.map(fw => (
                <div key={fw.id} className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${
                  fw.activation > 30
                    ? (isDark ? `border ${fw.borderColor}/30 ${fw.color}` : `border ${fw.borderColor}/30 ${fw.color}`)
                    : (isDark ? 'text-dark-text-muted' : 'text-slate-400')
                }`}>
                  <div className={`w-2 h-2 rounded-full ${fw.activation > 30 ? fw.bgColor : (isDark ? 'bg-dark-border' : 'bg-slate-200')}`} />
                  {fw.shortName} {fw.activation > 0 && Math.round(fw.activation)}
                </div>
              ))}
            </div>

            {/* 认知健康度提示 */}
            <div className={`w-full p-3 rounded-xl border text-center ${
              maxActivation > 70
                ? (isDark ? 'border-emerald-900/30 bg-emerald-950/10' : 'border-emerald-100 bg-emerald-50/50')
                : avgActivation > 20
                  ? (isDark ? 'border-blue-900/30 bg-blue-950/10' : 'border-blue-100 bg-blue-50/50')
                  : (isDark ? 'border-dark-border bg-dark-card/30' : 'border-slate-200/60 bg-slate-50/50')
            }`}>
              <p className={`text-xs font-medium ${
                maxActivation > 70 ? 'text-emerald-600 dark:text-emerald-400' :
                avgActivation > 20 ? 'text-blue-600 dark:text-blue-400' :
                isDark ? 'text-dark-text-secondary' : 'text-slate-500'
              }`}>
                {maxActivation > 70
                  ? `「${frameworks.find(f => f.activation === maxActivation)?.shortName}」维度高度活跃！正在深度突破这个方向。`
                  : avgActivation > 20
                    ? `认知引擎已启动，${activeFrameworks}/7 个框架正在工作`
                    : '开始对话后，认知框架将逐步激活...'
                }
              </p>
            </div>
          </div>
        )}

        {mode === 'frameworks' && (
          <div className="space-y-2">
            {frameworks.map(fw => (
              <FrameworkCard key={fw.id} framework={fw} isDark={isDark} />
            ))}

            {/* 最近事件时间线 */}
            {events.length > 0 && (
              <div className={`mt-3 p-3 rounded-xl border ${isDark ? 'border-dark-border bg-dark-card/30' : 'border-slate-200/60 bg-slate-50/50'}`}>
                <p className={`text-[10px] font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>最近激活</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {events.slice(-8).reverse().map((event, i) => {
                    const fw = frameworks.find(f => f.id === event.frameworkId);
                    return (
                      <div key={i} className={`flex items-center gap-2 text-[10px] ${
                        isDark ? 'text-dark-text-secondary' : 'text-slate-600'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${fw?.bgColor || 'bg-slate-400'}`} />
                        <span>{event.description}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'causal-chain' && (
          <>
            <CausalChainView nodes={causalNodes} isDark={isDark} />
            
            {/* 操作提示 */}
            <div className={`flex items-start gap-2 p-2.5 rounded-xl text-[10px] ${
              isDark ? 'bg-amber-950/20 border border-amber-900/20 text-amber-300/80' : 'bg-amber-50/50 border border-amber-100/60 text-amber-700'
            }`}>
              <AlertCircle className="w-3.5 h-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">如何使用因果链？</p>
                <p className="mt-0.5 leading-relaxed opacity-80">
                  当 AI 引导你做因果推理时，每一步都会在这里显示。你可以随时点击某个节点质疑：
                  "这步的前提成立吗？""这里有没有跳跃？"
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
