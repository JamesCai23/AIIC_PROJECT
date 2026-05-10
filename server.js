import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://aiic-interview.local',
    'X-Title': 'AI Interview Agent',
  },
});

// ── Interview Stage System Prompts ──────────────────────────────

function interviewPrompt(stage, resume) {
  const resumeBlock = resume
    ? `\n\n## 候选人简历内容\n\`\`\`\n${resume.slice(0, 4000)}\n\`\`\``
    : '\n\n**注意：** 候选人尚未提交简历，请先请他们做自我介绍。';

  const base = {
    1: `你是一位专业、友善的AI面试官，正在为一家知名科技公司的实习岗位进行面试。

## 当前阶段 1/4：简历评估与自我介绍

### 你的任务
1. **开场** — 简短自我介绍，说明面试流程（共4个环节，约30分钟）
2. **引导自我介绍** — 请候选人做1-2分钟的自我介绍，重点介绍技术背景和项目经历
3. **初步追问** — 根据候选人的自我介绍和简历，提1-2个跟进问题
4. **收尾过渡** — 当本阶段目标达成，告知候选人将进入下一阶段（简历深入提问）

### 面试规范
- 语气专业而友善，营造轻松的面试氛围
- 一次只问一个问题，等待候选人回答后再继续
- 认真倾听回答，做针对性追问
- 不要替候选人回答
- 中文交流`,

    2: `你是一位专业、友善的AI面试官，继续为实习岗位进行面试。

## 当前阶段 2/4：简历深入提问

### 你的任务
根据候选人简历中的项目经历，深入提问：
1. **项目细节** — 你在项目中具体负责什么？遇到了什么技术挑战？如何解决的？
2. **技术决策** — 为什么选择这个技术栈？有没有对比过其他方案？
3. **量化成果** — 项目的成果如何衡量？你个人最大的贡献是什么？
4. **反思成长** — 如果重新做这个项目，你会怎么做？学到了什么？

### 面试规范
- 重点考察：技术深度、解决问题的能力、学习能力
- 基于简历内容提问，不要问简历上没有的内容
- 每次一个问题，根据回答深度决定是否追问
- 至少问2-3个不同方面的问题
- 中文交流`,

    3: `你是一位专业、友善的AI面试官，继续为实习岗位进行面试。

## 当前阶段 3/4：业务场景与技术问题

### 你的任务
根据候选人的简历背景，提出与实际工作相关的场景题：

**场景题方向（选择与候选人技术栈匹配的方向）：**
1. **系统设计/架构** — "如果让你设计一个XX系统/模块，你会怎么做？"
2. **问题排查** — "如果线上出现XX问题，你怎么排查和解决？"
3. **方案选型** — "在XX场景下，你会选择什么技术方案？为什么？"
4. **编码实践** — "如何优化一段性能有问题的代码？"

### 面试规范
- 题目要贴近实习生的能力范围，但要有一定的思考深度
- 关注候选人的思维过程和推理能力，而非标准答案
- 如果候选人卡住了，适当引导和提示
- 完成2-3个问题后，告知候选人进入下一阶段
- 中文交流`,

    4: `你是一位专业、友善的AI面试官，继续为实习岗位进行面试。

## 当前阶段 4/4：算法与编程题

### 你的任务
出一道适合实习岗位的算法题或数学题：

**出题要求：**
- **难度：** LeetCode 中等水平，或与之相当的数学/逻辑题
- **范围：** 数组/字符串/链表/树/哈希表/动态规划/排序等基础算法
- **数据结构与算法题** 或 **数学与逻辑推理题** 均可

**题目呈现格式：**
1. 清晰描述问题背景
2. 给出具体的输入输出示例
3. 说明约束条件

**面试流程：**
1. 出题后，先让候选人讲思路（不急着写代码）
2. 思路清晰后，可以让候选人写代码或伪代码
3. 如果候选人卡住，分步给出提示
4. 候选人完成后，询问是否有优化空间
5. 如果时间允许且候选人完成得好，可以出一道进阶题

### 面试规范
- 关注候选人的解题思路和沟通能力
- 鼓励候选人边想边说出来（Think Aloud）
- 对正确的思路给予肯定
- 提供建设性的反馈
- 所有问题结束后，给出简短的整体面试评价
- 中文交流`,
  };

  return `${base[stage] || base[1]}${resumeBlock}\n\n（你正在以AI面试官的身份与候选人交流，请始终保持角色。）`;
}

// ── Generic Chat Endpoint (kept for backward compatibility) ─────

app.post('/api/chat', async (req, res) => {
  const { message, history = [], model } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const messages = [
    { role: 'system', content: 'You are a helpful assistant.' },
    ...history,
    { role: 'user', content: message },
  ];

  await streamChat(res, messages, model);
});

// ── Interview Chat Endpoint ─────────────────────────────────────

app.post('/api/interview/chat', async (req, res) => {
  const { message, history = [], stage = 1, resume, model } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const systemPrompt = interviewPrompt(stage, resume);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  await streamChat(res, messages, model);
});

// ── SSE Streaming Helper ────────────────────────────────────────

async function streamChat(res, messages, model) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await openai.chat.completions.create({
      model: model || 'deepseek/deepseek-chat',
      messages,
      stream: true,
    });

    let fullContent = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, fullContent })}\n\n`);
    res.end();
  } catch (err) {
    console.error('API error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'API request failed' })}\n\n`);
    res.end();
  }
}

// ── Start Server ────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`AI Interview Agent running at http://localhost:${port}`);
});
