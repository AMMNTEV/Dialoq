// ========== НАСТРОЙКИ ==========
// Применяем тему из localStorage сразу
(function applyThemeFromLocalStorage() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
    const toggle = document.getElementById('darkThemeToggle');
    if (toggle) toggle.checked = true;
  } else {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  }
})();

// ========== МГНОВЕННАЯ ОТРИСОВКА ==========
function applyCachedUser() {
  const lastUid = localStorage.getItem('lastUid');
  if (!lastUid) return;

  const cachedUserStr = localStorage.getItem(`cachedCurrentUser_${lastUid}`);
  if (cachedUserStr) {
    try {
      const currentUserData = JSON.parse(cachedUserStr);
      
      // Заполняем Map-кэш в памяти (если он используется)
      if (window.userCache) {
        window.userCache.set(lastUid, currentUserData);
      }

      // Обновляем UI боковой панели
      if (typeof updateSidebarUser === 'function') {
        updateSidebarUser(currentUserData);
      }
    } catch (e) {
      console.error('Ошибка чтения кэша пользователя:', e);
    }
  }
}

// Запускаем подгрузку из кэша сразу (не дожидаясь DOMContentLoaded, если DOM уже готов)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyCachedUser);
} else {
  applyCachedUser();
}

onAuthStateChanged(async (user) => {
  if (!user || !user.emailVerified) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;

  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) {
      // Защита от '@undefined': проверяем, есть ли символ '|' в имени
      let nickname = 'Пользователь';
      let tag = '';
      
      if (user.displayName && user.displayName.includes('|')) {
        const parts = user.displayName.split('|');
        nickname = parts[0];
        tag = '@' + parts[1];
      } else {
        nickname = user.displayName || 'Пользователь';
        // Используем вашу готовую функцию для генерации корректного тега
        tag = await generateUniqueTag(); 
      }

      // Создаем пользователя
      await db.collection('users').doc(user.uid).set({
        nickname: nickname,
        tag: tag,
        email: user.email || '',
        avatar: user.photoURL || '', // Сохраняем аватарку из Google
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Синхронизируем displayName в Firebase Auth для будущих сессий
      await user.updateProfile({ displayName: nickname + '|' + tag.replace('@', '') });
      
      window.location.reload();
      return;
    } else {
      // Обновляем кэш и сайдбар свежими данными из базы
      const userData = doc.data();

      // !!! ОБЯЗАТЕЛЬНО: сохраняем lastUid, чтобы при следующей перезагрузке знать, чей кэш читать
      localStorage.setItem('lastUid', user.uid);
      localStorage.setItem(`cachedCurrentUser_${user.uid}`, JSON.stringify(userData));

      if (window.userCache) {
        window.userCache.set(user.uid, userData);
      }

      if (typeof updateSidebarUser === 'function') {
        updateSidebarUser(userData);
      }
    }
  } catch (error) {
    console.error('Ошибка загрузки пользователя:', error);
  }
});

// Функция переключения темы
function toggleTheme(isDark) {
  if (isDark) {
    document.body.classList.add('dark-theme');
    localStorage.setItem('theme', 'dark');
    // Опционально: меняем цвет статус-бара на темный
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#121212');
  } else {
    document.body.classList.remove('dark-theme');
    localStorage.setItem('theme', 'light');
    // Возвращаем светлый цвет статус-бара
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#ffffff'); 
  }
}

// При загрузке страницы настроек проверяем localStorage, чтобы тумблер был в правильном положении
document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('darkThemeToggle');
  if (themeToggle) {
    themeToggle.checked = localStorage.getItem('theme') === 'dark';
  }
});

// ========== УДАЛЕНИЕ АККАУНТА ==========
// ========== УДАЛЕНИЕ АККАУНТА ==========
async function deleteAccount() {
  if (!currentUser) return;
  
  const isConfirmed = confirm("Вы уверены, что хотите удалить аккаунт? Профиль будет полностью удален.");
  if (!isConfirmed) return;

  const uid = currentUser.uid;
  let oldData = null;

  // Функция для полной очистки локального кэша
  const clearLocalCache = (userId) => {
    localStorage.removeItem(`cachedCurrentUser_${userId}`);
    localStorage.removeItem(`cachedChats_${userId}`);
    localStorage.removeItem(`cachedUnreads_${userId}`);
    localStorage.removeItem('lastUid');
    if (window.userCache) window.userCache.delete(userId);
  };

  try {
    // 1. Сохраняем текущие данные пользователя для возможного "отката"
    const docSnap = await db.collection('users').doc(uid).get();
    if (docSnap.exists) {
      oldData = docSnap.data();
    }
    
    // 2. Проверяем, есть ли у пользователя активные чаты в Firestore
    const chatsSnapshot = await db.collection('chats')
      .where('participants', 'array-contains', uid)
      .get();

    const hasChats = !chatsSnapshot.empty;

    if (!hasChats) {
      // ЕСПИ ЧАТОВ НЕТ: полностью удаляем документ пользователя из Firestore
      await db.collection('users').doc(uid).delete();
    } else {
      // ЕСЛИ ЧАТЫ ЕСТЬ: делаем «мягкое удаление» (анти-краш для чужих чатов)
      await db.collection('users').doc(uid).update({
        nickname: 'Удаленный аккаунт',
        email: '',
        avatar: '',
        tag: '',
        deletedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    // 3. Удаляем пользователя из Authentication
    await currentUser.delete();
    
    // 4. Очищаем локальный кэш
    clearLocalCache(uid);
    
    // 5. Перенаправляем на главную
    window.location.href = 'index.html';
    
  } catch (error) {
    console.error('Ошибка при удалении аккаунта:', error);
    
    if (error.code === 'auth/requires-recent-login') {
      // ЕСЛИ ОШИБКА СЕССИИ — ОТКАТЫВАЕМ ДАННЫЕ В БАЗЕ НАЗАД (если они там вообще оставались)
      if (oldData) {
        // Проверяем, существовал ли документ до удаления (на случай если чатов не было)
        const checkDoc = await db.collection('users').doc(uid).get();
        if (!checkDoc.exists) {
          await db.collection('users').doc(uid).set(oldData);
        } else {
          await db.collection('users').doc(uid).set(oldData);
        }
      }
      
      alert("В целях безопасности Firebase требует подтвердить вход. Сейчас вы выйдете из системы — войдите заново и сразу нажмите «Удалить» еще раз.");
      
      // Очищаем кэш ПЕРЕД тем, как выкинуть пользователя из аккаунта
      clearLocalCache(uid);
      
      await auth.signOut();
      window.location.href = 'index.html';
    } else {
      alert("Произошла ошибка при удалении: " + error.message);
    }
  }
}

// Функция обновления карточки пользователя в настройках И в левом сайдбаре
function updateSidebarUser(userData) {
  // 1. Обновление центральной карточки настроек
  const nameEl = document.getElementById('userName'); 
  const tagEl = document.getElementById('userTag');
  const avatarEl = document.getElementById('userAvatar');
  
  if (nameEl) nameEl.textContent = userData.nickname || 'Пользователь';
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

  // 2. Обновление левого сайдбара навигации
  const sidebarNameEl = document.getElementById('sidebarUserName');
  const sidebarTagEl = document.getElementById('sidebarUserTag');
  const sidebarAvatarEl = document.getElementById('sidebarUserAvatar');
  
  if (sidebarNameEl) sidebarNameEl.textContent = userData.nickname || 'Пользователь';
  if (sidebarTagEl) sidebarTagEl.textContent = userData.tag || '@user';
  
  if (sidebarAvatarEl) {
    if (userData.avatar) {
      sidebarAvatarEl.innerHTML = `<img src="${userData.avatar}" alt="Аватар" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block;">`;
      sidebarAvatarEl.style.background = 'transparent';
    } else {
      sidebarAvatarEl.innerHTML = userData.nickname ? userData.nickname.charAt(0).toUpperCase() : '?';
      sidebarAvatarEl.style.background = '#1a1a1a';
      sidebarAvatarEl.style.color = 'white';
    }
  }
}

