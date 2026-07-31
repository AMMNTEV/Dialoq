// ========== ПРОСМОТР ПРОФИЛЯ ДРУГОГО ПОЛЬЗОВАТЕЛЯ ==========
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');
if (!userId) window.location.href = 'messenger.html';

document.getElementById('backButton').href = `messenger.html?userId=${userId}`;

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
    // Если кэша нет, запрашиваем из базы
    db.collection('users').doc(user.uid).get().then(doc => {
      if(doc.exists) updateSidebarUser(doc.data());
    });
  }
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      document.getElementById('profileContent').innerHTML = `
        <div class="error">Пользователь не найден</div>
        <a href="messenger.html" style="display: block; text-align: center; margin-top: 20px; color: #667eea;">Вернуться в мессенджер</a>
      `;
      return;
    }
    const userData = userDoc.data();
    
    // Получаем первую букву, если аватарки нет
    const firstLetter = userData.nickname ? userData.nickname.charAt(0).toUpperCase() : '?';

    // Формируем HTML для аватарки: если есть Base64 код, выводим картинку, иначе букву
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
            <div class="info-row"><label>Никнейм:</label><span>${userData.nickname || 'Не указан'}</span></div>
            <div class="info-row"><label>Тег:</label><span>${userData.tag || 'Не указан'}</span></div>
          </div>
        </div>
      </div>
      <div class="profile-right">
        <div class="posts-header"><h2>Посты пользователя</h2></div>
        <div class="posts-container" id="postsContainer"><div class="loading">Загрузка постов...</div></div>
      </div>
    `;

    loadPosts(userId);
  } catch (error) {
    console.error('Ошибка загрузки профиля:', error);
    document.getElementById('profileContent').innerHTML = '<div class="error">Ошибка загрузки профиля</div>';
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
          postsContainer.innerHTML = '<div class="no-posts">У пользователя пока нет постов</div>';
          return;
        }
        let postsHTML = '';
        snapshot.forEach(doc => {
          const post = doc.data();
          let date = 'Дата неизвестна';
          if (post.createdAt) {
            try { date = new Date(post.createdAt.toDate()).toLocaleString(); } catch(e) { date = 'Только что'; }
          }
          postsHTML += `
            <div class="post-card">
              <div class="post-header"><span class="post-date">${date}</span></div>
              <div class="post-content">${post.content ? post.content.replace(/\n/g, '<br>') : ''}</div>
            </div>
          `;
        });
        postsContainer.innerHTML = postsHTML;
      }, error => {
        console.error('Ошибка загрузки постов:', error);
        if (error.code === 'failed-precondition') {
          postsContainer.innerHTML = '<div class="error">Требуется создать индекс. Подождите минуту и обновите страницу.</div>';
        } else {
          postsContainer.innerHTML = '<div class="error">Ошибка загрузки постов</div>';
        }
      });
  } catch (error) {
    console.error('Ошибка:', error);
    postsContainer.innerHTML = '<div class="error">Ошибка загрузки постов</div>';
  }
}

// Функция для обновления информации текущего пользователя в левом сайдбаре
function updateSidebarUser(userData) {
  const nameEl = document.getElementById('sidebarUserName');
  const tagEl = document.getElementById('sidebarUserTag');
  const avatarEl = document.getElementById('sidebarUserAvatar');
  
  if (nameEl) nameEl.textContent = userData.nickname || 'Пользователь';
  if (tagEl) tagEl.textContent = userData.tag || '@user';
  
  if (avatarEl) {
    if (userData.avatar) {
      avatarEl.innerHTML = `<img src="${userData.avatar}" alt="Аватар" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block;">`;
      avatarEl.style.background = 'transparent';
    } else {
      avatarEl.innerHTML = userData.nickname ? userData.nickname.charAt(0).toUpperCase() : '?';
      avatarEl.style.background = '#1a1a1a';
      avatarEl.style.color = 'white';
    }
  }
}