// ── Positions / Skills ──────────────────────────────────────────

async function loadPositions() {
  try {
    const res = await fetch('/api/positions');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.positions = await res.json();
    renderPositions(state.positions);
  } catch (err) {
    console.error('Failed to load positions:', err);
    state.positions = [{ id: 'algorithm', label: '算法', icon: '🧮', description: '算法实习岗位', stageLabels: ['自我介绍', '简历提问', '场景技术', '算法挑战'] }];
    renderPositions(state.positions);
  }
}

function renderPositions(positions) {
  const container = $('position-options');
  if (!container) return;
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

// ── Personas ────────────────────────────────────────────────────

async function loadPersonas() {
  try {
    const res = await fetch('/api/personas');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.personas = await res.json();
    renderPersonas(state.personas);
  } catch (err) {
    console.error('Failed to load personas:', err);
  }
}

function renderPersonas(personas) {
  const container = $('persona-options');
  if (!container) return;
  container.innerHTML = '';
  personas.forEach((p, i) => {
    const btn = document.createElement('button');
    const isDefault = p.id === 'default';
    btn.className = `persona-btn${isDefault ? ' active' : ''}`;
    btn.dataset.id = p.id;
    btn.innerHTML = `
      <span class="persona-icon">${p.icon || '🤖'}</span>
      <span class="persona-label">${p.label}</span>
      <span class="persona-desc">${p.description || ''}</span>
    `;
    btn.addEventListener('click', () => selectPersona(p.id));
    container.appendChild(btn);
  });

  // default to the 'default' persona, or first one
  const defaultPersona = personas.find(p => p.id === 'default') || personas[0];
  if (defaultPersona) selectPersona(defaultPersona.id);
}

function selectPersona(id) {
  state.persona = id;
  document.querySelectorAll('.persona-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.id === id);
  });
}

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

// ── Video Grid Resize ────────────────────────────────────────────
(function initResize() {
  const handle = $('resize-handle');
  const grid = $('video-grid');
  const main = document.querySelector('.main-content');
  if (!handle || !grid || !main) return;

  let isResizing = false;
  let startY = 0;
  let startHeight = 0;

  function onStart(e) {
    isResizing = true;
    handle.classList.add('active');
    startY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;
    startHeight = grid.offsetHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }

  function onMove(e) {
    if (!isResizing) return;
    const currentY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;
    const delta = currentY - startY;
    const mainRect = main.getBoundingClientRect();
    const maxHeight = mainRect.height - 20;
    const newHeight = Math.max(120, Math.min(startHeight + delta, maxHeight));
    grid.style.height = newHeight + 'px';
  }

  function onEnd() {
    if (!isResizing) return;
    isResizing = false;
    handle.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  handle.addEventListener('mousedown', onStart);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);
  handle.addEventListener('touchstart', onStart, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('touchend', onEnd);
})();

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
    l.textContent = getStageLabel(idx);
  });
}

// ── Transcript helpers ──────────────────────────────────────────
function addTranscript(role, text) {
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
