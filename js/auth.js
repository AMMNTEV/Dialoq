// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
window.userCache = new Map();
let currentUser = null;
let currentUserData = null;

// ========== ФУНКЦИЯ ДЛЯ ОБРАБОТКИ СОСТОЯНИЯ АВТОРИЗАЦИИ ==========
function onAuthStateChanged(callback) {
  auth.onAuthStateChanged(async (user) => {
    if (user && user.emailVerified) {
      currentUser = user;
      try {
        const doc = await db.collection('users').doc(user.uid).get();
        currentUserData = doc.exists ? doc.data() : null;
      } catch (err) {
        console.error('Ошибка загрузки данных пользователя:', err);
        currentUserData = null;
      }
      if (callback) callback(user, currentUserData);
    } else {
      currentUser = null;
      currentUserData = null;
      if (callback) callback(null, null);
    }
  });
}

// ========== ФУНКЦИИ АВТОРИЗАЦИИ ==========
async function login(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

async function register(email, password, nickname, tag) {
  // 1. Создаём пользователя
  const userCredential = await auth.createUserWithEmailAndPassword(email, password);
  const user = userCredential.user;

  // Гарантируем корректный формат тега с @
  const formattedTag = tag.startsWith('@') ? tag : '@' + tag;

  // 2. Обновляем displayName
  await user.updateProfile({ displayName: nickname + '|' + formattedTag });

  // 3. Сохраняем данные пользователя в Firestore
  await db.collection('users').doc(user.uid).set({
    nickname: nickname,
    tag: formattedTag,
    email: email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // 4. Отправляем письмо с подтверждением
  await user.sendEmailVerification({
    url: window.location.origin + '/index.html'
  });

  // 5. Выходим из аккаунта (пользователь должен подтвердить email)
  await auth.signOut();

  return user;
}

async function resetPassword(email) {
  return auth.sendPasswordResetEmail(email);
}

async function sendVerificationEmail() {
  const user = auth.currentUser;
  if (user) {
    await user.sendEmailVerification();
    return user;
  }
  throw new Error('No user logged in');
}

async function logout() {
  const uid = localStorage.getItem('lastUid');
  
  if (uid) {
    localStorage.removeItem(`cachedCurrentUser_${uid}`);
    localStorage.removeItem(`cachedChats_${uid}`);
    localStorage.removeItem(`cachedUnreads_${uid}`);
    localStorage.removeItem('lastUid');
  }
  
  await auth.signOut();
  window.location.href = 'index.html';
}

// ========== ПРОВЕРКА УНИКАЛЬНОСТИ ТЕГА ==========
async function checkTagUnique(tag) {
  const fullTag = tag.startsWith('@') ? tag : '@' + tag;
  const snapshot = await db.collection('users').where('tag', '==', fullTag).get();
  return snapshot.empty;
}

// ========== УТИЛИТЫ ДЛЯ ТЕГА ==========
function handleTagInput(input) {
  let value = input.value.replace(/@/g, '').slice(0, 20);
  value = value.replace(/[^a-zA-Z0-9_]/g, '');
  input.value = value;
}

function preventAtSymbolDeletion(event, input) {
  if (event.key === 'Backspace' && input.selectionStart === 0 && input.selectionEnd === 0) {
    event.preventDefault();
  }
  if (event.key === 'Delete' && input.selectionStart === 0 && input.selectionEnd === 1) {
    event.preventDefault();
  }
  if (event.key === 'ArrowLeft' && input.selectionStart === 0 && input.selectionEnd === 0) {
    event.preventDefault();
  }
}

// ========== МГНОВЕННЫЙ ВХОД ==========
document.addEventListener("DOMContentLoaded", () => {
  const lastUid = localStorage.getItem('lastUid');
  
  const isAlreadyOnMessenger = 
    window.location.pathname.includes('messenger.html') || 
    window.location.pathname.includes('profile.html') ||
    window.location.pathname.includes('settings.html') ||
    window.location.pathname.includes('edit.html') ||
    window.location.pathname.includes('user.html');
  
  if (lastUid && !isAlreadyOnMessenger) {
    window.location.href = 'messenger.html'; 
  }
});

// Вспомогательная функция для генерации уникального тега
async function generateUniqueTag() {
  let tag = '';
  let isUnique = false;
  let attempts = 0;
  
  while (!isUnique && attempts < 10) {
    attempts++;
    const randomDigits = Math.floor(10000 + Math.random() * 90000); 
    tag = '@user' + randomDigits;
    
    try {
      const snapshot = await db.collection('users').where('tag', '==', tag).get();
      if (snapshot.empty) {
        isUnique = true;
      }
    } catch (err) {
      console.error('Ошибка проверки уникальности тега:', err);
      break;
    }
  }
  
  if (!isUnique) {
    tag = '@user' + Date.now().toString().slice(-6);
  }
  return tag;
}

// ========== АВТОРИЗАЦИЯ ЧЕРЕЗ GOOGLE ==========
async function continueWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  
  provider.setCustomParameters({ prompt: 'select_account' });
  
  const result = await auth.signInWithPopup(provider);
  const user = result.user;

  let doc = null;
  let data = null;

  try {
    doc = await db.collection('users').doc(user.uid).get();
    data = doc.exists ? doc.data() : null;
  } catch (err) {
    console.error('Ошибка получения данных из Firestore:', err);
  }
  
  // 1. Извлекаем чистый никнейм из Google (имя пользователя)
  let cleanNickname = 'Пользователь';
  if (user.displayName) {
    cleanNickname = user.displayName.includes('|') 
      ? user.displayName.split('|')[0].trim() 
      : user.displayName.trim();
  }
  
  if (!cleanNickname || cleanNickname.toLowerCase() === 'undefined' || cleanNickname.toLowerCase() === 'null') {
    cleanNickname = 'Пользователь';
  }

  const avatarUrl = user.photoURL || '';

  // 2. Флаги нового или восстановленного аккаунта
  const isCompletelyNew = !doc || !doc.exists;
  const isDeletedAccount = doc && doc.exists && data && data.email === '';

  // 3. Создание абсолютно нового профиля
  if (isCompletelyNew || isDeletedAccount) {
    const newTag = await generateUniqueTag();

    await user.updateProfile({ 
      displayName: cleanNickname + '|' + newTag,
      photoURL: avatarUrl
    });

    await db.collection('users').doc(user.uid).set({
      nickname: cleanNickname,
      tag: newTag,
      email: user.email || '',
      avatar: avatarUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(isCompletelyNew ? '✅ Создан новый аккаунт' : '✅ Восстановлен удаленный аккаунт');
    return user;
  }

  // 4. Проверяем имеющийся тег в Firestore
  let currentTag = data ? data.tag : null;

  // Если тега нет, либо он содержит строку "undefined" / "null" — автогенерируем новый
  if (!currentTag || currentTag.includes('undefined') || currentTag.includes('null') || currentTag === '@') {
    currentTag = await generateUniqueTag();
    await db.collection('users').doc(user.uid).update({ tag: currentTag });
    console.log('✅ Исправлен/назначен новый тег:', currentTag);
  }

  // 5. Синхронизируем displayName в Firebase Auth
  const savedNickname = (data && data.nickname && data.nickname !== 'undefined') ? data.nickname : cleanNickname;
  const expectedDisplayName = savedNickname + '|' + currentTag;
  
  if (user.displayName !== expectedDisplayName) {
    await user.updateProfile({ displayName: expectedDisplayName });
    console.log('✅ Синхронизирован displayName:', expectedDisplayName);
  }
  
  return user;
}