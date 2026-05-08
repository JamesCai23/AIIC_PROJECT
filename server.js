import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import cors from 'cors';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://aiic-chatbot.local',
    'X-Title': 'AIIC Chatbot',
  },
});

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
    console.error('OpenRouter API error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'Internal server error' })}\n\n`);
    res.end();
  }
});

const imageModels = ['bytedance-seed/seedream-4.5'];

app.post('/api/generate-image', async (req, res) => {
  const { prompt, model } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const response = await openai.images.generate({
      model: model || imageModels[0],
      prompt,
      n: 1,
    });

    const imageUrl = response.data[0]?.url;
    if (!imageUrl) {
      throw new Error('No image URL returned');
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      throw new Error(`Failed to download image: ${imgRes.statusText}`);
    }

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const filename = `img-${Date.now()}.png`;
    const dir = path.join('public', 'images');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, filename), buffer);

    res.json({ url: `/images/${filename}` });
  } catch (err) {
    console.error('Image generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
