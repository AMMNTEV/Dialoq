// ========== РЕДАКТИРОВАНИЕ ПРОФИЛЯ ==========
currentUser = null;
currentUserData = {};
let isSubmitting = false;
let tagCheckTimeout = null;
let isTagAvailable = true;
let selectedAvatarFile = null;
let currentTagValue = '';

// ===== ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ ФОРМЫ =====
function initFormListeners() {
  const bioTextarea = document.getElementById('editBio');
  if (bioTextarea && !bioTextarea.dataset.listenerAttached) {
    bioTextarea.dataset.listenerAttached = 'true';
    bioTextarea.addEventListener('input', function() {
      updateBioCounter(this);
      autoResize(this);
    });
  }

  const tagInput = document.getElementById('editTag');
  if (tagInput && !tagInput.dataset.listenerAttached) {
    tagInput.dataset.listenerAttached = 'true';
    tagInput.addEventListener('input', function() {
      let value = this.value.replace(/@/g, '').slice(0, 20);
      value = value.replace(/[^a-zA-Z0-9_]/g, '');
      this.value = value;
      validateTag(value);
    });
  }

  const avatarInput = document.getElementById('avatarInput');
  if (avatarInput && !avatarInput.dataset.listenerAttached) {
    avatarInput.dataset.listenerAttached = 'true';
    avatarInput.addEventListener('change', handleAvatarSelect);
  }
}

// ===== МГНОВЕННАЯ ОТРИСОВКА ИЗ КЭША =====
function initEditPage() {
  initFormListeners();

  const lastUid = localStorage.getItem('lastUid');
  if (lastUid) {
    const cachedUserStr = localStorage.getItem(`cachedCurrentUser_${lastUid}`);
    if (cachedUserStr) {
      try {
        currentUserData = JSON.parse(cachedUserStr);
        updateSidebarUser(currentUserData);
        fillEditForm(currentUserData);
        console.log('✅ Данные загружены из кэша');
      } catch (e) {
        console.error('Ошибка парсинга кэша:', e);
      }
    }
  }
}

// Запускаем инициализацию сразу или по загрузке DOM
if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", initEditPage);
} else {
  initEditPage();
}

// ===== ПОДПИСКА НА АВТОРИЗАЦИЮ FIREBASE =====
auth.onAuthStateChanged(async (user) => {
  if (!user || !user.emailVerified) {
    localStorage.removeItem('lastUid');
    window.location.href = 'index.html';
    return;
  }

  currentUser = user;
  localStorage.setItem('lastUid', user.uid);

  try {
    console.log('📡 Загрузка данных из Firestore...');
    const doc = await db.collection('users').doc(user.uid).get();

    if (!doc.exists) {
      window.location.href = 'profile.html';
      return;
    }

    currentUserData = doc.data();
    const cacheKey = `cachedCurrentUser_${user.uid}`;
    localStorage.setItem(cacheKey, JSON.stringify(currentUserData));
    if (window.userCache) userCache.set(user.uid, currentUserData);

    // Отрисовываем сайдбар и заполняем форму актуальными данными
    updateSidebarUser(currentUserData);
    fillEditForm(currentUserData);

    const tagInput = document.getElementById('editTag');
    if (tagInput && tagInput.value) {
      validateTag(tagInput.value);
    }

    console.log('✅ Профиль успешно загружен');

  } catch (error) {
    console.error('❌ Ошибка загрузки профиля:', error);
    if (typeof showMessage === 'function') {
      showMessage(typeof t === 'function' ? t('saveError') : 'Ошибка загрузки данных', 'error');
    }
  }
});

// ===== ЗАПОЛНЕНИЕ ФОРМЫ И САЙДБАРА =====
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

function updateSidebarUser(userData) {
  const nameEl = document.getElementById('sidebarUserName');
  const tagEl = document.getElementById('sidebarUserTag');
  const avatarEl = document.getElementById('sidebarUserAvatar');

  if (nameEl) {
    nameEl.textContent = userData.nickname || 'Пользователь';
    nameEl.removeAttribute('data-i18n');
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

// ===== ВАЛИДАЦИЯ ТЕГА И БИО =====
function updateBioCounter(textarea) {
  const counter = document.getElementById('bioCounter');
  if (counter) {
    const len = textarea.value.length;
    counter.textContent = `${len} / 150`;
    counter.style.color = len > 140 ? '#dc2626' : '#999';
  }
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

function validateTag(value) {
  const statusDiv = document.getElementById('tagStatus');
  if (!statusDiv) return;

  if (tagCheckTimeout) clearTimeout(tagCheckTimeout);
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    statusDiv.textContent = typeof t === 'function' ? t('tagEmptyError') : 'Тег не может быть пустым';
    statusDiv.className = 'edit-tag-status unavailable';
    isTagAvailable = false;
    return;
  }

  if (trimmedValue.length < 3) {
    statusDiv.textContent = typeof t === 'function' ? t('tagMinLengthError') : 'Тег должен содержать минимум 3 символа';
    statusDiv.className = 'edit-tag-status unavailable';
    isTagAvailable = false;
    return;
  }

  const fullTag = '@' + trimmedValue;
  if (fullTag === currentUserData.tag) {
    statusDiv.textContent = typeof t === 'function' ? t('tagCurrentError') : 'Это ваш текущий тег';
    statusDiv.className = 'edit-tag-status available';
    isTagAvailable = true;
    return;
  }

  statusDiv.textContent = typeof t === 'function' ? t('tagChecking') : 'Проверка тега...';
  statusDiv.className = 'edit-tag-status loading';
  currentTagValue = trimmedValue;

  tagCheckTimeout = setTimeout(async () => {
    if (currentTagValue !== trimmedValue) return;

    try {
      const snapshot = await db.collection('users').where('tag', '==', fullTag).get();
      if (snapshot.empty) {
        statusDiv.textContent = typeof t === 'function' ? t('tagAvailable') : '✅ Тег доступен';
        statusDiv.className = 'edit-tag-status available';
        isTagAvailable = true;
      } else {
        statusDiv.textContent = typeof t === 'function' ? t('tagTaken') : '❌ Тег уже занят';
        statusDiv.className = 'edit-tag-status unavailable';
        isTagAvailable = false;
      }
    } catch (error) {
      console.error('Ошибка проверки тега:', error);
      statusDiv.textContent = '❌ Ошибка проверки';
      statusDiv.className = 'edit-tag-status unavailable';
      isTagAvailable = false;
    }
  }, 500);
}

// ===== АВАТАРКА =====
async function handleAvatarSelect(event) {
  let file = event.target.files[0];
  if (!file) return;

  let base64Avatar;
  try {
    base64Avatar = await processAvatarFile(file);
  } catch (error) {
    try {
      const convertedBlob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
      const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      const fallbackFile = new File([finalBlob], "avatar.jpg", { type: "image/jpeg" });
      base64Avatar = await processAvatarFile(fallbackFile);
    } catch (heicErr) {
      alert(typeof t === 'function' ? t('fileError') : 'Не удалось обработать изображение.');
      event.target.value = '';
      return;
    }
  }

  if (base64Avatar.length > 1048576) {
    alert(typeof t === 'function' ? t('fileTooLarge') : 'Файл слишком большой');
    event.target.value = '';
    return;
  }

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

// ===== СОХРАНЕНИЕ И ОТМЕНА =====
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
  const newBio = bioTextarea.value
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0)
  .join('\n');

  if (!newNickname) {
    showMessage(typeof t === 'function' ? t('enterNicknameError') : 'Введите никнейм', 'error');
    nickInput.focus();
    return;
  }

  if (!isTagAvailable) {
    showMessage(typeof t === 'function' ? t('tagSelectAvailableError') : 'Пожалуйста, выберите доступный тег', 'error');
    tagInput.focus();
    return;
  }

  if (rawTag.length < 3 && newTag !== currentUserData.tag) {
    showMessage(typeof t === 'function' ? t('tagMinLengthError') : 'Тег должен содержать минимум 3 символа', 'error');
    tagInput.focus();
    return;
  }

  if (newBio.length > 150) {
    showMessage(typeof t === 'function' ? t('bioMaxLengthError') : 'Био не может превышать 150 символов', 'error');
    bioTextarea.focus();
    return;
  }

  isSubmitting = true;
  showMessage(typeof t === 'function' ? t('saving') : 'Saving...', 'info');

  try {
    const updates = { nickname: newNickname, tag: newTag, bio: newBio };
    if (selectedAvatarFile) updates.avatar = selectedAvatarFile;

    await db.collection('users').doc(currentUser.uid).update(updates);

    const newDisplayName = `${newNickname}|${newTag}`;
    await currentUser.updateProfile({ displayName: newDisplayName });

    currentUserData = { ...currentUserData, ...updates };
    localStorage.setItem(`cachedCurrentUser_${currentUser.uid}`, JSON.stringify(currentUserData));
    if (window.userCache) userCache.set(currentUser.uid, currentUserData);

    updateSidebarUser(currentUserData);
    showMessage(typeof t === 'function' ? t('changesSaved') : 'Изменения сохранены!', 'success');

    

  } catch (error) {
    console.error('Ошибка сохранения:', error);
    showMessage(typeof t === 'function' ? t('saveError') : 'Ошибка при сохранении', 'error');
  } finally {
    isSubmitting = false;
  }
}

function cancelEditing() {
  window.location.href = 'profile.html';
}

function showMessage(text, type) {
  const msgDiv = document.getElementById('editMessage');
  if (!msgDiv) return;
  msgDiv.textContent = text;
  msgDiv.className = 'edit-message ' + (type || '');
  msgDiv.style.display = 'block';

  if (type !== 'info') {
    setTimeout(() => { msgDiv.style.display = 'none'; }, 5000);
  }
}

function goToMessenger() {
    window.history.back();
}