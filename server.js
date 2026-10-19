const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

// Lee la API Key desde las variables de entorno del sistema
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

const CHAT_PASSWORD = 'chat123';
const userStates = {};

app.use(express.json());
app.use(express.static('public'));

app.post('/login', (req, res) => {
  const { password, nickname } = req.body;

  if (password !== CHAT_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
  }

  if (!nickname || nickname.trim() === '') {
    return res.status(400).json({ success: false, message: 'Introduce un nombre válido' });
  }

  const cleanName = nickname.trim();
  const isDuplicate = Object.values(userStates).some(
    u => u.username.toLowerCase() === cleanName.toLowerCase()
  );

  if (isDuplicate) {
    return res.status(400).json({ success: false, message: 'Ese nombre de usuario ya está conectado' });
  }

  res.json({ success: true, nickname: cleanName });
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No se subió archivo');
  const fileUrl = `/uploads/${req.file.filename}`;
  const isImage = req.file.mimetype.startsWith('image/');
  res.json({ url: fileUrl, originalName: req.file.originalname, isImage });
});

io.on('connection', (socket) => {
  socket.on('user_connected', (nickname) => {
    socket.username = nickname;
    userStates[socket.id] = { username: nickname, status: 'online' };

    broadcastStatus();

    io.emit('chat_message', {
      id: Date.now() + Math.random().toString(),
      user: 'Sistema',
      text: `🟢 ${nickname} se ha unido al chat.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('update_focus', (status) => {
    if (userStates[socket.id]) {
      userStates[socket.id].status = status;
      broadcastStatus();

      if (status === 'online') {
        socket.broadcast.emit('messages_read_by_user', { reader: socket.username });
      }
    }
  });

  socket.on('send_message', async (data) => {
    const otherOnline = Object.values(userStates).some(u => u.username !== socket.username && u.status === 'online');

    io.emit('chat_message', {
      id: Date.now() + Math.random().toString(),
      user: socket.username,
      text: data.text,
      file: data.file,
      sticker: data.sticker,
      gif: data.gif,
      read: otherOnline,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    // RESPUESTA REAL DE IA CON GEMINI
    if (data.text && data.text.toLowerCase().includes('@ia')) {
      const prompt = data.text.replace(/@ia/gi, '').trim();

      if (!prompt) {
        io.emit('chat_message', {
          id: Date.now() + Math.random().toString(),
          user: '🤖 Asistente IA',
          text: '🤖 ¡Hola! ¿En qué puedo ayudarte? Escribe `@ia` seguido de tu pregunta.',
          read: true,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        return;
      }

      try {
        // Llamada a la API de Gemini
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });

        const replyText = response.text || 'No pude generar una respuesta en este momento.';

        io.emit('chat_message', {
          id: Date.now() + Math.random().toString(),
          user: '🤖 Asistente IA',
          text: replyText,
          read: true,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      } catch (err) {
        console.error('Error al consultar Gemini:', err);
        io.emit('chat_message', {
          id: Date.now() + Math.random().toString(),
          user: '🤖 Asistente IA',
          text: '❌ Hubo un error al procesar tu solicitud con la IA.',
          read: true,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
    }
  });

  socket.on('add_reaction', (data) => {
    io.emit('message_reaction', {
      messageId: data.messageId,
      emoji: data.emoji,
      user: socket.username
    });
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      const name = socket.username;
      delete userStates[socket.id];
      
      broadcastStatus();

      io.emit('chat_message', {
        id: Date.now() + Math.random().toString(),
        user: 'Sistema',
        text: `🔴 ${name} se ha desconectado.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  function broadcastStatus() {
    io.emit('status_change', userStates);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`));

