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
  state.interviewId = null;

  lobby.classList.add('hidden');
  meeting.classList.remove('hidden');

  clearTranscript();
  updateStageUI(1);
  nextStageBtn.textContent = '下一环节 →';
  nextStageBtn.disabled = false;

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
  state.interviewId = null;

  meeting.classList.add('hidden');
  lobby.classList.remove('hidden');
  clearTranscript();
  nextStageBtn.textContent = '下一环节 →';
  nextStageBtn.disabled = false;

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
        persona: state.persona,
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

  await sendToAI(`__START_STAGE__${state.stage}`);
});

// ── Finish Interview & Feedback ─────────────────────────────────
async function finishInterview() {
  state.phase = 'finished';
  stopTimer();
  nextStageBtn.textContent = '生成反馈报告中...';
  nextStageBtn.disabled = true;

  addTranscript('ai', '⏳ **面试结束，正在生成反馈报告...**');

  try {
    const res = await fetch('/api/interview/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: state.position,
        resume: state.resume,
        history: state.history,
        startTime: new Date(Date.now() - state.elapsedSeconds * 1000).toISOString(),
        duration: state.elapsedSeconds,
      }),
    });

    // Show the feedback via SSE stream
    const msgEl = addTranscript('ai', '');
    const parent = msgEl.closest('.tmsg');
    if (parent) parent.classList.add('typing');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let interviewId = null;

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
          msgEl.textContent = `反馈生成失败：${data.error}`;
          if (parent) parent.classList.remove('typing');
          resetFinishBtn();
          return;
        }

        if (data.meta) {
          interviewId = data.meta.interviewId;
          state.interviewId = interviewId;
          continue;
        }

        if (data.done) {
          fullContent = data.fullContent;
          msgEl.innerHTML = formatMessage(fullContent);
          if (parent) parent.classList.remove('typing');

          // Add download button after feedback
          if (interviewId) {
            addDownloadButton(interviewId);
          } else {
            // Try to save manually via a separate call if ID wasn't returned
            resetFinishBtn();
          }
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
    addTranscript('ai', `❌ 反馈生成失败：${err.message}。请稍后重试。`);
  }

  resetFinishBtn();
  speakText('面试全部结束，反馈报告已生成。');

  function finish() {
    state.isStreaming = false;
    sendBtn.disabled = false;
    showSpeaking(false);
    nextStageBtn.textContent = '面试已结束 ✓';
  }
}

function resetFinishBtn() {
  state.isStreaming = false;
  sendBtn.disabled = false;
  showSpeaking(false);
  nextStageBtn.textContent = '面试已结束 ✓';
  nextStageBtn.disabled = true;
}

function addDownloadButton(interviewId) {
  const div = document.createElement('div');
  div.className = 'tmsg';
  div.innerHTML = `
    <div class="tmsg-icon">📥</div>
    <div class="tmsg-bubble feedback-actions">
      <a href="/api/interviews/${interviewId}/download" class="download-btn" download>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        下载反馈报告
      </a>
    </div>
  `;
  transcript.appendChild(div);
  transcript.scrollTop = transcript.scrollHeight;
}

// ── TTS toggle ──────────────────────────────────────────────────
ttsBtn.addEventListener('click', toggleTTS);

// ── Ctrl+Enter to send ──────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSend();
});

// ── Init ────────────────────────────────────────────────────────
loadPositions();
loadPersonas();
