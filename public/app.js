const socket = io();
let currentUser = '';
let typingTimeout = null;
let isTypingSent = false;
 
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
const statusElement = document.getElementById('user-status');
const typingBar = document.getElementById('typing-bar');
const typingText = document.getElementById('typing-text');
 
// ---------- LOGIN ----------
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
 
// ---------- NOTIFICACIONES ----------
document.getElementById('btn-notify').addEventListener('click', requestNotificationPermission);
 
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
}
 
// ---------- SONIDO POP ----------
let audioCtx = null;
function playPopSound() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
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
  } catch (e) { /* sin audio, no pasa nada */ }
}
 
// ---------- PANELES ----------
document.getElementById('btn-emoji').addEventListener('click', () => {
  const wasHidden = emojiPicker.classList.contains('hidden');
  closePanels();
  if (wasHidden) emojiPicker.classList.remove('hidden');
});
 
document.getElementById('btn-sticker').addEventListener('click', () => {
  const wasHidden = stickerPicker.classList.contains('hidden');
  closePanels();
  if (wasHidden) {
    stickerPicker.classList.remove('hidden');
    if (!memeGrid.children.length) loadStickers('');
  }
});
 
document.getElementById('btn-gif').addEventListener('click', () => {
  const wasHidden = gifPicker.classList.contains('hidden');
  closePanels();
  if (wasHidden) {
    gifPicker.classList.remove('hidden');
    fetchGifs('');
  }
});
 
function closePanels() {
  emojiPicker.classList.add('hidden');
  stickerPicker.classList.add('hidden');
  gifPicker.classList.add('hidden');
}
 
emojiPicker.addEventListener('emoji-click', event => {
  messageInput.value += event.detail.unicode;
});
 
// ---------- GIFS Y STICKERS (vía servidor) ----------
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
 
function showHint(container, text) {
  container.innerHTML = '';
  const p = document.createElement('div');
  p.className = 'picker-hint';
  p.textContent = text;
  container.appendChild(p);
}
 
async function loadMedia(type, query, container, onPick) {
  showHint(container, 'Cargando...');
  try {
    const res = await fetch(`/api/gifs?type=${type}&q=${encodeURIComponent(query)}`);
    if (res.status === 503) {
      showHint(container, 'Falta configurar GIPHY_API_KEY en el servidor.');
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.results.length) {
      showHint(container, 'Sin resultados 😕');
      return;
    }
    container.innerHTML = '';
    data.results.forEach(item => {
      const img = document.createElement('img');
      img.src = item.preview;
      img.loading = 'lazy';
      img.addEventListener('click', () => onPick(item.url));
      container.appendChild(img);
    });
  } catch (err) {
    console.error('Error cargando', type, err);
    showHint(container, 'No se pudo cargar. Inténtalo de nuevo.');
  }
}
 
// GIFs
function fetchGifs(query) {
  loadMedia('gifs', query, gifGrid, (url) => {
    socket.emit('send_message', { gif: url });
    closePanels();
  });
}
 
gifSearch.addEventListener('input', debounce((e) => fetchGifs(e.target.value.trim()), 350));
 
// STICKERS: pestañas
const memeGrid = document.getElementById('sticker-meme-grid');
const stickerSearch = document.getElementById('sticker-search');
const stickerChips = document.getElementById('sticker-chips');
 
document.querySelectorAll('.picker-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.picker-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.getElementById('sticker-tab-memes').classList.toggle('hidden', tab.dataset.tab !== 'memes');
    document.getElementById('sticker-tab-emojis').classList.toggle('hidden', tab.dataset.tab !== 'emojis');
  });
});
 
// STICKERS: memes (Giphy stickers)
const STICKER_CATEGORIES = [
  { label: '🔥 Populares', q: '' },
  { label: '😂 Jajaja', q: 'jajaja' },
  { label: '👍 Ok', q: 'ok vale' },
  { label: '🙅 No', q: 'no nope' },
  { label: '😍 Me encanta', q: 'love me encanta' },
  { label: '😭 Triste', q: 'triste llorar' },
  { label: '😡 Enfadado', q: 'enfadado angry' },
  { label: '😳 WTF', q: 'wtf shock' },
  { label: '🥱 Aburrido', q: 'aburrido bored' },
  { label: '🙏 Gracias', q: 'gracias thanks' },
  { label: '👋 Hola', q: 'hola hello' },
  { label: '😴 Buenas noches', q: 'buenas noches' },
  { label: '🤡 Cringe', q: 'cringe meme' },
  { label: '💀 Muerto', q: 'dead skull' }
];
 
function loadStickers(query) {
  loadMedia('stickers', query, memeGrid, (url) => {
    socket.emit('send_message', { sticker: url });
    closePanels();
  });
}
 
STICKER_CATEGORIES.forEach((cat, i) => {
  const chip = document.createElement('button');
  chip.className = 'chip' + (i === 0 ? ' active' : '');
  chip.textContent = cat.label;
  chip.addEventListener('click', () => {
    stickerChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
    stickerSearch.value = '';
    loadStickers(cat.q);
  });
  stickerChips.appendChild(chip);
});
 
stickerSearch.addEventListener('input', debounce((e) => {
  stickerChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  loadStickers(e.target.value.trim());
}, 350));
 
// STICKERS: emojis grandes (pestaña local)
const EMOJI_STICKERS = ['1f600','1f602','1f923','1f60d','1f60e','1f929','1f970','1f618',
  '1f97a','1f62d','1f621','1f631','1f914','1f644','1f634','1f973',
  '1f44d','1f44f','1f64f','1f4aa','1f525','2764','1f389','1f480'];
 
const emojiStickerGrid = document.getElementById('sticker-emoji-grid');
EMOJI_STICKERS.forEach(code => {
  const img = document.createElement('img');
  img.src = `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.webp`;
  img.className = 'sticker-item';
  img.alt = 'Sticker';
  img.loading = 'lazy';
  img.addEventListener('click', () => {
    socket.emit('send_message', { sticker: img.src });
    closePanels();
  });
  emojiStickerGrid.appendChild(img);
});
 
// ---------- ADJUNTAR ARCHIVO ----------
document.getElementById('btn-attach').addEventListener('click', () => fileInput.click());
 
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
 
  const formData = new FormData();
  formData.append('file', file);
 
  try {
    const res = await fetch('/upload', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const fileData = await res.json();
    socket.emit('send_message', { text: '', file: fileData });
  } catch (err) {
    console.error('Error subiendo archivo:', err);
  }
  fileInput.value = '';
});
 
// ---------- ESCRIBIENDO... (emisión) ----------
messageInput.addEventListener('input', () => {
  if (!messageInput.value.trim()) {
    stopTyping();
    return;
  }
  // Solo emitimos "typing" una vez por racha, no en cada tecla
  if (!isTypingSent) {
    socket.emit('typing');
    isTypingSent = true;
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(stopTyping, 2000);
});
 
function stopTyping() {
  clearTimeout(typingTimeout);
  if (isTypingSent) {
    socket.emit('stop_typing');
    isTypingSent = false;
  }
}
 
// ---------- ESCRIBIENDO... (recepción) ----------
const typingUsers = new Map(); // username -> timeout de seguridad
 
function renderTyping() {
  const names = [...typingUsers.keys()];
  if (names.length === 0) {
    typingBar.classList.add('hidden');
    renderStatus();
    return;
  }
  const text = names.length === 1
    ? `${names[0]} está escribiendo...`
    : `${names.join(', ')} están escribiendo...`;
 
  typingText.textContent = text;
  typingBar.classList.remove('hidden');
  statusElement.textContent = text;
  statusElement.style.color = '#00a884';
  keepScrolledIfNearBottom();
}
 
socket.on('user_typing', ({ username }) => {
  clearTimeout(typingUsers.get(username));
  // Si no llega "stop_typing" (cierre de pestaña, red...), se limpia solo
  typingUsers.set(username, setTimeout(() => {
    typingUsers.delete(username);
    renderTyping();
  }, 4000));
  renderTyping();
});
 
socket.on('user_stop_typing', ({ username }) => {
  clearTimeout(typingUsers.get(username));
  typingUsers.delete(username);
  renderTyping();
});
 
// ---------- VISIBILIDAD DE PESTAÑA ----------
document.addEventListener('visibilitychange', sendFocusStatus);
window.addEventListener('focus', sendFocusStatus);
window.addEventListener('blur', sendFocusStatus);
 
function sendFocusStatus() {
  if (!currentUser) return;
  const isFocused = !document.hidden && document.hasFocus();
  socket.emit('update_focus', isFocused ? 'online' : 'background');
}
 
// ---------- ESTADO USUARIOS ----------
let lastUserStates = {};
 
socket.on('status_change', (userStates) => {
  lastUserStates = userStates;
  renderStatus();
});
 
function renderStatus() {
  // Mientras alguien escribe, el encabezado muestra eso
  if (typingUsers.size > 0) return;
 
  const otherUsers = Object.values(lastUserStates).filter(u => u.username !== currentUser);
 
  if (otherUsers.length === 0) {
    statusElement.textContent = 'Desconectado';
    statusElement.style.color = '#8696a0';
  } else if (otherUsers.some(u => u.status === 'online')) {
    statusElement.textContent = 'En línea';
    statusElement.style.color = '#00a884';
  } else {
    statusElement.textContent = 'En otra pestaña';
    statusElement.style.color = '#e5a93c';
  }
}
 
// ---------- ENVIAR MENSAJE ----------
document.getElementById('btn-send').addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
 
function sendMessage() {
  const text = messageInput.value.trim();
  if (text) {
    stopTyping();
    socket.emit('send_message', { text });
    messageInput.value = '';
    closePanels();
  }
}
 
// ---------- RECIBIR MENSAJES ----------
function isOnlyEmoji(str) {
  const emojiRegex = /^(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])+$/;
  return emojiRegex.test(str.trim());
}
 
function isNearBottom() {
  return messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 120;
}
 
function keepScrolledIfNearBottom() {
  if (isNearBottom()) messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
 
socket.on('chat_message', (msg) => {
  const wasNearBottom = isNearBottom();
  const div = document.createElement('div');
  div.dataset.id = msg.id;
 
  if (msg.user === 'Sistema') {
    div.className = 'msg system-msg';
    div.textContent = msg.text;
  } else {
    const isMe = msg.user === currentUser;
    div.className = `msg ${isMe ? 'my-msg' : ''}`;
 
    let body = `<div class="msg-author">${escapeHTML(msg.user)}</div>`;
 
    if (msg.isLoading) {
      body += `<div class="msg-content"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    } else if (msg.text) {
      if (isOnlyEmoji(msg.text)) {
        body += `<div class="msg-content"><span class="big-emoji">${escapeHTML(msg.text)}</span></div>`;
      } else {
        body += `<div class="msg-content"><span>${escapeHTML(msg.text)}</span></div>`;
      }
    }
 
    if (msg.sticker) body += `<br><img src="${escapeHTML(msg.sticker)}" class="sticker-img" />`;
    if (msg.gif) body += `<br><img src="${escapeHTML(msg.gif)}" class="gif-img" />`;
    if (msg.file) {
      if (msg.file.isImage) body += `<br><img src="${escapeHTML(msg.file.url)}" class="preview-img" />`;
      else body += `<br><a href="${escapeHTML(msg.file.url)}" target="_blank" class="file-link">📎 ${escapeHTML(msg.file.originalName)}</a>`;
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
          body: msg.text || 'Ha enviado contenido multimedia'
        });
      }
    }
  }
 
  messagesContainer.appendChild(div);
 
  // Los stickers/GIFs cargan después: re-ajustamos el scroll cuando terminen
  div.querySelectorAll('img').forEach(img => {
    img.addEventListener('load', () => { if (wasNearBottom || msg.user === currentUser) messagesContainer.scrollTop = messagesContainer.scrollHeight; });
  });
 
  if (wasNearBottom || msg.user === currentUser) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
});
 
// ---------- STREAMING DE LA IA ----------
socket.on('update_ai_message', (data) => {
  const msgDiv = document.querySelector(`.msg[data-id="${data.id}"]`);
  if (!msgDiv) return;
 
  const contentContainer = msgDiv.querySelector('.msg-content');
  if (!contentContainer) return;
 
  const wasNearBottom = isNearBottom();
  const cursor = data.streaming ? '<span class="stream-cursor"></span>' : '';
  contentContainer.innerHTML = `<span>${escapeHTML(data.text)}</span>${cursor}`;
 
  // Solo seguimos el texto si el usuario no se ha ido hacia arriba a leer
  if (wasNearBottom) messagesContainer.scrollTop = messagesContainer.scrollHeight;
 
  if (!data.streaming && document.hidden && Notification.permission === 'granted') {
    new Notification('Respuesta de la IA lista', { body: data.text.slice(0, 120) });
  }
});
 
// ---------- LEÍDO ----------
socket.on('messages_read_by_user', () => {
  document.querySelectorAll('.my-msg .ticks').forEach(tick => tick.classList.add('read'));
});
 
// ---------- REACCIONES ----------
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
  return String(str ?? '').replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
 