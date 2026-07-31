// ========== ПРОФИЛЬ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ==========
let unsubscribePosts = null;
let isSubmitting = false;
let changes = {};
let tagCheckTimeout = null;
let isTagValid = true; // Флаг, разрешающий или запрещающий сохранение

onAuthStateChanged(async (user) => {
  if (!user || !user.emailVerified) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  
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
        profileAvatarEl.innerHTML = currentUserData.avatar 
          ? `<img src="${currentUserData.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">` 
          : (currentUserData.nickname ? currentUserData.nickname.charAt(0).toUpperCase() : '?');
    }
  }

  // 2. ЗАТЕМ ИДЕМ В БАЗУ ДАННЫХ (Фоновое обновление)
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) {
      // Создаем пользователя, если его нет
      await db.collection('users').doc(user.uid).set({
        nickname: user.displayName ? user.displayName.split('|')[0] : 'Пользователь',
        tag: user.displayName ? '@' + user.displayName.split('|')[1] : '@user',
        email: user.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      window.location.reload();
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
  const current = currentUserData.nickname || '';
  span.innerHTML = `<input type="text" id="editNickname" value="${current}" class="edit-input">`;
  changes.nickname = true;
  showActionButtons();
}

function editTag() {
  const span = document.getElementById('tag');
  const current = (currentUserData.tag || '').replace('@', '');
  
  span.innerHTML = `
    <div style="display: flex; flex-direction: column; width: 100%;">
      <div style="display: flex; align-items: center; width: 100%;">
        <span style="color: #666; font-weight: 600; padding-right: 4px;">@</span>
        <input type="text" id="editTag" value="${current}" oninput="handleTagInput(this); validateProfileTag(this.value)" placeholder="tag" class="edit-input">
      </div>
      <!-- Заменили height: 14px на min-height: 16px и добавили line-height: 1.2 -->
      <div id="tagStatus" style="font-size: 0.8rem; margin-top: 4px; min-height: 16px; line-height: 1.2; font-weight: 500;"></div>
    </div>
  `;
  changes.tag = true;
  isTagValid = true; 
  showActionButtons();
}

async function saveChanges() {
  if (isSubmitting) return; 
  
  let newNickname = currentUserData.nickname;
  let newTag = currentUserData.tag;

  // 1. Валидация никнейма без алертов (подсветка рамки)
  if (changes.nickname) {
    newNickname = document.getElementById('editNickname').value.trim();
    if (!newNickname) {
      const nickInput = document.getElementById('editNickname');
      nickInput.style.borderColor = '#dc2626'; // Красная рамка
      setTimeout(() => nickInput.style.borderColor = '#e2e8f0', 2000);
      return;
    }
  }

  // 2. Валидация тега (опираемся на результаты oninput проверки)
  if (changes.tag) {
    if (!isTagValid) {
      // Привлекаем внимание к тексту ошибки легкой анимацией жирности
      const statusDiv = document.getElementById('tagStatus');
      if (statusDiv) {
        statusDiv.style.fontWeight = 'bold';
        setTimeout(() => statusDiv.style.fontWeight = '500', 300);
      }
      return;
    }
    newTag = '@' + document.getElementById('editTag').value.trim();
  }

  // 3. Сохранение
  isSubmitting = true;
  const user = auth.currentUser;
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';
  const updates = {};
  
  if (changes.nickname) updates.nickname = newNickname;
  if (changes.tag) updates.tag = newTag;

  try {
    await db.collection('users').doc(user.uid).update(updates);
    const newDisplayName = `${newNickname}|${newTag}`;
    await user.updateProfile({ displayName: newDisplayName });
    
    currentUserData = { ...currentUserData, ...updates };
    userCache.set(user.uid, currentUserData);
    localStorage.setItem(`cachedCurrentUser_${user.uid}`, JSON.stringify(currentUserData));
    
    messageDiv.innerHTML = '<div class="success">Изменения сохранены!</div>';
    document.querySelector('.profile-left').appendChild(messageDiv);
    
    cancelEditing(); 
    
    setTimeout(() => messageDiv.remove(), 2000);
  } catch (error) {
    console.error('Ошибка сохранения:', error);
    messageDiv.innerHTML = '<div class="error">Ошибка при сохранении</div>';
    document.querySelector('.profile-left').appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 2000);
  } finally {
    isSubmitting = false;
  }
  updateSidebarUser(currentUserData);
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
            <div class="post-content">${post.content ? post.content.replace(/\n/g, '<br>') : ''}</div>
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

// Обработка выбора файла
document.getElementById('avatarInput')?.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      // Создаем холст для изменения размера
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const targetSize = 800;
      
      canvas.width = targetSize;
      canvas.height = targetSize;

      // Вычисляем координаты для обрезки (crop) по центру в идеальный квадрат
      const minDim = Math.min(img.width, img.height);
      const startX = (img.width - minDim) / 2;
      const startY = (img.height - minDim) / 2;

      // Отрисовываем картинку (сжимаем и обрезаем)
      ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, targetSize, targetSize);

      // Получаем Base64 строку (JPEG, качество 70% для экономии места)
      const base64Avatar = canvas.toDataURL('image/jpeg', 0.7);

      // Проверка на лимит Firestore (1 МБ = 1048576 байт)
      if (base64Avatar.length > 1000000) {
        alert('Файл слишком большой даже после сжатия. Пожалуйста, выберите другую картинку.');
        return;
      }

      saveAvatarToFirebase(base64Avatar);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// Сохранение в базу данных
async function saveAvatarToFirebase(base64String) {
  const user = auth.currentUser;
  try {
    // Пишем в базу
    await db.collection('users').doc(user.uid).update({ avatar: base64String });
    
    // Обновляем локальный кэш
    currentUserData.avatar = base64String;
    userCache.set(user.uid, currentUserData);
    localStorage.setItem(`cachedCurrentUser_${user.uid}`, JSON.stringify(currentUserData));
    updateSidebarUser(currentUserData);
    
    // Сразу показываем на экране
    renderAvatar(base64String);
  } catch (error) {
    console.error('Ошибка сохранения аватарки:', error);
    alert('Ошибка при загрузке аватарки');
  }
}

// Функция для красивого отображения аватарки
function renderAvatar(avatarData) {
  const avatarDiv = document.getElementById('profileAvatar');
  if (avatarData) {
    avatarDiv.innerHTML = `<img src="${avatarData}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`;
  } else {
    avatarDiv.innerHTML = currentUserData.nickname ? currentUserData.nickname.charAt(0).toUpperCase() : '?';
  }
}

// Вспомогательная функция для отображения кнопок "Сохранить" и "Отмена"
function showActionButtons() {
  if (!document.getElementById('profileActionButtons')) {
    const container = document.createElement('div');
    container.id = 'profileActionButtons';
    container.style.display = 'flex';
    container.style.gap = '10px';
    container.style.marginTop = '16px';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-btn';
    saveBtn.style.marginTop = '0'; 
    saveBtn.textContent = 'Сохранить';
    saveBtn.onclick = saveChanges;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'save-btn';
    cancelBtn.style.marginTop = '0';
    cancelBtn.style.background = '#94a3b8'; // Серый цвет для отмены
    cancelBtn.textContent = 'Отмена';
    cancelBtn.onclick = cancelEditing;

    container.appendChild(saveBtn);
    container.appendChild(cancelBtn);
    document.querySelector('.profile-info').appendChild(container);
  }
}

// Функция отмены редактирования
function cancelEditing() {
  changes = {};
  const buttons = document.getElementById('profileActionButtons');
  if (buttons) buttons.remove();
  loadProfileInfo(); // Перерисовываем информацию из кэша (возвращаем span)
}

function validateProfileTag(value) {
  const statusDiv = document.getElementById('tagStatus');
  
  if (tagCheckTimeout) clearTimeout(tagCheckTimeout);
  
  const trimmedValue = value.trim();

  // 1. Проверка на пустоту
  if (!trimmedValue) {
    statusDiv.textContent = 'Тег не может быть пустым';
    statusDiv.style.color = '#dc2626'; // Красный
    isTagValid = false;
    return;
  }

  // 2. Проверка на минимальную длину
  if (trimmedValue.length < 3) {
    statusDiv.textContent = 'Минимальная длина тега — 3 символа';
    statusDiv.style.color = '#dc2626'; // Красный
    isTagValid = false;
    return;
  }

  const fullTag = '@' + trimmedValue;
  
  // 3. Проверка, не является ли это текущим тегом пользователя
  if (fullTag === currentUserData.tag) {
    statusDiv.textContent = 'Это ваш текущий тег';
    statusDiv.style.color = '#16a34a'; // Зеленый
    isTagValid = true;
    return;
  }

  // Индикация загрузки
  statusDiv.textContent = 'Проверка...';
  statusDiv.style.color = '#666'; 
  isTagValid = false; 

  // 4. Отложенный запрос в базу
  tagCheckTimeout = setTimeout(async () => {
    // В базу летим только если тег прошел локальные проверки на длину
    const isUnique = await checkTagUnique(trimmedValue);
    if (isUnique) {
      statusDiv.textContent = 'Тег свободен';
      statusDiv.style.color = '#16a34a'; // Зеленый
      isTagValid = true;
    } else {
      statusDiv.textContent = 'Этот тег уже занят';
      statusDiv.style.color = '#dc2626'; // Красный
      isTagValid = false;
    }
  }, 500);
}

function updateSidebarUser(userData) {
  const nameEl = document.getElementById('sidebarUserName');
  const tagEl = document.getElementById('sidebarUserTag');
  const avatarEl = document.getElementById('sidebarUserAvatar');
  
  if (nameEl) nameEl.textContent = userData.nickname || 'Пользователь';
  if (tagEl) tagEl.textContent = userData.tag || '@user';
  
  if (avatarEl) {
    if (userData.avatar) {
      avatarEl.innerHTML = `<img src="${userData.avatar}" alt="Аватар" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block;">`;
      avatarEl.style.background = 'transparent';
    } else {
      avatarEl.innerHTML = userData.nickname ? userData.nickname.charAt(0).toUpperCase() : '?';
      avatarEl.style.background = '#1a1a1a';
      avatarEl.style.color = 'white';
    }
  }
}