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

onAuthStateChanged(async (user) => {
  if (!user || !user.emailVerified) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;

  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (doc.exists) {
      currentUserData = doc.data();
      document.getElementById('userAvatar').textContent = currentUserData.nickname ? currentUserData.nickname.charAt(0).toUpperCase() : '?';
      document.getElementById('userName').textContent = currentUserData.nickname || 'Пользователь';
      document.getElementById('userTag').textContent = currentUserData.tag || '@user';

      if (currentUserData.theme === 'dark') {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
        document.getElementById('darkThemeToggle').checked = true;
        localStorage.setItem('theme', 'dark');
      } else {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
        document.getElementById('darkThemeToggle').checked = false;
        localStorage.setItem('theme', 'light');
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
  
  const isConfirmed = confirm("Вы уверены, что хотите удалить аккаунт? Ваш ник изменится на «Удаленный аккаунт», а сам профиль будет удален.");
  
  if (!isConfirmed) return;

  try {
    const uid = currentUser.uid;
    
    // 1. Помечаем аккаунт как удаленный в Firestore (НЕ УДАЛЯЕМ документ!)
    await db.collection('users').doc(uid).update({
      nickname: 'Удаленный аккаунт',
      email: '', // Стираем почту
      avatar: '',
      tag: '',
      deletedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 2. Удаляем аккаунт из Firebase Authentication
    await currentUser.delete();
    
    // 3. Чистим локальный кэш
    localStorage.removeItem(`cachedCurrentUser_${uid}`);
    localStorage.removeItem(`cachedChats_${uid}`);
    localStorage.removeItem(`cachedUnreads_${uid}`);
    localStorage.removeItem('lastUid');
    
    // 4. Перенаправляем на страницу входа
    window.location.href = 'index.html';
    
  } catch (error) {
    console.error('Ошибка при удалении аккаунта:', error);
    
    if (error.code === 'auth/requires-recent-login') {
      alert("В целях безопасности, чтобы удалить аккаунт, необходимо войти в него заново. Сейчас вы будете перенаправлены на страницу входа.");
      await auth.signOut();
      window.location.href = 'index.html';
    } else {
      alert("Произошла ошибка при удалении: " + error.message);
    }
  }
}