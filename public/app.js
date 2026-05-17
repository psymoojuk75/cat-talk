const socket = io();

let currentUser = null;
let currentData = null;
let currentTab = "rooms";
let currentRoom = null;
let onlineUsers = [];

const $ = id => document.getElementById(id);

$("darkBtn").onclick = () => {
  document.body.classList.toggle("dark-mode");
};

$("messageInput").addEventListener("input", () => {
  if (currentRoom) {
    socket.emit("typing", {
      roomId: currentRoom.id,
      nickname: currentUser.nickname
    });
  }
});

$("fileInput").addEventListener("change", () => {
  if ($("fileInput").files.length) sendMessage();
});

socket.on("dataChanged", () => loadMyData());

let updateTimer = null;

socket.on("roomUpdated", roomId => {
  if (currentRoom && Number(currentRoom.id) === Number(roomId)) {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      loadMyData(true);
      playNotify();
    }, 300);
  }
});

socket.on("onlineUsers", users => {
  onlineUsers = users || [];
  renderOnline();
});

socket.on("typing", data => {
  if (!currentRoom || Number(data.roomId) !== Number(currentRoom.id)) return;
  $("typingText").textContent = `${data.nickname}님이 입력 중...`;
  setTimeout(() => $("typingText").textContent = "", 1200);
});

function playNotify() {
  const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
  audio.play().catch(() => {});
}

async function issueNickname() {
  const nickname = $("issueNickname").value.trim();
  if (!nickname) return alert("닉네임을 입력하세요.");

  const res = await fetch("/api/issue-nickname", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ nickname })
  });

  const result = await res.json();

  if (result.ok) {
    $("issuedCodeBox").innerHTML =
      `🎉 닉네임: ${escapeHtml(result.user.nickname)}<br>🔑 입장코드: ${result.user.code}`;
    $("loginCode").value = result.user.code;
    alert(`코드 발급 완료: ${result.user.code}`);
  } else {
    alert(result.message || "발급 실패");
  }
}

async function login() {
  const code = $("loginCode").value.trim();
  if (!code) return alert("입장코드를 입력하세요.");

  const res = await fetch("/api/login", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ code })
  });

  const result = await res.json();

  if (result.ok) {
    currentUser = result.user;
    localStorage.setItem("catTalkUser", JSON.stringify(currentUser));
    openMain();
  } else {
    alert("입장코드가 틀렸습니다.");
  }
}

function openMain() {
  $("authScreen").classList.add("hidden");
  $("mainScreen").classList.remove("hidden");
  $("userBadge").textContent = `${currentUser.profileEmoji || "🐱"} ${currentUser.nickname} #${currentUser.code}`;
  socket.emit("online", currentUser);
  loadMyData();
}

function logout() {
  localStorage.removeItem("catTalkUser");
  location.reload();
}

async function loadMyData(keepRoom = false) {
  if (!currentUser) return;

  const res = await fetch(`/api/my?code=${currentUser.code}`);
  const result = await res.json();
  if (!result.ok) return;

  currentData = result;

  if (currentRoom && keepRoom) {
    const room = currentData.rooms.find(r => Number(r.id) === Number(currentRoom.id));
    if (room) {
      currentRoom = room;
      renderRoomMessages();
      renderOnline();
    }
    return;
  }

  if (currentRoom) {
    const room = currentData.rooms.find(r => Number(r.id) === Number(currentRoom.id));
    if (room) {
      currentRoom = room;
      renderRoomMessages();
      renderOnline();
    }
  } else {
    renderTab();
  }
}

function showTab(tab) {
  currentTab = tab;
  ["Rooms", "Invite", "Approve", "People", "Profile", "Rank"].forEach(name => {
    const el = $("tab" + name);
    if (el) el.classList.remove("active");
  });

  const id = "tab" + tab.charAt(0).toUpperCase() + tab.slice(1);
  if ($(id)) $(id).classList.add("active");
  renderTab();
}

function renderTab() {
  if (!currentData) return;
  if (currentTab === "rooms") renderRooms();
  if (currentTab === "invite") renderInvite();
  if (currentTab === "approve") renderApprove();
  if (currentTab === "people") renderPeople();
  if (currentTab === "profile") renderProfile();
  if (currentTab === "rank") renderRank();
}

function renderRooms() {
  const box = $("tabContent");
  const rooms = currentData.rooms || [];

  box.innerHTML = `<h2>💬 내 채팅방 <span class="badge">${rooms.length}</span></h2>`;

  if (!rooms.length) {
    box.innerHTML += `<div class="list-item">아직 채팅방이 없습니다.</div>`;
    return;
  }

  rooms.forEach(room => {
    box.innerHTML += `
      <div class="list-item" onclick="openRoom(${room.id})">
        <b>${escapeHtml(room.title)}</b>
        <p class="small">메시지 ${room.messages.length}개 · 방장 #${room.ownerCode}</p>
        ${room.notice ? `<p>📌 ${escapeHtml(room.notice)}</p>` : ""}
      </div>
    `;
  });
}

function renderInvite() {
  $("tabContent").innerHTML = `
    <h2>➕ 초대하기</h2>
    <div class="card">
      <p>닉네임 또는 코드 입력. 여러 명은 쉼표로 구분.</p>
      <input id="targetInput" placeholder="예: 2, 재미나">
      <input id="invitePassword" placeholder="비밀방 비밀번호. 없으면 비워두기">
      <button onclick="createInvite()">초대 요청</button>
    </div>
  `;
}

async function createInvite() {
  const targets = $("targetInput").value.trim();
  if (!targets) return alert("상대를 입력하세요.");

  const res = await fetch("/api/invite", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      myCode: currentUser.code,
      targets,
      password: $("invitePassword").value
    })
  });

  const result = await res.json();
  if (result.ok) {
    alert("초대 요청 완료! 모두 승인하면 방 생성!");
    showTab("approve");
    loadMyData();
  } else {
    alert(result.message || "초대 실패");
  }
}

function renderApprove() {
  const box = $("tabContent");
  const invites = currentData.invites || [];
  box.innerHTML = `<h2>✅ 승인탭</h2>`;

  if (!invites.length) {
    box.innerHTML += `<div class="list-item">초대가 없습니다.</div>`;
    return;
  }

  invites.forEach(invite => {
    const me = invite.members.find(m => Number(m.code) === Number(currentUser.code));
    const members = invite.members.map(m =>
      `${escapeHtml(m.nickname)} #${m.code} ${m.approved ? "✅" : m.rejected ? "❌" : "⏳"}`
    ).join("<br>");

    box.innerHTML += `
      <div class="list-item">
        <b>초대자: ${escapeHtml(invite.requesterNickname)} #${invite.requesterCode}</b>
        <p class="small">상태: ${invite.status}</p>
        <p>${members}</p>
        ${
          me && !me.approved && !me.rejected && invite.status === "승인대기"
            ? `<button class="green" onclick="approveInvite(${invite.id})">승인</button>
               <button class="red" onclick="rejectInvite(${invite.id})">거절</button>`
            : ""
        }
        ${invite.roomId ? `<button onclick="openRoom(${invite.roomId})">방 들어가기</button>` : ""}
      </div>
    `;
  });
}

async function approveInvite(id) {
  const res = await fetch("/api/invite/approve", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ myCode: currentUser.code, inviteId: id })
  });

  const result = await res.json();
  alert(result.room ? "모두 승인! 방 생성!" : "승인 완료");
  loadMyData();
}

async function rejectInvite(id) {
  if (!confirm("거절할까요?")) return;

  await fetch("/api/invite/reject", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ myCode: currentUser.code, inviteId: id })
  });

  loadMyData();
}

function renderPeople() {
  const box = $("tabContent");
  const users = currentData.users || [];

  box.innerHTML = `<h2>👥 사람 목록</h2>`;
  users.forEach(user => {
    box.innerHTML += `
      <div class="list-item">
        <b>${user.profileEmoji || "🐱"} ${escapeHtml(user.nickname)} #${user.code}</b>
        <p class="small">${escapeHtml(user.status || "")}</p>
        ${
          Number(user.code) !== Number(currentUser.code)
            ? `<button onclick="quickInvite(${user.code})">초대</button>`
            : `<span class="small">나</span>`
        }
      </div>
    `;
  });
}

async function quickInvite(code) {
  await fetch("/api/invite", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ myCode: currentUser.code, targets: String(code) })
  });
  showTab("approve");
  loadMyData();
}

function renderProfile() {
  $("tabContent").innerHTML = `
    <h2>🎨 프로필 꾸미기</h2>
    <div class="card">
      <input id="profileNickname" value="${escapeAttr(currentUser.nickname)}" placeholder="닉네임">
      <input id="profileEmoji" value="${escapeAttr(currentUser.profileEmoji || "🐱")}" placeholder="프로필 이모지">
      <input id="profileColor" value="${escapeAttr(currentUser.profileColor || "#f7e600")}" placeholder="프로필 색상">
      <input id="profileStatus" value="${escapeAttr(currentUser.status || "")}" placeholder="상태메시지">
      <button onclick="saveProfile()">저장</button>
    </div>
  `;
}

async function saveProfile() {
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      code: currentUser.code,
      nickname: $("profileNickname").value,
      profileEmoji: $("profileEmoji").value,
      profileColor: $("profileColor").value,
      status: $("profileStatus").value
    })
  });

  const result = await res.json();
  if (result.ok) {
    currentUser = result.user;
    localStorage.setItem("catTalkUser", JSON.stringify(currentUser));
    $("userBadge").textContent = `${currentUser.profileEmoji} ${currentUser.nickname} #${currentUser.code}`;
    alert("프로필 저장 완료");
    loadMyData();
  }
}

function renderRank() {
  const box = $("tabContent");
  box.innerHTML = `<h2>🏆 인기방 랭킹</h2>`;

  (currentData.ranking || []).forEach((room, i) => {
    box.innerHTML += `
      <div class="list-item">
        <b>${i + 1}위 ${escapeHtml(room.title)}</b>
        <p class="small">메시지 ${room.count}개</p>
      </div>
    `;
  });
}

function openRoom(roomId) {
  const room = currentData.rooms.find(r => Number(r.id) === Number(roomId));
  if (!room) return alert("방 없음");

  if (room.password) {
    const pw = prompt("비밀방 비밀번호 입력");
    if (pw !== room.password) return alert("비밀번호 틀림");
  }

  currentRoom = room;
  $("mainScreen").classList.add("hidden");
  $("chatView").classList.remove("hidden");
  $("roomTitle").textContent = room.title;

  socket.emit("joinRoom", room.id);

  $("noticeBar").classList.toggle("hidden", !room.notice);
  $("noticeBar").textContent = room.notice ? "📌 " + room.notice : "";

  $("roomNoticeInput").value = room.notice || "";
  $("roomBgmInput").value = room.bgm || "";
  $("roomPasswordInput").value = room.password || "";

  renderRoomMessages();
  renderOnline();
}

function backToMain() {
  currentRoom = null;
  $("chatView").classList.add("hidden");
  $("mainScreen").classList.remove("hidden");
  loadMyData();
}

function renderOnline() {
  if (!currentRoom) return;

  const codes = currentRoom.memberCodes || [];
  const names = onlineUsers
    .filter(u => codes.some(c => Number(c) === Number(u.code)))
    .map(u => `${u.profileEmoji || "🐱"} ${u.nickname}`);

  $("onlineBar").textContent = names.length ? "🟢 접속중: " + names.join(", ") : "";
}

function renderRoomMessages() {
  if (!currentRoom) return;
  const box = $("messages");
  box.innerHTML = "";

  (currentRoom.messages || []).forEach(msg => {
    const isMe = Number(msg.code) === Number(currentUser.code);
    const user = (currentData.users || []).find(u => Number(u.code) === Number(msg.code));
    const profileEmoji = user?.profileEmoji || (msg.code === 0 ? "🤖" : "🐱");
    const profileColor = user?.profileColor || "#f7e600";
    const reactions = Object.entries(msg.reactions || {})
      .map(([emoji, users]) => `${emoji} ${users.length}`)
      .join(" ");

    box.innerHTML += `
      <div class="msg-row ${isMe ? "me" : ""}">
        ${isMe ? "" : `<div class="profile" style="background:${profileColor}">${profileEmoji}</div>`}
        <div class="bubble-wrap">
          ${isMe ? "" : `<div class="name">${escapeHtml(msg.nickname)} #${msg.code}</div>`}
          <div class="bubble">
            ${escapeHtml(msg.text)}
            ${msg.edited ? `<span class="small"> (수정됨)</span>` : ""}
            ${msg.fileUrl && msg.fileType?.startsWith("image")
              ? `<img src="${msg.fileUrl}">`
              : ""}
            ${msg.fileUrl && msg.fileType?.startsWith("audio")
              ? `<audio controls src="${msg.fileUrl}"></audio>`
              : ""}
          </div>
          <div class="time">${msg.createdAt || ""}</div>
          <div class="reactions">${reactions}</div>
          <div class="actions">
            <button onclick="reactMessage(${msg.id}, '❤️')">❤️</button>
            <button onclick="reactMessage(${msg.id}, '👍')">👍</button>
            <button onclick="reactMessage(${msg.id}, '😹')">😹</button>
            ${isMe && !msg.deleted ? `<button onclick="editMessage(${msg.id})">수정</button><button onclick="deleteMessage(${msg.id})">삭제</button>` : ""}
          </div>
        </div>
      </div>
    `;
  });

  box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
  if (!currentRoom) return;

  const text = $("messageInput").value.trim();
  const file = $("fileInput").files[0];

  if (!text && !file) return;

  const form = new FormData();
  form.append("myCode", currentUser.code);
  form.append("roomId", currentRoom.id);
  form.append("text", text);
  if (file) form.append("file", file);

  const res = await fetch("/api/room/message", {
    method: "POST",
    body: form
  });

  if (res.ok) {
    $("messageInput").value = "";
    $("fileInput").value = "";
    await loadMyData(true);
  }
}

async function editMessage(id) {
  const text = prompt("수정할 내용");
  if (!text) return;

  await fetch("/api/room/message/edit", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      myCode: currentUser.code,
      roomId: currentRoom.id,
      messageId: id,
      text
    })
  });

  loadMyData(true);
}

async function deleteMessage(id) {
  if (!confirm("삭제할까요?")) return;

  await fetch("/api/room/message/delete", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      myCode: currentUser.code,
      roomId: currentRoom.id,
      messageId: id
    })
  });

  loadMyData(true);
}

async function reactMessage(id, emoji) {
  await fetch("/api/room/message/react", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      myCode: currentUser.code,
      roomId: currentRoom.id,
      messageId: id,
      emoji
    })
  });

  loadMyData(true);
}

function toggleRoomMenu() {
  $("roomMenu").classList.toggle("hidden");
}

async function saveRoomSettings() {
  if (Number(currentRoom.ownerCode) !== Number(currentUser.code)) {
    return alert("방장만 설정 가능");
  }

  await fetch("/api/room/settings", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      myCode: currentUser.code,
      roomId: currentRoom.id,
      notice: $("roomNoticeInput").value,
      bgm: $("roomBgmInput").value,
      password: $("roomPasswordInput").value
    })
  });

  alert("방 설정 저장");
  loadMyData(true);
}

let callPeer = null;
let localCallStream = null;
let pendingCallOffer = null;

const callConfig = {
  iceServers: [

    {
      urls: "stun:stun.l.google.com:19302"
    },

    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp"
      ],
      username: "openrelayproject",
      credential: "openrelayproject"
    }

  ]
};

function getRemoteAudio() {
  let audio = document.getElementById("remoteCallAudio");

  if (!audio) {
    audio = document.createElement("audio");
    audio.id = "remoteCallAudio";
    audio.autoplay = true;
    audio.controls = true;

    document.body.appendChild(audio);
  }

  return audio;
}

async function prepareCall() {
  localCallStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false
  });

  callPeer = new RTCPeerConnection(callConfig);

  localCallStream.getTracks().forEach(track => {
    callPeer.addTrack(track, localCallStream);
  });

  callPeer.ontrack = event => {
    const audio = getRemoteAudio();
    audio.srcObject = event.streams[0];
  };

  callPeer.onicecandidate = event => {
    if (event.candidate && currentRoom) {
      socket.emit("iceCandidate", {
        roomId: currentRoom.id,
        candidate: event.candidate
      });
    }
  };
}

async function fakeCall() {
  if (!currentRoom) {
    alert("채팅방 먼저 들어가세요.");
    return;
  }

  try {
    await prepareCall();

    const offer = await callPeer.createOffer();
    await callPeer.setLocalDescription(offer);

    socket.emit("callOffer", {
      roomId: currentRoom.id,
      offer,
      from: currentUser.nickname
    });

    alert("📞 전화 거는 중...");
  } catch (err) {
    console.log(err);
    alert("통화 시작 실패");
  }
}

async function answerVoiceCall() {
  if (!pendingCallOffer) return;

  await prepareCall();

  await callPeer.setRemoteDescription(
    new RTCSessionDescription(pendingCallOffer.offer)
  );

  const answer = await callPeer.createAnswer();

  await callPeer.setLocalDescription(answer);

  socket.emit("callAnswer", {
    roomId: currentRoom.id,
    answer,
    from: currentUser.nickname
  });

  pendingCallOffer = null;

  alert("✅ 통화 연결됨");
}

socket.on("callOffer", data => {
  if (!currentRoom) return;
  if (Number(data.roomId) !== Number(currentRoom.id)) return;

  pendingCallOffer = data;

  const ok = confirm(`📞 ${data.from}님이 전화 중!\n받을까요?`);

  if (ok) {
    answerVoiceCall();
  }
});

socket.on("callAnswer", async data => {
  if (!callPeer) return;

  await callPeer.setRemoteDescription(
    new RTCSessionDescription(data.answer)
  );

  alert("🎉 통화 연결 성공!");
});

socket.on("iceCandidate", async data => {
  if (!callPeer) return;

  try {
    await callPeer.addIceCandidate(
      new RTCIceCandidate(data.candidate)
    );
  } catch (err) {
    console.log(err);
  }
});

function toggleEmojiShop() {
  $("emojiShop").classList.toggle("hidden");
}

function insertEmoji(emoji) {
  $("messageInput").value += emoji;
  $("messageInput").focus();
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(text) {
  return escapeHtml(text).replaceAll('"', "&quot;");
}

function restoreLogin() {
  const saved = localStorage.getItem("catTalkUser");
  if (saved) {
    currentUser = JSON.parse(saved);
    openMain();
  }
}

restoreLogin();
function endVoiceCall() {
  if (callPeer) {
    callPeer.close();
    callPeer = null;
  }

  if (localCallStream) {
    localCallStream.getTracks().forEach(track => track.stop());
    localCallStream = null;
  }

  const audio = document.getElementById("remoteCallAudio");
  if (audio) {
    audio.srcObject = null;
    audio.remove();
  }

  alert("☎️ 통화를 종료했습니다.");
}