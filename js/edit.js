// ========== РЕДАКТИРОВАНИЕ ПРОФИЛЯ ==========
let currentUser = null;
let currentUserData = {};
let isSubmitting = false;
let tagCheckTimeout = null;
let isTagValid = true;
let selectedAvatarFile = null;

// ========== МГНОВЕННАЯ ОТРИСОВКА (ДО ЗАПУСКА FIREBASE) ==========
document.addEventListener("DOMContentLoaded", () => {
  const lastUid = localStorage.getItem('lastUid');
  if (lastUid) {
    const cachedUserStr = localStorage.getItem(`cachedCurrentUser_${lastUid}`);
    if (cachedUserStr) {
      currentUserData = JSON.parse(cachedUserStr);
      if (typeof updateSidebarUser === 'function') updateSidebarUser(currentUserData);
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

  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) {
      window.location.href = 'profile.html';
      return;
    }
    currentUserData = doc.data();
    localStorage.setItem(`cachedCurrentUser_${user.uid}`, JSON.stringify(currentUserData));
    if (window.userCache) userCache.set(user.uid, currentUserData);
    
    updateSidebarUser(currentUserData);
    fillEditForm(currentUserData);
    
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
  }

  // Аватар
  if (avatarDiv) {
    if (data.avatar) {
      avatarDiv.innerHTML = `<img src="${data.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`;
      avatarDiv.style.background = 'transparent';
    } else {
      avatarDiv.innerHTML = data.nickname ? data.nickname.charAt(0).toUpperCase() : '?';
      avatarDiv.style.background = '#3b82f6';
    }
  }
}

// ===== БИО СЧЕТЧИК =====
document.addEventListener('DOMContentLoaded', () => {
  const bioTextarea = document.getElementById('editBio');
  if (bioTextarea) {
    bioTextarea.addEventListener('input', function() {
      updateBioCounter(this);
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

// ===== ВАЛИДАЦИЯ ТЕГА =====
document.addEventListener('DOMContentLoaded', () => {
  const tagInput = document.getElementById('editTag');
  if (tagInput) {
    tagInput.addEventListener('input', function() {
      validateTag(this.value);
    });
  }
});

function validateTag(value) {
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

async function checkTagUnique(tag) {
  if (!currentUser) return false;
  try {
    const snapshot = await db.collection('users')
      .where('tag', '==', '@' + tag)
      .get();
    return snapshot.empty || (snapshot.docs.length === 1 && snapshot.docs[0].id === currentUser.uid);
  } catch (error) {
    console.error('Ошибка проверки тега:', error);
    return false;
  }
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

  const newNickname = nickInput.value.trim();
  const newTag = '@' + tagInput.value.trim().replace(/^@+/, '');
  const newBio = bioTextarea.value.trim();

  // Валидация
  if (!newNickname) {
    showMessage('Введите никнейм', 'error');
    nickInput.focus();
    return;
  }

  if (!isTagValid) {
    showMessage('Пожалуйста, выберите доступный тег', 'error');
    return;
  }

  if (newBio.length > 150) {
    showMessage('Био не может превышать 150 символов', 'error');
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

    // Обновляем displayName
    const newDisplayName = `${newNickname}|${newTag}`;
    await currentUser.updateProfile({ displayName: newDisplayName });

    // Обновляем кэш
    currentUserData = { ...currentUserData, ...updates };
    if (selectedAvatarFile) currentUserData.avatar = selectedAvatarFile;
    localStorage.setItem(`cachedCurrentUser_${currentUser.uid}`, JSON.stringify(currentUserData));
    if (window.userCache) userCache.set(currentUser.uid, currentUserData);

    // Обновляем сайдбар
    updateSidebarUser(currentUserData);

    showMessage(t('changesSaved') || 'Изменения успешно сохранены!', 'success');

    // Перенаправляем на профиль через 1.5 секунды
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

// ===== ОБНОВЛЕНИЕ САЙДБАРА =====
function updateSidebarUser(userData) {
  const nameEl = document.getElementById('sidebarUserName');
  const tagEl = document.getElementById('sidebarUserTag');
  const avatarEl = document.getElementById('sidebarUserAvatar');

  if (nameEl) {
    nameEl.textContent = userData.nickname || 'Users';
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