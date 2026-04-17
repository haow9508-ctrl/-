/**
 * CogniRead AI 设置面板组件
 * 
 * 类比 Lobe Chat / Chatbot UI 的设置界面设计：
 * - 模态对话框形式
 * - 选项卡分组：模型配置、个性化、系统提示词
 * - 实时测试连接
 * - 保存到 localStorage
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X, Check, AlertCircle, Eye, EyeOff, Save, Trash2, 
  Upload, Download, ChevronRight, Sparkles, Brain, User, FileText
} from 'lucide-react';
import {
  AI_PROVIDERS, DEFAULT_AI_CONFIG, DEFAULT_SYSTEM_PROMPT,
  AIService, AIConfig, ChatMessage, StreamingChunk
} from '@/utils/aiService';
import {
  UserPreferences, MemoryStore, OpenClawMemory,
  loadMemory, updateUserPreferences, getUserPreferences,
  clearAllMemory, exportMemory, importMemory, getMemoryStats,
  buildMemoryAwareSystemPrompt
} from '@/utils/memory';

const AI_CONFIG_KEY = 'cogniread_ai_config';

function loadAIConfig(): AIConfig {
  try {
    const data = localStorage.getItem(AI_CONFIG_KEY);
    if (data) return { ...DEFAULT_AI_CONFIG, ...JSON.parse(data) };
  } catch { /* ignore */ }
  return { ...DEFAULT_AI_CONFIG };
}

function saveAIConfig(config: AIConfig) {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
}

type SettingsTab = 'model' | 'personality' | 'prompt' | 'memory';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChange?: (config: AIConfig) => void;
  isDark?: boolean;
}

export default function SettingsPanel({ isOpen, onClose, onConfigChange, isDark }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('model');
  const [config, setConfig] = useState<AIConfig>(loadAIConfig);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // 个性化状态
  const [preferences, setPreferences] = useState<UserPreferences>(getUserPreferences());

  // 记忆状态
  const [memoryStats, setMemoryStats] = useState(getMemoryStats());
  const [memoryData, setMemoryData] = useState<MemoryStore | null>(null);
  const [showMemoryDetail, setShowMemoryDetail] = useState(false);
  const [importText, setImportText] = useState('');

  const selectedProvider = AI_PROVIDERS.find(p => p.id === config.provider);

  const updateConfig = useCallback((updates: Partial<AIConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...updates };
      // 自动填充 baseUrl
      if (updates.provider && updates.provider !== 'custom') {
        const provider = AI_PROVIDERS.find(p => p.id === updates.provider);
        if (provider) next.baseUrl = provider.baseUrl;
      }
      return next;
    });
  }, []);

  const handleSave = () => {
    saveAIConfig(config);
    onConfigChange?.(config);
    onClose();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const service = new AIService(config);
    const result = await service.testConnection();
    setTestResult(result);
    setTesting(false);
  };

  const handleSavePreferences = () => {
    updateUserPreferences(preferences);
  };

  const handleClearMemory = () => {
    if (confirm('确定清除所有 AI 记忆数据？此操作不可撤销。')) {
      clearAllMemory();
      setMemoryStats(getMemoryStats());
      setMemoryData(null);
    }
  };

  const handleExportMemory = () => {
    const data = exportMemory();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cogniread-memory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMemory = () => {
    if (importMemory(importText)) {
      setMemoryStats(getMemoryStats());
      setImportText('');
      alert('记忆数据导入成功！');
    } else {
      alert('导入失败：请检查 JSON 格式');
    }
  };

  const handleViewMemory = () => {
    setMemoryData(loadMemory());
    setShowMemoryDetail(true);
  };

  const handleResetPrompt = () => {
    setConfig(prev => ({ ...prev, systemPrompt: '' }));
  };

  // 标签页配置
  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'model', label: '模型配置', icon: <Brain className="w-4 h-4" /> },
    { id: 'personality', label: '个性化', icon: <User className="w-4 h-4" /> },
    { id: 'prompt', label: '系统提示词', icon: <FileText className="w-4 h-4" /> },
    { id: 'memory', label: '记忆管理', icon: <Sparkles className="w-4 h-4" /> },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      {/* Panel */}
      <div className={`relative w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white border border-slate-200'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-dark-border' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isDark ? 'text-dark-text' : 'text-slate-800'}`}>AI 助手设置</h2>
              <p className={`text-[11px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>配置你的个性化 AI 学习伴侣</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-dark-hover text-dark-text-muted' : 'hover:bg-slate-100 text-slate-400'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex gap-1 px-4 py-2 border-b ${isDark ? 'border-dark-border bg-dark-surface' : 'border-slate-100 bg-slate-50/50'}`}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? `bg-white ${isDark ? 'text-dark-text' : 'text-slate-800'} shadow-sm`
                  : (isDark ? 'text-dark-text-muted hover:text-dark-text-secondary' : 'text-slate-500 hover:text-slate-700')
              }`}>
              {tab.icon}<span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {/* ===== 模型配置 ===== */}
          {activeTab === 'model' && (
            <>
              {/* Provider */}
              <div>
                <label className={`block text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>AI 提供商</label>
                <div className="grid grid-cols-3 gap-2">
                  {AI_PROVIDERS.filter(p => p.id !== 'custom').map(provider => (
                    <button key={provider.id} onClick={() => updateConfig({ provider: provider.id })}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        config.provider === provider.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-500/30'
                          : isDark ? 'border-dark-border hover:border-dark-hover' : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <span className="text-lg">{provider.icon}</span>
                      <p className={`text-xs font-medium mt-1 ${config.provider === provider.id ? 'text-indigo-600 dark:text-indigo-400' : isDark ? 'text-dark-text-secondary' : 'text-slate-600'}`}>{provider.name}</p>
                    </button>
                  ))}
                  <button onClick={() => updateConfig({ provider: 'custom' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      config.provider === 'custom'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-500/30'
                        : isDark ? 'border-dark-border hover:border-dark-hover' : 'border-slate-200 hover:border-slate-300'
                    }`}>
                    <span className="text-lg">⚙️</span>
                    <p className={`text-xs font-medium mt-1 ${config.provider === 'custom' ? 'text-indigo-600 dark:text-indigo-400' : isDark ? 'text-dark-text-secondary' : 'text-slate-600'}`}>自定义</p>
                  </button>
                </div>
              </div>

              {/* Model */}
              {selectedProvider && selectedProvider.models.length > 0 && (
                <div>
                  <label className={`block text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>模型</label>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedProvider.models.map(model => (
                      <button key={model.id} onClick={() => updateConfig({ model: model.id })}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          config.model === model.id
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-500/30'
                            : isDark ? 'border-dark-border hover:border-dark-hover' : 'border-slate-200 hover:border-slate-300'
                        }`}>
                        <p className={`text-sm font-medium ${config.model === model.id ? 'text-indigo-600 dark:text-indigo-400' : isDark ? 'text-dark-text' : 'text-slate-700'}`}>{model.name}</p>
                        <p className={`text-[10px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>上下文 {Math.round(model.contextWindow / 1000)}K tokens</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Model ID */}
              {config.provider === 'custom' && (
                <div>
                  <label className={`block text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>模型 ID</label>
                  <input type="text" value={config.model} onChange={e => updateConfig({ model: e.target.value })} placeholder="例如: gpt-4o"
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-dark-surface border-dark-border text-dark-text placeholder:text-dark-text-muted' : 'bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400'} focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`} />
                </div>
              )}

              {/* API Key */}
              {config.provider !== 'ollama' && (
                <div>
                  <label className={`block text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>API Key</label>
                  <div className="relative">
                    <input type={showApiKey ? 'text' : 'password'} value={config.apiKey}
                      onChange={e => updateConfig({ apiKey: e.target.value })}
                      placeholder="sk-..."
                      className={`w-full px-3 py-2 pr-10 rounded-lg border text-sm font-mono ${isDark ? 'bg-dark-surface border-dark-border text-dark-text placeholder:text-dark-text-muted' : 'bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400'} focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`} />
                    <button onClick={() => setShowApiKey(!showApiKey)} className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className={`text-[10px] mt-1 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>密钥仅存储在浏览器本地，不会发送到任何第三方服务器</p>
                </div>
              )}

              {/* Base URL */}
              <div>
                <label className={`block text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>API 地址 (Base URL)</label>
                <input type="text" value={config.baseUrl} onChange={e => updateConfig({ baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className={`w-full px-3 py-2 rounded-lg border text-sm font-mono ${isDark ? 'bg-dark-surface border-dark-border text-dark-text placeholder:text-dark-text-muted' : 'bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400'} focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`} />
              </div>

              {/* Temperature */}
              <div>
                <label className={`block text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>
                  创造性 (Temperature): <span className={isDark ? 'text-dark-text' : 'text-slate-700'}>{config.temperature.toFixed(1)}</span>
                </label>
                <input type="range" min="0" max="1" step="0.1" value={config.temperature}
                  onChange={e => updateConfig({ temperature: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                <div className="flex justify-between mt-1">
                  <span className={`text-[10px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>精确</span>
                  <span className={`text-[10px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>创造</span>
                </div>
              </div>

              {/* Stream toggle */}
              <div className={`flex items-center justify-between p-3 rounded-xl border ${isDark ? 'border-dark-border' : 'border-slate-200'}`}>
                <div>
                  <p className={`text-sm font-medium ${isDark ? 'text-dark-text' : 'text-slate-700'}`}>流式输出</p>
                  <p className={`text-[11px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>逐字显示 AI 回复，更好的体验</p>
                </div>
                <button onClick={() => updateConfig({ streamEnabled: !config.streamEnabled })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${config.streamEnabled ? 'bg-indigo-500' : isDark ? 'bg-dark-border' : 'bg-slate-300'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${config.streamEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Test Connection */}
              <div className="flex items-center gap-2">
                <button onClick={handleTestConnection} disabled={testing || (!config.apiKey && config.provider !== 'ollama')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${testing ? 'opacity-60 cursor-wait' : ''} ${isDark ? 'bg-dark-hover hover:bg-dark-surface text-dark-text' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
                  {testing ? <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                  {testing ? '测试中...' : '测试连接'}
                </button>
                {testResult && (
                  <div className={`flex items-center gap-1 text-xs ${testResult.success ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {testResult.success ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    {testResult.message}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ===== 个性化 ===== */}
          {activeTab === 'personality' && (
            <>
              <div className={`p-4 rounded-xl border ${isDark ? 'bg-indigo-950/20 border-indigo-900/30' : 'bg-indigo-50/50 border-indigo-100'}`}>
                <p className={`text-xs ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>
                  💡 这些偏好会被注入到 AI 的 System Prompt 中，让 AI 记住你的偏好并个性化回复。越用越懂你！
                </p>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>你的名字</label>
                <input type="text" value={preferences.name || ''} onChange={e => setPreferences(p => ({ ...p, name: e.target.value || undefined }))}
                  placeholder="AI 会用这个名字称呼你"
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-dark-surface border-dark-border text-dark-text placeholder:text-dark-text-muted' : 'bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400'} focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`} />
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>学习风格</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'visual' as const, icon: '👁️', label: '视觉型', desc: '偏好图表' },
                    { id: 'reading' as const, icon: '📖', label: '阅读型', desc: '偏好文字' },
                    { id: 'discussion' as const, icon: '💬', label: '讨论型', desc: '偏好对话' },
                  ].map(style => (
                    <button key={style.id} onClick={() => setPreferences(p => ({ ...p, learningStyle: style.id }))}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        preferences.learningStyle === style.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-500/30'
                          : isDark ? 'border-dark-border hover:border-dark-hover' : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <span className="text-xl">{style.icon}</span>
                      <p className={`text-xs font-medium mt-1 ${preferences.learningStyle === style.id ? 'text-indigo-600 dark:text-indigo-400' : isDark ? 'text-dark-text-secondary' : 'text-slate-600'}`}>{style.label}</p>
                      <p className={`text-[10px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>{style.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>回复偏好</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'concise' as const, label: '简洁精炼', desc: '控制篇幅，直击要点' },
                    { id: 'detailed' as const, label: '详细深入', desc: '充分展开，深入分析' },
                  ].map(pref => (
                    <button key={pref.id} onClick={() => setPreferences(p => ({ ...p, replyPreference: pref.id }))}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        preferences.replyPreference === pref.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-500/30'
                          : isDark ? 'border-dark-border hover:border-dark-hover' : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <p className={`text-sm font-medium ${preferences.replyPreference === pref.id ? 'text-indigo-600 dark:text-indigo-400' : isDark ? 'text-dark-text' : 'text-slate-700'}`}>{pref.label}</p>
                      <p className={`text-[10px] mt-0.5 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>{pref.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>兴趣领域</label>
                <input type="text" value={(preferences.interests || []).join(', ')}
                  onChange={e => setPreferences(p => ({ ...p, interests: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                  placeholder="例如: 行为经济学, 心理学, 投资"
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-dark-surface border-dark-border text-dark-text placeholder:text-dark-text-muted' : 'bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400'} focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`} />
                <p className={`text-[10px] mt-1 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>用逗号分隔多个兴趣</p>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>自定义指令</label>
                <textarea value={preferences.customInstructions || ''} onChange={e => setPreferences(p => ({ ...p, customInstructions: e.target.value || undefined }))}
                  placeholder="告诉 AI 任何你想让它记住的事...&#10;例如: 我正在准备研究生考试，请侧重考试相关的内容"
                  rows={3}
                  className={`w-full px-3 py-2 rounded-lg border text-sm resize-none ${isDark ? 'bg-dark-surface border-dark-border text-dark-text placeholder:text-dark-text-muted' : 'bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400'} focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`} />
              </div>

              <button onClick={handleSavePreferences}
                className={`flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium rounded-xl hover:shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98] transition-all`}>
                <Save className="w-4 h-4" />保存个性化设置
              </button>
            </>
          )}

          {/* ===== 系统提示词 ===== */}
          {activeTab === 'prompt' && (
            <>
              <div className={`p-4 rounded-xl border ${isDark ? 'bg-amber-950/20 border-amber-900/30' : 'bg-amber-50/50 border-amber-100'}`}>
                <p className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-600'}`}>
                  ⚠️ System Prompt 定义了 AI 的"人格"和行为。留空则使用内置的阅读助手默认提示词。支持 Markdown 格式。
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-xs font-semibold ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>System Prompt</label>
                  <button onClick={handleResetPrompt}
                    className={`text-[11px] px-2 py-0.5 rounded-md ${isDark ? 'text-dark-text-muted hover:text-dark-text-secondary hover:bg-dark-hover' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
                    恢复默认
                  </button>
                </div>
                <textarea value={config.systemPrompt} onChange={e => updateConfig({ systemPrompt: e.target.value })}
                  placeholder={DEFAULT_SYSTEM_PROMPT.slice(0, 100) + '...'}
                  rows={12}
                  className={`w-full px-4 py-3 rounded-xl border text-sm font-mono leading-relaxed resize-none ${isDark ? 'bg-dark-surface border-dark-border text-dark-text placeholder:text-dark-text-muted' : 'bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400'} focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`} />
              </div>

              <div className={`p-3 rounded-xl border ${isDark ? 'border-dark-border' : 'border-slate-200'}`}>
                <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>预览完整 System Prompt（含记忆注入）</p>
                <pre className={`text-[11px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto p-2 rounded-lg ${isDark ? 'bg-dark-bg text-dark-text-muted' : 'bg-slate-50 text-slate-500'}`}>
                  {buildMemoryAwareSystemPrompt(config.systemPrompt || DEFAULT_SYSTEM_PROMPT).slice(0, 2000)}
                  {(buildMemoryAwareSystemPrompt(config.systemPrompt || DEFAULT_SYSTEM_PROMPT).length > 2000) ? '\n...' : ''}
                </pre>
              </div>
            </>
          )}

          {/* ===== 记忆管理 ===== */}
          {activeTab === 'memory' && (
            <>
              <div className={`p-4 rounded-xl border ${isDark ? 'bg-emerald-950/20 border-emerald-900/30' : 'bg-emerald-50/50 border-emerald-100'}`}>
                <p className={`text-xs ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`}>
                  🧠 AI 记忆系统会自动记录你的学习轨迹、笔记和偏好。这些数据帮助 AI 提供更个性化的回复。所有数据仅存储在浏览器本地。
                </p>
              </div>

              {/* Memory stats */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '学习笔记', value: memoryStats.noteCount, color: 'text-blue-500' },
                  { label: '对话次数', value: memoryStats.totalConversations, color: 'text-purple-500' },
                  { label: '总交互次数', value: memoryStats.totalInteractions, color: 'text-emerald-500' },
                  { label: '知识联系', value: memoryStats.connectionCount, color: 'text-amber-500' },
                ].map(stat => (
                  <div key={stat.label} className={`p-3 rounded-xl border ${isDark ? 'border-dark-border' : 'border-slate-200'}`}>
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className={`text-[11px] ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* OpenClaw Long-term Memory */}
              {(() => {
                const oc = loadMemory().openClawMemory;
                if (!oc) return null;
                return (
                  <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-indigo-900/30 bg-indigo-950/10' : 'border-indigo-100 bg-indigo-50/30'}`}>
                    <div className={`px-4 py-3 border-b ${isDark ? 'border-indigo-900/20' : 'border-indigo-100'}`}>
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-500" />
                        <span className={`text-xs font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>OpenClaw 长期记忆</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isDark ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-100 text-indigo-600'}`}>
                          已迁移 {new Date(oc.migratedAt).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3 max-h-72 overflow-y-auto">
                      {/* User Profile */}
                      <div>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>用户画像</p>
                        <div className="space-y-1">
                          {oc.education.map((e, i) => (
                            <p key={`edu-${i}`} className={`text-[11px] ${isDark ? 'text-dark-text-secondary' : 'text-slate-600'}`}>{e}</p>
                          ))}
                          {oc.techBackground.map((e, i) => (
                            <p key={`tech-${i}`} className={`text-[11px] ${isDark ? 'text-dark-text-secondary' : 'text-slate-600'}`}>{e}</p>
                          ))}
                        </div>
                      </div>
                      {/* Cognitive Insights */}
                      <div>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>核心认知洞察</p>
                        <div className="space-y-1.5">
                          {oc.cognitiveInsights.slice(0, 4).map((insight, i) => (
                            <div key={`insight-${i}`} className={`text-[11px] p-2 rounded-lg ${isDark ? 'bg-dark-surface text-dark-text-secondary' : 'bg-white text-slate-600'}`}>
                              {insight}
                            </div>
                          ))}
                          {oc.cognitiveInsights.length > 4 && (
                            <p className={`text-[10px] italic ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>
                              还有 {oc.cognitiveInsights.length - 4} 条洞察...
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Dialog Preferences */}
                      <div>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>对话原则</p>
                        <div className="flex flex-wrap gap-1">
                          {oc.dialogModePreferences.map((pref, i) => (
                            <span key={`dp-${i}`} className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-indigo-900/30 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}`}>
                              {pref}
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* Daily Memory Summary */}
                      <div>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>每日记忆 ({Object.keys(oc.dailyMemories).length} 天)</p>
                        <div className="space-y-1">
                          {Object.entries(oc.dailyMemories).slice(-5).map(([date, summary]) => (
                            <div key={date} className={`text-[11px] p-2 rounded-lg ${isDark ? 'bg-dark-surface' : 'bg-white'}`}>
                              <span className={`font-mono font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>{date}</span>
                              <span className={`ml-2 ${isDark ? 'text-dark-text-secondary' : 'text-slate-600'}`}>{summary}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Projects */}
                      <div>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>已完成项目 ({oc.completedProjects.length})</p>
                        <div className="flex flex-wrap gap-1">
                          {oc.completedProjects.slice(0, 5).map((proj, i) => (
                            <span key={`proj-${i}`} className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-emerald-900/30 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
                              {proj.length > 30 ? proj.slice(0, 30) + '...' : proj}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="space-y-2">
                <button onClick={handleViewMemory}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${isDark ? 'border-dark-border hover:bg-dark-hover text-dark-text' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}>
                  <Eye className="w-4 h-4" />查看完整记忆数据
                </button>
                <button onClick={handleExportMemory}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${isDark ? 'border-dark-border hover:bg-dark-hover text-dark-text' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}>
                  <Download className="w-4 h-4" />导出记忆 (JSON)
                </button>
                <button onClick={handleClearMemory}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/30 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all`}>
                  <Trash2 className="w-4 h-4" />清除所有记忆
                </button>
              </div>

              {/* Import */}
              <div>
                <label className={`block text-xs font-semibold mb-2 ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>导入记忆</label>
                <textarea value={importText} onChange={e => setImportText(e.target.value)}
                  placeholder="粘贴之前导出的 JSON 数据..."
                  rows={3}
                  className={`w-full px-3 py-2 rounded-lg border text-xs font-mono resize-none ${isDark ? 'bg-dark-surface border-dark-border text-dark-text placeholder:text-dark-text-muted' : 'bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400'} focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`} />
                <button onClick={handleImportMemory} disabled={!importText.trim()}
                  className={`mt-2 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${importText.trim() ? 'bg-indigo-500 text-white hover:bg-indigo-600' : isDark ? 'bg-dark-border text-dark-text-muted' : 'bg-slate-100 text-slate-400'} disabled:cursor-not-allowed`}>
                  <Upload className="w-4 h-4" />导入
                </button>
              </div>

              {/* Memory detail view */}
              {showMemoryDetail && memoryData && (
                <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-dark-border' : 'border-slate-200'}`}>
                  <div className={`flex items-center justify-between px-4 py-2 border-b ${isDark ? 'border-dark-border bg-dark-surface' : 'border-slate-100 bg-slate-50'}`}>
                    <span className={`text-xs font-semibold ${isDark ? 'text-dark-text-muted' : 'text-slate-500'}`}>完整记忆数据</span>
                    <button onClick={() => setShowMemoryDetail(false)} className={`p-1 ${isDark ? 'text-dark-text-muted' : 'text-slate-400'}`}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <pre className={`text-[11px] font-mono p-4 overflow-auto max-h-64 ${isDark ? 'bg-dark-bg text-dark-text-muted' : 'bg-slate-50 text-slate-500'}`}>
                    {JSON.stringify(memoryData, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-2 px-6 py-4 border-t ${isDark ? 'border-dark-border' : 'border-slate-100'}`}>
          <button onClick={onClose}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${isDark ? 'text-dark-text-muted hover:bg-dark-hover' : 'text-slate-500 hover:bg-slate-100'}`}>
            取消
          </button>
          <button onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium rounded-xl hover:shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98] transition-all">
            <Save className="w-4 h-4" />保存设置
          </button>
        </div>
      </div>
    </div>
  );
}

// 导出加载函数供 App.tsx 使用
export { loadAIConfig, saveAIConfig };
