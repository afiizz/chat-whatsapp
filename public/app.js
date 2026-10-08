const socket = io();
let currentUser = '';

const loginContainer = document.getElementById('login-container');
const chatApp = document.getElementById('chat-app');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const emojiPicker = document.getElementById('emoji-picker');
const fileInput = document.getElementById('file-input');
const errorMsg = document.getElementById('error-msg');

// LOGIN
document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('password').addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!username || !password) return;

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.success) {
      currentUser = username;
      loginContainer.classList.add('hidden');
      chatApp.classList.remove('hidden');
      socket.emit('user_connected', currentUser);
    } else {
      errorMsg.textContent = data.message;
      errorMsg.classList.remove('hidden');
    }
  } catch (err) {
    errorMsg.textContent = 'Error al conectar con el servidor';
    errorMsg.classList.remove('hidden');
  }
}

// TOGGLE EMOJIS
document.getElementById('btn-emoji').addEventListener('click', () => {
  emojiPicker.classList.toggle('hidden');
});

emojiPicker.addEventListener('emoji-click', event => {
  messageInput.value += event.detail.unicode;
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
  }
}

// RECIBIR MENSAJES EN TIEMPO REAL
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

// Detectar si la pestaña pasa a segundo plano o se vuelve a enfocar
document.addEventListener('visibilitychange', sendFocusStatus);
window.addEventListener('focus', sendFocusStatus);
window.addEventListener('blur', sendFocusStatus);

function sendFocusStatus() {
  const isFocused = !document.hidden && document.hasFocus();
  socket.emit('update_focus', isFocused ? 'online' : 'background');
}

// Actualizar el texto del encabezado según el estado de los demás usuarios
socket.on('status_change', (userStates) => {
  const statusElement = document.getElementById('user-status');
  
  // Filtrar otros usuarios distintos al actual
  const otherUsers = Object.values(userStates).filter(u => u.username !== currentUser);

  if (otherUsers.length === 0) {
    statusElement.textContent = 'Desconectado';
    statusElement.style.color = '#8696a0'; // Gris
  } else {
    // Si alguno está activo en la pestaña
    const isOtherOnline = otherUsers.some(u => u.status === 'online');
    
    if (isOtherOnline) {
      statusElement.textContent = 'En línea';
      statusElement.style.color = '#00a884'; // Verde WhatsApp
    } else {
      statusElement.textContent = 'En otra pestaña';
      statusElement.style.color = '#e5a93c'; // Naranja/Amarillo
    }
  }
});