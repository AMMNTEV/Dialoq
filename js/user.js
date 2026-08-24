// ========== МГНОВЕННАЯ ОТРИСОВКА САЙДБАРА (ДО ЗАПУСКА FIREBASE) ==========
document.addEventListener("DOMContentLoaded", () => {
  const lastUid = localStorage.getItem('lastUid');
  if (lastUid) {
    const cachedUserStr = localStorage.getItem(`cachedCurrentUser_${lastUid}`);
    if (cachedUserStr) {
      if (typeof updateSidebarUser === 'function') {
        updateSidebarUser(JSON.parse(cachedUserStr));
      }
    }
  }
});

// ========== ПРОСМОТР ПРОФИЛЯ ДРУГОГО ПОЛЬЗОВАТЕЛЯ ==========
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');
if (!userId) window.location.href = 'messenger.html';

let unsubscribePosts = null;
let isFollowing = false; // Выносим флаг на уровень модуля

onAuthStateChanged(async (user) => {
  if (!user || !user.emailVerified) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  const cachedUserStr = localStorage.getItem(`cachedCurrentUser_${user.uid}`);
  if (cachedUserStr) {
    updateSidebarUser(JSON.parse(cachedUserStr));
  } else {
    db.collection('users').doc(user.uid).get().then(doc => {
      if(doc.exists) updateSidebarUser(doc.data());
    });
  }
  
  try {
    db.collection('users').doc(userId).onSnapshot((doc) => {
      if (!doc.exists) {
        document.querySelector('.profile-two-columns').innerHTML = `
          <div class="error" style="text-align: center; margin-top: 50px; font-size: 1.2rem; width: 100%;">${t('userNotFound') || 'Пользователь не найден'}</div>
          <a href="messenger.html" style="display: block; text-align: center; margin-top: 20px; color: #3b82f6; width: 100%;">${t('backToMessenger') || 'Вернуться в мессенджер'}</a>
        `;
        return;
      }
      
      const userData = doc.data();
      
      // Аватар
      const firstLetter = userData.nickname ? userData.nickname.charAt(0).toUpperCase() : '?';
      const avatarHTML = userData.avatar 
        ? `<img src="${userData.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">` 
        : firstLetter;

      const avatarEl = document.getElementById('userAvatar');
      if (avatarEl) {
        avatarEl.innerHTML = avatarHTML;
        if (!userData.avatar) {
          avatarEl.style.background = '#3b82f6';
          avatarEl.style.color = 'white';
        }
      }

      // Информация профиля
      const nicknameEl = document.getElementById('userNickname');
      if (nicknameEl) nicknameEl.textContent = userData.nickname || t('notSpecified');

      const tagEl = document.getElementById('userTag');
      if (tagEl) tagEl.textContent = userData.tag || t('notSpecified');

      const headerTagEl = document.getElementById('headerUserTag');
      if (headerTagEl) headerTagEl.textContent = userData.tag || '';

      const bioEl = document.getElementById('userBio');
      if (bioEl) bioEl.textContent = userData.bio || '';

      // Счетчики подписок
      const followers = userData.followers || [];
      const following = userData.following || [];
      
      const statFollowersCount = document.getElementById('statFollowersCount');
      const statFollowingCount = document.getElementById('statFollowingCount');
      if (statFollowersCount) statFollowersCount.textContent = followers.length;
      if (statFollowingCount) statFollowingCount.textContent = following.length;

      // Логика кнопки "Подписаться"
      const btnFollow = document.getElementById('btnFollow');
      if (btnFollow && currentUser) {
        isFollowing = followers.includes(currentUser.uid);
        
        if (isFollowing) {
          btnFollow.textContent = t('unfollow') || 'Отписаться';
          btnFollow.classList.remove('btn-primary');
          btnFollow.classList.add('btn-secondary'); 
        } else {
          btnFollow.textContent = t('btnFollow') || 'Подписаться';
          btnFollow.classList.remove('btn-secondary');
          btnFollow.classList.add('btn-primary');
        }
        
        btnFollow.onclick = () => toggleFollow(userId);
      }
      
      // Загружаем посты, если они еще не загружены
      if (!unsubscribePosts) {
        loadPosts(userId);
      }
    });
  } catch (error) {
    console.error('Ошибка загрузки профиля:', error);
    document.querySelector('.profile-two-columns').innerHTML = `<div class="error" style="text-align: center; margin-top: 50px; width: 100%;">${t('profileLoadError') || 'Ошибка загрузки'}</div>`;
  }
});

async function loadPosts(targetUserId) {
  const postsContainer = document.getElementById('userPostsContainer');
  if (!postsContainer) return;

  if (unsubscribePosts) unsubscribePosts();

  try {
    unsubscribePosts = db.collection('posts')
      .where('userId', '==', targetUserId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(snapshot => {
        const statPostsCount = document.getElementById('statPostsCount');
        if (statPostsCount) {
          statPostsCount.textContent = snapshot.size;
        }
        
        if (snapshot.empty) {
          postsContainer.innerHTML = `<div class="no-posts" style="text-align: center; color: gray; padding: 20px;">${t('noUserPosts') || 'У пользователя пока нет постов.'}</div>`;
          return;
        }
        let postsHTML = '';
        snapshot.forEach(doc => {
          const post = doc.data();
          let date = t('unknownDate') || 'Неизвестная дата';
          if (post.createdAt) {
            try { date = new Date(post.createdAt.toDate()).toLocaleString(); } catch(e) { date = t('justNow') || 'Только что'; }
          }
          
          const likedBy = post.likedBy || [];
          const likesCount = likedBy.length;
          const isLiked = currentUser && likedBy.includes(currentUser.uid);
          const heartClass = isLiked ? 'like-btn liked' : 'like-btn';

          postsHTML += `
  <div class="post-card">
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
      }, error => {
        console.error('Ошибка загрузки постов:', error);
        if (error.code === 'failed-precondition') {
          postsContainer.innerHTML = `<div class="error">${t('indexRequired') || 'Требуется индекс БД'}</div>`;
        } else {
          postsContainer.innerHTML = `<div class="error">${t('postsLoadError') || 'Ошибка загрузки постов'}</div>`;
        }
      });
  } catch (error) {
    console.error('Ошибка:', error);
    postsContainer.innerHTML = `<div class="error">${t('postsLoadError') || 'Ошибка загрузки постов'}</div>`;
  }
}

function updateSidebarUser(userData) {
  const nameEl = document.getElementById('sidebarUserName');
  const tagEl = document.getElementById('sidebarUserTag');
  const avatarEl = document.getElementById('sidebarUserAvatar');
  
  if (nameEl) {
    try {
      nameEl.textContent = userData.nickname || (t('users') || 'Users');
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

window.toggleFollow = async function(targetUserId) {
  if (!currentUser) return;
  
  const btnFollow = document.getElementById('btnFollow');
  btnFollow.disabled = true;

  const targetUserRef = db.collection('users').doc(targetUserId);
  const currentUserRef = db.collection('users').doc(currentUser.uid);

  try {
    if (isFollowing) {
      await Promise.all([
        targetUserRef.update({
          followers: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        }),
        currentUserRef.update({
          following: firebase.firestore.FieldValue.arrayRemove(targetUserId)
        })
      ]);
    } else {
      await Promise.all([
        targetUserRef.update({
          followers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        }),
        currentUserRef.update({
          following: firebase.firestore.FieldValue.arrayUnion(targetUserId)
        })
      ]);
    }
  } catch (error) {
    console.error("Ошибка при подписке/отписке:", error);
  } finally {
    btnFollow.disabled = false;
  }
};

function parseBioLinks(text) {
  if (!text) return '';
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  return escaped.replace(urlRegex, (url) => {
    const href = url.startsWith('http') ? url : `https://${url}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="bio-link">${url}</a>`;
  });
}