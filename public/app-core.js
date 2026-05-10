// ── State ────────────────────────────────────────────────────────
const state = {
  phase: 'lobby',
  stage: 1,
  position: 'algorithm',
  resume: '',
  history: [],
  isStreaming: false,
  isRecording: false,
  recognition: null,
  cameraStream: null,
  timerInterval: null,
  elapsedSeconds: 0,
  ttsEnabled: true,
  positions: [],
  interviewId: null,  // set after feedback is saved
};

const STAGE_LABELS = { 1: '自我介绍', 2: '简历提问', 3: '场景技术', 4: '算法挑战' };
let POSITION_STAGE_LABELS = null;

function getStageLabel(stage) {
  if (POSITION_STAGE_LABELS) return POSITION_STAGE_LABELS[stage] || STAGE_LABELS[stage];
  return STAGE_LABELS[stage];
}

function getSystemMessage(msg) {
  if (msg === '__START_INTERVIEW__') return '请开始面试';
  const m = msg.match(/^__START_STAGE__(\d)$/);
  if (m) return `我们已经进入下一阶段（${getStageLabel(parseInt(m[1]))}），请根据本阶段要求继续面试。`;
  if (msg === '__END_INTERVIEW__') return '面试已结束，请对候选人的整体表现做出评价和总结，给出反馈。';
  return msg;
}

// ── DOM refs ────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const lobby = $('lobby');
const meeting = $('meeting');
const transcript = $('transcript');
const input = $('input');
const sendBtn = $('send-btn');
const micBtn = $('mic-btn');
const ttsBtn = $('tts-btn');
const resumeInput = $('resume-input');
const resumeFile = $('resume-file');
const fileName = $('file-name');
const startBtn = $('start-btn');
const nextStageBtn = $('next-stage-btn');
const leaveBtn = $('leave-btn');
const recordingBar = $('recording-bar');
const webcam = $('webcam');
const camPlaceholder = $('cam-placeholder');
const stageLabel = $('stage-label');
const timerEl = $('timer');
const speakingIndicator = $('speaking-indicator');

// ── Helpers ─────────────────────────────────────────────────────
function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function formatMessage(text) {
  return escapeHtml(text)
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}
