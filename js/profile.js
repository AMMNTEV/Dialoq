// ========== ПРОФИЛЬ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ==========
let unsubscribePosts = null;
let isSubmitting = false;
let changes = {};
let tagCheckTimeout = null;
let isTagValid = true; // Флаг, разрешающий или запрещающий сохранение

// ========== МГНОВЕННАЯ ОТРИСОВКА (ДО ЗАПУСКА FIREBASE) ==========
document.addEventListener("DOMContentLoaded", () => {
  const lastUid = localStorage.getItem('lastUid');
  
  if (lastUid) {
    const cachedUserStr = localStorage.getItem(`cachedCurrentUser_${lastUid}`);
    if (cachedUserStr) {
      currentUserData = JSON.parse(cachedUserStr);
      
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
    
    if (document.getElementById('chatsList')) {
      const cachedChats = localStorage.getItem(`cachedChats_${lastUid}`);
      const cachedUnreads = localStorage.getItem(`cachedUnreads_${lastUid}`);
      if (cachedChats) {
        allChats = JSON.parse(cachedChats);
        if (cachedUnreads) unreadCounts = JSON.parse(cachedUnreads);
        if (typeof displayChats === 'function') displayChats(allChats);
      }
    }
  }
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
  
  const cacheKey = `cachedCurrentUser_${user.uid}`;
  const cachedDataStr = localStorage.getItem(cacheKey);
  
  if (cachedDataStr) {
    currentUserData = JSON.parse(cachedDataStr);
    updateSidebarUser(currentUserData); 
    
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

  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) {
      // Используем t('users') как дефолтное имя, аналогично мессенджеру
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

      await db.collection('users').doc(user.uid).set({
        nickname: nickname,
        tag: tag,
        email: user.email || '',
        avatar: user.photoURL || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      await user.updateProfile({ displayName: nickname + '|' + tag.replace('@', '') });
      
      window.location.reload();
      return;
    }
    
    currentUserData = doc.data();
    
    localStorage.setItem(cacheKey, JSON.stringify(currentUserData));
    if (window.userCache) userCache.set(user.uid, currentUserData);
    
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
      <label>${t('lblNickname')}</label>
      <span id="nickname">${currentUserData.nickname || t('notSpecified')}</span>
      <button onclick="editNickname()" class="edit-btn">✎</button>
    </div>
    <div class="info-row">
      <label>${t('lblTag')}</label>
      <span id="tag">${currentUserData.tag || t('notSpecified')}</span>
      <button onclick="editTag()" class="edit-btn">✎</button>
    </div>
    <div class="info-row">
      <label>${t('lblEmail')}</label>
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
  const current = (currentUserData.tag || '').replace(/^@+/, '');
  
  span.innerHTML = `
    <div style="display: flex; flex-direction: column; width: 100%;">
      <div class="tag-input-wrapper">
        <span class="tag-prefix">@</span>
        <input type="text" id="editTag" value="${current}" oninput="handleTagInput(this); validateProfileTag(this.value)" placeholder="tag" class="edit-input-borderless" autocomplete="off">
      </div>
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

  if (changes.nickname) {
    newNickname = document.getElementById('editNickname').value.trim();
    if (!newNickname) {
      const nickInput = document.getElementById('editNickname');
      nickInput.style.borderColor = '#dc2626'; 
      setTimeout(() => nickInput.style.borderColor = '#e2e8f0', 2000);
      return;
    }
  }

  if (changes.tag) {
    if (!isTagValid) {
      const statusDiv = document.getElementById('tagStatus');
      if (statusDiv) {
        statusDiv.style.fontWeight = 'bold';
        setTimeout(() => statusDiv.style.fontWeight = '500', 300);
      }
      return;
    }
    const rawInputTag = document.getElementById('editTag').value.trim().replace(/^@+/, '');
    newTag = '@' + rawInputTag;
  }

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
    if (window.userCache) userCache.set(user.uid, currentUserData);
    localStorage.setItem(`cachedCurrentUser_${user.uid}`, JSON.stringify(currentUserData));
    
    messageDiv.innerHTML = `<div class="success">${t('changesSaved')}</div>`;
    document.querySelector('.profile-left').appendChild(messageDiv);
    
    cancelEditing(); 
    
    setTimeout(() => messageDiv.remove(), 2000);
  } catch (error) {
    console.error('Ошибка сохранения:', error);
    messageDiv.innerHTML = `<div class="error">${t('saveError')}</div>`;
    document.querySelector('.profile-left').appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 2000);
  } finally {
    isSubmitting = false;
  }
  updateSidebarUser(currentUserData);
}

let selectedPostImageFile = null; // Храним оригинальный файл до публикации

window.autoResize = function(textarea) {
  textarea.style.height = 'auto'; // Сбрасываем высоту
  textarea.style.height = textarea.scrollHeight + 'px'; // Устанавливаем высоту по содержимому
};

function showCreatePostModal() {
  document.getElementById('postModal').style.display = 'flex';
  const postContent = document.getElementById('postContent');
  postContent.value = '';
  postContent.style.height = 'auto'; // Сброс высоты
  removePostImage();
}

// Обязательно делаем функцию async, так как конвертация HEIC занимает время
// Вспомогательная функция для мгновенного перевода любого формата (PNG, WEBP) в JPG
function convertToJpgForPreview(file) {
  return new Promise((resolve, reject) => {
    // URL.createObjectURL работает надежнее и быстрее FileReader'а для тяжелых файлов
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = function() {
      URL.revokeObjectURL(objectUrl); // Очищаем память
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Слегка ограничиваем размер для быстрого предпросмотра
      const maxDim = 1500;
      let w = img.width;
      let h = img.height;
      
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      
      canvas.width = w;
      canvas.height = h;
      
      // Обязательно заливаем белым фоном, чтобы прозрачность PNG не стала черной
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      
      // Конвертируем в JPG с качеством 90%
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Формат не поддерживается'));
    };
    
    img.src = objectUrl;
  });
}


// Обновленная функция выбора картинки для поста
async function handlePostImageSelect(event) {
  let file = event.target.files[0];
  if (!file) return;

  try {
    // ПОПЫТКА 1: Пробуем обработать файл как обычный (PNG, JPG, WEBP)
    const jpgBase64 = await convertToJpgForPreview(file);
    
    document.getElementById('previewImg').src = jpgBase64;
    document.getElementById('postImagePreview').style.display = 'block';
    
    const res = await fetch(jpgBase64);
    const blob = await res.blob();
    selectedPostImageFile = new File([blob], "post_image.jpg", { type: "image/jpeg" });

  } catch (error) {
    // ПОПЫТКА 2: Браузер не смог прочитать файл. Предполагаем, что это HEIC
    console.warn('Обычное чтение не удалось, пробуем конвертировать через heic2any...', error);
    
    try {
      // Запускаем конвертацию
      const convertedBlob = await heic2any({ 
        blob: file, 
        toType: "image/jpeg", 
        quality: 0.85 
      });
      const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      file = new File([finalBlob], "converted_image.jpg", { type: "image/jpeg" });

      // Теперь, когда у нас есть настоящий JPG, снова прогоняем его через предпросмотр
      const fallbackJpgBase64 = await convertToJpgForPreview(file);
      
      document.getElementById('previewImg').src = fallbackJpgBase64;
      document.getElementById('postImagePreview').style.display = 'block';
      
      const res = await fetch(fallbackJpgBase64);
      const fallbackBlob = await res.blob();
      selectedPostImageFile = new File([fallbackBlob], "post_image.jpg", { type: "image/jpeg" });

    } catch (heicErr) {
      // ПОПЫТКА 3: Полный провал (файл поврежден или это вообще не картинка)
      console.error('Ошибка конвертации фолбэка HEIC:', heicErr);
      alert(t('fileError') || 'Не удалось обработать изображение. Файл может быть поврежден или иметь неподдерживаемый формат.');
      removePostImage();
    }
  }
}

function removePostImage() {
  selectedPostImageFile = null; // Очищаем файл
  const previewDiv = document.getElementById('postImagePreview');
  const previewImg = document.getElementById('previewImg');
  const fileInput = document.getElementById('postImageInput');
  
  if (previewDiv) previewDiv.style.display = 'none';
  if (previewImg) previewImg.src = '';
  if (fileInput) fileInput.value = '';
}

// Адаптивное сжатие под заданный лимит байт
function compressImageToFit(file, maxBytes) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let quality = 0.9; // Начинаем с хорошего качества
        let scale = 1.0;
        let maxDim = 1500; // Начальное максимальное разрешение
        let base64 = '';

        const attemptCompression = () => {
          let w = img.width * scale;
          let h = img.height * scale;

          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }

          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          return canvas.toDataURL('image/jpeg', quality);
        };

        base64 = attemptCompression();

        // Цикл: ухудшаем качество и размер, пока не влезем в остаток (maxBytes)
        while (base64.length > maxBytes && quality > 0.1) {
          quality -= 0.1; // Снижаем качество
          
          if (quality <= 0.4) {
             // Если качество уже сильно упало, начинаем уменьшать само разрешение картинки на 20%
             scale *= 0.8;
          }
          
          if (scale < 0.1) break; // Защита от зависания
          
          base64 = attemptCompression();
        }

        if (base64.length > maxBytes) {
          reject(new Error('Невозможно сжать до нужного размера'));
        } else {
          resolve(base64);
        }
      };
      img.onerror = () => reject(new Error('Ошибка загрузки фото'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });
}


function hideCreatePostModal() {
  document.getElementById('postModal').style.display = 'none';
}

async function createPost() {
  if (isSubmitting) return;
  const content = document.getElementById('postContent').value.trim();

  // Пост должен содержать либо текст, либо картинку
  if (!content && !selectedPostImageFile) {
    alert(t('enterPostText') || 'Введите текст или выберите фото');
    return;
  }

  // Прячем окно сразу, чтобы интерфейс казался отзывчивым
  hideCreatePostModal();
  isSubmitting = true;

  let finalImageBase64 = null;

  try {
    if (selectedPostImageFile) {
      // 1. Вычисляем вес текста. (Один символ utf-8 может весить до 4 байт, Blob считает идеально точно)
      const textBytes = new Blob([content]).size;
      
      // 2. Лимит Firestore на документ = 1 МБ (1 048 576 байт). 
      // Резервируем 50 000 байт (~50 КБ) на технические поля Firestore, никнейм, даты и массивы лайков.
      const maxImageBytes = 1048576 - 50000 - textBytes;

      // 3. Сжимаем картинку так, чтобы она точно влезла в остаток
      finalImageBase64 = await compressImageToFit(selectedPostImageFile, maxImageBytes);
    }

    // Сохраняем пост в базу
    await db.collection('posts').add({
      userId: currentUser.uid,
      userNickname: currentUserData.nickname,
      userTag: currentUserData.tag,
      content: content,
      image: finalImageBase64 || null, 
      likedBy: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    removePostImage();
  } catch (error) {
    console.error('Ошибка публикации поста:', error);
    
    // Если вывалилась ошибка из промиса компрессии
    if (error.message.includes('сжать')) {
       alert(t('fileTooLarge') || 'Файл слишком большой и его не удалось достаточно сжать.');
    } else {
       alert(t('postCreateError') || 'Ошибка при создании поста.');
    }
  } finally {
    setTimeout(() => { isSubmitting = false; }, 1000);
  }
}

async function deletePost(postId) {
  if (!confirm(t('confirmDeletePost'))) return;
  try {
    await db.collection('posts').doc(postId).delete();
  } catch (error) {
    console.error('Ошибка удаления поста:', error);
    alert(t('postDeleteError'));
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
        postsContainer.innerHTML = `<div class="no-posts">${t('noPostsYet')}</div>`;
        return;
      }
      let postsHTML = '';
      snapshot.forEach(doc => {
        const post = doc.data();
        let date = t('justNow');
        if (post.createdAt) {
          try { date = new Date(post.createdAt.toDate()).toLocaleString(); } catch(e) { date = t('justNow'); }
        }
        
        // Логика лайков
        const likedBy = post.likedBy || [];
        const likesCount = likedBy.length;
        const isLiked = likedBy.includes(currentUser.uid);
        const heartClass = isLiked ? 'like-btn liked' : 'like-btn';

        postsHTML += `
  <div class="post-card" id="post-${doc.id}">
    <div class="post-header">
      <button onclick="deletePost('${doc.id}')" class="delete-post-btn">×</button>
    </div>
    ${post.image ? `<div class="post-image" style="margin-bottom: 12px;"><img src="${post.image}" style="width: 100%; max-height: 500px; object-fit: contain; border-radius: 12px; display: block;" /></div>` : ''}
    <div class="post-content">${post.content ? post.content.replace(/\n/g, '<br>') : ''}</div>
    
    <div class="post-footer">
      <button class="${heartClass}" onclick="toggleLike('${doc.id}')">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
        <span class="like-count">${likesCount > 0 ? likesCount : ''}</span>
      </button>
      <span class="post-date">${date}</span>
    </div>
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

// Добавляем async в обработчик события
document.getElementById('avatarInput')?.addEventListener('change', async function(e) {
  let file = e.target.files[0];
  if (!file) return;

  const isHeic = file.name.toLowerCase().endsWith('.heic') || 
                 file.name.toLowerCase().endsWith('.heif') || 
                 file.type === 'image/heic' || 
                 file.type === 'image/heif';
                 
  if (isHeic) {
    try {
      const convertedBlob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
      const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      file = new File([finalBlob], "avatar.jpg", { type: "image/jpeg" });
    } catch (err) {
      console.error('Ошибка конвертации HEIC для аватара:', err);
      alert(t('fileError') || 'Не удалось обработать формат HEIC.');
      return;
    }
  }

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const targetSize = 800;
      
      canvas.width = targetSize;
      canvas.height = targetSize;

      // Белый фон под прозрачные PNG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetSize, targetSize);

      const minDim = Math.min(img.width, img.height);
      const startX = (img.width - minDim) / 2;
      const startY = (img.height - minDim) / 2;

      ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, targetSize, targetSize);
      
      const base64Avatar = canvas.toDataURL('image/jpeg', 0.8);

      if (base64Avatar.length > 1048576) {
        alert(t('fileTooLarge') || 'Файл слишком большой');
        return;
      }
      saveAvatarToFirebase(base64Avatar);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

async function saveAvatarToFirebase(base64String) {
  const user = auth.currentUser;
  try {
    await db.collection('users').doc(user.uid).update({ avatar: base64String });
    
    currentUserData.avatar = base64String;
    if (window.userCache) userCache.set(user.uid, currentUserData);
    localStorage.setItem(`cachedCurrentUser_${user.uid}`, JSON.stringify(currentUserData));
    updateSidebarUser(currentUserData);
    renderAvatar(base64String);
  } catch (error) {
    console.error('Ошибка сохранения аватарки:', error);
    alert(t('avatarUploadError'));
  }
}

function renderAvatar(avatarData) {
  const avatarDiv = document.getElementById('profileAvatar');
  if (avatarData) {
    avatarDiv.innerHTML = `<img src="${avatarData}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`;
  } else {
    avatarDiv.innerHTML = currentUserData.nickname ? currentUserData.nickname.charAt(0).toUpperCase() : '?';
  }
}

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
    saveBtn.textContent = t('saveBtn');
    saveBtn.onclick = saveChanges;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'save-btn';
    cancelBtn.style.marginTop = '0';
    cancelBtn.style.background = '#94a3b8'; 
    cancelBtn.textContent = t('cancelBtn');
    cancelBtn.onclick = cancelEditing;

    container.appendChild(saveBtn);
    container.appendChild(cancelBtn);
    document.querySelector('.profile-info').appendChild(container);
  }
}

function cancelEditing() {
  changes = {};
  const buttons = document.getElementById('profileActionButtons');
  if (buttons) buttons.remove();
  loadProfileInfo(); 
}

function validateProfileTag(value) {
  const statusDiv = document.getElementById('tagStatus');
  
  if (tagCheckTimeout) clearTimeout(tagCheckTimeout);
  
  const trimmedValue = value.trim().replace(/^@+/, '');

  if (!trimmedValue) {
    statusDiv.textContent = t('tagEmptyError');
    statusDiv.style.color = '#dc2626'; 
    isTagValid = false;
    return;
  }

  if (trimmedValue.length < 3) {
    statusDiv.textContent = t('tagMinLengthError');
    statusDiv.style.color = '#dc2626'; 
    isTagValid = false;
    return;
  }

  const fullTag = '@' + trimmedValue;
  
  if (fullTag === currentUserData.tag) {
    statusDiv.textContent = t('tagCurrentError');
    statusDiv.style.color = '#16a34a'; 
    isTagValid = true;
    return;
  }

  statusDiv.textContent = t('tagChecking');
  statusDiv.style.color = '#666'; 
  isTagValid = false; 

  tagCheckTimeout = setTimeout(async () => {
    const isUnique = await checkTagUnique(trimmedValue);
    if (isUnique) {
      statusDiv.textContent = t('tagAvailable');
      statusDiv.style.color = '#16a34a'; 
      isTagValid = true;
    } else {
      statusDiv.textContent = t('tagTaken');
      statusDiv.style.color = '#dc2626'; 
      isTagValid = false;
    }
  }, 500);
}

function updateSidebarUser(userData) {
  const nameEl = document.getElementById('sidebarUserName');
  const tagEl = document.getElementById('sidebarUserTag');
  const avatarEl = document.getElementById('sidebarUserAvatar');
  
  if (nameEl) {
    try {
      nameEl.textContent = userData.nickname || t('users');
      nameEl.removeAttribute('data-i18n'); // <--- ДОБАВИТЬ СЮДА
    } catch (e) {
      nameEl.textContent = userData.nickname || 'Users';
      nameEl.removeAttribute('data-i18n'); // <--- И СЮДА НА ВСЯКИЙ СЛУЧАЙ
    }
  }
  
  if (tagEl) tagEl.textContent = userData.tag || '@user';
  
  if (avatarEl) {
    if (userData.avatar) {
      // Заменяем t('avatarAlt') на обычную строку, как в messenger.js, чтобы избежать падения скрипта
      avatarEl.innerHTML = `<img src="${userData.avatar}" alt="Аватар" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block;">`;
      avatarEl.style.background = 'transparent';
    } else {
      avatarEl.innerHTML = userData.nickname ? userData.nickname.charAt(0).toUpperCase() : '?';
      avatarEl.style.background = '#3b82f6';
      avatarEl.style.color = 'white';
    }
  }
}

window.toggleLike = async function(postId) {
  if (!currentUser) return;
  const postRef = db.collection('posts').doc(postId);
  
  try {
    const doc = await postRef.get();
    if (!doc.exists) return;
    
    const postData = doc.data();
    const likedBy = postData.likedBy || [];
    
    // Если пользователь уже ставил лайк - убираем его ID из массива
    if (likedBy.includes(currentUser.uid)) {
      await postRef.update({
        likedBy: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
      });
    } 
    // Если не ставил - добавляем его ID в массив
    else {
      await postRef.update({
        likedBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
      });
    }
  } catch (error) {
    console.error('Ошибка при переключении лайка:', error);
  }
};