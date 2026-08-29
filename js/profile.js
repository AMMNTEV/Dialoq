// ========== ПРОФИЛЬ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ==========
let unsubscribePosts = null;
let isSubmitting = false;
let changes = {};
let tagCheckTimeout = null;
let isTagValid = true;

// ========== МГНОВЕННАЯ ОТРИСОВКА (ДО ЗАПУСКА FIREBASE) ==========
document.addEventListener("DOMContentLoaded", () => {
  const lastUid = localStorage.getItem('lastUid');
  
  if (lastUid) {
    const cachedUserStr = localStorage.getItem(`cachedCurrentUser_${lastUid}`);
    if (cachedUserStr) {
      currentUserData = JSON.parse(cachedUserStr);
      
      if (typeof updateSidebarUser === 'function') updateSidebarUser(currentUserData);
      
      if (document.getElementById('nickname') && typeof loadProfileInfo === 'function') {
        loadProfileInfo();
        const avatarDiv = document.getElementById('profileAvatar');
        if (avatarDiv) {
          if (currentUserData.avatar) {
            avatarDiv.innerHTML = `<img src="${currentUserData.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">`;
            avatarDiv.style.background = 'transparent';
          } else {
            avatarDiv.innerHTML = currentUserData.nickname ? currentUserData.nickname.charAt(0).toUpperCase() : '?';
            avatarDiv.style.background = '#3b82f6';
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
  const headerTagEl = document.getElementById('headerUserTag');
  
  if (nickEl) nickEl.textContent = currentUserData.nickname || t('notSpecified');
  if (tagEl) tagEl.textContent = currentUserData.tag || t('notSpecified');
  if (bioEl) renderBio(bioEl, currentUserData.bio || '');
  if (headerTagEl) headerTagEl.textContent = currentUserData.tag || '';

  const followers = currentUserData.followers || [];
  const following = currentUserData.following || [];
  
  const statFollowersCount = document.getElementById('statFollowersCount');
  const statFollowingCount = document.getElementById('statFollowingCount');
  
  if (statFollowersCount) statFollowersCount.textContent = followers.length;
  if (statFollowingCount) statFollowingCount.textContent = following.length;
}

let selectedPostImageFile = null;

window.autoResize = function(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
};

function showCreatePostModal() {
  document.getElementById('postModal').style.display = 'flex';
  const postContent = document.getElementById('postContent');
  postContent.value = '';
  postContent.style.height = 'auto';
  removePostImage();
}

function convertToJpgForPreview(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = function() {
      URL.revokeObjectURL(objectUrl);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
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
      
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Формат не поддерживается'));
    };
    
    img.src = objectUrl;
  });
}

async function handlePostImageSelect(event) {
  let file = event.target.files[0];
  if (!file) return;

  try {
    const jpgBase64 = await convertToJpgForPreview(file);
    
    document.getElementById('previewImg').src = jpgBase64;
    document.getElementById('postImagePreview').style.display = 'block';
    
    const res = await fetch(jpgBase64);
    const blob = await res.blob();
    selectedPostImageFile = new File([blob], "post_image.jpg", { type: "image/jpeg" });

  } catch (error) {
    console.warn('Обычное чтение не удалось, пробуем конвертировать через heic2any...', error);
    
    try {
      const convertedBlob = await heic2any({ 
        blob: file, 
        toType: "image/jpeg", 
        quality: 0.85 
      });
      const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      file = new File([finalBlob], "converted_image.jpg", { type: "image/jpeg" });

      const fallbackJpgBase64 = await convertToJpgForPreview(file);
      
      document.getElementById('previewImg').src = fallbackJpgBase64;
      document.getElementById('postImagePreview').style.display = 'block';
      
      const res = await fetch(fallbackJpgBase64);
      const fallbackBlob = await res.blob();
      selectedPostImageFile = new File([fallbackBlob], "post_image.jpg", { type: "image/jpeg" });

    } catch (heicErr) {
      console.error('Ошибка конвертации фолбэка HEIC:', heicErr);
      alert(t('fileError') || 'Не удалось обработать изображение. Файл может быть поврежден или иметь неподдерживаемый формат.');
      removePostImage();
    }
  }
}

function removePostImage() {
  selectedPostImageFile = null;
  const previewDiv = document.getElementById('postImagePreview');
  const previewImg = document.getElementById('previewImg');
  const fileInput = document.getElementById('postImageInput');
  
  if (previewDiv) previewDiv.style.display = 'none';
  if (previewImg) previewImg.src = '';
  if (fileInput) fileInput.value = '';
}

function compressImageToFit(file, maxBytes) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let quality = 0.9;
        let scale = 1.0;
        let maxDim = 1500;
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

        while (base64.length > maxBytes && quality > 0.1) {
          quality -= 0.1;
          
          if (quality <= 0.4) {
             scale *= 0.8;
          }
          
          if (scale < 0.1) break;
          
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

  if (!content && !selectedPostImageFile) {
    alert(t('enterPostText') || 'Введите текст или выберите фото');
    return;
  }

  hideCreatePostModal();
  isSubmitting = true;

  let finalImageBase64 = null;

  try {
    if (selectedPostImageFile) {
      const textBytes = new Blob([content]).size;
      const maxImageBytes = 1048576 - 50000 - textBytes;
      finalImageBase64 = await compressImageToFit(selectedPostImageFile, maxImageBytes);
    }

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
      console.error('Ошибка конвертации фолбэка HEIC для аватара:', heicErr);
      alert(t('fileError') || 'Не удалось обработать изображение. Файл может быть поврежден или иметь неподдерживаемый формат.');
      e.target.value = ''; 
      return;
    }
  }

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
    avatarDiv.style.background = 'transparent';
  } else {
    avatarDiv.innerHTML = currentUserData.nickname ? currentUserData.nickname.charAt(0).toUpperCase() : '?';
    avatarDiv.style.background = '#3b82f6';
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

window.toggleLike = async function(postId) {
  if (!currentUser) return;
  const postRef = db.collection('posts').doc(postId);
  
  try {
    const doc = await postRef.get();
    if (!doc.exists) return;
    
    const postData = doc.data();
    const likedBy = postData.likedBy || [];
    
    if (likedBy.includes(currentUser.uid)) {
      await postRef.update({
        likedBy: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
      });
    } else {
      await postRef.update({
        likedBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
      });
    }
  } catch (error) {
    console.error('Ошибка при переключении лайка:', error);
  }
};

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
  });
}

function renderBio(container, text) {
  if (!container) return;
  if (!text) {
    container.innerHTML = '';
    return;
  }

  const lines = text.split('\n');
  
  if (lines.length <= 3) {
    container.innerHTML = parseBioLinks(text);
    return;
  }

  const shortText = lines.slice(0, 3).join('\n');

  container.innerHTML = `<div class="bio-short">${parseBioLinks(shortText)}\n<div class="bio-toggle-btn" onclick="toggleBio(this, 'full')">${t('bioMore')}</div></div><div class="bio-full" style="display: none;">${parseBioLinks(text)}\n<div class="bio-toggle-btn" onclick="toggleBio(this, 'short')">${t('bioHide')}</div></div>`;
}

function toggleBio(btn, mode) {
  const parent = btn.closest('.insta-bio');
  if (!parent) return;
  const shortDiv = parent.querySelector('.bio-short');
  const fullDiv = parent.querySelector('.bio-full');

  if (mode === 'full') {
    shortDiv.style.display = 'none';
    fullDiv.style.display = 'block';
  } else {
    shortDiv.style.display = 'block';
    fullDiv.style.display = 'none';
  }
}

function goToMessenger() {
    if (window.history.length > 1) {
        // Если есть история - возвращаемся назад
        window.history.back();
    } else {
        // Если истории нет - заменяем текущую страницу в истории
        window.location.replace('messenger.html');
    }
}