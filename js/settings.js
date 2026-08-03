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

async function toggleTheme(isDark) {
  const theme = isDark ? 'dark' : 'light';
  if (isDark) {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  } else {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  }
  localStorage.setItem('theme', theme);

  if (currentUser) {
    try {
      await db.collection('users').doc(currentUser.uid).update({ theme: theme });
    } catch (error) {
      console.error('Ошибка сохранения темы:', error);
    }
  }
}

// ========== УДАЛЕНИЕ АККАУНТА ==========
async function deleteAccount() {
  if (!currentUser) return;
  
  const isConfirmed = confirm("Вы уверены, что хотите удалить аккаунт? Профиль будет полностью удален.");
  if (!isConfirmed) return;

  const uid = currentUser.uid;
  let oldData = null;

  try {
    // 1. Сохраняем текущие данные пользователя для возможного "отката"
    const docSnap = await db.collection('users').doc(uid).get();
    if (docSnap.exists) {
      oldData = docSnap.data();
    }
    
    // 2. СНАЧАЛА зачищаем базу, ПОКА ЕСТЬ ПРАВА (сессия еще жива)
    await db.collection('users').doc(uid).update({
      nickname: 'Удаленный аккаунт',
      email: '',
      avatar: '',
      tag: '',
      deletedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 3. ТЕПЕРЬ удаляем пользователя из Authentication
    await currentUser.delete();
    
    // 4. Очищаем локальный кэш
    localStorage.removeItem(`cachedCurrentUser_${uid}`);
    localStorage.removeItem(`cachedChats_${uid}`);
    localStorage.removeItem(`cachedUnreads_${uid}`);
    localStorage.removeItem('lastUid');
    if (window.userCache) window.userCache.delete(uid);
    
    // 5. Перенаправляем на главную
    window.location.href = 'index.html';
    
  } catch (error) {
    console.error('Ошибка при удалении аккаунта:', error);
    
    if (error.code === 'auth/requires-recent-login') {
      // ЕСЛИ ОШИБКА СЕССИИ — ОТКАТЫВАЕМ ДАННЫЕ В БАЗЕ НАЗАД, так как аккаунт не удалился
      if (oldData) {
        await db.collection('users').doc(uid).set(oldData);
      }
      
      alert("В целях безопасности Firebase требует подтвердить вход. Сейчас вы выйдете из системы — войдите заново и сразу нажмите «Удалить» еще раз.");
      await auth.signOut();
      window.location.href = 'index.html';
    } else {
      alert("Произошла ошибка при удалении: " + error.message);
    }
  }
}

// Функция обновления карточки пользователя в боковой панели
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