// ========== ПРОФИЛЬ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ==========
let unsubscribePosts = null;
let isSubmitting = false;
let changes = {};

// ========== МГНОВЕННАЯ ОТРИСОВКА (ДО ЗАПУСКА FIREBASE) ==========
document.addEventListener("DOMContentLoaded", () => {
  // Смотрим, кто был авторизован при последнем открытии приложения
  const lastUid = localStorage.getItem('lastUid');
  
  if (lastUid) {
    // 1. Мгновенно загружаем данные пользователя
    const cachedUserStr = localStorage.getItem(`cachedCurrentUser_${lastUid}`);
    if (cachedUserStr) {
      currentUserData = JSON.parse(cachedUserStr);
      
      // Отрисовываем левую панель и аватарку за 0 миллисекунд
      if (typeof updateSidebarUser === 'function') updateSidebarUser(currentUserData);
      
      // Если мы на странице профиля — мгновенно рисуем инфу профиля
if (document.getElementById('profileInfo') && typeof loadProfileInfo === 'function') {
  loadProfileInfo();
  const avatarDiv = document.getElementById('profileAvatar');
  if (avatarDiv) {
    if (currentUserData.avatar) {
      avatarDiv.innerHTML = `<img src="${currentUserData.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`;
      avatarDiv.style.background = 'transparent'; // Делаем прозрачным
    } else {
      avatarDiv.innerHTML = currentUserData.nickname ? currentUserData.nickname.charAt(0).toUpperCase() : '?';
      avatarDiv.style.background = '#3b82f6'; // Возвращаем фон для буквы
    }
  }
}
    
    // 2. Мгновенно загружаем список чатов (если мы в мессенджере)
    if (document.getElementById('chatsList')) {
      const cachedChats = localStorage.getItem(`cachedChats_${lastUid}`);
      const cachedUnreads = localStorage.getItem(`cachedUnreads_${lastUid}`);
      if (cachedChats) {
        allChats = JSON.parse(cachedChats);
        if (cachedUnreads) unreadCounts = JSON.parse(cachedUnreads);
        // Сразу выводим чаты на экран
        if (typeof displayChats === 'function') displayChats(allChats);
      }
    }
  }
}
});

onAuthStateChanged(async (user) => {
  if (!user || !user.emailVerified) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;

  localStorage.setItem('lastUid', user.uid);
  
  // 1. СНАЧАЛА ЧИТАЕМ ИЗ LOCALSTORAGE (Мгновенное отображение)
  const cacheKey = `cachedCurrentUser_${user.uid}`;
  const cachedDataStr = localStorage.getItem(cacheKey);
  
  if (cachedDataStr) {
    currentUserData = JSON.parse(cachedDataStr);
    updateSidebarUser(currentUserData); // Мгновенно обновляем левую панель
    
    // Если мы на странице профиля, тоже сразу отрисовываем данные
    if (document.getElementById('profileInfo')) loadProfileInfo();
    const profileAvatarEl = document.getElementById('profileAvatar');
    if (profileAvatarEl && typeof renderAvatar === 'function') {
        renderAvatar(currentUserData.avatar);
    } else if (profileAvatarEl) {
    // Запасной вариант для messenger.js
    if (currentUserData.avatar) {
      profileAvatarEl.innerHTML = `<img src="${currentUserData.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`;
      profileAvatarEl.style.background = 'transparent';
    } else {
      profileAvatarEl.innerHTML = currentUserData.nickname ? currentUserData.nickname.charAt(0).toUpperCase() : '?';
      profileAvatarEl.style.background = '#3b82f6';
    }
}
}

  // 2. ЗАТЕМ ИДЕМ В БАЗУ ДАННЫХ (Фоновое обновление)
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) {
  // Защита от '@undefined': проверяем, есть ли символ '|' в имени
  let nickname = t('users');
  let tag = '';
  
  if (user.displayName && user.displayName.includes('|')) {
    const parts = user.displayName.split('|');
    nickname = parts[0];
    tag = '@' + parts[1];
  } else {
    nickname = user.displayName || t('users');
    tag = await generateUniqueTag(); 
  }

  const newUserData = {
    nickname: nickname,
    tag: tag,
    email: user.email || '',
    avatar: user.photoURL || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  // 1. Создаем пользователя в Firestore
  await db.collection('users').doc(user.uid).set(newUserData);
  
  // 2. Синхронизируем displayName в Firebase Auth
  await user.updateProfile({ displayName: nickname + '|' + tag.replace('@', '') });

  // 3. Обновляем локальные переменные и кэш БЕЗ перезагрузки страницы (window.location.reload)
  currentUserData = newUserData;
  localStorage.setItem(cacheKey, JSON.stringify(currentUserData));
  userCache.set(user.uid, currentUserData);
  
  // 4. Мгновенно обновляем UI
  updateSidebarUser(currentUserData);
  if (document.getElementById('profileInfo')) loadProfileInfo();
  return;
}
    
    currentUserData = doc.data();
    
    // Обновляем кэш в localStorage свежими данными из базы
    localStorage.setItem(cacheKey, JSON.stringify(currentUserData));
    userCache.set(user.uid, currentUserData); 
    
    // Перерисовываем интерфейс актуальными данными (если они изменились)
    updateSidebarUser(currentUserData);
    if (document.getElementById('profileInfo')) loadProfileInfo();
    if (document.getElementById('postsContainer') && typeof listenForNewPosts === 'function') listenForNewPosts();
    
  } catch (error) {
    console.error('Ошибка загрузки профиля:', error);
  }
});

function loadProfileInfo() {
  const profileInfo = document.getElementById('profileInfo');
  profileInfo.innerHTML = `
    <div class="info-row">
      <label>Никнейм:</label>
      <span id="nickname">${currentUserData.nickname || 'Не указан'}</span>
      <button onclick="editNickname()" class="edit-btn">✎</button>
    </div>
    <div class="info-row">
      <label>Тег:</label>
      <span id="tag">${currentUserData.tag || 'Не указан'}</span>
      <button onclick="editTag()" class="edit-btn">✎</button>
    </div>
    <div class="info-row">
      <label>Email:</label>
      <span>${currentUserData.email}</span>
    </div>
  `;
}

function editNickname() {
  const span = document.getElementById('nickname');
  const current = span.textContent;
  span.innerHTML = `<input type="text" id="editNickname" value="${current}" class="edit-input">`;
  changes.nickname = true;
  if (!document.getElementById('saveProfileBtn')) {
    const saveBtn = document.createElement('button');
    saveBtn.id = 'saveProfileBtn';
    saveBtn.className = 'save-btn';
    saveBtn.textContent = 'Сохранить изменения';
    saveBtn.onclick = saveChanges;
    document.querySelector('.profile-info').appendChild(saveBtn);
  }
}

function editTag() {
  const span = document.getElementById('tag');
  const current = span.textContent;
  span.innerHTML = `<input type="text" id="editTag" value="${current}" placeholder="@tag" class="edit-input">`;
  changes.tag = true;
  if (!document.getElementById('saveProfileBtn')) {
    const saveBtn = document.createElement('button');
    saveBtn.id = 'saveProfileBtn';
    saveBtn.className = 'save-btn';
    saveBtn.textContent = 'Сохранить изменения';
    saveBtn.onclick = saveChanges;
    document.querySelector('.profile-info').appendChild(saveBtn);
  }
}

async function saveChanges() {
  const user = auth.currentUser;
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';
  const updates = {};
  if (changes.nickname) updates.nickname = document.getElementById('editNickname').value;
  if (changes.tag) updates.tag = document.getElementById('editTag').value;
  try {
    await db.collection('users').doc(user.uid).update(updates);
    const newDisplayName = `${updates.nickname || currentUserData.nickname}|${updates.tag || currentUserData.tag}`;
    await user.updateProfile({ displayName: newDisplayName });
    currentUserData = { ...currentUserData, ...updates };
    userCache.set(user.uid, currentUserData);
    messageDiv.innerHTML = '<div class="success">Изменения сохранены!</div>';
    document.querySelector('.profile-left').appendChild(messageDiv);
    document.getElementById('saveProfileBtn')?.remove();
    changes = {};
    setTimeout(() => messageDiv.remove(), 2000);
  } catch (error) {
    console.error('Ошибка сохранения:', error);
    messageDiv.innerHTML = '<div class="error">Ошибка при сохранении</div>';
    document.querySelector('.profile-left').appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 2000);
  }
}

function showCreatePostModal() {
  document.getElementById('postModal').style.display = 'flex';
  document.getElementById('postContent').value = '';
}
function hideCreatePostModal() {
  document.getElementById('postModal').style.display = 'none';
}
async function createPost() {
  if (isSubmitting) return;
  const content = document.getElementById('postContent').value.trim();
  if (!content) { alert('Введите текст поста'); return; }
  hideCreatePostModal();
  isSubmitting = true;
  try {
    await db.collection('posts').add({
      userId: currentUser.uid,
      userNickname: currentUserData.nickname,
      userTag: currentUserData.tag,
      content: content,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Ошибка создания поста:', error);
    alert('Ошибка при создании поста');
  } finally {
    setTimeout(() => { isSubmitting = false; }, 1000);
  }
}
async function deletePost(postId) {
  if (!confirm('Удалить этот пост?')) return;
  try {
    await db.collection('posts').doc(postId).delete();
  } catch (error) {
    console.error('Ошибка удаления поста:', error);
    alert('Ошибка при удалении поста');
  }
}

function listenForNewPosts() {
  if (unsubscribePosts) unsubscribePosts();
  unsubscribePosts = db.collection('posts')
    .where('userId', '==', currentUser.uid)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      const postsContainer = document.getElementById('postsContainer');
      if (snapshot.empty) {
        postsContainer.innerHTML = '<div class="no-posts">У вас пока нет постов. Создайте первый!</div>';
        return;
      }
      let postsHTML = '';
      snapshot.forEach(doc => {
        const post = doc.data();
        let date = 'Только что';
        if (post.createdAt) {
          try { date = new Date(post.createdAt.toDate()).toLocaleString(); } catch(e) { date = 'Только что'; }
        }
        postsHTML += `
          <div class="post-card" id="post-${doc.id}">
            <div class="post-header">
              <span class="post-date">${date}</span>
              <button onclick="deletePost('${doc.id}')" class="delete-post-btn">×</button>
            </div>
            <div class="post-content">${post.content ? formatMessageText(post.content) : ''}</div>
          </div>
        `;
      });
      postsContainer.innerHTML = postsHTML;
    }, error => { console.error('Ошибка в слушателе постов:', error); });
}

window.onclick = function(event) {
  const modal = document.getElementById('postModal');
  if (event.target === modal) modal.style.display = 'none';
};

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
let selectedChat = null;
let currentChatId = null;
let unsubscribeMessages = null;
let unsubscribeChats = null;
let allChats = [];
let allUsers = [];
let allUsersForModal = [];
let isChatMode = false;
let selectedMessageId = null;
let unreadCounts = {};
let isCreatingGroup = false;
let isNewChatPending = false;

// Глобальные множества для хранения выбранных ID пользователей
let selectedUsersForCreate = new Set();
let selectedUsersForAdd = new Set();

// Функция для обработки клика по галочке
function toggleUserSelection(userId, isChecked, mode) {
  if (mode === 'create') {
    if (isChecked) selectedUsersForCreate.add(userId);
    else selectedUsersForCreate.delete(userId);
  } else if (mode === 'add') {
    if (isChecked) selectedUsersForAdd.add(userId);
    else selectedUsersForAdd.delete(userId);
  }
}

// ========== ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ ==========
async function loadAllUsers() {
  if (!currentUser) return;
  try {
    const snapshot = await db.collection('users').get();
    allUsers = [];
snapshot.forEach(doc => {
  const data = doc.data();
  const isDeleted = !data.nickname || 
                    data.nickname === 'Deleted' || 
                    data.nickname === 'Удаленный аккаунт' || 
                    data.nickname === 'Users:' || 
                    data.nickname === 'Users' || 
                    data.deletedAt;

  if (doc.id !== currentUser.uid && !isDeleted) {
    allUsers.push({ id: doc.id, ...data });
  }
});
  } catch (error) {
    console.error('Ошибка загрузки пользователей:', error);
  }
}

async function loadAllUsersForModal() {
  if (!currentUser) return;
  try {
    const snapshot = await db.collection('users').get();
    allUsersForModal = [];
    snapshot.forEach(doc => {
  const data = doc.data();
  const isDeleted = !data.nickname || 
                    data.nickname === 'Deleted' || 
                    data.nickname === 'Удаленный аккаунт' || 
                    data.nickname === 'Users:' || 
                    data.nickname === 'Users' || 
                    data.deletedAt;

  if (doc.id !== currentUser.uid && !isDeleted) {
        allUsersForModal.push({ id: doc.id, ...data });
      }
    });
  } catch (error) {
    console.error('Ошибка загрузки пользователей:', error);
  }
}

async function getUserById(userId) {
  if (userCache.has(userId)) return userCache.get(userId);
  try {
    const doc = await db.collection('users').doc(userId).get();
    const data = doc.exists ? doc.data() : null;
    if (data) userCache.set(userId, data);
    return data;
  } catch (error) {
    console.error('Ошибка загрузки пользователя:', error);
    return null;
  }
}

// ========== ПРОСЛУШИВАНИЕ ЧАТОВ ==========
function listenForChats() {
  if (!currentUser) return;

  // 1. ЧТЕНИЕ ИЗ КЭША (Stale-While-Revalidate)
  const cacheKeyChats = `cachedChats_${currentUser.uid}`;
  const cacheKeyUnreads = `cachedUnreads_${currentUser.uid}`;
  
  try {
    const cachedChatsStr = localStorage.getItem(cacheKeyChats);
    const cachedUnreadsStr = localStorage.getItem(cacheKeyUnreads);
    
    if (cachedChatsStr) {
      allChats = JSON.parse(cachedChatsStr).map(chat => ({
        ...chat,
        lastMessageTime: chat.lastMessageTime ? new Date(chat.lastMessageTime) : null,
        createdAt: chat.createdAt ? new Date(chat.createdAt) : null
      }));
      
      if (cachedUnreadsStr) {
        unreadCounts = JSON.parse(cachedUnreadsStr);
      }
      
      if (!isNewChatPending && allChats.length > 0) {
        displayChats(allChats);
      }
    }
  } catch (error) {
    console.error('Ошибка чтения кэша чатов:', error);
  }

  if (unsubscribeChats) unsubscribeChats();

  // 2. ФОНОВОЕ ОБНОВЛЕНИЕ ИЗ FIREBASE
  unsubscribeChats = db.collection('chats')
    .where('participants', 'array-contains', currentUser.uid)
    .onSnapshot(snapshot => {
      const chatsList = document.getElementById('chatsList');
      if (!chatsList) return;

      if (snapshot.empty) {
        chatsList.innerHTML = `<div class="no-chats">${t('noChatsText')}</div>`;
        allChats = [];
        localStorage.removeItem(cacheKeyChats);
        localStorage.removeItem(cacheKeyUnreads);
        if (!isNewChatPending) {
          displayChats(allChats);
        }
        return;
      }

      const chatPromises = [];
      const chats = [];
      const newUnreadCounts = {};

      snapshot.forEach(doc => {
        const chat = doc.data();
        const promise = (async () => {
          let chatName = '';
          let chatAvatar = '';
          let chatImage = null;
          let createdAt = chat.createdAt ? chat.createdAt.toDate?.() || new Date(chat.createdAt) : new Date();

          if (chat.isGroup) {
            chatName = chat.name || t('defaultGroupName');
            chatAvatar = '👥';
            chatImage = chat.avatar || chat.bitmap || chat.photo || chat.profileImage || null;
          } else {
  const otherUserId = chat.participants.find(id => id !== currentUser.uid);
  const otherUser = await getUserById(otherUserId);
  
  const rawName = otherUser ? otherUser.nickname : '';
  if (!rawName || rawName === 'Users:' || rawName === 'Users' || rawName === 'Удаленный аккаунт') {
    chatName = 'Deleted';
  } else {
    chatName = rawName;
  }

  chatAvatar = otherUser ? otherUser.tag : '';
  chatImage = otherUser ? (otherUser.avatar || otherUser.bitmap || otherUser.photo || otherUser.profileImage || null) : null;
}

          const lastMsgQuery = await db.collection('chats').doc(doc.id)
            .collection('messages')
            .orderBy('timestamp', 'desc')
            .limit(5)
            .get();

          let lastMessage = null;
          let lastMessageTime = chat.lastMessageTime ? chat.lastMessageTime.toDate?.() || new Date(chat.lastMessageTime) : null;
          let hasAnyMessage = false;

          for (const msgDoc of lastMsgQuery.docs) {
  const msg = msgDoc.data();
  hasAnyMessage = true;
  if (!msg.deletedFor || (!msg.deletedFor.includes('everyone') && !msg.deletedFor.includes(currentUser.uid))) {
    // Если сообщение системное, парсим его, иначе берем обычный текст
    lastMessage = msg.isSystem ? getSystemMessageText(msg) : msg.text; 
    lastMessageTime = msg.timestamp ? msg.timestamp.toDate?.() || new Date(msg.timestamp) : lastMessageTime;
    break;
  }
}

          if (!chat.isGroup && !hasAnyMessage) return;

          if (!lastMessageTime) {
            lastMessageTime = createdAt;
          }

          let unreadCount = 0;
          if (chat.isGroup) {
            const messagesSnapshot = await db.collection('chats').doc(doc.id)
              .collection('messages')
              .orderBy('timestamp', 'desc')
              .limit(50)
              .get();
            messagesSnapshot.forEach(msgDoc => {
              const msg = msgDoc.data();
              if (msg.deletedFor && (msg.deletedFor.includes('everyone') || msg.deletedFor.includes(currentUser.uid))) return;
              if (msg.isSystem) return;
              if (msg.senderId !== currentUser.uid && (!msg.readBy || !msg.readBy.includes(currentUser.uid))) {
                unreadCount++;
              }
            });
          } else {
            const unreadQuery = await db.collection('chats').doc(doc.id)
              .collection('messages')
              .where('read', '==', false)
              .get();
            unreadQuery.forEach(msgDoc => {
              const msg = msgDoc.data();
              if (msg.deletedFor && (msg.deletedFor.includes('everyone') || msg.deletedFor.includes(currentUser.uid))) return;
              if (msg.receiverId === currentUser.uid) unreadCount++;
            });
          }

          newUnreadCounts[doc.id] = unreadCount;

          chats.push({
            id: doc.id,
            ...chat,
            displayName: chatName,
            displayAvatar: chatAvatar,
            chatImage: chatImage,
            lastMessage: lastMessage,
            lastMessageTime: lastMessageTime,
            createdAt: createdAt
          });
        })();
        chatPromises.push(promise);
      });

      Promise.all(chatPromises).then(() => {
        const filteredChats = chats.filter(chat => chat !== undefined);
        unreadCounts = newUnreadCounts;
        allChats = filteredChats;
        allChats.sort((a, b) => {
          const unreadA = unreadCounts[a.id] || 0;
          const unreadB = unreadCounts[b.id] || 0;
          if (unreadB !== unreadA) return unreadB - unreadA;
          const timeA = a.lastMessageTime || a.createdAt || new Date(0);
          const timeB = b.lastMessageTime || b.createdAt || new Date(0);
          return timeB - timeA;
        });

        // 3. ОБНОВЛЕНИЕ КЭША НОВЫМИ ДАННЫМИ ИЗ БАЗЫ
        try {
          localStorage.setItem(cacheKeyChats, JSON.stringify(allChats));
          localStorage.setItem(cacheKeyUnreads, JSON.stringify(unreadCounts));
        } catch (e) {
          console.warn('Не удалось сохранить чаты в localStorage:', e);
        }

        if (!isNewChatPending) {
          displayChats(allChats);
        } else {
          const newChat = allChats.find(c => c.id === currentChatId);
          if (newChat && selectedChat && selectedChat.isNew) {
            selectedChat = newChat;
            selectedChat.isNew = false;
            isNewChatPending = false;
            updateChatHeader(selectedChat);
            loadMessages(false);
          }
        }
      });
    }, error => console.error('Ошибка прослушивания чатов:', error));
}

function displayChats(chats) {
  const chatsList = document.getElementById('chatsList');
  
  // Если список чатов пуст, выводим об этом информацию
  if (!chats || chats.length === 0) {
  	chatsList.innerHTML = `<div class="no-chats">${t('emptyChatList')}</div>`;
  	return;
  }

  chatsList.innerHTML = chats.map(chat => {
    const unreadCount = unreadCounts[chat.id] || 0;
    const unreadBadge = unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : '';
    
    let avatarContent = '';
    if (chat.chatImage) {
      avatarContent = `<img src="${chat.chatImage}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
      avatarContent = chat.displayName ? chat.displayName.charAt(0).toUpperCase() : '?';
    }

    const lastMessage = chat.lastMessage || 'Нет сообщений';
    const chatJson = JSON.stringify(chat).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `
      <div class="chat-item ${unreadCount > 0 ? 'has-unread' : ''}" onclick='selectChat(${chatJson})'>
        <div class="chat-avatar-placeholder" style="overflow:hidden; display:flex; align-items:center; justify-content:center; padding:0;">${avatarContent}</div>
        <div class="chat-info">
          <div class="chat-name">${chat.displayName} ${unreadBadge}</div>
          <div class="chat-last-message">${lastMessage.length > 30 ? lastMessage.substring(0, 30) + '...' : lastMessage}</div>
        </div>
      </div>
    `;
  }).join('');

  const searchInput = document.getElementById('searchInput');
  if (searchInput && searchInput.value.trim() !== '') {
    searchAll();
  }
}

// ========== ПОИСК ==========
function searchAll() {
  const searchText = document.getElementById('searchInput').value.toLowerCase();
  if (!searchText) { displayChats(allChats); return; }

  const filteredUsers = allUsers.filter(user =>
    (user.nickname && user.nickname.toLowerCase().includes(searchText)) ||
    (user.tag && user.tag.toLowerCase().includes(searchText))
  );
  const filteredChats = allChats.filter(chat =>
    chat.isGroup && chat.displayName.toLowerCase().includes(searchText)
  );

  if (filteredUsers.length === 0 && filteredChats.length === 0) {
    document.getElementById('chatsList').innerHTML = `<div class="no-users">${t('nothingFound')}</div>`;
    return;
  }

  let resultsHTML = '';
  if (filteredChats.length > 0) {
    resultsHTML += `<div class="search-section"><h4>${t('groups')}</h4></div>`;
    filteredChats.forEach(chat => {
      let avatarContent = chat.chatImage 
        ? `<img src="${chat.chatImage}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` 
        : (chat.displayName.charAt(0).toUpperCase() || '?');
      const chatJson = JSON.stringify(chat).replace(/'/g, "\\'").replace(/"/g, '&quot;');
      resultsHTML += `
        <div class="chat-item" onclick='selectChat(${chatJson})'>
          <div class="chat-avatar-placeholder" style="overflow:hidden; display:flex; align-items:center; justify-content:center; padding:0;">${avatarContent}</div>
          <div class="chat-info">
            <div class="chat-name">${chat.displayName}</div>
            <div class="chat-last-message">${t('defaultGroupName')}</div>
          </div>
        </div>
      `;
    });
  }
  if (filteredUsers.length > 0) {
    resultsHTML += `<div class="search-section"><h4>${t('users')}</h4></div>`;
    filteredUsers.forEach(user => {
      let userImage = user.avatar || user.bitmap || user.photo || user.profileImage || null;
      let avatarContent = userImage 
        ? `<img src="${userImage}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` 
        : (user.nickname ? user.nickname.charAt(0).toUpperCase() : '?');
      const tag = user.tag || '';
      const nickname = user.nickname || 'Без имени';
      resultsHTML += `
        <div class="user-item" onclick="createPrivateChat('${user.id}', '${nickname.replace(/'/g, "\\'")}', '${tag.replace(/'/g, "\\'")}')">
          <div class="user-avatar-placeholder" style="overflow:hidden; display:flex; align-items:center; justify-content:center; padding:0;">${avatarContent}</div>
          <div class="user-info">
            <div class="user-name">${nickname}</div>
            <div class="user-tag">${tag}</div>
          </div>
        </div>
      `;
    });
  }
  document.getElementById('chatsList').innerHTML = resultsHTML;
}

function searchUsersInCreate() {
  const searchText = document.getElementById('searchUsersInCreate').value.toLowerCase();
  const usersList = document.getElementById('usersListModal');
  if (!usersList) return;

  if (!searchText) { 
    usersList.innerHTML = `<div class="no-users">${t('startTypingToSearch')}</div>`;
    return; 
  }

  const filtered = allUsersForModal.filter(user =>
    (user.nickname && user.nickname.toLowerCase().includes(searchText)) ||
    (user.tag && user.tag.toLowerCase().includes(searchText))
  );

  if (filtered.length === 0) { 
    usersList.innerHTML = `<div class="no-users">${t('nothingFound')}</div>`;
    return; 
  }

  let html = '';
  filtered.forEach(user => {
    // Проверяем, есть ли ID в нашем глобальном хранилище
    const isChecked = selectedUsersForCreate.has(user.id) ? 'checked' : '';
    html += `<label class="user-checkbox"><input type="checkbox" value="${user.id}" onchange="toggleUserSelection('${user.id}', this.checked, 'create')" ${isChecked}><span>${user.nickname} ${user.tag}</span></label>`;
  });
  
  usersList.innerHTML = html;
}

function searchUsersToAdd() {
  if (!selectedChat) return;
  const searchText = document.getElementById('searchUsersToAdd').value.toLowerCase();
  const addList = document.getElementById('addParticipantsList');
  if (!addList) return;

  if (!searchText) { 
  addList.innerHTML = `<div class="no-users">${t('startTypingToSearch')}</div>`; 
  return; 
}

  const nonParticipants = allUsersForModal.filter(user => !selectedChat.participants.includes(user.id));
  const filtered = nonParticipants.filter(user =>
    (user.nickname && user.nickname.toLowerCase().includes(searchText)) ||
    (user.tag && user.tag.toLowerCase().includes(searchText))
  );

  if (filtered.length === 0) { 
  addList.innerHTML = `<div class="no-users">${t('nothingFound')}</div>`; 
  return; 
}

  let html = '';
  filtered.forEach(user => {
    // Проверяем, есть ли ID в нашем глобальном хранилище
    const isChecked = selectedUsersForAdd.has(user.id) ? 'checked' : '';
    html += `<label class="user-checkbox"><input type="checkbox" value="${user.id}" onchange="toggleUserSelection('${user.id}', this.checked, 'add')" ${isChecked}><span>${user.nickname} ${user.tag}</span></label>`;
  });
  
  addList.innerHTML = html;
}

// ========== СОЗДАНИЕ ЛИЧНОГО ЧАТА (ТОЛЬКО ПОИСК) ==========
async function createPrivateChat(userId, nickname, tag) {
  try {
    const userDoc = await getUserById(userId);
    const userImage = userDoc ? (userDoc.avatar || userDoc.bitmap || userDoc.photo || userDoc.profileImage || null) : null;
    
    const chatsSnapshot = await db.collection('chats')
      .where('participants', 'array-contains', currentUser.uid)
      .get();
    let existingChatId = null;
    let existingChat = null;
    chatsSnapshot.forEach(doc => {
      const chat = doc.data();
      if (!chat.isGroup && chat.participants.includes(userId)) {
        existingChatId = doc.id;
        existingChat = { id: doc.id, ...chat };
      }
    });
    if (existingChatId) {
      const chat = { id: existingChatId, ...existingChat, displayName: nickname, displayAvatar: tag, chatImage: userImage };
      selectChat(chat);
    } else {
      const virtualChat = {
        id: 'new_' + userId,
        participants: [currentUser.uid, userId],
        isGroup: false,
        displayName: nickname,
        displayAvatar: tag,
        chatImage: userImage,
        isNew: true,
        lastMessage: null,
        lastMessageTime: null
      };
      isNewChatPending = true;
      selectChat(virtualChat);
    }
  } catch (error) {
    console.error('Ошибка создания чата:', error);
    alert('Ошибка при создании чата');
  }
}

// ========== ВЫБОР ЧАТА ==========
async function selectChat(chat) {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  const messagesContainer = document.getElementById('messagesContainer');
  const chatHeader = document.getElementById('chatHeader');
  const messageInputArea = document.getElementById('messageInputArea');

  // Проверяем, является ли собеседник удаленным аккаунтом
  // Проверяем, является ли собеседник удаленным аккаунтом
const isDeletedAccount = !chat.isGroup && (
  chat.displayName === 'Deleted' || 
  chat.displayName === 'Удаленный аккаунт' || 
  chat.displayName === 'Users:' || 
  chat.displayName === 'Users' || 
  !chat.displayAvatar
);

  // Отрисовываем поле ввода или заглушку
  if (isDeletedAccount) {
  messageInputArea.innerHTML = `<div class="deleted-user-stub">${t('deletedUserStub')}</div>`;
} else {
    messageInputArea.innerHTML = `
  <textarea id="messageInput" placeholder="${t('typeMessage')}" rows="1" oninput="autoResize(this)" onkeydown="handleEnter(event)"></textarea>
  <button onclick="sendMessage()" id="sendButton" title="Отправить">
    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 2L11 13"/>
      <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
    </svg>
  </button>
`;
  }
  messageInputArea.style.display = 'flex';

  if (chat.isNew) {
    selectedChat = chat;
    currentChatId = chat.id;
    updateChatHeader(chat);
    messagesContainer.innerHTML = `<div class="no-messages">${t('noMessages')}</div>`;
    if (window.innerWidth <= 768) {
      enterChatMode();
    }
    return;
  }

  selectedChat = chat;
  currentChatId = chat.id;
  messagesContainer.innerHTML = `<div class="loading">${t('loadingMessages')}</div>`;
  updateChatHeader(chat);

  await loadMessages(true);

  if (window.innerWidth <= 768) {
    enterChatMode();
  }

  if (unreadCounts[chat.id] > 0) {
    markMessagesAsRead(chat.id);
  }
}

function updateChatHeader(chat) {
  const chatHeader = document.getElementById('chatHeader');
  let headerContent = '';
  
  let avatarContent = '';
  if (chat.chatImage) {
    avatarContent = `<img src="${chat.chatImage}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
  } else {
    avatarContent = chat.displayName ? chat.displayName.charAt(0).toUpperCase() : '?';
  }

  // Общий SVG-код стрелки "Назад" для мобильных и десктопов
  const backIconSvg = `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;

  if (chat.isGroup) {
    const participantsCount = chat.participants ? chat.participants.length : 2;
    headerContent = `
      <button class="mobile-back-btn" onclick="exitChatMode()">${backIconSvg}</button>
      <div class="selected-chat" onclick="openChatInfo('${chat.id}')">
        <div class="chat-avatar-placeholder large" style="overflow:hidden; display:flex; align-items:center; justify-content:center; padding:0;">${avatarContent}</div>
        <div class="chat-info">
          <h3>${chat.displayName}</h3>
          <p>${participantsCount} ${t('participantsCount')}</p>
        </div>
      </div>
    `;
  } else {
    const otherUserId = chat.participants.find(id => id !== currentUser.uid);
    headerContent = `
      <button class="mobile-back-btn" onclick="exitChatMode()">${backIconSvg}</button>
      <div class="selected-chat" onclick="openUserProfile('${otherUserId}')">
        <div class="chat-avatar-placeholder large" style="overflow:hidden; display:flex; align-items:center; justify-content:center; padding:0;">${avatarContent}</div>
        <div class="chat-info">
          <h3>${chat.displayName}</h3>
          <p>${chat.displayAvatar}</p>
        </div>
      </div>
    `;
  }
  chatHeader.innerHTML = headerContent;
}

// ========== ОТМЕТКА ПРОЧИТАННЫХ (ТОЛЬКО ЛИЧНЫЕ) ==========
async function markMessagesAsRead(chatId) {
  if (selectedChat && selectedChat.isGroup) return;
  try {
    const unreadSnapshot = await db.collection('chats').doc(chatId)
      .collection('messages')
      .where('read', '==', false)
      .get();
    if (unreadSnapshot.empty) return;
    const batch = db.batch();
    unreadSnapshot.forEach(doc => {
      const msg = doc.data();
      if (msg.receiverId === currentUser.uid) {
        batch.update(doc.ref, { read: true });
      }
    });
    await batch.commit();
    unreadCounts[chatId] = 0;
    
    // Обновляем кэш непрочитанных сразу после прочтения
    try {
      localStorage.setItem(`cachedUnreads_${currentUser.uid}`, JSON.stringify(unreadCounts));
    } catch (e) { console.warn('Ошибка записи кэша', e); }

    const chatElement = document.querySelector(`.chat-item[onclick*='${chatId}']`);
    if (chatElement) {
      chatElement.classList.remove('has-unread');
      const nameElement = chatElement.querySelector('.chat-name');
      if (nameElement) {
        const badge = nameElement.querySelector('.unread-badge');
        if (badge) badge.remove();
      }
    }
  } catch (error) {
    console.error('Ошибка при отметке сообщений как прочитанных:', error);
  }
}

// ========== ЗАГРУЗКА СООБЩЕНИЙ (БЕЗ МИГАНИЯ) ==========
async function loadMessages(showLoading = false) {
  if (!currentChatId || !selectedChat) return;
  const messagesContainer = document.getElementById('messagesContainer');
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  if (showLoading) {
    messagesContainer.innerHTML = `<div class="loading">${t('loadingMessages')}</div>`;
  }

  try {
    const snapshot = await db.collection('chats').doc(currentChatId)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .get({ source: 'server' });

    const visibleMessages = [];
    snapshot.forEach(doc => {
      const msg = doc.data();
      if (msg.deletedFor && (msg.deletedFor.includes('everyone') || msg.deletedFor.includes(currentUser.uid))) {
        return;
      }
      visibleMessages.push({ id: doc.id, ...msg });
    });

    if (visibleMessages.length === 0) {
      messagesContainer.innerHTML = `<div class="no-messages">${t('noMessages')}</div>`;
      listenForNewMessages();
      return;
    }

    const senderIds = new Set();
    visibleMessages.forEach(msg => {
      if (!msg.isSystem && selectedChat.isGroup && msg.senderId !== currentUser.uid) {
        senderIds.add(msg.senderId);
      }
    });

    const senderCache = {};
    if (senderIds.size > 0) {
      const userIds = Array.from(senderIds);
      for (let i = 0; i < userIds.length; i += 10) {
        const batch = userIds.slice(i, i + 10);
        const usersSnapshot = await db.collection('users')
          .where('__name__', 'in', batch)
          .get();
        usersSnapshot.forEach(doc => {
          senderCache[doc.id] = doc.data();
        });
      }
    }

    const batch = db.batch();
    let hasUnread = false;
    visibleMessages.forEach(msg => {
      if (selectedChat.isGroup) {
        if (msg.senderId !== currentUser.uid && !msg.isSystem) {
          if (!msg.readBy || !msg.readBy.includes(currentUser.uid)) {
            hasUnread = true;
            batch.update(db.collection('chats').doc(currentChatId).collection('messages').doc(msg.id), {
              readBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
          }
        }
      } else {
        if (msg.receiverId === currentUser.uid && !msg.read) {
          hasUnread = true;
          batch.update(db.collection('chats').doc(currentChatId).collection('messages').doc(msg.id), { read: true });
        }
      }
    });
    if (hasUnread) {
      await batch.commit();
      unreadCounts[currentChatId] = 0;
      
      // Обновляем кэш непрочитанных при групповом прочтении
      try {
        localStorage.setItem(`cachedUnreads_${currentUser.uid}`, JSON.stringify(unreadCounts));
      } catch (e) { console.warn('Ошибка записи кэша', e); }

      const chatElement = document.querySelector(`.chat-item[onclick*='${currentChatId}']`);
      if (chatElement) {
        chatElement.classList.remove('has-unread');
        const nameElement = chatElement.querySelector('.chat-name');
        if (nameElement) {
          const badge = nameElement.querySelector('.unread-badge');
          if (badge) badge.remove();
        }
      }
    }

    let html = '';
    let lastDate = '';
    const nonSystemMessages = visibleMessages.filter(msg => !msg.isSystem);
    if (nonSystemMessages.length === 0) {
      visibleMessages.forEach(msg => {
        if (msg.isSystem) {
  html += `<div class="message system" id="msg-${msg.id}"><div class="message-content">${getSystemMessageText(msg)}</div></div>`;
}
      });
    } else {
      visibleMessages.forEach(msg => {
        const isMyMessage = msg.senderId === currentUser.uid;
        let time = '';
        let messageDate = '';
        if (msg.timestamp) {
          const date = msg.timestamp.toDate();
          time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          messageDate = date.toLocaleDateString();
        }
        if (!msg.isSystem && messageDate && messageDate !== lastDate) {
          html += `<div class="date-separator">${messageDate}</div>`;
          lastDate = messageDate;
        }
        if (msg.isSystem) {
  html += `<div class="message system" id="msg-${msg.id}"><div class="message-content">${getSystemMessageText(msg)}</div></div>`;
  return;
}
        let senderInfo = '';
        if (selectedChat.isGroup && !isMyMessage) {
          const sender = senderCache[msg.senderId];
          if (sender) {
            senderInfo = `<div class="message-sender">${sender.nickname || '?'} ${sender.tag || ''}</div>`;
          }
        }
        const deleteOption = isMyMessage ? `<button class="message-delete-btn" onclick="showMessageOptions('${msg.id}', event)">⋯</button>` : '';
        html += `
          <div class="message ${isMyMessage ? 'my-message' : 'other-message'}" id="msg-${msg.id}">
            ${deleteOption}
            ${senderInfo}
            <div class="message-content">${formatMessageText(msg.text)}</div>
            <div class="message-time">${time}</div>
          </div>
        `;
      });
    }

    messagesContainer.innerHTML = html;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    listenForNewMessages();
  } catch (error) {
    console.error('Ошибка загрузки сообщений:', error);
    if (showLoading) {
      messagesContainer.innerHTML = '<div class="error">Ошибка загрузки сообщений</div>';
    }
  }
}

// ========== СЛУШАТЕЛЬ НОВЫХ И ИЗМЕНЕННЫХ СООБЩЕНИЙ ==========
function listenForNewMessages() {
  if (!currentChatId) return;
  if (unsubscribeMessages) {
    unsubscribeMessages();
  }

  unsubscribeMessages = db.collection('chats').doc(currentChatId)
    .collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot(async snapshot => {
      snapshot.docChanges().forEach(async change => {
        const msg = change.doc.data();
        const msgId = change.doc.id;

        if (change.type === 'added') {
          if (document.getElementById(`msg-${msgId}`)) return;
          if (msg.deletedFor && (msg.deletedFor.includes('everyone') || msg.deletedFor.includes(currentUser.uid))) return;

          if (selectedChat.isGroup) {
            if (msg.senderId !== currentUser.uid && !msg.isSystem) {
              if (!msg.readBy || !msg.readBy.includes(currentUser.uid)) {
                await change.doc.ref.update({ readBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
              }
            }
          } else {
            if (msg.receiverId === currentUser.uid && !msg.read) {
              await change.doc.ref.update({ read: true });
            }
          }

          const messagesContainer = document.getElementById('messagesContainer');
          
          const noMessages = messagesContainer.querySelector('.no-messages');
          if (noMessages) {
            noMessages.remove();
          }

          if (msg.isSystem) {
  const messageHTML = `<div class="message system" id="msg-${msgId}"><div class="message-content">${getSystemMessageText(msg)}</div></div>`;
  messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return;
}

          let senderInfo = '';
          if (selectedChat.isGroup && msg.senderId !== currentUser.uid && msg.senderId) {
            const sender = await getUserById(msg.senderId);
            if (sender) {
              senderInfo = `<div class="message-sender">${sender.nickname || '?'} ${sender.tag || ''}</div>`;
            }
          }
          const isMyMessage = msg.senderId === currentUser.uid;
          
          let time = '';
          if (msg.timestamp) {
            const date = msg.timestamp.toDate();
            time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } else {
            time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }

          const deleteOption = isMyMessage ? `<button class="message-delete-btn" onclick="showMessageOptions('${msgId}', event)">⋯</button>` : '';
          const messageHTML = `
            <div class="message ${isMyMessage ? 'my-message' : 'other-message'}" id="msg-${msgId}">
              ${deleteOption}
              ${senderInfo}
              <div class="message-content">${formatMessageText(msg.text)}</div>
              <div class="message-time">${time}</div>
            </div>
          `;
          messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        if (change.type === 'modified') {
          if (msg.deletedFor && (msg.deletedFor.includes('everyone') || msg.deletedFor.includes(currentUser.uid))) {
            const msgElement = document.getElementById(`msg-${msgId}`);
            if (msgElement) {
              msgElement.remove();
            }
          }
        }

        if (change.type === 'removed') {
          const msgElement = document.getElementById(`msg-${msgId}`);
          if (msgElement) {
            msgElement.remove();
          }
        }
      });
    }, error => console.error('Ошибка слушателя новых сообщений:', error));
}

// ========== ОТПРАВКА СООБЩЕНИЯ ==========
async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || !selectedChat) return;
  input.value = '';
  input.style.height = 'auto';

  try {
    if (selectedChat.isNew) {
      const otherUserId = selectedChat.participants.find(id => id !== currentUser.uid);
      const newChatRef = await db.collection('chats').add({
        participants: [currentUser.uid, otherUserId],
        isGroup: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastMessage: null,
        lastMessageTime: null
      });
      const chatId = newChatRef.id;
      selectedChat.id = chatId;
      selectedChat.isNew = false;
      currentChatId = chatId;
      isNewChatPending = false;

      const messageData = {
        text: text,
        senderId: currentUser.uid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        receiverId: otherUserId,
        read: false
      };
      await db.collection('chats').doc(chatId).collection('messages').add(messageData);
      await db.collection('chats').doc(chatId).update({
        lastMessage: text,
        lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
      });

      await loadMessages(false);
      updateChatHeader(selectedChat);
      return;
    }

    const messageData = {
      text: text,
      senderId: currentUser.uid,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (selectedChat.isGroup) {
      messageData.readBy = [currentUser.uid];
    } else {
      const otherUserId = selectedChat.participants.find(id => id !== currentUser.uid);
      messageData.receiverId = otherUserId;
      messageData.read = false;
    }

    await db.collection('chats').doc(currentChatId).collection('messages').add(messageData);
    await db.collection('chats').doc(currentChatId).update({
      lastMessage: text,
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
    });

  } catch (error) {
    console.error('Ошибка отправки:', error);
    alert('Ошибка при отправке сообщения');
    input.value = text;
  }
}

// ========== СОЗДАНИЕ ГРУППЫ ==========
function showCreateGroupModal() {
  selectedUsersForCreate.clear(); // Очищаем выбранных людей перед открытием окна
  const usersList = document.getElementById('usersListModal');
  if (!usersList) return;
  document.getElementById('searchUsersInCreate').value = '';
  usersList.innerHTML = `<div class="no-users">${t('startTypingToSearch')}</div>`;
  document.getElementById('createGroupModal').style.display = 'flex';
}
function hideCreateGroupModal() {
  document.getElementById('createGroupModal').style.display = 'none';
}
async function createGroupChat() {
  if (isCreatingGroup) return;
  const groupName = document.getElementById('groupName').value.trim();
  
  if (!groupName) { alert(t('alertEnterGroupName')); return; }
  // Проверяем наличие выбранных людей в нашем глобальном множестве
  if (selectedUsersForCreate.size === 0) { alert(t('alertSelectParticipant')); return; }
  
  isCreatingGroup = true;
  hideCreateGroupModal();
  
  const participants = [currentUser.uid];
  // Добавляем всех из памяти
  selectedUsersForCreate.forEach(userId => participants.push(userId));
  
  try {
    await db.collection('chats').add({
      name: groupName,
      participants: participants,
      isGroup: true,
      createdBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage: null,
      lastMessageTime: null
    });
    document.getElementById('groupName').value = '';
    selectedUsersForCreate.clear(); // Очищаем после успешного создания
  } catch (error) {
    console.error('Ошибка создания беседы:', error);
    alert('Ошибка при создании беседы: ' + error.message);
  } finally {
    setTimeout(() => { isCreatingGroup = false; }, 1000);
  }
}

// ========== ИНФОРМАЦИЯ О ГРУППЕ ==========
async function openChatInfo(chatId) {
  if (!selectedChat || !selectedChat.isGroup) return;
  try {
    const chatDoc = await db.collection('chats').doc(chatId).get();
    const chat = chatDoc.data();
    selectedChat = { ...selectedChat, participants: chat.participants, name: chat.name };

    const avatarDiv = document.getElementById('groupInfoAvatar');
    if (avatarDiv) {
      if (chat.avatar) {
        avatarDiv.innerHTML = `<img src="${chat.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`;
      } else {
        avatarDiv.innerHTML = chat.name ? chat.name.charAt(0).toUpperCase() : '👥';
      }
    }

    let participantsHTML = '<ul class="participants-list">';
    for (const userId of chat.participants) {
      const userData = await getUserById(userId);
      if (userData) {
        const isCreator = userId === chat.createdBy ? ' (создатель)' : '';
        const canRemove = userId !== currentUser.uid && userId !== chat.createdBy;
        participantsHTML += `<li>
          ${userData.nickname} ${userData.tag}${isCreator}
          ${canRemove ? `<button class="remove-participant-btn" onclick="removeParticipant('${userId}')">×</button>` : ''}
        </li>`;
      }
    }
    participantsHTML += '</ul>';

    document.getElementById('groupInfoName').textContent = chat.name || t('defaultGroupName');
    document.getElementById('groupParticipants').innerHTML = participantsHTML;

    const leaveBtn = document.getElementById('leaveGroupBtn');
    if (chat.createdBy === currentUser.uid) {
      leaveBtn.style.display = 'none';
    } else {
      leaveBtn.style.display = 'block';
    }

    document.getElementById('searchUsersToAdd').value = '';
    document.getElementById('addParticipantsList').innerHTML = `<div class="no-users">${t('startTypingToSearch')}</div>`;
    selectedUsersForAdd.clear(); // Очищаем список добавления

    const deleteBtn = document.getElementById('deleteGroupBtn');
    if (chat.createdBy === currentUser.uid) {
      deleteBtn.style.display = 'inline-block';
    } else {
      deleteBtn.style.display = 'none';
    }

    document.getElementById('groupInfoModal').style.display = 'flex';
  } catch (error) {
    console.error('Ошибка загрузки информации о беседе:', error);
  }
}
function hideGroupInfoModal() {
  document.getElementById('groupInfoModal').style.display = 'none';
}

// ========== УПРАВЛЕНИЕ УЧАСТНИКАМИ ГРУППЫ ==========
async function removeParticipant(userId) {
  if (!selectedChat || !selectedChat.isGroup) return;
  if (!confirm(t('confirmRemoveUser'))) return;
  try {
    await db.collection('chats').doc(selectedChat.id).update({
      participants: firebase.firestore.FieldValue.arrayRemove(userId)
    });
    const userData = await getUserById(userId);
    if (userData) {
      await db.collection('chats').doc(selectedChat.id).collection('messages').add({
  text: '', 
  systemEvent: 'sysRemoved',
  systemArgs: `${userData.nickname} ${userData.tag}`,
  senderId: 'system',
  timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  read: false,
  isSystem: true
});
    }
    const updatedChatDoc = await db.collection('chats').doc(selectedChat.id).get();
    const updatedChat = updatedChatDoc.data();
    selectedChat = { ...selectedChat, participants: updatedChat.participants };
    await openChatInfo(selectedChat.id);
    updateChatHeaderParticipantCount();
    if (unsubscribeChats) { unsubscribeChats(); }
    listenForChats();
  } catch (error) {
    console.error('Ошибка удаления участника:', error);
    alert('Ошибка при удалении участника');
  }
}

async function addSelectedParticipants() {
  if (!selectedChat) return;
  
  if (selectedUsersForAdd.size === 0) { alert(t('alertSelectParticipant')); return; }
  const newParticipants = Array.from(selectedUsersForAdd);
  
  try {
    await db.collection('chats').doc(selectedChat.id).update({
      participants: firebase.firestore.FieldValue.arrayUnion(...newParticipants)
    });
    const addedNames = [];
    for (const userId of newParticipants) {
      const userData = await getUserById(userId);
      if (userData) {
        addedNames.push(`${userData.nickname} ${userData.tag}`);
      }
    }
    await db.collection('chats').doc(selectedChat.id).collection('messages').add({
  text: '', 
  systemEvent: 'sysAdded',
  systemArgs: addedNames.join(', '),
  senderId: 'system',
  timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  read: false,
  isSystem: true
});
    const updatedChatDoc = await db.collection('chats').doc(selectedChat.id).get();
    const updatedChat = updatedChatDoc.data();
    selectedChat = { ...selectedChat, participants: updatedChat.participants };
    await openChatInfo(selectedChat.id);
    updateChatHeaderParticipantCount();
    if (unsubscribeChats) { unsubscribeChats(); }
    listenForChats();
    selectedUsersForAdd.clear(); // Очищаем после успешного добавления
  } catch (error) {
    console.error('Ошибка добавления участников:', error);
    alert('Ошибка при добавлении участников');
  }
}

async function leaveCurrentGroup() {
  if (!selectedChat || !selectedChat.isGroup) return;
  if (!confirm(t('confirmLeaveGroup'))) return;
  try {
    await db.collection('chats').doc(selectedChat.id).collection('messages').add({
  text: '', 
  systemEvent: 'sysLeft',
  systemArgs: `${currentUserData.nickname} ${currentUserData.tag}`,
  senderId: 'system',
  timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  read: false,
  isSystem: true
});
    await db.collection('chats').doc(selectedChat.id).update({
      participants: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
    });
    hideGroupInfoModal();
    exitChatMode();
  } catch (error) {
    console.error('Ошибка при выходе из беседы:', error);
    alert('Ошибка при выходе из беседы');
  }
}

async function deleteCurrentGroup() {
  if (!selectedChat || !selectedChat.isGroup) return;
  if (!confirm(t('confirmDeleteGroup'))) return;
  try {
    const messagesSnapshot = await db.collection('chats').doc(selectedChat.id)
      .collection('messages')
      .get();
    const batch = db.batch();
    messagesSnapshot.forEach(doc => batch.delete(doc.ref));
    batch.delete(db.collection('chats').doc(selectedChat.id));
    await batch.commit();
    hideGroupInfoModal();
    exitChatMode();
  } catch (error) {
    console.error('Ошибка удаления беседы:', error);
    alert('Ошибка при удалении беседы');
  }
}

function updateChatHeaderParticipantCount() {
  if (selectedChat && selectedChat.isGroup) {
    const participantCount = selectedChat.participants ? selectedChat.participants.length : 2;
    const participantElement = document.querySelector('.selected-chat p');
    if (participantElement) {
      participantElement.textContent = `${participantCount} участников`;
    }
  }
}

// ========== УДАЛЕНИЕ СООБЩЕНИЙ ==========
function showMessageOptions(messageId, event) {
  if (event) event.stopPropagation();
  selectedMessageId = messageId;
  const msgElement = document.getElementById(`msg-${messageId}`);
  if (!msgElement) return;
  const isMyMessage = msgElement.classList.contains('my-message');
  const deleteForEveryoneBtn = document.getElementById('deleteForEveryoneBtn');
  deleteForEveryoneBtn.style.display = isMyMessage ? 'block' : 'none';
  document.getElementById('messageOptionsModal').style.display = 'flex';
}
function hideMessageOptions() {
  document.getElementById('messageOptionsModal').style.display = 'none';
  selectedMessageId = null;
}

// ========== ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ОБНОВЛЕНИЯ ПРЕВЬЮ ЧАТА ==========
async function updateChatPreviewAfterDelete(chatId, isForEveryone = false) {
  const snapshot = await db.collection('chats').doc(chatId)
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(20)
    .get();

  let newLastMessage = null;
  let newLastMessageTime = null;

  for (const doc of snapshot.docs) {
  const msg = doc.data();
  if (!msg.deletedFor || (!msg.deletedFor.includes('everyone') && !msg.deletedFor.includes(currentUser.uid))) {
    // Аналогичная проверка
    newLastMessage = msg.isSystem ? getSystemMessageText(msg) : msg.text;
    newLastMessageTime = msg.timestamp ? msg.timestamp.toDate() : null;
    break;
  }
}

  if (isForEveryone) {
    await db.collection('chats').doc(chatId).update({
      lastMessage: newLastMessage,
      lastMessageTime: newLastMessageTime ? firebase.firestore.Timestamp.fromDate(newLastMessageTime) : null
    });
  } else {
    const chatIndex = allChats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      allChats[chatIndex].lastMessage = newLastMessage;
      allChats[chatIndex].lastMessageTime = newLastMessageTime;
    }
    if (selectedChat && selectedChat.id === chatId) {
      selectedChat.lastMessage = newLastMessage;
      selectedChat.lastMessageTime = newLastMessageTime;
    }
    displayChats(allChats);
  }
}

// ========== ОБНОВЛЁННЫЕ ФУНКЦИИ УДАЛЕНИЯ (без мигания) ==========
async function deleteMessageForMe() {
  if (!selectedMessageId || !currentChatId) return;
  
  const messageIdToDelete = selectedMessageId;
  hideMessageOptions();

  try {
    await db.collection('chats').doc(currentChatId)
      .collection('messages')
      .doc(messageIdToDelete)
      .update({
        deletedFor: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
      });
    await updateChatPreviewAfterDelete(currentChatId, false);
  } catch (error) {
    console.error('Ошибка удаления сообщения:', error);
    alert('Ошибка при удалении сообщения');
  }
}

async function deleteMessageForEveryone() {
  if (!selectedMessageId || !currentChatId) return;
  
  const messageIdToDelete = selectedMessageId;
  hideMessageOptions();

  try {
    await db.collection('chats').doc(currentChatId)
      .collection('messages')
      .doc(messageIdToDelete)
      .update({
        deletedFor: ['everyone']
      });
    await updateChatPreviewAfterDelete(currentChatId, true);
  } catch (error) {
    console.error('Ошибка удаления сообщения:', error);
    alert('Ошибка при удалении сообщения');
  }
}

// ========== ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ (МОБИЛЬНЫЕ) ==========
function enterChatMode() {
  isChatMode = true;
  document.body.classList.add('chat-mode');
  
  // Скрываем нижнюю панель навигации при входе в диалог
  const bottomNav = document.getElementById('mobileBottomNav');
  if (bottomNav) bottomNav.style.display = 'none';

  const chatsSidebar = document.getElementById('chatsSidebar');
  if (chatsSidebar) chatsSidebar.style.display = 'none';
  history.pushState({ chatMode: true }, '', window.location.href);
}

function exitChatMode() {
  isChatMode = false;
  document.body.classList.remove('chat-mode');

  // Возвращаем нижнюю панель ТОЛЬКО на мобильных устройствах и в неактивном режиме чата
  const bottomNav = document.getElementById('mobileBottomNav');
  if (bottomNav) {
    bottomNav.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
  }

  const chatsSidebar = document.getElementById('chatsSidebar');
  if (chatsSidebar) chatsSidebar.style.display = 'flex';
  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
  selectedChat = null;
  currentChatId = null;
  document.getElementById('chatHeader').innerHTML = `<div class="no-chat-selected">${t('noChatSelected')}</div>`;
  document.getElementById('messagesContainer').innerHTML = '';
  document.getElementById('messageInputArea').style.display = 'none';
  isNewChatPending = false;
}

window.addEventListener('popstate', function(event) {
  if (isChatMode) exitChatMode();
});

function openUserProfile(userId) {
  window.location.href = `user.html?id=${userId}`;
}

// ========== ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ И РЕСАЙЗЕ ==========
window.addEventListener('load', function() {
  if (window.innerWidth <= 768) {
    document.body.classList.remove('chat-mode');
    const bottomNav = document.getElementById('mobileBottomNav');
    if (bottomNav) bottomNav.style.display = 'flex';
    document.getElementById('messageInputArea').style.display = 'none';
    const chatsSidebar = document.getElementById('chatsSidebar');
    if (chatsSidebar) chatsSidebar.style.display = 'flex';
  }
});

window.addEventListener('resize', function() {
  const bottomNav = document.getElementById('mobileBottomNav');
  if (window.innerWidth > 768) {
    document.body.classList.remove('chat-mode');
    if (bottomNav) bottomNav.style.display = 'none';
    const chatsSidebar = document.getElementById('chatsSidebar');
    if (chatsSidebar) chatsSidebar.style.display = 'flex';
  } else {
    if (bottomNav) bottomNav.style.display = isChatMode ? 'none' : 'flex';
    const chatsSidebar = document.getElementById('chatsSidebar');
    if (chatsSidebar) chatsSidebar.style.display = isChatMode ? 'none' : 'flex';
  }
});

onAuthStateChanged(async (user) => {
  if (!user || !user.emailVerified) {
    localStorage.removeItem('lastUid');
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  localStorage.setItem('lastUid', user.uid);
  await loadAllUsers();
  await loadAllUsersForModal();
  listenForChats();

  // === АВТОМАТИЧЕСКОЕ ОТКРЫТИЕ ЧАТА ПО URL ===
  const urlParams = new URLSearchParams(window.location.search);
  const openUserId = urlParams.get('openUser');

  if (openUserId) {
    const targetUser = await getUserById(openUserId);
    if (targetUser) {
      createPrivateChat(
        openUserId,
        targetUser.nickname || 'Пользователь',
        targetUser.tag || ''
      );
    }
  }
});

// Функция обновления карточки пользователя в боковой панели
function updateSidebarUser(userData) {
  const nameEl = document.getElementById('sidebarUserName');
  const tagEl = document.getElementById('sidebarUserTag');
  const avatarEl = document.getElementById('sidebarUserAvatar');
  
  if (nameEl) nameEl.textContent = userData.nickname || t('users');
  if (tagEl) tagEl.textContent = userData.tag || '@user';
  
  if (avatarEl) {
    if (userData.avatar) {
      avatarEl.innerHTML = `<img src="${userData.avatar}" alt="Аватар" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block;">`;
      avatarEl.style.background = 'transparent';
    } else {
      avatarEl.innerHTML = userData.nickname ? userData.nickname.charAt(0).toUpperCase() : '?';
      avatarEl.style.background = '#3b82f6';
      avatarEl.style.color = 'white';
    }
  }
}

// ========== ЗАГРУЗКА АВАТАРКИ ДЛЯ БЕСЕДЫ ==========
document.getElementById('groupAvatarInput')?.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file || !selectedChat || !selectedChat.isGroup) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      // Создаем холст для изменения размера (как в профиле)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const targetSize = 800;
      
      canvas.width = targetSize;
      canvas.height = targetSize;

      // Вычисляем координаты для обрезки (crop) по центру в идеальный квадрат
      const minDim = Math.min(img.width, img.height);
      const startX = (img.width - minDim) / 2;
      const startY = (img.height - minDim) / 2;

      // Отрисовываем картинку
      ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, targetSize, targetSize);

      // Получаем Base64 строку (JPEG, 70% качества)
      const base64Avatar = canvas.toDataURL('image/jpeg', 0.7);

      if (base64Avatar.length > 1000000) {
        alert('Файл слишком большой даже после сжатия. Пожалуйста, выберите другую картинку.');
        return;
      }

      saveGroupAvatarToFirebase(base64Avatar);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

async function saveGroupAvatarToFirebase(base64String) {
  if (!selectedChat || !selectedChat.isGroup) return;
  try {
    // 1. Пишем в базу данных
    await db.collection('chats').doc(selectedChat.id).update({ avatar: base64String });
    
    // 2. Отправляем системное сообщение об изменении
    await db.collection('chats').doc(selectedChat.id).collection('messages').add({
  text: '', 
  systemEvent: 'sysAvatarUpdated',
  systemArgs: currentUserData.nickname,
  senderId: 'system',
  timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  read: false,
  isSystem: true
});

    // 3. Обновляем UI в модалке мгновенно
    const avatarDiv = document.getElementById('groupInfoAvatar');
    if (avatarDiv) {
      avatarDiv.innerHTML = `<img src="${base64String}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`;
    }
    
    // 4. Обновляем шапку открытого чата
    selectedChat.chatImage = base64String;
    updateChatHeader(selectedChat);
    
    // 5. Перезапускаем слушатель, чтобы аватарка обновилась в списке чатов слева
    if (unsubscribeChats) { unsubscribeChats(); }
    listenForChats();

  } catch (error) {
    console.error('Ошибка сохранения аватарки беседы:', error);
    alert('Ошибка при загрузке аватарки');
  }
}

function getSystemMessageText(msg) {
  // Если сообщение использует новый динамический формат
  if (msg.systemEvent) {
    const args = msg.systemArgs || '';
    
    switch (msg.systemEvent) {
      case 'sysRemoved': 
        return `❌ ${args} ${t('sysRemoved')}`;
      case 'sysAdded': 
        return `✅ ${t('sysAdded')} ${args}`;
      case 'sysLeft': 
        return `👋 ${args} ${t('sysLeft')}`;
      case 'sysAvatarUpdated': 
        return `🖼️ ${args} ${t('sysAvatarUpdated')}`;
    }
  }
  // Фоллбэк: для старых системных сообщений, где текст уже жестко записан в БД
  return msg.text;
}

function autoResize(el) {
  el.style.height = 'auto'; // Сбрасываем высоту для точного перерасчета
  el.style.height = el.scrollHeight + 'px'; // Задаем высоту по контенту
  
  // Если высота достигла максимума (120px), включаем скроллинг
  if (el.scrollHeight >= 120) {
    el.style.overflowY = 'auto';
  } else {
    el.style.overflowY = 'hidden';
  }
}

function handleEnter(e) {
  // Отправляем сообщение по нажатию Enter (без зажатого Shift)
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); // Предотвращаем переход на новую строку
    sendMessage(); 
    e.target.style.height = 'auto'; // Схлопываем поле обратно после отправки
  }
}

function formatMessageText(text) {
  if (!text) return '';
  
  // Экранируем HTML, чтобы избежать XSS-атак
  const escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Регулярное выражение для поиска ссылок
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  // Превращаем найденные URL в кликабельные ссылки
  const linkedText = escapedText.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${url}</a>`;
  });

  // Заменяем переносы строк на теги <br>
  return linkedText.replace(/\n/g, '<br>');
}