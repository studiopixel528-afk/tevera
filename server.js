const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const httpServer = http.createServer((req, res) => {
  const file = path.join(__dirname, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Файл не найден'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const io = new Server(httpServer, { cors: { origin: '*' } });
const online = {};

function sendTo(username, event, data) {
  const id = online[username];
  if (id) io.to(id).emit(event, data);
}

io.on('connection', (socket) => {
  socket.on('register', (username) => {
    online[username] = socket.id;
    socket.username = username;
    console.log('Подключился:', username);
    // Присылаем новому пользователю список всех занятых юзернеймов, кроме себя
    const others = Object.keys(online).filter((u) => u !== username);
    socket.emit('user-list', others);
    console.log('Пользователи сейчас:', Object.keys(online).join(', '));
  });

  socket.on('message', (data) => {
    sendTo(data.to, 'message', { from: data.from, text: data.text || '', audio: data.audio || null, audioMime: data.audioMime || null });
  });

  socket.on('disconnect', () => {
    if (socket.username) delete online[socket.username];
    console.log('Отключился:', socket.username);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log('Сервер запущен: http://localhost:' + PORT);
});