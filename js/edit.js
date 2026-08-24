// ========== РЕДАКТИРОВАНИЕ ПРОФИЛЯ ==========
let currentUser = null;
let currentUserData = {};
let isSubmitting = false;
let tagCheckTimeout = null;
let isTagAvailable = false;
let selectedAvatarFile = null;
let currentTagValue = '';

// ========== МГНОВЕННАЯ ОТРИСОВКА (ДО ЗАПУСКА FIREBASE) ==========
document.addEventListener("DOMContentLoaded", () => {
  const lastUid = localStorage.getItem('lastUid');
  if (lastUid) {
    const cachedUserStr = localStorage.getItem(`cachedCurrentUser_${lastUid}`);
    if (cachedUserStr) {
      currentUserData = JSON.parse(cachedUserStr);
      updateSidebarUser(currentUserData);
      fillEditForm(currentUserData);
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

  // ===== НОВОЕ: Мгновенная подгрузка из кэша (как в profile.js) =====
  const cacheKey = `cachedCurrentUser_${user.uid}`;
  const cachedDataStr = localStorage.getItem(cacheKey);
  
  if (cachedDataStr) {
    currentUserData = JSON.parse(cachedDataStr);
    updateSidebarUser(currentUserData);
    fillEditForm(currentUserData);
  }
  // =================================================================

  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) {
      window.location.href = 'profile.html';
      return;
    }
    currentUserData = doc.data();
    localStorage.setItem(cacheKey, JSON.stringify(currentUserData));
    if (window.userCache) userCache.set(user.uid, currentUserData);
    
    updateSidebarUser(currentUserData);
    fillEditForm(currentUserData);
    
    // Проверяем текущий тег после загрузки данных
    const tagInput = document.getElementById('editTag');
    if (tagInput && tagInput.value) {
      validateTag(tagInput.value);
    }
    
  } catch (error) {
    console.error('Ошибка загрузки профиля:', error);
    showMessage(t('saveError') || 'Ошибка загрузки данных', 'error');
  }
});

function fillEditForm(data) {
  const nickInput = document.getElementById('editNickname');
  const tagInput = document.getElementById('editTag');
  const bioTextarea = document.getElementById('editBio');
  const avatarDiv = document.getElementById('editAvatar');

  if (nickInput) nickInput.value = data.nickname || '';
  if (tagInput) tagInput.value = (data.tag || '').replace(/^@+/, '');
  if (bioTextarea) {
    bioTextarea.value = data.bio || '';
    updateBioCounter(bioTextarea);
    autoResize(bioTextarea);
  }

  // Аватар
  if (avatarDiv) {
    if (data.avatar) {
      avatarDiv.innerHTML = `<img src="${data.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`;
      avatarDiv.style.background = 'transparent';
    } else {
      avatarDiv.innerHTML = data.nickname ? data.nickname.charAt(0).toUpperCase() : '?';
      avatarDiv.style.background = '#3b82f6';
      avatarDiv.style.color = '#fff';
      avatarDiv.style.display = 'flex';
      avatarDiv.style.alignItems = 'center';
      avatarDiv.style.justifyContent = 'center';
      avatarDiv.style.fontSize = '2.5rem';
      avatarDiv.style.fontWeight = '600';
    }
  }
}

// ===== БИО СЧЕТЧИК =====
document.addEventListener('DOMContentLoaded', () => {
  const bioTextarea = document.getElementById('editBio');
  if (bioTextarea) {
    bioTextarea.addEventListener('input', function() {
      updateBioCounter(this);
      autoResize(this);
    });
  }
});

function updateBioCounter(textarea) {
  const counter = document.getElementById('bioCounter');
  if (counter) {
    const len = textarea.value.length;
    counter.textContent = `${len} / 150`;
    if (len > 140) {
      counter.style.color = '#dc2626';
    } else {
      counter.style.color = '#999';
    }
  }
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

// ===== ВАЛИДАЦИЯ ТЕГА =====
document.addEventListener('DOMContentLoaded', () => {
  const tagInput = document.getElementById('editTag');
  if (tagInput) {
    tagInput.addEventListener('input', function() {
      // Очищаем ввод от @ и недопустимых символов
      let value = this.value.replace(/@/g, '').slice(0, 20);
      value = value.replace(/[^a-zA-Z0-9_]/g, '');
      this.value = value;
      validateTag(value);
    });
  }
});

function validateTag(value) {
  const statusDiv = document.getElementById('tagStatus');
  if (!statusDiv) return;
  
  if (tagCheckTimeout) clearTimeout(tagCheckTimeout);
  
  const trimmedValue = value.trim();

  // Если поле пустое
  if (!trimmedValue) {
    statusDiv.textContent = t('tagEmptyError') || 'Тег не может быть пустым';
    statusDiv.className = 'edit-tag-status unavailable';
    isTagAvailable = false;
    return;
  }

  // Проверка минимальной длины (3 символа)
  if (trimmedValue.length < 3) {
    statusDiv.textContent = t('tagMinLengthError') || 'Тег должен содержать минимум 3 символа';
    statusDiv.className = 'edit-tag-status unavailable';
    isTagAvailable = false;
    return;
  }

  // Проверка, не является ли это текущим тегом пользователя
  const fullTag = '@' + trimmedValue;
  if (fullTag === currentUserData.tag) {
    statusDiv.textContent = t('tagCurrentError') || 'Это ваш текущий тег';
    statusDiv.className = 'edit-tag-status available';
    isTagAvailable = true;
    return;
  }

  // Показываем статус проверки
  statusDiv.textContent = t('tagChecking') || 'Проверка тега...';
  statusDiv.className = 'edit-tag-status loading';
  currentTagValue = trimmedValue;

  // Дебаунс 500мс перед проверкой
  tagCheckTimeout = setTimeout(async () => {
    // Проверяем, не изменился ли тег за время ожидания
    if (currentTagValue !== trimmedValue) return;

    try {
      const snapshot = await db.collection('users')
        .where('tag', '==', fullTag)
        .get();

      if (snapshot.empty) {
        statusDiv.textContent = t('tagAvailable') || '✅ Тег доступен';
        statusDiv.className = 'edit-tag-status available';
        isTagAvailable = true;
      } else {
        statusDiv.textContent = t('tagTaken') || '❌ Тег уже занят';
        statusDiv.className = 'edit-tag-status unavailable';
        isTagAvailable = false;
      }
    } catch (error) {
      console.error('Ошибка проверки тега:', error);
      statusDiv.textContent = t('tagError') || '❌ Ошибка проверки';
      statusDiv.className = 'edit-tag-status unavailable';
      isTagAvailable = false;
    }
  }, 500);
}

// ===== АВАТАРКА =====
document.addEventListener('DOMContentLoaded', () => {
  const avatarInput = document.getElementById('avatarInput');
  if (avatarInput) {
    avatarInput.addEventListener('change', handleAvatarSelect);
  }
});

async function handleAvatarSelect(event) {
  let file = event.target.files[0];
  if (!file) return;

  let base64Avatar;

  try {
    base64Avatar = await processAvatarFile(file);
  } catch (error) {
    console.warn('Обычное чтение аватара не удалось, пробуем heic2any...', error);
    
    try {
      const convertedBlob = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.85
      });
      const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      const fallbackFile = new File([finalBlob], "avatar.jpg", { type: "image/jpeg" });
      base64Avatar = await processAvatarFile(fallbackFile);
      
    } catch (heicErr) {
      console.error('Ошибка конвертации HEIC для аватара:', heicErr);
      alert(t('fileError') || 'Не удалось обработать изображение.');
      event.target.value = '';
      return;
    }
  }

  if (base64Avatar.length > 1048576) {
    alert(t('fileTooLarge') || 'Файл слишком большой');
    event.target.value = '';
    return;
  }

  // Обновляем превью аватара
  const avatarDiv = document.getElementById('editAvatar');
  if (avatarDiv) {
    avatarDiv.innerHTML = `<img src="${base64Avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`;
    avatarDiv.style.background = 'transparent';
  }
  
  selectedAvatarFile = base64Avatar;
}

function processAvatarFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = function() {
      URL.revokeObjectURL(objectUrl);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const targetSize = 800;

      canvas.width = targetSize;
      canvas.height = targetSize;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetSize, targetSize);

      const minDim = Math.min(img.width, img.height);
      const startX = (img.width - minDim) / 2;
      const startY = (img.height - minDim) / 2;

      ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, targetSize, targetSize);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Формат не поддерживается'));
    };

    img.src = objectUrl;
  });
}

// ===== СОХРАНЕНИЕ =====
async function saveChanges() {
  if (isSubmitting) return;

  const nickInput = document.getElementById('editNickname');
  const tagInput = document.getElementById('editTag');
  const bioTextarea = document.getElementById('editBio');

  if (!nickInput || !tagInput || !bioTextarea) {
    showMessage('Ошибка: Поля ввода не найдены', 'error');
    return;
  }

  const newNickname = nickInput.value.trim();
  const rawTag = tagInput.value.trim().replace(/^@+/, '');
  const newTag = '@' + rawTag;
  const newBio = bioTextarea.value.trim();

  // Валидация никнейма
  if (!newNickname) {
    showMessage('Введите никнейм', 'error');
    nickInput.focus();
    return;
  }

  // Валидация тега
  if (!isTagAvailable) {
    showMessage('Пожалуйста, выберите доступный тег', 'error');
    tagInput.focus();
    return;
  }

  // Проверка длины тега
  if (rawTag.length < 3 && newTag !== currentUserData.tag) {
    showMessage('Тег должен содержать минимум 3 символа', 'error');
    tagInput.focus();
    return;
  }

  // Валидация био
  if (newBio.length > 150) {
    showMessage('Био не может превышать 150 символов', 'error');
    bioTextarea.focus();
    return;
  }

  isSubmitting = true;
  showMessage('Сохранение...', 'info');

  try {
    const updates = {
      nickname: newNickname,
      tag: newTag,
      bio: newBio
    };

    if (selectedAvatarFile) {
      updates.avatar = selectedAvatarFile;
    }

    await db.collection('users').doc(currentUser.uid).update(updates);

    const newDisplayName = `${newNickname}|${newTag}`;
    await currentUser.updateProfile({ displayName: newDisplayName });

    currentUserData = { ...currentUserData, ...updates };
    if (selectedAvatarFile) currentUserData.avatar = selectedAvatarFile;
    localStorage.setItem(`cachedCurrentUser_${currentUser.uid}`, JSON.stringify(currentUserData));
    if (window.userCache) userCache.set(currentUser.uid, currentUserData);

    updateSidebarUser(currentUserData);

    showMessage(t('changesSaved') || 'Изменения успешно сохранены!', 'success');

    setTimeout(() => {
      window.location.href = 'profile.html';
    }, 1500);

  } catch (error) {
    console.error('Ошибка сохранения:', error);
    showMessage(t('saveError') || 'Ошибка при сохранении', 'error');
  } finally {
    isSubmitting = false;
  }
}

// ===== ОТМЕНА =====
function cancelEditing() {
  window.location.href = 'profile.html';
}

// ===== СООБЩЕНИЯ =====
function showMessage(text, type) {
  const msgDiv = document.getElementById('editMessage');
  if (!msgDiv) return;
  msgDiv.textContent = text;
  msgDiv.className = 'edit-message';
  if (type) msgDiv.classList.add(type);
  msgDiv.style.display = 'block';

  if (type !== 'info') {
    setTimeout(() => {
      msgDiv.style.display = 'none';
    }, 5000);
  }
}

function updateSidebarUser(userData) {
  const nameEl = document.getElementById('sidebarUserName');
  const tagEl = document.getElementById('sidebarUserTag');
  const avatarEl = document.getElementById('sidebarUserAvatar');
  
  if (nameEl) {
    try {
      nameEl.textContent = userData.nickname || t('users');
      nameEl.removeAttribute('data-i18n');
    } catch (e) {
      nameEl.textContent = userData.nickname || 'Users';
      nameEl.removeAttribute('data-i18n');
    }
  }
  
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