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
      avatarDiv.style.background = '#1a1a1a'; // Возвращаем фон для буквы
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
      profileAvatarEl.style.background = '#1a1a1a';
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
  if (!content) { alert(t('enterPostText')); return; }
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
    alert(t('postCreateError'));
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

document.getElementById('avatarInput')?.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const targetSize = 800;
      
      canvas.width = targetSize;
      canvas.height = targetSize;

      const minDim = Math.min(img.width, img.height);
      const startX = (img.width - minDim) / 2;
      const startY = (img.height - minDim) / 2;

      ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, targetSize, targetSize);
      const base64Avatar = canvas.toDataURL('image/jpeg', 0.7);

      if (base64Avatar.length > 1000000) {
        alert(t('fileTooLarge'));
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
      avatarEl.style.background = '#1a1a1a';
      avatarEl.style.color = 'white';
    }
  }
}