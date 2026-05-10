import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// ── Skill / Position Loader ──────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, 'skills');

function parseSkillFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Parse JSON metadata from code block
  const metaMatch = content.match(/```json\n([\s\S]*?)```/);
  const meta = metaMatch ? JSON.parse(metaMatch[1]) : {};

  // Parse stage sections: ## 阶段 N ... (until next ## 阶段 or end of file)
  const stageRegex = /## 阶段 (\d)[\s\S]*?(?=## 阶段 \d|$)/g;
  const stages = {};
  let match;
  while ((match = stageRegex.exec(content)) !== null) {
    stages[parseInt(match[1])] = match[0].trim();
  }

  return { meta, stages };
}

function loadAllPositions() {
  const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md'));
  const positions = {};
  for (const file of files) {
    const id = file.replace('.md', '');
    positions[id] = parseSkillFile(path.join(SKILLS_DIR, file));
  }
  return positions;
}

const positions = loadAllPositions();
console.log(`Loaded positions: ${Object.keys(positions).join(', ')}`);

// ── Interview Prompt Builder ────────────────────────────────────

function interviewPrompt(stage, resume, positionId) {
  const pos = positions[positionId] || positions['algorithm'];
  const stageContent = pos.stages[stage];

  const resumeBlock = resume
    ? `\n\n## 候选人简历内容\n\`\`\`\n${resume.slice(0, 4000)}\n\`\`\``
    : '\n\n**注意：** 候选人尚未提交简历，请先请他们做自我介绍。';

  if (stageContent) {
    return `${stageContent}${resumeBlock}\n\n（你正在以AI面试官的身份与候选人交流，请始终保持角色。）`;
  }

  // Fallback (shouldn't happen)
  return `你是一位专业、友善的AI面试官，正在为一家知名科技公司的实习岗位进行面试。\n\n当前阶段 ${stage}/4${resumeBlock}\n\n（你正在以AI面试官的身份与候选人交流，请始终保持角色。）`;
}

// ── Get all positions (for frontend) ────────────────────────────

app.get('/api/positions', (req, res) => {
  const list = Object.entries(positions).map(([id, p]) => ({
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

// ── SSE Streaming Helper ────────────────────────────────────────

async function streamChat(res, messages, model) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await openai.chat.completions.create({
      model: model || 'deepseek-chat',
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
  console.log(`AI Interview Agent running at http://localhost:${port}`);
});
