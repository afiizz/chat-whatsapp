const socket = io();
let currentUser = '';

const loginContainer = document.getElementById('login-container');
const chatApp = document.getElementById('chat-app');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const emojiPicker = document.getElementById('emoji-picker');
const stickerPicker = document.getElementById('sticker-picker');
const fileInput = document.getElementById('file-input');
const errorMsg = document.getElementById('error-msg');

// LOGIN
document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('user-nickname').addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const password = document.getElementById('room-password').value.trim();
  const nickname = document.getElementById('user-nickname').value.trim();

  if (!password || !nickname) {
    errorMsg.textContent = 'Introduce la contraseña y tu nombre';
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
    } else {
      errorMsg.textContent = data.message;
      errorMsg.classList.remove('hidden');
    }
  } catch (err) {
    errorMsg.textContent = 'Error al conectar con el servidor';
    errorMsg.classList.remove('hidden');
  }
}

// TOGGLE EMOJIS & STICKERS
document.getElementById('btn-emoji').addEventListener('click', () => {
  stickerPicker.classList.add('hidden');
  emojiPicker.classList.toggle('hidden');
});

document.getElementById('btn-sticker').addEventListener('click', () => {
  emojiPicker.classList.add('hidden');
  stickerPicker.classList.toggle('hidden');
});

emojiPicker.addEventListener('emoji-click', event => {
  messageInput.value += event.detail.unicode;
});

// SELECCIONAR Y ENVIAR STICKER
document.querySelectorAll('.sticker-item').forEach(img => {
  img.addEventListener('click', () => {
    const stickerUrl = img.src;
    socket.emit('send_message', { sticker: stickerUrl });
    stickerPicker.classList.add('hidden');
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

// ENVIAR MENSAJE DE TEXTO
document.getElementById('btn-send').addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
  const text = messageInput.value.trim();
  if (text) {
    socket.emit('send_message', { text });
    messageInput.value = '';
    emojiPicker.classList.add('hidden');
    stickerPicker.classList.add('hidden');
  }
}

// DETECTAR ESTADO DE LA PESTAÑA
document.addEventListener('visibilitychange', sendFocusStatus);
window.addEventListener('focus', sendFocusStatus);
window.addEventListener('blur', sendFocusStatus);

function sendFocusStatus() {
  if (!currentUser) return;
  const isFocused = !document.hidden && document.hasFocus();
  socket.emit('update_focus', isFocused ? 'online' : 'background');
}

// CAMBIO DE ESTADO
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

// RECIBIR MENSAJES
socket.on('chat_message', (msg) => {
  const div = document.createElement('div');

  if (msg.user === 'Sistema') {
    div.className = 'msg system-msg';
    div.textContent = msg.text;
  } else {
    const isMe = msg.user === currentUser;
    div.className = `msg ${isMe ? 'my-msg' : ''}`;

    let body = `<div class="msg-author">${msg.user}</div>`;

    if (msg.text) {
      body += `<span>${escapeHTML(msg.text)}</span>`;
    }

    if (msg.sticker) {
      body += `<br><img src="${msg.sticker}" class="sticker-img" />`;
    }

    if (msg.file) {
      if (msg.file.isImage) {
        body += `<br><img src="${msg.file.url}" class="preview-img" />`;
      } else {
        body += `<br><a href="${msg.file.url}" target="_blank" class="file-link">📎 ${msg.file.originalName}</a>`;
      }
    }

    body += `<span class="msg-time">${msg.time}</span>`;
    div.innerHTML = body;
  }

  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}