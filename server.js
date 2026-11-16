const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const httpServer = http.createServer((req, res) => {
  const file = path.join(__dirname, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const io = new Server(httpServer, { cors: { origin: '*' }, maxHttpBufferSize: 1e8 });
const online = {};
const ALL_USERS_FILE = path.join(__dirname, 'users.json');
const AVATARS_FILE = path.join(__dirname, 'avatars.json');
const GROUPS_FILE = path.join(__dirname, 'groups.json');
const PHONES_FILE = path.join(__dirname, 'phones.json');

function loadPhones() { try { return JSON.parse(fs.readFileSync(PHONES_FILE, 'utf8')); } catch (e) { return {}; } }
function savePhones() { try { fs.writeFileSync(PHONES_FILE, JSON.stringify(phones)); } catch (e) {} }
let phones = loadPhones();

function loadGroups() {
  try { return JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8')); } catch (e) { return []; }
}
function saveGroups() {
  try { fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups)); } catch (e) {}
}
let groups = loadGroups();

function groupFor(userLower) {
  return groups.filter((g) => g.members.map((m) => m.toLowerCase()).includes(userLower));
}

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

// Р’СЃРµ РєРѕРіРґР°-Р»РёР±Рѕ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРЅС‹Рµ СЋР·РµСЂРЅРµР№РјС‹ (РґР»СЏ СѓРЅРёРєР°Р»СЊРЅРѕСЃС‚Рё РЅР°РІСЃРµРіРґР°)
let registeredUsers = loadAllUsers();

function sendTo(username, event, data) {
  const id = online[(username || '').toLowerCase()];
  if (id) io.to(id).emit(event, data);
}

io.on('connection', (socket) => {
  // РџСЂРѕРІРµСЂРєР° СѓРЅРёРєР°Р»СЊРЅРѕСЃС‚Рё СЋР·РµСЂРЅРµР№РјР° РїСЂРё РІС…РѕРґРµ
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
    socket.emit('groups-list', groupFor(lower));
    io.emit('user-list', { users: registeredUsers, avatars: avatars, phones: phones });
    console.log('РџРѕРґРєР»СЋС‡РёР»СЃСЏ:', username);
  });

  socket.on('register', (username) => {
    const key = (username || '').toLowerCase();
    if (socket.username) delete online[socket.username];
    online[key] = socket.id;
    socket.username = key;
    socket.emit('my-avatar', avatars[key] || null);
    socket.emit('groups-list', groupFor(key));
    io.emit('user-list', { users: registeredUsers, avatars: avatars, phones: phones });
  });

  // РЎРѕР·РґР°РЅРёРµ РіСЂСѓРїРїС‹/РєР°РЅР°Р»Р°
  socket.on('create-group', (data) => {
    const { name, type, members } = data || {};
    if (!name) return;
    const id = 'g' + Date.now() + Math.floor(Math.random() * 1000);
    const memberList = [socket.username].concat((members || []).map((m) => String(m).toLowerCase()));
    const uniqueMembers = [];
    memberList.forEach((m) => { if (!uniqueMembers.includes(m)) uniqueMembers.push(m); });
    const group = { id: id, name: String(name), type: type === 'channel' ? 'channel' : 'group', owner: socket.username, members: uniqueMembers };
    groups.push(group);
    saveGroups();
    uniqueMembers.forEach((m) => {
      const idSocket = online[m];
      if (idSocket) io.to(idSocket).emit('group-invite', group);
    });
    socket.emit('group-invite', group);
  });

  // РЈСЃС‚Р°РЅРѕРІРєР° Р°РІР°С‚Р°СЂРєРё
socket.on('set-avatar', (data) => {
    const key = (socket.username || '').toLowerCase();
    if (!key) return;
    avatars[key] = String(data.avatar || '').slice(0, 2000000);
    saveAvatars();
    io.emit('user-list', { users: registeredUsers, avatars: avatars, phones: phones });
  });

  socket.on('set-phone', (data) => {
    const key = (socket.username || '').toLowerCase();
    if (!key) return;
    phones[key] = String(data.phone || '');
    savePhones();
    io.emit('user-list', { users: registeredUsers, avatars: avatars, phones: phones });
  });

  socket.on('rename-user', (data) => {
    const oldKey = (socket.username || '').toLowerCase();
    const newName = (data.username || '').trim().replace(/^@/, '').replace(/\s+/g, ' ');
    if (!oldKey || !newName) return;
    const newKey = newName.toLowerCase();
    if (newKey === oldKey) return;
    if (online[newKey] && online[newKey] !== socket.id) { socket.emit('rename-fail'); return; }
    // Обновляем в registeredUsers
    const idx = registeredUsers.findIndex((u) => u.toLowerCase() === oldKey);
    if (idx !== -1) registeredUsers[idx] = newName; else registeredUsers.push(newName);
    saveAllUsers();
    if (avatars[oldKey]) { avatars[newKey] = avatars[oldKey]; delete avatars[oldKey]; saveAvatars(); }
    if (phones[oldKey]) { phones[newKey] = phones[oldKey]; delete phones[oldKey]; savePhones(); }
    delete online[oldKey];
    online[newKey] = socket.id;
    socket.username = newKey;
    socket.emit('my-avatar', avatars[newKey] || null);
    socket.emit('renamed', { username: newName });
    io.emit('user-list', { users: registeredUsers, avatars: avatars, phones: phones });
  });

  socket.on('message', (data) => {
    const hasAudio = data.audio !== undefined && data.audio !== null && data.audio !== '';
    const byteLen = hasAudio ? (data.audio.byteLength !== undefined ? data.audio.byteLength : data.audio.length) : 'РЅРµС‚';
    console.log(`[message] to=${data.to} from=${data.from} audio=${hasAudio} size=${byteLen}`);
    sendTo(data.to, 'message', { from: data.from, text: data.text || '', audio: hasAudio ? data.audio : null, audioMime: data.audioMime || null });
  });

  // РЎРѕРѕР±С‰РµРЅРёРµ РІ РіСЂСѓРїРїСѓ/РєР°РЅР°Р» вЂ” СЂР°СЃСЃС‹Р»Р°РµС‚СЃСЏ РІСЃРµРј СѓС‡Р°СЃС‚РЅРёРєР°Рј
  socket.on('group-message', (data) => {
    const gid = String(data.groupId || '');
    const group = groups.find((g) => g.id === gid);
    if (!group) return;
    const hasAudio = data.audio !== undefined && data.audio !== null && data.audio !== '';
    const payload = { groupId: gid, from: socket.username, text: data.text || '', audio: hasAudio ? data.audio : null, audioMime: data.audioMime || null };
    group.members.forEach((m) => {
      const idSocket = online[m];
      if (idSocket) io.to(idSocket).emit('group-message', payload);
    });
  });

  socket.on('call-user', (data) => sendTo(data.to, 'incoming-call', { from: data.from }));
  socket.on('call-offer', (data) => sendTo(data.to, 'call-offer', { from: data.from, offer: data.offer }));
  socket.on('call-answer', (data) => sendTo(data.to, 'call-answer', { from: data.from, answer: data.answer }));
  socket.on('ice-candidate', (data) => sendTo(data.to, 'ice-candidate', { from: data.from, candidate: data.candidate }));
  socket.on('call-end', (data) => sendTo(data.to, 'call-ended', { from: data.from }));

  socket.on('disconnect', () => {
    if (socket.username) delete online[socket.username];
    console.log('РћС‚РєР»СЋС‡РёР»СЃСЏ:', socket.username);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log('РЎРµСЂРІРµСЂ Р·Р°РїСѓС‰РµРЅ: http://localhost:' + PORT);
});
