import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { getPositions, getSkillContent } from './lib/skills-loader.js';
import { streamChat } from './lib/stream.js';
import { saveInterview, listInterviews, getInterview, formatFeedbackMarkdown } from './lib/store.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public', {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

// ── Interview Prompt Builder ────────────────────────────────────

function interviewPrompt(stage, resume, positionId) {
  const positions = getPositions();
  const pos = positions[positionId] || positions['algorithm'];
  const stageContent = pos?.stages?.[stage];

  const resumeBlock = resume
    ? `\n\n## 候选人简历内容\n\`\`\`\n${resume.slice(0, 4000)}\n\`\`\``
    : '\n\n**注意：** 候选人尚未提交简历，请先请他们做自我介绍。';

  if (stageContent) {
    return `${stageContent}${resumeBlock}\n\n（你正在以AI面试官的身份与候选人交流，请始终保持角色。）`;
  }

  return `你是一位专业、友善的AI面试官，正在为一家知名科技公司的实习岗位进行面试。\n\n当前阶段 ${stage}/4${resumeBlock}\n\n（你正在以AI面试官的身份与候选人交流，请始终保持角色。）`;
}

function feedbackPrompt(feedbackSkill, history) {
  const content = feedbackSkill?.stages?.[1] || feedbackSkill?.meta?.description || '';
  const historyBlock = history.length > 0
    ? `\n\n## 面试对话记录\n\`\`\`\n${history.map(m =>
        `${m.role === 'assistant' ? '面试官' : '候选人'}：${m.content}`
      ).join('\n').slice(0, 8000)}\n\`\`\``
    : '';

  return `${content}${historyBlock}\n\n请根据以上对话记录撰写反馈报告。`;
}

// ── Get all positions ───────────────────────────────────────────

app.get('/api/positions', (req, res) => {
  const positions = getPositions();
  const list = Object.entries(positions)
    .filter(([_, p]) => p.meta.stageLabels) // only actual positions, not feedback
    .map(([id, p]) => ({
      id,
      ...p.meta,
    }));
  res.json(list);
});

// ── Generic Chat Endpoint ───────────────────────────────────────

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
  const { message, history = [], stage = 1, resume, model, position } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const systemPrompt = interviewPrompt(stage, resume, position);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  await streamChat(res, messages, model);
});

// ── Interview Complete / Feedback ───────────────────────────────

app.post('/api/interview/complete', async (req, res) => {
  const { position, resume, history, duration, startTime } = req.body;

  if (!history || history.length === 0) {
    return res.status(400).json({ error: 'History is required' });
  }

  const feedbackSkill = getSkillContent('feedback');
  const systemContent = feedbackPrompt(feedbackSkill, history);

  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: '请根据以上面试对话记录，撰写完整的面试反馈报告。' },
  ];

  // Set up SSE manually so we can capture full feedback text
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let fullFeedback = '';

  try {
    const { default: OpenAI } = await import('openai');

    const openai = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY,
    });

    const stream = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullFeedback += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
  } catch (err) {
    console.error('Feedback API error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'Feedback generation failed' })}\n\n`);
    res.end();
    return;
  }

  // Stream done event
  res.write(`data: ${JSON.stringify({ done: true, fullContent: fullFeedback })}\n\n`);

  // Save interview with the generated feedback
  const id = saveInterview({
    position,
    resume,
    startTime: startTime || new Date().toISOString(),
    duration: duration || 0,
    history,
    feedback: fullFeedback,
  });

  // Send interview ID as metadata
  if (id) {
    res.write(`data: ${JSON.stringify({ meta: { interviewId: id } })}\n\n`);
  }

  res.end();
});

// ── List past interviews ────────────────────────────────────────

app.get('/api/interviews', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(listInterviews(limit));
});

// ── Get single interview ────────────────────────────────────────

app.get('/api/interviews/:id', (req, res) => {
  const data = getInterview(req.params.id);
  if (!data) return res.status(404).json({ error: 'Interview not found' });
  res.json(data);
});

// ── Download feedback as markdown ───────────────────────────────

app.get('/api/interviews/:id/download', (req, res) => {
  const data = getInterview(req.params.id);
  if (!data) return res.status(404).json({ error: 'Interview not found' });

  const md = formatFeedbackMarkdown(data);
  const filename = `面试反馈-${data.position}-${(data.id || '').split('-')[0]}.md`;

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(md);
});

// ── TTS Endpoint ─────────────────────────────────────────────────

app.post('/api/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  try {
    const result = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ALI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'cosyvoice-v3-flash',
        input: {
          text: text.slice(0, 1000),
          voice: 'longanyang',
          format: 'mp3',
        },
      }),
    });

    const data = await result.json();
    if (!data.output?.audio?.url) {
      throw new Error(data.message || 'TTS API failed');
    }

    const audioRes = await fetch(data.output.audio.url);
    res.setHeader('Content-Type', 'audio/mpeg');
    const { Readable } = await import('stream');
    Readable.fromWeb(audioRes.body).pipe(res);
  } catch (err) {
    console.error('TTS error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start Server ────────────────────────────────────────────────

app.listen(port, () => {
  const positions = getPositions();
  console.log(`Loaded positions: ${Object.keys(positions).join(', ')}`);
  console.log(`AI Interview Agent running at http://localhost:${port}`);
});
