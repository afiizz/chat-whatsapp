
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');
 
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || '';
 
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
 
const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const isHttps = (u) => typeof u === 'string' && /^https:\/\//i.test(u);
 
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
  if (!req.file) return res.status(400).send('No se subió ningún archivo');
  const fileUrl = `/uploads/${req.file.filename}`;
  const isImage = req.file.mimetype.startsWith('image/');
  res.json({ url: fileUrl, originalName: req.file.originalname, isImage });
});
 
// PROXY DE GIFS Y STICKERS (Giphy). La clave se queda en el servidor.
app.get('/api/gifs', async (req, res) => {
  if (!GIPHY_API_KEY) return res.status(503).json({ error: 'no_key' });
 
  const type = req.query.type === 'stickers' ? 'stickers' : 'gifs';
  const q = String(req.query.q || '').trim();
  const endpoint = q ? 'search' : 'trending';
 
  const params = new URLSearchParams({
    api_key: GIPHY_API_KEY,
    limit: '24',
    rating: 'pg-13',
    lang: 'es'
  });
  if (q) params.set('q', q);
 
  try {
    const r = await fetch(`https://api.giphy.com/v1/${type}/${endpoint}?${params}`);
    if (!r.ok) return res.status(502).json({ error: 'giphy_error' });
    const json = await r.json();
    const results = (json.data || []).map(g => ({
      preview: g.images.fixed_width_small?.url || g.images.fixed_width.url,
      url: g.images.fixed_width.url
    }));
    res.json({ results });
  } catch (err) {
    console.error('Error Giphy:', err);
    res.status(502).json({ error: 'giphy_error' });
  }
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
      time: nowTime()
    });
  });
 
  // "ESCRIBIENDO..."
  socket.on('typing', () => {
    if (socket.username) {
      socket.broadcast.emit('user_typing', { username: socket.username });
    }
  });
 
  socket.on('stop_typing', () => {
    if (socket.username) {
      socket.broadcast.emit('user_stop_typing', { username: socket.username });
    }
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
    if (!socket.username) return;
 
    // Al enviar, deja de estar "escribiendo"
    socket.broadcast.emit('user_stop_typing', { username: socket.username });
 
    const otherOnline = Object.values(userStates).some(u => u.username !== socket.username && u.status === 'online');
 
    io.emit('chat_message', {
      id: Date.now() + Math.random().toString(),
      user: socket.username,
      text: data.text,
      file: data.file,
      sticker: isHttps(data.sticker) ? data.sticker : undefined,
      gif: isHttps(data.gif) ? data.gif : undefined,
      read: otherOnline,
      time: nowTime()
    });
 
    // RESPUESTA DE LA IA CON STREAMING
    if (data.text && data.text.toLowerCase().includes('@ia')) {
      const prompt = data.text.replace(/@ia/gi, '').trim();
      const aiMessageId = 'ai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
 
      if (!prompt) {
        io.emit('chat_message', {
          id: aiMessageId,
          user: '🤖 Asistente IA',
          text: '🤖 ¡Hola! ¿En qué puedo ayudarte? Escribe `@ia` seguido de tu consulta.',
          read: true,
          time: nowTime()
        });
        return;
      }
 
      // 1. Burbuja con indicador de carga (hasta que llegue el primer trozo)
      io.emit('chat_message', {
        id: aiMessageId,
        user: '🤖 Asistente IA',
        isLoading: true,
        read: true,
        time: nowTime()
      });
 
      let full = '';
      try {
        // 2. Streaming con Gemini
        const stream = await ai.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: prompt,
        });
 
        let lastEmit = 0;
        for await (const chunk of stream) {
          if (!chunk.text) continue;
          full += chunk.text;
 
          // Limitamos a ~8 actualizaciones por segundo para no saturar el socket
          const now = Date.now();
          if (now - lastEmit >= 120) {
            lastEmit = now;
            io.emit('update_ai_message', { id: aiMessageId, text: full, streaming: true });
          }
        }
 
        // 3. Texto final completo
        io.emit('update_ai_message', {
          id: aiMessageId,
          text: full || 'No pude generar una respuesta en este momento.',
          streaming: false
        });
      } catch (err) {
        console.error('Error al consultar Gemini:', err);
        io.emit('update_ai_message', {
          id: aiMessageId,
          text: full
            ? full + '\n\n❌ La respuesta se cortó por un error.'
            : '❌ Hubo un error al procesar tu solicitud con la IA.',
          streaming: false
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
 
      socket.broadcast.emit('user_stop_typing', { username: name });
      broadcastStatus();
 
      io.emit('chat_message', {
        id: Date.now() + Math.random().toString(),
        user: 'Sistema',
        text: `🔴 ${name} se ha desconectado.`,
        time: nowTime()
      });
    }
  });
 
  function broadcastStatus() {
    io.emit('status_change', userStates);
  }
});
 
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
  if (!GIPHY_API_KEY) console.warn('⚠️  Falta GIPHY_API_KEY: los GIFs y stickers de memes no cargarán.');
});

