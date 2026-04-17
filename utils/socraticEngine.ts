import { Message, SocraticQuestion, Concept, CognitiveStage, STAGE_ORDER } from '@/types/book';

// 回答评估结果
interface AnswerEvaluation {
  level: number; // 0=精准, 1=部分正确, 2=方向对了, 3=偏离
  confidence: number; // 0-1 置信度
  matchedConcepts: string[]; // 匹配到的核心概念
  missingPoints: string[]; // 缺少的关键点
}

// 各认知阶段的引导策略
const STAGE_STRATEGIES: Record<CognitiveStage, {
  intro: (conceptName: string) => string;
  evaluate: (evaluation: AnswerEvaluation, concept: Concept) => string;
  completion: (conceptName: string) => string;
}> = {
  understand: {
    intro: (name) => `让我们先来理解「${name}」的核心含义。\n\n我不会直接告诉你答案——我想先听听你自己的想法：你觉得这个概念是什么意思？`,
    evaluate: (evaluation, concept) => {
      if (evaluation.level <= 1) return '你对核心概念的理解很不错！接下来，试着用你自己的话，向一个完全没接触过这个概念的人解释它。';
      if (evaluation.level === 2) return '方向对了，但还不够精确。试着从"它是什么""它不是什么"两个角度来描述这个概念。';
      return '让我们换个角度来理解这个概念。想想看，在你的日常生活中，有没有遇到过类似的现象？';
    },
    completion: (name) => `很好！你已经理解了「${name}」的核心含义。接下来，让我们试着把这个概念应用到具体情境中。`,
  },
  apply: {
    intro: (name) => `理解了概念还不够，让我们把「${name}」应用到实际情境中。\n\n我会给你一个场景，你来分析其中体现的原理。`,
    evaluate: (evaluation, concept) => {
      if (evaluation.level <= 1) return '分析得很到位！你已经能把概念和实际场景联系起来了。再想想，在完全不同的领域，这个概念也能适用吗？';
      if (evaluation.level === 2) return '思路对了！不过你可以更精确地分析。想想看，这个场景中的哪些具体细节体现了这个概念的机制？';
      return '让我给你一个提示：试着把场景拆开——先识别关键要素，再看它们之间的关系。';
    },
    completion: (name) => `你已经能把「${name}」灵活应用了！接下来，让我们回头整理一下你的理解，把零散的知识编织成网络。`,
  },
  review: {
    intro: (name) => `让我们来复习和巩固「${name}」的理解。\n\n我会通过提问来检验你的记忆和理解深度。`,
    evaluate: (evaluation, concept) => {
      if (evaluation.level <= 1) return '你的理解很扎实！不过我想挑战你一下：这个概念在什么情况下会失效？你能想到反例吗？';
      if (evaluation.level === 2) return '你记得大部分内容。让我帮你补充一个关键点：这个概念和之前学的其他概念之间有什么联系？';
      return '看来有些地方需要回顾。让我给你一个提示，帮你想起来……';
    },
    completion: (name) => `「${name}」的知识网络已经建立了！最后一步，让我们从更高维度来审视这个概念，看看能不能发现新的认知。`,
  },
  create: {
    intro: (name) => `最后一个阶段——让我们从更高维度来审视「${name}」。\n\n我不会再给你标准答案，我想和你一起探索：这个概念有没有内在的矛盾？你有没有产生新的理解？`,
    evaluate: (evaluation, concept) => {
      if (evaluation.level <= 1) return '你的洞察很有深度！这让我想到了另一个问题：你发现的这个规律，是否在其他领域也能找到对应？';
      if (evaluation.level === 2) return '你开始触碰到了更深层的思考。试着把你的想法推到极致——如果这个概念不成立，世界会怎样？';
      return '大胆思考！这里没有"标准答案"。你觉得这个概念最大的价值是什么？它最大的局限又是什么？';
    },
    completion: (name) => `你已经完成了对「${name}」的四阶段认知旅程！你不仅理解了概念，还能应用它、建立知识网络，并产出了自己的见解。这才是真正的"掌握"。`,
  },
};

export class SocraticEngine {
  private currentQuestion: SocraticQuestion | null = null;
  private questionIndex: number = 0;
  private correctAnswers: number = 0;
  private conversationHistory: Message[] = [];
  private questions: SocraticQuestion[] = [];
  private minCorrectAnswers: number = 2;
  private concept: Concept | null = null;
  private failedAttemptsOnCurrentQuestion: number = 0;
  private hasGivenHint: boolean = false;
  // 四阶段认知流程
  private currentStage: CognitiveStage = 'understand';
  private stageInteractionCount: number = 0;
  private stageCorrectCount: number = 0;
  private readonly STAGE_ADVANCE_THRESHOLD = 2; // 每阶段需要答对2次才能推进

  constructor(questions: SocraticQuestion[], minCorrectAnswers: number = 2, concept?: Concept, initialStage: CognitiveStage = 'understand') {
    this.questions = questions;
    this.minCorrectAnswers = minCorrectAnswers;
    this.concept = concept || null;
    this.questionIndex = 0;
    this.currentQuestion = questions[0] || null;
    this.currentStage = initialStage;
  }

  // 获取当前认知阶段
  getCurrentStage(): CognitiveStage {
    return this.currentStage;
  }

  // 获取阶段进度
  getStageProgress(): { stage: CognitiveStage; interactions: number; correct: number; threshold: number; stageIndex: number; totalStages: number } {
    return {
      stage: this.currentStage,
      interactions: this.stageInteractionCount,
      correct: this.stageCorrectCount,
      threshold: this.STAGE_ADVANCE_THRESHOLD,
      stageIndex: STAGE_ORDER.indexOf(this.currentStage),
      totalStages: STAGE_ORDER.length,
    };
  }

  // 获取当前阶段的引导开场白
  getStageIntro(): string {
    if (!this.concept) return '';
    return STAGE_STRATEGIES[this.currentStage].intro(this.concept.name);
  }

  // 检查阶段是否可以推进
  private shouldAdvanceStage(): boolean {
    return this.stageCorrectCount >= this.STAGE_ADVANCE_THRESHOLD;
  }

  // 推进到下一阶段
  private advanceStage(): { advanced: boolean; message: string; isMastered: boolean } {
    const currentIdx = STAGE_ORDER.indexOf(this.currentStage);
    if (currentIdx >= STAGE_ORDER.length - 1) {
      // 已经是最后一个阶段(创造)，完成掌握
      return { advanced: false, message: STAGE_STRATEGIES[this.currentStage].completion(this.concept?.name || ''), isMastered: true };
    }
    this.currentStage = STAGE_ORDER[currentIdx + 1];
    this.stageInteractionCount = 0;
    this.stageCorrectCount = 0;
    const completionMsg = STAGE_STRATEGIES[STAGE_ORDER[currentIdx]].completion(this.concept?.name || '');
    const introMsg = STAGE_STRATEGIES[this.currentStage].intro(this.concept?.name || '');
    return { advanced: true, message: `${completionMsg}\n\n${introMsg}`, isMastered: false };
  }

  getCurrentQuestion(): SocraticQuestion | null {
    return this.currentQuestion;
  }

  getConversationHistory(): Message[] {
    return this.conversationHistory;
  }

  getCorrectAnswers(): number {
    return this.correctAnswers;
  }

  getProgress(): { current: number; total: number; correct: number } {
    return {
      current: this.questionIndex + 1,
      total: this.questions.length,
      correct: this.correctAnswers
    };
  }

  isMastered(): boolean {
    return this.correctAnswers >= this.minCorrectAnswers;
  }

  // 核心方法：评估用户回答
  private evaluateUserAnswer(userAnswer: string, question: SocraticQuestion): AnswerEvaluation {
    const answer = userAnswer.toLowerCase().trim();
    
    // 如果回答太短（少于3个字），大概率是在敷衍或不确定
    if (answer.length < 3) {
      return { level: 3, confidence: 0.9, matchedConcepts: [], missingPoints: ['请详细说明你的想法'] };
    }

    // 核心概念关键词库 - 根据 concept 的 ID 来判断
    const conceptKeywords: Record<string, string[][]> = {
      // 每个 concept 对应多组关键词，每组代表一个核心要点
      'system1': [
        ['快', '快速', '迅速', '自动', '直觉', '本能', '无意识', '不经思考', '毫不费力', '不费力'],
        ['习惯', '经验', '熟练', '技能', '肌肉记忆', '条件反射', '自然反应'],
        ['情绪', '表情', '判断', '印象', '感觉', '第一反应']
      ],
      'system2': [
        ['慢', '缓慢', '费力', '需要努力', '专注', '集中', '注意力', '刻意', '有意识'],
        ['逻辑', '分析', '推理', '计算', '理性', '深思熟虑', '思考', '比较'],
        ['控制', '监督', '检查', '纠正', '介入', '接管', '抑制']
      ],
      'anchoring': [
        ['锚', '锚定', '锚点', '参考点', '基准', '起始', '出发点'],
        ['影响', '偏差', '误导', '左右', '偏向', '参考', '依赖'],
        ['数字', '价格', '初始', '先入为主', '第一印象', '首次']
      ],
      'availability': [
        ['容易想起', '容易回忆', '记忆', '印象', '容易获取', '容易想到', '浮现'],
        ['媒体', '新闻', '报道', '曝光', '宣传', '传播'],
        ['高估', '误判', '偏见', '偏差', '频率', '概率']
      ],
      'loss-aversion': [
        ['损失', '失去', '亏损', '失去更痛苦', '不想失去', '怕损失'],
        ['两倍', '2倍', '更强烈', '不对称', '痛苦大于快乐'],
        ['持有', '不舍', '惜售', '不愿卖', '不甘心', '处置效应']
      ],
      'framing': [
        ['表达', '措辞', '描述', '说法', '呈现', '包装', '框架', '表述'],
        ['不同选择', '不同决策', '改变判断', '影响选择', '误导'],
        ['获得', '损失', '正面', '负面', '积极', '消极']
      ],
      'overconfidence': [
        ['高估', '过度自信', '盲目乐观', '自以为是', '太自信', '自负'],
        ['判断', '能力', '预测', '估计', '决策', '误判'],
        ['错觉', '偏差', '认知偏差', '偏见', '盲目']
      ],
      'peak-end': [
        ['高峰', '峰值', '最高点', '最强烈', '最深刻', '最难忘'],
        ['结尾', '结束', '终点', '最后', '收尾', '尾声'],
        ['记忆', '评价', '印象', '回忆', '感受']
      ],
      'endowment': [
        ['拥有', '属于', '我的', '自己', '占有'],
        ['高估', '不舍', '依恋', '情感', '依恋', '舍不得'],
        ['估值', '价值', '价格', '卖出', '放弃']
      ]
    };

    // 获取当前概念的关键词组
    const conceptId = this.concept?.id || '';
    const keywordGroups = conceptKeywords[conceptId] || [];
    
    let matchedGroups = 0;
    let matchedConcepts: string[] = [];
    let missingPoints: string[] = [];

    // 检查每组关键词
    keywordGroups.forEach((group, index) => {
      const groupMatched = group.some(keyword => answer.includes(keyword));
      if (groupMatched) {
        matchedGroups++;
        matchedConcepts.push(...group.filter(k => answer.includes(k)));
      } else {
        // 这组没匹配到，说明缺少这个要点
        const groupLabels = [
          '核心特征', '具体表现/例子', '深层影响/机制'
        ];
        missingPoints.push(groupLabels[index] || `要点${index + 1}`);
      }
    });

    // 根据匹配程度确定层级
    const matchRatio = keywordGroups.length > 0 ? matchedGroups / keywordGroups.length : 0;
    
    let level: number;
    if (matchRatio >= 0.6) {
      level = 0; // 精准
    } else if (matchRatio >= 0.3) {
      level = 1; // 部分正确
    } else if (matchedGroups > 0) {
      level = 2; // 方向对了
    } else {
      // 即使没有匹配到预设关键词，检查是否有合理的内容
      if (answer.length > 20) {
        level = 2; // 长回答，可能方向对了但用的不同词汇
      } else {
        level = 3; // 需要引导
      }
    }

    return {
      level,
      confidence: matchRatio,
      matchedConcepts,
      missingPoints
    };
  }

  // 根据评估结果生成回应
  evaluateAnswer(userAnswer: string): {
    isCorrect: boolean;
    feedback: string;
    quote: string;
    isEncouragement: boolean;
    isGuidance: boolean;
    shouldContinue: boolean;
    isMastered: boolean;
    stageAdvanced?: boolean;
    newStage?: CognitiveStage;
  } {
    if (!this.currentQuestion) {
      return {
        isCorrect: false,
        feedback: '没有更多问题了。',
        quote: '',
        isEncouragement: false,
        isGuidance: false,
        shouldContinue: false,
        isMastered: this.isMastered()
      };
    }

    this.stageInteractionCount++;
    const evaluation = this.evaluateUserAnswer(userAnswer, this.currentQuestion);
    
    // 找到匹配的引导层级
    const guidance = this.currentQuestion.guidanceLevels.find(g => g.level === evaluation.level);
    const defaultGuidance = this.currentQuestion.guidanceLevels[this.currentQuestion.guidanceLevels.length - 1];
    const matchedGuidance = guidance || defaultGuidance;

    // 根据层级决定行为
    if (evaluation.level <= 1) {
      // 回答正确或部分正确
      this.correctAnswers++;
      this.stageCorrectCount++;
      this.failedAttemptsOnCurrentQuestion = 0;
      this.hasGivenHint = false;
      this.questionIndex++;
      
      // 检查是否应该推进认知阶段
      if (this.shouldAdvanceStage()) {
        const stageResult = this.advanceStage();
        if (stageResult.isMastered) {
          this.currentQuestion = null;
          return {
            isCorrect: true,
            feedback: stageResult.message,
            quote: this.questions[Math.min(this.questionIndex - 1, this.questions.length - 1)]?.quote || '',
            isEncouragement: true,
            isGuidance: false,
            shouldContinue: false,
            isMastered: true,
          };
        }
        // 阶段推进了
        return {
          isCorrect: true,
          feedback: matchedGuidance.response + '\n\n---\n\n' + stageResult.message,
          quote: evaluation.level === 0 ? (this.questions[this.questionIndex - 1]?.quote || '') : '',
          isEncouragement: evaluation.level === 0,
          isGuidance: false,
          shouldContinue: true,
          isMastered: false,
          stageAdvanced: true,
          newStage: this.currentStage,
        };
      }

      // 检查是否已经达到掌握标准（通过问题数）
      if (this.isMastered()) {
        this.currentQuestion = null;
        return {
          isCorrect: true,
          feedback: matchedGuidance.response,
          quote: this.questions[Math.min(this.questionIndex - 1, this.questions.length - 1)]?.quote || '',
          isEncouragement: true,
          isGuidance: false,
          shouldContinue: false,
          isMastered: true
        };
      }

      // 移动到下一个问题
      if (this.questionIndex < this.questions.length) {
        this.currentQuestion = this.questions[this.questionIndex];
        const nextQ = matchedGuidance.followUpQuestion || this.currentQuestion.question;
        return {
          isCorrect: true,
          feedback: matchedGuidance.response,
          quote: evaluation.level === 0 ? (this.questions[this.questionIndex - 1]?.quote || '') : '',
          isEncouragement: evaluation.level === 0,
          isGuidance: evaluation.level === 1,
          shouldContinue: true,
          isMastered: false,
        };
      } else {
        this.currentQuestion = null;
        return {
          isCorrect: true,
          feedback: matchedGuidance.response,
          quote: '',
          isEncouragement: true,
          isGuidance: false,
          shouldContinue: false,
          isMastered: this.isMastered()
        };
      }
    } else {
      // 回答不够准确，需要引导
      this.failedAttemptsOnCurrentQuestion++;
      
      let feedback = matchedGuidance.response;
      
      // 注入阶段特定的引导
      if (this.concept) {
        const stageFeedback = STAGE_STRATEGIES[this.currentStage].evaluate(evaluation, this.concept);
        if (this.failedAttemptsOnCurrentQuestion >= 2) {
          feedback = stageFeedback;
        }
      }
      
      // 如果连续失败多次，给出更强的提示
      if (this.failedAttemptsOnCurrentQuestion >= 3 && !this.hasGivenHint) {
        this.hasGivenHint = true;
        feedback = `我换个角度来帮你理解：\n\n${feedback}\n\n${this.currentQuestion.guidanceLevels.find(g => g.level === 3)?.response || ''}`;
      }
      
      // 如果失败超过5次，直接给答案并进入下一题
      if (this.failedAttemptsOnCurrentQuestion >= 5) {
        this.failedAttemptsOnCurrentQuestion = 0;
        this.hasGivenHint = false;
        this.questionIndex++;
        
        if (this.questionIndex < this.questions.length) {
          this.currentQuestion = this.questions[this.questionIndex];
          return {
            isCorrect: false,
            feedback: `没关系，让我来分享一下我的理解：\n\n${this.currentQuestion?.quote || ''}\n\n我们换个话题继续探讨吧。`,
            quote: this.questions[this.questionIndex - 1]?.quote || '',
            isEncouragement: false,
            isGuidance: true,
            shouldContinue: true,
            isMastered: false
          };
        }
      }

      return {
        isCorrect: false,
        feedback,
        quote: '',
        isEncouragement: false,
        isGuidance: true,
        shouldContinue: true,
        isMastered: false
      };
    }
  }

  // 获取下一个问题文本
  getNextQuestionText(): string | null {
    if (!this.currentQuestion) return null;
    return this.currentQuestion.question;
  }

  getHint(): string {
    return this.currentQuestion?.guidanceLevels.find(g => g.level === 3)?.response || '请再思考一下。';
  }

  reset(stage?: CognitiveStage): void {
    this.questionIndex = 0;
    this.correctAnswers = 0;
    this.conversationHistory = [];
    this.failedAttemptsOnCurrentQuestion = 0;
    this.hasGivenHint = false;
    this.currentQuestion = this.questions[0] || null;
    this.currentStage = stage || 'understand';
    this.stageInteractionCount = 0;
    this.stageCorrectCount = 0;
  }
}

// 思维碰撞引擎
export class CollisionEngine {
  private concept: Concept;
  private conversationHistory: Message[] = [];
  private usedPerspectives: Set<number> = new Set();
  private usedChallenges: Set<number> = new Set();
  private turnCount: number = 0;

  constructor(concept: Concept) {
    this.concept = concept;
  }

  // 根据用户输入生成回应
  generateResponse(userInput: string): {
    content: string;
    isQuote: boolean;
    shouldChallenge: boolean;
  } {
    this.turnCount++;
    const input = userInput.toLowerCase().trim();
    
    // 检查用户是否提出了问题
    const isQuestion = input.includes('?') || input.includes('？') || 
                      input.startsWith('为什么') || input.startsWith('怎么') || 
                      input.startsWith('如何') || input.startsWith('什么') ||
                      input.startsWith('是不是') || input.startsWith('能不能');

    // 检查用户是否表达了观点
    const hasOpinion = input.includes('我觉得') || input.includes('我认为') || 
                      input.includes('我的看法') || input.includes('在我看来') ||
                      input.includes('感觉') || input.includes('相信');

    // 检查用户是否表达了困惑
    const isConfused = input.includes('不懂') || input.includes('不理解') || 
                      input.includes('困惑') || input.includes('矛盾') ||
                      input.includes('矛盾') || input.includes('搞不清');

    let content = '';
    let isQuote = false;
    let shouldChallenge = false;

    if (isConfused) {
      // 用户困惑时，给予清晰解释并引用原文
      const quote = this.getRandomQuote();
      content = `我理解你的困惑，这个概念确实不容易一下子搞清楚。\n\n让我用一个角度来解释：${this.getRandomPerspective()}\n\n书中这样写道：\n${quote}`;
      isQuote = true;
    } else if (isQuestion) {
      // 用户提问，回答并抛出新角度
      const perspective = this.getRandomPerspective();
      const challenge = this.getRandomChallenge();
      content = `好问题！${perspective}\n\n不过我也想反问你：${challenge}`;
      shouldChallenge = true;
    } else if (hasOpinion) {
      // 用户表达观点，挑战和拓展
      const challenge = this.getRandomChallenge();
      const quote = this.getRandomQuote();
      if (this.turnCount % 3 === 0) {
        // 每3轮引用一次原文
        content = `你的观点很有深度！让我引用书中的一段话来拓展：\n\n${quote}\n\n${challenge}`;
        isQuote = true;
      } else {
        content = `你的思考方式很有意思！\n\n${this.getRandomPerspective()}\n\n不过我想挑战一下你的想法：${challenge}`;
        shouldChallenge = true;
      }
    } else {
      // 一般回应，引导深入讨论
      const perspective = this.getRandomPerspective();
      content = `你说的让我想到了一个角度：\n\n${perspective}\n\n你怎么看这个观点？它和你的想法有什么异同？`;
    }

    // 如果所有视角都用过了，重置
    if (this.usedPerspectives.size >= (this.concept.collisionTopics[0]?.perspectives.length || 1)) {
      this.usedPerspectives.clear();
    }
    if (this.usedChallenges.size >= (this.concept.collisionTopics[0]?.challengeQuestions.length || 1)) {
      this.usedChallenges.clear();
    }

    return { content, isQuote, shouldChallenge };
  }

  private getRandomQuote(): string {
    const quotes = this.concept.quotes;
    return quotes[Math.floor(Math.random() * quotes.length)];
  }

  private getRandomPerspective(): string {
    const topics = this.concept.collisionTopics;
    if (topics.length === 0) return '这是一个值得深入探讨的话题。';
    
    const topic = topics[0];
    const available = topic.perspectives.filter((_, i) => !this.usedPerspectives.has(i));
    if (available.length === 0) {
      this.usedPerspectives.clear();
      return topic.perspectives[Math.floor(Math.random() * topic.perspectives.length)];
    }
    
    const index = topic.perspectives.indexOf(available[Math.floor(Math.random() * available.length)]);
    this.usedPerspectives.add(index);
    return topic.perspectives[index];
  }

  private getRandomChallenge(): string {
    const topics = this.concept.collisionTopics;
    if (topics.length === 0) return '你还能从其他角度思考这个问题吗？';
    
    const topic = topics[0];
    const available = topic.challengeQuestions.filter((_, i) => !this.usedChallenges.has(i));
    if (available.length === 0) {
      this.usedChallenges.clear();
      return topic.challengeQuestions[Math.floor(Math.random() * topic.challengeQuestions.length)];
    }
    
    const index = topic.challengeQuestions.indexOf(available[Math.floor(Math.random() * available.length)]);
    this.usedChallenges.add(index);
    return topic.challengeQuestions[index];
  }

  getStarterMessage(): string {
    const topics = this.concept.collisionTopics;
    if (topics.length === 0) {
      return `欢迎来到"思维的碰撞"！我们可以自由讨论"${this.concept.name}"。\n\n你想从哪个角度开始？`;
    }
    const topic = topics[0];
    return `欢迎来到"思维的碰撞"！\n\n${topic.description}\n\n${topic.starterQuestion}`;
  }

  reset(): void {
    this.conversationHistory = [];
    this.usedPerspectives.clear();
    this.usedChallenges.clear();
    this.turnCount = 0;
  }
}
