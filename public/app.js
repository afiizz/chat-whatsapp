const socket = io();
let currentUser = '';
let typingTimeout = null;

const loginContainer = document.getElementById('login-container');
const chatApp = document.getElementById('chat-app');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const emojiPicker = document.getElementById('emoji-picker');
const stickerPicker = document.getElementById('sticker-picker');
const gifPicker = document.getElementById('gif-picker');
const gifSearch = document.getElementById('gif-search');
const gifGrid = document.getElementById('gif-grid');
const fileInput = document.getElementById('file-input');
const errorMsg = document.getElementById('error-msg');

// LOGIN
document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('user-nickname').addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });
document.getElementById('room-password').addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const password = document.getElementById('room-password').value.trim();
  const nickname = document.getElementById('user-nickname').value.trim();

  if (!nickname || !password) {
    errorMsg.textContent = 'Introduce tu nombre y la contraseña';
    errorMsg.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, nickname })
    });

    const data = await res.json();
    if (data.success) {
      currentUser = data.nickname;
      loginContainer.classList.add('hidden');
      chatApp.classList.remove('hidden');
      socket.emit('user_connected', currentUser);
      sendFocusStatus();
      requestNotificationPermission();
    } else {
      errorMsg.textContent = data.message;
      errorMsg.classList.remove('hidden');
    }
  } catch (err) {
    errorMsg.textContent = 'Error de conexión con el servidor';
    errorMsg.classList.remove('hidden');
  }
}

// SOLICITAR NOTIFICACIONES
document.getElementById('btn-notify').addEventListener('click', requestNotificationPermission);

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
}

// SONIDO POP
function playPopSound() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
}

// TOGGLE PANELS
document.getElementById('btn-emoji').addEventListener('click', () => {
  closePanels();
  emojiPicker.classList.toggle('hidden');
});

document.getElementById('btn-sticker').addEventListener('click', () => {
  closePanels();
  stickerPicker.classList.toggle('hidden');
});

document.getElementById('btn-gif').addEventListener('click', () => {
  closePanels();
  gifPicker.classList.toggle('hidden');
  if (!gifPicker.classList.contains('hidden')) fetchGifs('trending');
});

function closePanels() {
  emojiPicker.classList.add('hidden');
  stickerPicker.classList.add('hidden');
  gifPicker.classList.add('hidden');
}

emojiPicker.addEventListener('emoji-click', event => {
  messageInput.value += event.detail.unicode;
});

// BUSCADOR GIFS
gifSearch.addEventListener('input', (e) => {
  const query = e.target.value.trim();
  fetchGifs(query || 'trending');
});

async function fetchGifs(query) {
  try {
    const res = await fetch(`https://g.tenor.com/v1/search?q=${query}&key=LIVDSRZULEBR&limit=12`);
    const data = await res.json();
    gifGrid.innerHTML = '';
    data.results.forEach(gif => {
      const img = document.createElement('img');
      img.src = gif.media[0].tinygif.url;
      img.addEventListener('click', () => {
        socket.emit('send_message', { gif: gif.media[0].gif.url });
        closePanels();
      });
      gifGrid.appendChild(img);
    });
  } catch (err) {
    console.error('Error GIFs:', err);
  }
}

// STICKERS
document.querySelectorAll('.sticker-item').forEach(img => {
  img.addEventListener('click', () => {
    socket.emit('send_message', { sticker: img.src });
    closePanels();
  });
});

// ADJUNTAR ARCHIVO
document.getElementById('btn-attach').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/upload', { method: 'POST', body: formData });
  const fileData = await res.json();

  socket.emit('send_message', { text: '', file: fileData });
  fileInput.value = '';
});

// EVENTO DE ESCRIBIENDO
messageInput.addEventListener('input', () => {
  socket.emit('typing');
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stop_typing');
  }, 1500);
});

// ENVIAR MENSAJE
document.getElementById('btn-send').addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
  const text = messageInput.value.trim();
  if (text) {
    socket.emit('stop_typing');
    clearTimeout(typingTimeout);
    socket.emit('send_message', { text });
    messageInput.value = '';
    closePanels();
  }
}

// ESCUCHA DE ESTADO "ESCRIBIENDO..."
socket.on('user_typing', (data) => {
  const statusElement = document.getElementById('user-status');
  statusElement.textContent = `${data.username} está escribiendo...`;
  statusElement.style.color = '#00a884';
});

socket.on('user_stop_typing', () => {
  // El estado volverá a actualizarse al enviar el mensaje o con el status general
});

// VISIBILIDAD DE PESTAÑA
document.addEventListener('visibilitychange', sendFocusStatus);
window.addEventListener('focus', sendFocusStatus);
window.addEventListener('blur', sendFocusStatus);

function sendFocusStatus() {
  if (!currentUser) return;
  const isFocused = !document.hidden && document.hasFocus();
  socket.emit('update_focus', isFocused ? 'online' : 'background');
}

// ESTADO USUARIOS
socket.on('status_change', (userStates) => {
  const statusElement = document.getElementById('user-status');
  const otherUsers = Object.values(userStates).filter(u => u.username !== currentUser);

  if (otherUsers.length === 0) {
    statusElement.textContent = 'Desconectado';
    statusElement.style.color = '#8696a0';
  } else {
    const isOtherOnline = otherUsers.some(u => u.status === 'online');
    if (isOtherOnline) {
      statusElement.textContent = 'En línea';
      statusElement.style.color = '#00a884';
    } else {
      statusElement.textContent = 'En otra pestaña';
      statusElement.style.color = '#e5a93c';
    }
  }
});

function isOnlyEmoji(str) {
  const emojiRegex = /^(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])+$/g;
  return emojiRegex.test(str.trim());
}

// RECIBIR MENSAJES
socket.on('chat_message', (msg) => {
  const div = document.createElement('div');
  div.dataset.id = msg.id;

  if (msg.user === 'Sistema') {
    div.className = 'msg system-msg';
    div.textContent = msg.text;
  } else {
    const isMe = msg.user === currentUser;
    div.className = `msg ${isMe ? 'my-msg' : ''}`;

    let body = `<div class="msg-author">${msg.user}</div>`;
    
    if (msg.isLoading) {
      body += `<div class="msg-content"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    } else if (msg.text) {
      if (isOnlyEmoji(msg.text)) {
        body += `<div class="msg-content"><span class="big-emoji">${escapeHTML(msg.text)}</span></div>`;
      } else {
        body += `<div class="msg-content"><span>${escapeHTML(msg.text)}</span></div>`;
      }
    }

    if (msg.sticker) body += `<br><img src="${msg.sticker}" class="sticker-img" />`;
    if (msg.gif) body += `<br><img src="${msg.gif}" class="gif-img" />`;
    if (msg.file) {
      if (msg.file.isImage) body += `<br><img src="${msg.file.url}" class="preview-img" />`;
      else body += `<br><a href="${msg.file.url}" target="_blank" class="file-link">📎 ${msg.file.originalName}</a>`;
    }

    body += `<div class="reactions-bar" id="reactions-${msg.id}"></div>`;
    
    const ticksHTML = isMe ? `<span class="ticks ${msg.read ? 'read' : ''}">✓✓</span>` : '';
    body += `<span class="msg-time">${msg.time}${ticksHTML}</span>`;
    body += `<div class="reaction-trigger">➕</div>`;

    div.innerHTML = body;

    const trigger = div.querySelector('.reaction-trigger');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      showReactionMenu(div, msg.id);
    });

    if (!isMe && !msg.isLoading) {
      playPopSound();
      if (document.hidden && Notification.permission === 'granted') {
        new Notification(`Nuevo mensaje de ${msg.user}`, {
          body: msg.text || 'Ha enviado contenido multimedia',
          icon: '⚡'
        });
      }
    }
  }

  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// ACTUALIZACIÓN DINÁMICA DE LA RESPUESTA DE LA IA
socket.on('update_ai_message', (data) => {
  const msgDiv = document.querySelector(`.msg[data-id="${data.id}"]`);
  if (msgDiv) {
    const contentContainer = msgDiv.querySelector('.msg-content');
    if (contentContainer) {
      contentContainer.innerHTML = `<span>${escapeHTML(data.text)}</span>`;
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
});

// MARCAR COMO LEÍDO
socket.on('messages_read_by_user', () => {
  const allMyTicks = document.querySelectorAll('.my-msg .ticks');
  allMyTicks.forEach(tick => tick.classList.add('read'));
});

function showReactionMenu(msgElement, messageId) {
  const existing = msgElement.querySelector('.reaction-menu');
  if (existing) return existing.remove();

  const menu = document.createElement('div');
  menu.className = 'reaction-menu';
  ['❤️', '😂', '👍', '🔥', '😮'].forEach(emoji => {
    const span = document.createElement('span');
    span.textContent = emoji;
    span.addEventListener('click', () => {
      socket.emit('add_reaction', { messageId, emoji });
      menu.remove();
    });
    menu.appendChild(span);
  });

  msgElement.appendChild(menu);
}

socket.on('message_reaction', (data) => {
  const reactionsBar = document.getElementById(`reactions-${data.messageId}`);
  if (reactionsBar) {
    const badge = document.createElement('span');
    badge.className = 'reaction-badge';
    badge.textContent = `${data.emoji} ${data.user}`;
    reactionsBar.appendChild(badge);
  }
});

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

