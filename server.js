const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const multer = require("multer");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const DATA_FILE = path.join(__dirname, "data.json");

function quickSave() {
  try {

    const safeData = {
      users: typeof onlineUsers !== "undefined" ? onlineUsers : [],
      rooms: typeof rooms !== "undefined" ? rooms : [],
      invites: typeof invites !== "undefined" ? invites : [],
      messages: typeof messages !== "undefined" ? messages : []
    };

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(safeData, null, 2)
    );

    console.log("💾 data.json 저장 완료");

  } catch (err) {
    console.log("❌ 저장 실패", err);
  }
}

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATA_FILE = path.join(__dirname, "data.json");

function quickSave() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({
        onlineUsers,
        rooms,
        invites,
        messages
      }, null, 2)
    );

    console.log("💾 data.json 저장 완료");
  } catch (err) {
    console.log("❌ 저장 실패", err);
  }
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "public")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.floor(Math.random() * 9999) + ext);
  }
});

const upload = multer({ storage });

function ensureData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ users: [], invites: [], rooms: [] }, null, 2),
      "utf8"
    );
  }
}

function readData() {
  ensureData();

  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  data.users ||= [];
  data.invites ||= [];
  data.rooms ||= [];

  return data;
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function findUser(data, value) {
  const key = String(value).trim();

  return data.users.find(user =>
    String(user.code) === key || user.nickname === key
  );
}

function createRoomIfReady(data, invite) {
  if (invite.roomId) return null;

  const allApproved = invite.members.every(member => member.approved);

  if (!allApproved) return null;

  const room = {
    id: Date.now(),
    title: invite.members.map(member => member.nickname).join(", "),
    ownerCode: invite.requesterCode,
    memberCodes: invite.members.map(member => member.code),
    kickedCodes: [],
    password: invite.password || "",
    notice: "",
    bgm: "",
    messages: [],
    createdAt: new Date().toLocaleString("ko-KR")
  };

  data.rooms.push(room);

  invite.roomId = room.id;
  invite.status = "완료";

  return room;
}

app.get("/api/data", (req, res) => {
  res.json(readData());
});

app.post("/api/issue-nickname", (req, res) => {
  const data = readData();
  const nickname = String(req.body.nickname || "").trim();

  if (!nickname) {
    return res.status(400).json({
      ok: false,
      message: "닉네임을 입력하세요."
    });
  }

  const cleanNickname =
  nickname.trim().toLowerCase();

const exists = data.users.find(user =>
  user.nickname &&
  user.nickname.trim().toLowerCase() === cleanNickname
);

  const exists = data.users.find(user =>
  user.nickname &&
  user.nickname.trim().toLowerCase() === nickname.trim().toLowerCase()
);

  if (exists) {
    return res.status(409).json({
      ok: false,
      message: "이미 있는 닉네임입니다."
    });
  }

  const code = data.users.length
    ? Math.max(...data.users.map(user => Number(user.code))) + 1
    : 1;

  const user = {
    id: Date.now(),
    code,
    nickname,
    profileEmoji: "🐱",
    profileColor: "#f7e600",
    status: "안녕하세요. 깨톡입니다.",
    createdAt: new Date().toLocaleString("ko-KR")
  };

  data.users.push(user);
  writeData(data);

  io.emit("dataChanged");

  res.json({
    ok: true,
    user
  });
});

app.post("/api/login", (req, res) => {
  const data = readData();
  const user = findUser(data, req.body.code);

  if (!user) {
    return res.status(403).json({
      ok: false,
      message: "입장코드가 틀렸습니다."
    });
  }

  res.json({
    ok: true,
    user
  });
});

app.post("/api/profile", (req, res) => {
  const data = readData();
  const user = findUser(data, req.body.code);

  if (!user) {
    return res.status(403).json({
      ok: false,
      message: "사용자를 찾을 수 없습니다."
    });
  }

  user.nickname = req.body.nickname || user.nickname;
  user.profileEmoji = req.body.profileEmoji || user.profileEmoji;
  user.profileColor = req.body.profileColor || user.profileColor;
  user.status = req.body.status || user.status;

  writeData(data);

  io.emit("dataChanged");

  res.json({
    ok: true,
    user
  });
});

app.post("/api/invite", (req, res) => {
  const data = readData();
  const me = findUser(data, req.body.myCode);

  if (!me) {
    return res.status(403).json({
      ok: false,
      message: "로그인 정보 오류"
    });
  }

  const targets = String(req.body.targets || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

  if (targets.length === 0) {
    return res.status(400).json({
      ok: false,
      message: "초대할 사람을 입력하세요."
    });
  }

  const memberMap = new Map();

  memberMap.set(String(me.code), {
    code: me.code,
    nickname: me.nickname,
    approved: true
  });

  for (const target of targets) {
    const user = findUser(data, target);

    if (!user) {
      return res.status(404).json({
        ok: false,
        message: `${target} 사용자를 찾을 수 없습니다.`
      });
    }

    memberMap.set(String(user.code), {
      code: user.code,
      nickname: user.nickname,
      approved: Number(user.code) === Number(me.code)
    });
  }

  const members = Array.from(memberMap.values());

  if (members.length < 2) {
    return res.status(400).json({
      ok: false,
      message: "상대 1명 이상이 필요합니다."
    });
  }

  const invite = {
    id: Date.now(),
    requesterCode: me.code,
    requesterNickname: me.nickname,
    members,
    status: "승인대기",
    password: req.body.password || "",
    roomId: null,
    createdAt: new Date().toLocaleString("ko-KR")
  };

  data.invites.push(invite);
  writeData(data);

  io.emit("dataChanged");

  res.json({
    ok: true,
    invite
  });
});

app.post("/api/invite/approve", (req, res) => {
  const data = readData();
  const user = findUser(data, req.body.myCode);
  const invite = data.invites.find(invite =>
    Number(invite.id) === Number(req.body.inviteId)
  );

  if (!user || !invite) {
    return res.status(404).json({
      ok: false,
      message: "초대를 찾을 수 없습니다."
    });
  }

  const member = invite.members.find(member =>
    Number(member.code) === Number(user.code)
  );

  if (!member) {
    return res.status(403).json({
      ok: false,
      message: "내 초대가 아닙니다."
    });
  }

  member.approved = true;

  const room = createRoomIfReady(data, invite);

  writeData(data);

  io.emit("dataChanged");

  res.json({
    ok: true,
    room,
    message: room ? "모두 승인 완료! 방 생성!" : "승인 완료"
  });
});

app.post("/api/invite/reject", (req, res) => {
  const data = readData();
  const invite = data.invites.find(invite =>
    Number(invite.id) === Number(req.body.inviteId)
  );

  if (!invite) {
    return res.status(404).json({
      ok: false,
      message: "초대를 찾을 수 없습니다."
    });
  }

  invite.status = "거절됨";

  const member = invite.members.find(member =>
    Number(member.code) === Number(req.body.myCode)
  );

  if (member) {
    member.rejected = true;
  }

  writeData(data);

  io.emit("dataChanged");

  res.json({
    ok: true
  });
});

app.get("/api/my", (req, res) => {
  const data = readData();
  const user = findUser(data, req.query.code);

  if (!user) {
    return res.status(403).json({
      ok: false,
      message: "로그인 정보 오류"
    });
  }

  const rooms = data.rooms.filter(room =>
    room.memberCodes.some(code => Number(code) === Number(user.code)) &&
    !room.kickedCodes?.some(code => Number(code) === Number(user.code))
  );

  const invites = data.invites.filter(invite =>
    invite.members.some(member => Number(member.code) === Number(user.code))
  );

  const ranking = [...data.rooms]
    .sort((a, b) => b.messages.length - a.messages.length)
    .slice(0, 10)
    .map(room => ({
      id: room.id,
      title: room.title,
      count: room.messages.length
    }));

  res.json({
    ok: true,
    user,
    rooms,
    invites,
    users: data.users,
    ranking
  });
});

app.post("/api/room/message", upload.single("file"), (req, res) => {
  const data = readData();
  const user = findUser(data, req.body.myCode);
  const room = data.rooms.find(room =>
    Number(room.id) === Number(req.body.roomId)
  );

  if (!user || !room) {
    return res.status(404).json({
      ok: false,
      message: "사용자 또는 방을 찾을 수 없습니다."
    });
  }

  if (!room.memberCodes.some(code => Number(code) === Number(user.code))) {
    return res.status(403).json({
      ok: false,
      message: "이 방 멤버가 아닙니다."
    });
  }

  if (room.kickedCodes?.some(code => Number(code) === Number(user.code))) {
    return res.status(403).json({
      ok: false,
      message: "강퇴된 사용자입니다."
    });
  }

  const message = {
    id: Date.now(),
    code: user.code,
    nickname: user.nickname,
    text: req.body.text || "",
    fileUrl: req.file ? "/uploads/" + req.file.filename : "",
    fileType: req.file ? req.file.mimetype : "",
    reactions: {},
    deleted: false,
    edited: false,
    createdAt: new Date().toLocaleString("ko-KR")
  };

  room.messages.push(message);

  if ((req.body.text || "").startsWith("@깨봇")) {
    room.messages.push({
      id: Date.now() + 1,
      code: 0,
      nickname: "깨봇",
      text: "냥! 깨봇 답변입니다. 지금은 테스트 AI라서 간단한 대답만 가능하다냥 😹",
      fileUrl: "",
      fileType: "",
      reactions: {},
      deleted: false,
      edited: false,
      createdAt: new Date().toLocaleString("ko-KR")
    });
  }

  writeData(data);

  io.to(String(room.id)).emit("roomUpdated", room.id);

  res.json({
    ok: true,
    message
  });
});

app.post("/api/room/message/edit", (req, res) => {
  const data = readData();
  const user = findUser(data, req.body.myCode);
  const room = data.rooms.find(room =>
    Number(room.id) === Number(req.body.roomId)
  );

  if (!user || !room) {
    return res.status(404).json({
      ok: false
    });
  }

  const msg = room.messages.find(message =>
    Number(message.id) === Number(req.body.messageId)
  );

  if (!msg || Number(msg.code) !== Number(user.code)) {
    return res.status(403).json({
      ok: false
    });
  }

  msg.text = req.body.text || msg.text;
  msg.edited = true;

  writeData(data);

  io.to(String(room.id)).emit("roomUpdated", room.id);

  res.json({
    ok: true
  });
});

app.post("/api/room/message/delete", (req, res) => {
  const data = readData();
  const user = findUser(data, req.body.myCode);
  const room = data.rooms.find(room =>
    Number(room.id) === Number(req.body.roomId)
  );

  if (!user || !room) {
    return res.status(404).json({
      ok: false
    });
  }

  const msg = room.messages.find(message =>
    Number(message.id) === Number(req.body.messageId)
  );

  if (!msg || Number(msg.code) !== Number(user.code)) {
    return res.status(403).json({
      ok: false
    });
  }

  msg.deleted = true;
  msg.text = "삭제된 메시지입니다.";
  msg.fileUrl = "";

  writeData(data);

  io.to(String(room.id)).emit("roomUpdated", room.id);

  res.json({
    ok: true
  });
});

app.post("/api/room/message/react", (req, res) => {
  const data = readData();
  const user = findUser(data, req.body.myCode);
  const room = data.rooms.find(room =>
    Number(room.id) === Number(req.body.roomId)
  );

  if (!user || !room) {
    return res.status(404).json({
      ok: false
    });
  }

  const msg = room.messages.find(message =>
    Number(message.id) === Number(req.body.messageId)
  );

  if (!msg) {
    return res.status(404).json({
      ok: false
    });
  }

  const emoji = req.body.emoji || "❤️";

  msg.reactions ||= {};
  msg.reactions[emoji] ||= [];

  if (!msg.reactions[emoji].includes(user.code)) {
    msg.reactions[emoji].push(user.code);
  }

  writeData(data);

  io.to(String(room.id)).emit("roomUpdated", room.id);

  res.json({
    ok: true
  });
});

app.post("/api/room/settings", (req, res) => {
  const data = readData();
  const user = findUser(data, req.body.myCode);
  const room = data.rooms.find(room =>
    Number(room.id) === Number(req.body.roomId)
  );

  if (!user || !room) {
    return res.status(404).json({
      ok: false
    });
  }

  if (Number(room.ownerCode) !== Number(user.code)) {
    return res.status(403).json({
      ok: false,
      message: "방장만 설정할 수 있습니다."
    });
  }

  room.notice = req.body.notice ?? room.notice;
  room.bgm = req.body.bgm ?? room.bgm;
  room.password = req.body.password ?? room.password;

  writeData(data);

  io.to(String(room.id)).emit("roomUpdated", room.id);

  res.json({
    ok: true
  });
});

app.post("/api/room/kick", (req, res) => {
  const data = readData();
  const owner = findUser(data, req.body.myCode);
  const room = data.rooms.find(room =>
    Number(room.id) === Number(req.body.roomId)
  );

  if (!owner || !room) {
    return res.status(404).json({
      ok: false
    });
  }

  if (Number(room.ownerCode) !== Number(owner.code)) {
    return res.status(403).json({
      ok: false,
      message: "방장만 강퇴할 수 있습니다."
    });
  }

  const targetCode = Number(req.body.targetCode);

  if (targetCode === Number(owner.code)) {
    return res.status(400).json({
      ok: false,
      message: "방장은 자기 자신을 강퇴할 수 없습니다."
    });
  }

  room.kickedCodes ||= [];

  if (!room.kickedCodes.includes(targetCode)) {
    room.kickedCodes.push(targetCode);
  }

  writeData(data);

  io.to(String(room.id)).emit("roomUpdated", room.id);
  io.emit("dataChanged");

  res.json({
    ok: true
  });
});

const online = new Map();

io.on("connection", socket => {
  socket.on("online", user => {
    if (user?.code) {
      online.set(socket.id, user);
      io.emit("onlineUsers", Array.from(online.values()));
    }
  });

  socket.on("joinRoom", roomId => {
    socket.join(String(roomId));
  });

  socket.on("typing", data => {
    socket.to(String(data.roomId)).emit("typing", data);
  });

  socket.on("callOffer", data => {
    socket.to(String(data.roomId)).emit("callOffer", data);
  });

  socket.on("callAnswer", data => {
    socket.to(String(data.roomId)).emit("callAnswer", data);
  });

  socket.on("iceCandidate", data => {
    socket.to(String(data.roomId)).emit("iceCandidate", data);
  });

  socket.on("disconnect", () => {
    online.delete(socket.id);
    io.emit("onlineUsers", Array.from(online.values()));
  });
});

server.listen(PORT, () => {
  console.log("--------------------------------");
  console.log(`깨톡 시즌4 서버 실행: http://localhost:${PORT}`);
  console.log("--------------------------------");
});
const DATA_FILE = path.join(__dirname, "data.json");

let db = {
  users: [],
  rooms: [],
  invites: [],
  messages: []
};

if (fs.existsSync(DATA_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    console.log("✅ data.json 불러오기 성공");
  } catch (err) {
    console.log("❌ data.json 읽기 실패", err);
  }
}

function saveDB() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(db, null, 2)
  );
}
setInterval(() => {
  quickSave();
}, 5000);