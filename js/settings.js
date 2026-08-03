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

  try {
    const uid = currentUser.uid;
    
    // 1. СНАЧАЛА пробуем удалить пользователя из Authentication. 
    // Если сессия старая, здесь сразу вылетит ошибка auth/requires-recent-login, 
    // МЫ НЕ УСПЕЕМ испортить данные в базе!
    await currentUser.delete();
    
    // 2. Если удаление в Auth прошло успешно, только теперь зачищаем базу и кэш
    localStorage.removeItem(`cachedCurrentUser_${uid}`);
    localStorage.removeItem(`cachedChats_${uid}`);
    localStorage.removeItem(`cachedUnreads_${uid}`);
    localStorage.removeItem('lastUid');
    if (window.userCache) window.userCache.delete(uid);
    
    await db.collection('users').doc(uid).update({
      nickname: 'Удаленный аккаунт',
      email: '',
      avatar: '',
      tag: '',
      deletedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // 3. Перенаправляем на главную
    window.location.href = 'index.html';
    
  } catch (error) {
    console.error('Ошибка при удалении аккаунта:', error);
    
    if (error.code === 'auth/requires-recent-login') {
      alert("В целях безопасности Firebase требует подтвердить вход. Сейчас вы выйдете из системы — войдите заново и сразу нажмите «Удалить» еще раз.");
      await auth.signOut();
      window.location.href = 'index.html';
    } else {
      alert("Произошла ошибка при удалении: " + error.message);
    }
  }
}