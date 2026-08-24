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
if (document.getElementById('nickname') && typeof loadProfileInfo === 'function') {
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
    
    if (document.getElementById('nickname')) loadProfileInfo();
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
    if (document.getElementById('nickname')) loadProfileInfo();
    if (document.getElementById('userPostsContainer') && typeof listenForNewPosts === 'function') listenForNewPosts();
    
  } catch (error) {
    console.error('Ошибка загрузки профиля:', error);
  }
});

// Функция загрузки профиля (для нового Insta-дизайна)
function loadProfileInfo() {
  const nickEl = document.getElementById('nickname');
  const tagEl = document.getElementById('tag');
  const bioEl = document.getElementById('userBio'); 
  
  if (nickEl) nickEl.textContent = currentUserData.nickname || t('notSpecified');
  if (tagEl) tagEl.textContent = currentUserData.tag || t('notSpecified');
  if (bioEl) bioEl.innerHTML = parseBioLinks(currentUserData.bio || ''); 

  const followers = currentUserData.followers || [];
  const following = currentUserData.following || [];
  
  const statFollowersCount = document.getElementById('statFollowersCount');
  const statFollowingCount = document.getElementById('statFollowingCount');
  
  if (statFollowersCount) statFollowersCount.textContent = followers.length;
  if (statFollowingCount) statFollowingCount.textContent = following.length;
}

// Редактирование профиля с многострочным textarea для БИО
async function saveChanges() {
  if (isSubmitting) return; 
  
  let newNickname = currentUserData.nickname;
  let newTag = currentUserData.tag;
  let newBio = currentUserData.bio;

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

  if (changes.bio) {
    newBio = document.getElementById('editBio').value.trim();
  }

  isSubmitting = true;
  const user = auth.currentUser;
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';
  const updates = {};
  
  if (changes.nickname) updates.nickname = newNickname;
  if (changes.tag) updates.tag = newTag;
  if (changes.bio) updates.bio = newBio; // Сохраняем био в базу данных

  try {
    await db.collection('users').doc(user.uid).update(updates);
    const newDisplayName = `${newNickname}|${newTag}`;
    await user.updateProfile({ displayName: newDisplayName });
    
    currentUserData = { ...currentUserData, ...updates };
    if (window.userCache) userCache.set(user.uid, currentUserData);
    localStorage.setItem(`cachedCurrentUser_${user.uid}`, JSON.stringify(currentUserData));
    
    messageDiv.innerHTML = `<div class="success">${t('changesSaved')}</div>`;
    
    const leftProfile = document.querySelector('.profile-left');
    if (leftProfile) {
        leftProfile.appendChild(messageDiv);
    }
    
    cancelEditing(); 
    
    setTimeout(() => messageDiv.remove(), 2000);
  } catch (error) {
    console.error('Ошибка сохранения:', error);
    messageDiv.innerHTML = `<div class="error">${t('saveError')}</div>`;
    
    const leftProfile = document.querySelector('.profile-left');
    if (leftProfile) {
        leftProfile.appendChild(messageDiv);
    }
    
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
      const statPostsCount = document.getElementById('statPostsCount');
      if (statPostsCount) {
        statPostsCount.textContent = snapshot.size;
      }
      
      const postsContainer = document.getElementById('userPostsContainer');
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

document.getElementById('avatarInput')?.addEventListener('change', async function(e) {
  let file = e.target.files[0];
  if (!file) return;

  let base64Avatar;

  try {
    // ПОПЫТКА 1: Пробуем обработать файл как обычный (PNG, JPG, WEBP)
    base64Avatar = await processAvatarFile(file);
    
  } catch (error) {
    // ПОПЫТКА 2: Браузер не смог прочитать файл. Предполагаем, что это HEIC
    console.warn('Обычное чтение аватара не удалось, пробуем heic2any...', error);
    
    try {
      // Запускаем конвертацию
      const convertedBlob = await heic2any({ 
        blob: file, 
        toType: "image/jpeg", 
        quality: 0.85 
      });
      const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      const fallbackFile = new File([finalBlob], "avatar.jpg", { type: "image/jpeg" });

      // Повторно прогоняем уже сконвертированный JPG через обрезку
      base64Avatar = await processAvatarFile(fallbackFile);

    } catch (heicErr) {
      // ПОПЫТКА 3: Полный провал
      console.error('Ошибка конвертации фолбэка HEIC для аватара:', heicErr);
      alert(t('fileError') || 'Не удалось обработать изображение. Файл может быть поврежден или иметь неподдерживаемый формат.');
      // Очищаем input, чтобы можно было попробовать выбрать этот же файл заново
      e.target.value = ''; 
      return;
    }
  }

  // Если всё прошло успешно, проверяем лимит базы данных Firestore (~1 МБ)
  if (base64Avatar.length > 1048576) {
    alert(t('fileTooLarge') || 'Файл слишком большой после обработки');
    e.target.value = '';
    return;
  }
  
  saveAvatarToFirebase(base64Avatar);
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

// Вспомогательная функция для обработки, обрезки (квадрат) и сжатия аватара
function processAvatarFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = function() {
      URL.revokeObjectURL(objectUrl); // Очищаем память
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const targetSize = 800;
      
      canvas.width = targetSize;
      canvas.height = targetSize;

      // Белый фон под прозрачные PNG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetSize, targetSize);

      // Вычисляем координаты для квадратной обрезки по центру
      const minDim = Math.min(img.width, img.height);
      const startX = (img.width - minDim) / 2;
      const startY = (img.height - minDim) / 2;

      ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, targetSize, targetSize);
      
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Формат не поддерживается или файл поврежден'));
    };
    
    img.src = objectUrl;
  });
}

function parseBioLinks(text) {
  if (!text) return '';
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  return escaped.replace(urlRegex, (url) => {
    const href = url.startsWith('http') ? url : `https://${url}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="bio-link">${url}</a>`;
  }).replace(/\n/g, '<br>');
}