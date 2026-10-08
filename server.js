const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Asegurar que existe la carpeta de subidas
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de almacenamiento para archivos adjuntos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Usuarios permitidos (puedes cambiar usuarios/contraseñas aquí)
const USERS = {
  'usuario1': 'clave123',
  'usuario2': 'clave456'
};

app.use(express.json());
app.use(express.static('public'));

// Endpoint de Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (USERS[username] && USERS[username] === password) {
    return res.json({ success: true, username });
  }
  res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
});

// Endpoint para subir archivos (imágenes/documentos)
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No se subió archivo');
  const fileUrl = `/uploads/${req.file.filename}`;
  const isImage = req.file.mimetype.startsWith('image/');
  res.json({ url: fileUrl, originalName: req.file.originalname, isImage });
});

// Comunicación en tiempo real con WebSockets
io.on('connection', (socket) => {
  socket.on('user_connected', (username) => {
    socket.username = username;
    io.emit('chat_message', {
      user: 'Sistema',
      text: `🟢 ${username} se ha unido al chat.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('send_message', (data) => {
    io.emit('chat_message', {
      user: socket.username,
      text: data.text,
      file: data.file,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`));
