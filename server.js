const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Asegurar carpeta de subidas
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Contraseña única/global para entrar al chat
const CHAT_PASSWORD = 'chat123';

app.use(express.json());
app.use(express.static('public'));

// Endpoint de Validación
app.post('/login', (req, res) => {
  const { password, nickname } = req.body;
  if (password === CHAT_PASSWORD && nickname && nickname.trim() !== '') {
    return res.json({ success: true, nickname: nickname.trim() });
  }
  res.status(401).json({ success: false, message: 'Contraseña incorrecta o nombre no válido' });
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No se subió archivo');
  const fileUrl = `/uploads/${req.file.filename}`;
  const isImage = req.file.mimetype.startsWith('image/');
  res.json({ url: fileUrl, originalName: req.file.originalname, isImage });
});

// Guardamos los sockets activos
const userStates = {};

io.on('connection', (socket) => {
  socket.on('user_connected', (nickname) => {
    socket.username = nickname;
    userStates[socket.id] = { username: nickname, status: 'online' };

    broadcastStatus();

    io.emit('chat_message', {
      user: 'Sistema',
      text: `🟢 ${nickname} se ha unido al chat.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('update_focus', (status) => {
    if (userStates[socket.id]) {
      userStates[socket.id].status = status;
      broadcastStatus();
    }
  });

  socket.on('send_message', (data) => {
    io.emit('chat_message', {
      user: socket.username,
      text: data.text,
      file: data.file,
      sticker: data.sticker,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      const name = socket.username;
      delete userStates[socket.id];
      
      broadcastStatus();

      io.emit('chat_message', {
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