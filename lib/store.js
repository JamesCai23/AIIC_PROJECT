import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const INTERVIEWS_DIR = path.join(DATA_DIR, 'interviews');

// Ensure data directory exists
function ensureDirs() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(INTERVIEWS_DIR)) fs.mkdirSync(INTERVIEWS_DIR, { recursive: true });
    return true;
  } catch (err) {
    console.error('Failed to create data directory:', err.message);
    return false;
  }
}

function generateId() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = crypto.randomBytes(4).toString('hex');
  return `${dateStr}-${rand}`;
}

export function saveInterview(data) {
  if (!ensureDirs()) return null;

  const id = generateId();
  const record = {
    id,
    position: data.position || 'unknown',
    resume: (data.resume || '').slice(0, 2000),
    startTime: data.startTime || new Date().toISOString(),
    duration: data.duration || 0,
    history: data.history || [],
    feedback: data.feedback || null,
    createdAt: new Date().toISOString(),
  };

  const filePath = path.join(INTERVIEWS_DIR, `${id}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    return id;
  } catch (err) {
    console.error('Failed to save interview:', err.message);
    return null;
  }
}

export function listInterviews(limit = 20) {
  if (!ensureDirs()) return [];

  try {
    const files = fs.readdirSync(INTERVIEWS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    return files.map(file => {
      const data = JSON.parse(fs.readFileSync(path.join(INTERVIEWS_DIR, file), 'utf-8'));
      return {
        id: data.id,
        position: data.position,
        startTime: data.startTime,
        duration: data.duration,
        hasFeedback: !!data.feedback,
      };
    });
  } catch (err) {
    console.error('Failed to list interviews:', err.message);
    return [];
  }
}

export function getInterview(id) {
  if (!ensureDirs()) return null;

  const filePath = path.join(INTERVIEWS_DIR, `${id}.json`);
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error('Failed to get interview:', err.message);
    return null;
  }
}

export function formatFeedbackMarkdown(interview) {
  const pos = interview.position || '未知';
  const duration = interview.duration || 0;
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const date = interview.startTime
    ? new Date(interview.startTime).toLocaleString('zh-CN')
    : '未知';

  let md = `# 面试反馈报告\n\n`;
  md += `## 基本信息\n\n`;
  md += `- **面试岗位：** ${pos}\n`;
  md += `- **面试日期：** ${date}\n`;
  md += `- **面试时长：** ${mins}分${secs}秒\n\n`;
  md += `---\n\n`;

  if (interview.feedback) {
    md += interview.feedback;
  } else {
    md += '*暂无反馈内容*\n';
  }

  md += `\n\n---\n\n`;
  md += `*本报告由 AI 面试官自动生成*\n`;

  return md;
}
