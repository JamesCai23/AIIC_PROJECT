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

// ── Positions / Skills ──────────────────────────────────────────

async function loadPositions() {
  try {
    const res = await fetch('/api/positions');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.positions = await res.json();
    renderPositions(state.positions);
  } catch (err) {
    console.error('Failed to load positions:', err);
    // fallback: use default algorithm
    state.positions = [{ id: 'algorithm', label: '算法', icon: '🧮', description: '算法实习岗位', stageLabels: ['自我介绍', '简历提问', '场景技术', '算法挑战'] }];
    renderPositions(state.positions);
  }
}

function renderPositions(positions) {
  const container = $('position-options');
  container.innerHTML = '';
  positions.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = `pos-btn${i === 0 ? ' active' : ''}`;
    btn.dataset.id = p.id;
    btn.innerHTML = `
      <span class="pos-icon">${p.icon || '🎯'}</span>
      <span class="pos-label">${p.label}</span>
      <span class="pos-desc">${p.description || ''}</span>
    `;
    btn.addEventListener('click', () => selectPosition(p.id));
    container.appendChild(btn);
  });

  // Set default selection
  if (positions.length > 0) {
    selectPosition(positions[0].id);
  }
}

function selectPosition(id) {
  state.position = id;
  document.querySelectorAll('.pos-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.id === id);
  });

  const pos = state.positions.find(p => p.id === id);
  if (pos && pos.stageLabels) {
    POSITION_STAGE_LABELS = {};
    pos.stageLabels.forEach((label, i) => { POSITION_STAGE_LABELS[i + 1] = label; });
  } else {
    POSITION_STAGE_LABELS = null;
  }
}

// Load positions on startup
loadPositions();

// ── File Upload ─────────────────────────────────────────────────
resumeFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  fileName.textContent = file.name;
  const reader = new FileReader();
  reader.onload = () => { resumeInput.value = reader.result; };
  reader.readAsText(file);
});

// ── Keyboard ────────────────────────────────────────────────────
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});
function autoResize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';
}
input.addEventListener('input', autoResize);
sendBtn.addEventListener('click', handleSend);

// ── Timer ───────────────────────────────────────────────────────
function startTimer() {
  state.elapsedSeconds = 0;
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.elapsedSeconds++;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}

function updateTimerDisplay() {
  const m = String(Math.floor(state.elapsedSeconds / 60)).padStart(2, '0');
  const s = String(state.elapsedSeconds % 60).padStart(2, '0');
  timerEl.textContent = `${m}:${s}`;
}

// ── Camera ──────────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
      audio: false,
    });
    webcam.srcObject = stream;
    state.cameraStream = stream;
    camPlaceholder.classList.add('hidden');
  } catch (_) {
    camPlaceholder.classList.remove('hidden');
  }
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
}

// ── Start Interview ─────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  const resume = resumeInput.value.trim();
  if (!resume) {
    resumeInput.style.borderColor = '#ef4444';
    resumeInput.focus();
    setTimeout(() => resumeInput.style.borderColor = '', 2000);
    return;
  }

  state.resume = resume;
  state.phase = 'interview';
  state.stage = 1;
  state.history = [];

  lobby.classList.add('hidden');
  meeting.classList.remove('hidden');

  clearTranscript();
  updateStageUI(1);
  nextStageBtn.textContent = '下一环节 →';

  await startCamera();
  startTimer();
  await sendToAI('__START_INTERVIEW__');
});

// ── Leave / Restart ──────────────────────────────────────────────
leaveBtn.addEventListener('click', () => {
  if (state.isStreaming) return;
  stopCamera();
  stopTimer();
  stopTTS();
  if (state.recognition) { try { state.recognition.abort(); } catch (_) {} }

  state.phase = 'lobby';
  state.stage = 1;
  state.history = [];
  state.isRecording = false;

  meeting.classList.add('hidden');
  lobby.classList.remove('hidden');
  clearTranscript();
  nextStageBtn.textContent = '下一环节 →';
  nextStageBtn.disabled = false;

  // Reset camera placeholder
  camPlaceholder.classList.remove('hidden');
});

// ── Send ────────────────────────────────────────────────────────
async function handleSend() {
  const text = input.value.trim();
  if (!text || state.isStreaming || state.phase !== 'interview') return;
  input.value = '';
  input.style.height = 'auto';
  await sendToAI(text);
}

// ── Send message to AI ──────────────────────────────────────────
async function sendToAI(userMessage) {
  state.isStreaming = true;
  sendBtn.disabled = true;
  nextStageBtn.classList.add('hidden');
  showSpeaking(true);

  const isSystemTrigger = userMessage.startsWith('__');

  if (!isSystemTrigger) {
    addTranscript('user', userMessage);
    state.history.push({ role: 'user', content: userMessage });
  }

  const msgEl = addTranscript('ai', '');
  const parent = msgEl.closest('.tmsg');
  if (parent) parent.classList.add('typing');

  try {
    const res = await fetch('/api/interview/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: isSystemTrigger ? getSystemMessage(userMessage) : userMessage,
        history: state.history,
        stage: state.stage,
        resume: state.resume,
        position: state.position,
      }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));

        if (data.error) {
          msgEl.textContent = `错误：${data.error}`;
          if (parent) parent.classList.remove('typing');
          finish();
          return;
        }

        if (data.done) {
          fullContent = data.fullContent;
          msgEl.innerHTML = formatMessage(fullContent);
          if (parent) parent.classList.remove('typing');

          if (!isSystemTrigger || userMessage === '__START_INTERVIEW__') {
            state.history.push({ role: 'assistant', content: fullContent });
          } else if (userMessage.startsWith('__START_STAGE__')) {
            // For stage transitions, push the greeting as first message of new stage
            state.history.push({ role: 'assistant', content: fullContent });
          }

          speakText(fullContent);
          finish();
          return;
        }

        if (data.content) {
          fullContent += data.content;
          msgEl.innerHTML = formatMessage(fullContent);
          transcript.scrollTop = transcript.scrollHeight;
        }
      }
    }
  } catch (err) {
    msgEl.textContent = '连接失败，请重试。';
    if (parent) parent.classList.remove('typing');
  }

  finish();

  function finish() {
    state.isStreaming = false;
    sendBtn.disabled = false;
    input.focus();
    nextStageBtn.classList.remove('hidden');
    showSpeaking(false);
  }
}

// ── Next Stage ──────────────────────────────────────────────────
nextStageBtn.addEventListener('click', async () => {
  if (state.isStreaming) return;

  if (state.stage >= 4) {
    finishInterview();
    return;
  }

  state.stage++;
  updateStageUI(state.stage);
  nextStageBtn.classList.add('hidden');

  if (state.stage === 4) {
    nextStageBtn.textContent = '结束面试';
  }

  // Don't add transition to visible history
  await sendToAI(`__START_STAGE__${state.stage}`);
});

// ── Finish Interview ────────────────────────────────────────────
function finishInterview() {
  state.phase = 'finished';
  stopTimer();
  nextStageBtn.textContent = '面试已结束 ✓';
  nextStageBtn.disabled = true;
  const msg = '🎉 **面试全部结束！**\n\n感谢你参与本次模拟面试。你可以点击左下角"离开"按钮回到等候室。';
  addTranscript('ai', msg);
  speakText('面试全部结束，感谢你参与本次模拟面试。');
}

// ── Speaking indicator ──────────────────────────────────────────
function showSpeaking(on) {
  speakingIndicator.classList.toggle('hidden', !on);
}

// ── TTS (Text-to-Speech) ────────────────────────────────────────
let currentAudio = null;

async function speakText(text) {
  if (!state.ttsEnabled || !text) return;
  try {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; };
    currentAudio.play();
  } catch (_) {}
}

function stopTTS() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

function toggleTTS() {
  state.ttsEnabled = !state.ttsEnabled;
  ttsBtn.classList.toggle('muted', !state.ttsEnabled);
  if (!state.ttsEnabled) stopTTS();
}

ttsBtn.addEventListener('click', toggleTTS);

// ── Stage UI ────────────────────────────────────────────────────
function updateStageUI(stage) {
  stageLabel.textContent = `${stage} / 4 ${getStageLabel(stage)}`;

  document.querySelectorAll('.sdot').forEach(d => {
    const s = parseInt(d.dataset.s);
    d.classList.remove('active', 'completed');
    if (s < stage) d.classList.add('completed');
    if (s === stage) d.classList.add('active');
  });

  document.querySelectorAll('.slabel').forEach((l, i) => {
    const idx = i + 1;
    l.classList.remove('active', 'completed');
    if (idx < stage) l.classList.add('completed');
    if (idx === stage) l.classList.add('active');
    // Update label text from position-specific labels
    l.textContent = getStageLabel(idx);
  });
}

// ── Speech-to-Text ──────────────────────────────────────────────
const SpeechRecog = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecog) {
  state.recognition = new SpeechRecog();
  state.recognition.lang = 'zh-CN';
  state.recognition.continuous = true;
  state.recognition.interimResults = true;

  state.recognition.onresult = (e) => {
    let final = '';
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    if (final) input.value = (input.value || '') + final;
    input.placeholder = interim ? `正在听: ${interim}...` : '输入回答...';
    autoResize();
  };

  state.recognition.onend = () => {
    if (state.isRecording && state.recognition) {
      try { state.recognition.start(); } catch (_) {}
    }
  };

  state.recognition.onerror = (e) => {
    if (e.error === 'not-allowed') alert('请允许使用麦克风权限以使用语音输入功能。');
    stopRecording();
  };

  micBtn.addEventListener('click', toggleRecording);
} else {
  micBtn.title = '不支持语音输入';
  micBtn.style.opacity = '0.3';
  micBtn.style.cursor = 'not-allowed';
}

function toggleRecording() {
  if (!state.recognition) return;
  state.isRecording ? stopRecording() : startRecording();
}

function startRecording() {
  state.isRecording = true;
  micBtn.classList.add('recording');
  recordingBar.classList.remove('hidden');
  input.placeholder = '正在聆听...';
  try { state.recognition.start(); } catch (_) {}
}

function stopRecording() {
  state.isRecording = false;
  micBtn.classList.remove('recording');
  recordingBar.classList.add('hidden');
  input.placeholder = '输入回答...';
  try { state.recognition.stop(); } catch (_) {}
}

// ── Transcript helpers ──────────────────────────────────────────
function addTranscript(role, text) {
  // Remove placeholder if present
  const ph = transcript.querySelector('.transcript-placeholder');
  if (ph) ph.remove();

  const div = document.createElement('div');
  div.className = `tmsg ${role}`;

  const icon = document.createElement('div');
  icon.className = 'tmsg-icon';
  icon.textContent = role === 'ai' ? '🤖' : '👤';

  const bubble = document.createElement('div');
  bubble.className = 'tmsg-bubble';
  if (text) bubble.innerHTML = formatMessage(text);

  div.appendChild(icon);
  div.appendChild(bubble);
  transcript.appendChild(div);
  transcript.scrollTop = transcript.scrollHeight;
  return bubble;
}

function clearTranscript() {
  transcript.innerHTML = '';
}

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

// ── Ctrl+Enter to send ──────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSend();
});
