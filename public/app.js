const chat = document.getElementById('chat');
const form = document.getElementById('form');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const modelSelect = document.getElementById('model-select');

let messageHistory = [];
let isStreaming = false;

const imageModels = ['bytedance-seed/seedream-4.5'];

modelSelect.addEventListener('change', () => {
  const isImage = imageModels.includes(modelSelect.value);
  input.placeholder = isImage
    ? 'Describe the image you want to generate...'
    : 'Type your message...';
  input.focus();
});

function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (role === 'user') {
    bubble.textContent = content;
  }
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? '👤' : '🤖';
  div.appendChild(avatar);
  div.appendChild(bubble);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

function addImageMessage(role, imageUrl, prompt) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble image-bubble';

  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = prompt || 'Generated image';
  img.className = 'generated-image';
  bubble.appendChild(img);

  const actions = document.createElement('div');
  actions.className = 'image-actions';

  const previewBtn = document.createElement('button');
  previewBtn.className = 'img-action-btn';
  previewBtn.textContent = '🔍 Preview';
  previewBtn.addEventListener('click', () => openPreview(imageUrl));

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'img-action-btn';
  downloadBtn.innerHTML = '⬇ Download';
  downloadBtn.addEventListener('click', () => downloadImage(imageUrl, prompt));

  actions.appendChild(previewBtn);
  actions.appendChild(downloadBtn);
  bubble.appendChild(actions);

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = '🤖';
  div.appendChild(avatar);
  div.appendChild(bubble);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function openPreview(imageUrl) {
  const overlay = document.createElement('div');
  overlay.className = 'preview-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const img = document.createElement('img');
  img.src = imageUrl;
  img.className = 'preview-image';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'preview-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => overlay.remove());

  overlay.appendChild(img);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);

  document.addEventListener('keydown', handler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', handler);
    }
  });
}

function downloadImage(imageUrl, prompt) {
  const a = document.createElement('a');
  a.href = imageUrl;
  a.download = `${prompt ? prompt.slice(0, 30) : 'image'}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function autoResize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

input.addEventListener('input', autoResize);

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.dispatchEvent(new Event('submit'));
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || isStreaming) return;

  input.value = '';
  input.style.height = 'auto';
  isStreaming = true;
  sendBtn.disabled = true;

  const selectedModel = modelSelect.value;

  addMessage('user', text);
  messageHistory.push({ role: 'user', content: text });

  if (imageModels.includes(selectedModel)) {
    await generateImage(text);
  } else {
    await chatStream(text, selectedModel);
  }

  isStreaming = false;
  sendBtn.disabled = false;
  input.focus();
});

async function generateImage(prompt) {
  const bubble = addMessage('bot', '');
  const parent = bubble.parentElement;
  parent.classList.add('typing');

  try {
    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    const data = await res.json();

    parent.classList.remove('typing');
    if (data.error) {
      bubble.textContent = `Error: ${data.error}`;
      return;
    }

    bubble.remove();
    addImageMessage('bot', data.url, prompt);
    messageHistory.push({ role: 'assistant', content: `[Image: ${data.url}]` });
  } catch (err) {
    parent.classList.remove('typing');
    bubble.textContent = 'Image generation failed. Please try again.';
  }
}

async function chatStream(message, model) {
  const bubble = addMessage('bot', '');
  const parent = bubble.parentElement;
  parent.classList.add('typing');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: messageHistory.slice(-20), model }),
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
          bubble.textContent = `Error: ${data.error}`;
          parent.classList.remove('typing');
          return;
        }

        if (data.done) {
          fullContent = data.fullContent;
          bubble.textContent = fullContent;
          parent.classList.remove('typing');
          messageHistory.push({ role: 'assistant', content: fullContent });
          return;
        }

        if (data.content) {
          fullContent += data.content;
          bubble.textContent = fullContent;
          chat.scrollTop = chat.scrollHeight;
        }
      }
    }
  } catch (err) {
    bubble.textContent = 'Connection error. Please try again.';
    parent.classList.remove('typing');
  }
}
