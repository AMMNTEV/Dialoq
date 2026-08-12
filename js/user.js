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
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      document.getElementById('profileContent').innerHTML = `
        <div class="error">${t('userNotFound')}</div>
        <a href="messenger.html" style="display: block; text-align: center; margin-top: 20px; color: #667eea;">${t('backToMessenger')}</a>
      `;
      return;
    }
    const userData = userDoc.data();
    
    const firstLetter = userData.nickname ? userData.nickname.charAt(0).toUpperCase() : '?';

    const avatarHTML = userData.avatar 
      ? `<img src="${userData.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;">` 
      : firstLetter;

    document.getElementById('profileContent').innerHTML = `
      <div class="profile-left">
        <div class="profile-card">
          <div class="profile-avatar-placeholder">
            <div class="avatar-large">${avatarHTML}</div>
          </div>
          <div class="profile-info">
            <div class="info-row"><label>${t('lblNickname')}</label><span>${userData.nickname || t('notSpecified')}</span></div>
            <div class="info-row"><label>${t('lblTag')}</label><span>${userData.tag || t('notSpecified')}</span></div>
          </div>
        </div>
      </div>
      <div class="profile-right">
        <div class="posts-header"><h2>${t('userPosts')}</h2></div>
        <div class="posts-container" id="postsContainer"><div class="loading">${t('loadingPosts')}</div></div>
      </div>
    `;

    loadPosts(userId);
  } catch (error) {
    console.error('Ошибка загрузки профиля:', error);
    document.getElementById('profileContent').innerHTML = `<div class="error">${t('profileLoadError')}</div>`;
  }
});

async function loadPosts(targetUserId) {
  const postsContainer = document.getElementById('postsContainer');
  if (unsubscribePosts) unsubscribePosts();

  try {
    unsubscribePosts = db.collection('posts')
      .where('userId', '==', targetUserId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(snapshot => {
        if (snapshot.empty) {
          postsContainer.innerHTML = `<div class="no-posts">${t('noUserPosts')}</div>`;
          return;
        }
        let postsHTML = '';
        snapshot.forEach(doc => {
          const post = doc.data();
          let date = t('unknownDate');
          if (post.createdAt) {
            try { date = new Date(post.createdAt.toDate()).toLocaleString(); } catch(e) { date = t('justNow'); }
          }
          
          // Логика лайков
          const likedBy = post.likedBy || [];
          const likesCount = likedBy.length;
          const isLiked = currentUser && likedBy.includes(currentUser.uid);
          const heartClass = isLiked ? 'like-btn liked' : 'like-btn';

          postsHTML += `
            <div class="post-card">
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
          postsContainer.innerHTML = `<div class="error">${t('indexRequired')}</div>`;
        } else {
          postsContainer.innerHTML = `<div class="error">${t('postsLoadError')}</div>`;
        }
      });
  } catch (error) {
    console.error('Ошибка:', error);
    postsContainer.innerHTML = `<div class="error">${t('postsLoadError')}</div>`;
  }
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