// ========== ПРОФИЛЬ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ==========
let unsubscribePosts = null;
let isSubmitting = false;
let changes = {};

onAuthStateChanged(async (user) => {
  if (!user || !user.emailVerified) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  if (userCache.has(user.uid)) {
    currentUserData = userCache.get(user.uid);
    loadProfileInfo();
    listenForNewPosts();
    return;
  }
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) {
      // Если документа нет – создаём его (для обратной совместимости)
      await db.collection('users').doc(user.uid).set({
        nickname: user.displayName ? user.displayName.split('|')[0] : 'Пользователь',
        tag: user.displayName ? '@' + user.displayName.split('|')[1] : '@user',
        email: user.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      // После создания перезагружаем страницу, чтобы данные подтянулись
      window.location.reload();
      return;
    }
    currentUserData = doc.data();
    userCache.set(user.uid, currentUserData);
    renderAvatar(currentUserData.avatar);
    loadProfileInfo();
    listenForNewPosts();
  } catch (error) {
    console.error('Ошибка загрузки профиля:', error);
    document.getElementById('profileInfo').innerHTML = '<div class="error">Ошибка загрузки профиля</div>';
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
  // Убираем @ для редактирования, так как handleTagInput из auth.js её удаляет
  const current = (currentUserData.tag || '').replace('@', '');
  
  // Добавляем oninput="handleTagInput(this)" для запрета ввода спецсимволов и кириллицы
  span.innerHTML = `
    <div style="display: flex; align-items: center; width: 100%;">
      <span style="color: #666; font-weight: 600; padding-right: 4px;">@</span>
      <input type="text" id="editTag" value="${current}" oninput="handleTagInput(this)" placeholder="tag" class="edit-input">
    </div>
  `;
  changes.tag = true;
  showActionButtons();
}

async function saveChanges() {
  if (isSubmitting) return; // Защита от двойного клика
  
  let newNickname = currentUserData.nickname;
  let newTag = currentUserData.tag;

  // 1. Валидация никнейма (проверка на пустоту)
  if (changes.nickname) {
    newNickname = document.getElementById('editNickname').value.trim();
    if (!newNickname) {
      alert('Никнейм не может быть пустым');
      return;
    }
  }

  // 2. Валидация тега (проверка на пустоту и уникальность)
  if (changes.tag) {
    const tagInput = document.getElementById('editTag').value.trim();
    if (!tagInput) {
      alert('Тег не может быть пустым');
      return;
    }
    
    const fullTag = '@' + tagInput;
    
    // Проверяем уникальность, только если тег действительно изменился
    if (fullTag !== currentUserData.tag) {
      const isUnique = await checkTagUnique(tagInput);
      if (!isUnique) {
        alert('Этот тег уже занят. Пожалуйста, выберите другой.');
        return;
      }
    }
    newTag = fullTag;
  }

  // 3. Сохранение данных
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
    
    // Обновляем локальные данные
    currentUserData = { ...currentUserData, ...updates };
    userCache.set(user.uid, currentUserData);
    
    messageDiv.innerHTML = '<div class="success">Изменения сохранены!</div>';
    document.querySelector('.profile-left').appendChild(messageDiv);
    
    cancelEditing(); // Возвращаем интерфейс в режим просмотра
    
    setTimeout(() => messageDiv.remove(), 2000);
  } catch (error) {
    console.error('Ошибка сохранения:', error);
    messageDiv.innerHTML = '<div class="error">Ошибка при сохранении</div>';
    document.querySelector('.profile-left').appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 2000);
  } finally {
    isSubmitting = false; // Снимаем блокировку кнопки
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