const chat = document.getElementById('chat');
const form = document.getElementById('form');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');

let messageHistory = [];
let isStreaming = false;

function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `
    <div class="avatar">${role === 'user' ? '👤' : '🤖'}</div>
    <div class="bubble">${role === 'user' ? escapeHtml(content) : ''}</div>
  `;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div.querySelector('.bubble');
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

  addMessage('user', text);
  messageHistory.push({ role: 'user', content: text });

  const bubble = addMessage('bot', '');
  const parent = bubble.parentElement;
  parent.classList.add('typing');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: messageHistory.slice(-20) }),
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
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    input.focus();
  }
});
