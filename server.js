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

const io = new Server(httpServer, { cors: { origin: '*' }, maxHttpBufferSize: 1e8 });
const online = {};
const ALL_USERS_FILE = path.join(__dirname, 'users.json');
const AVATARS_FILE = path.join(__dirname, 'avatars.json');

function loadAvatars() {
  try { return JSON.parse(fs.readFileSync(AVATARS_FILE, 'utf8')); } catch (e) { return {}; }
}
function saveAvatars() {
  try { fs.writeFileSync(AVATARS_FILE, JSON.stringify(avatars)); } catch (e) {}
}

const avatars = loadAvatars();

function loadAllUsers() {
  try { return JSON.parse(fs.readFileSync(ALL_USERS_FILE, 'utf8')); } catch (e) { return []; }
}
function saveAllUsers() {
  try { fs.writeFileSync(ALL_USERS_FILE, JSON.stringify(registeredUsers)); } catch (e) {}
}

// Все когда-либо зарегистрированные юзернеймы (для уникальности навсегда)
let registeredUsers = loadAllUsers();

function sendTo(username, event, data) {
  const id = online[(username || '').toLowerCase()];
  if (id) io.to(id).emit(event, data);
}

io.on('connection', (socket) => {
  // Проверка уникальности юзернейма при входе
  socket.on('try-register', (usernameRaw, callback) => {
    const username = (usernameRaw || '').trim().replace(/^@/, '').replace(/\s+/g, ' ');
    if (!username) { if (callback) callback({ ok: false, error: 'empty' }); return; }
    const lower = username.toLowerCase();
    if (online[lower] && online[lower] !== socket.id) {
      if (callback) callback({ ok: false, error: 'taken' }); return;
    }
    if (!registeredUsers.some((u) => u.toLowerCase() === lower)) {
      registeredUsers.push(username);
      saveAllUsers();
    }
    online[lower] = socket.id;
    socket.username = lower;
    if (callback) callback({ ok: true, username: username });
    socket.emit('my-avatar', avatars[lower] || null);
    io.emit('user-list', { users: registeredUsers, avatars: avatars });
    console.log('Подключился:', username);
  });

  socket.on('register', (username) => {
    const key = (username || '').toLowerCase();
    if (socket.username) delete online[socket.username];
    online[key] = socket.id;
    socket.username = key;
    socket.emit('my-avatar', avatars[key] || null);
    io.emit('user-list', { users: registeredUsers, avatars: avatars });
  });

  // Установка аватарки
  socket.on('set-avatar', (data) => {
    const key = (socket.username || '').toLowerCase();
    if (!key) return;
    avatars[key] = String(data.avatar || '').slice(0, 2000000);
    saveAvatars();
    io.emit('user-list', { users: registeredUsers, avatars: avatars });
  });

  socket.on('message', (data) => {
    const hasAudio = data.audio !== undefined && data.audio !== null && data.audio !== '';
    const byteLen = hasAudio ? (data.audio.byteLength !== undefined ? data.audio.byteLength : data.audio.length) : 'нет';
    console.log(`[message] to=${data.to} from=${data.from} audio=${hasAudio} size=${byteLen}`);
    sendTo(data.to, 'message', { from: data.from, text: data.text || '', audio: hasAudio ? data.audio : null, audioMime: data.audioMime || null });
  });

  socket.on('call-user', (data) => sendTo(data.to, 'incoming-call', { from: data.from }));
  socket.on('call-offer', (data) => sendTo(data.to, 'call-offer', { from: data.from, offer: data.offer }));
  socket.on('call-answer', (data) => sendTo(data.to, 'call-answer', { from: data.from, answer: data.answer }));
  socket.on('ice-candidate', (data) => sendTo(data.to, 'ice-candidate', { from: data.from, candidate: data.candidate }));
  socket.on('call-end', (data) => sendTo(data.to, 'call-ended', { from: data.from }));

  socket.on('disconnect', () => {
    if (socket.username) delete online[socket.username];
    console.log('Отключился:', socket.username);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log('Сервер запущен: http://localhost:' + PORT);
});