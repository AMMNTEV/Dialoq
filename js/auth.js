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

  // 2. Обновляем displayName
  await user.updateProfile({ displayName: nickname + '|' + tag });

  // 3. Сохраняем данные пользователя в Firestore
  await db.collection('users').doc(user.uid).set({
    nickname: nickname,
    tag: tag,
    email: email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // 4. Отправляем письмо с подтверждением (с правильным URL)
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
  
  // Очищаем локальный кэш пользователя перед выходом
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
  const fullTag = '@' + tag;
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
  
  // Добавляем страницы settings.html и user.html в список исключений для редиректа
  const isAlreadyOnMessenger = 
    window.location.pathname.includes('messenger.html') || 
    window.location.pathname.includes('profile.html') ||
    window.location.pathname.includes('settings.html') ||
    window.location.pathname.includes('user.html');
  
  // Если в кэше остался lastUid и мы НЕ на одной из внутренних страниц, перекидываем в мессенджер
  if (lastUid && !isAlreadyOnMessenger) {
    window.location.href = 'messenger.html'; 
  }
});

// ========== АВТОРИЗАЦИЯ ЧЕРЕЗ GOOGLE ==========
async function continueWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  const result = await auth.signInWithPopup(provider);
  const user = result.user;

  // Проверяем, существует ли уже этот пользователь в нашей базе Firestore
  const doc = await db.collection('users').doc(user.uid).get();
  
  // Получаем чистое имя из displayName
  let cleanNickname = 'Пользователь';
  if (user.displayName) {
    // Если есть | - берем первую часть
    if (user.displayName.includes('|')) {
      cleanNickname = user.displayName.split('|')[0].trim();
    } else {
      cleanNickname = user.displayName.trim();
    }
    // Если имя пустое или состоит только из символов
    if (!cleanNickname || cleanNickname.length < 1) {
      cleanNickname = 'Пользователь';
    }
  }

  // Если документ НЕ существует - это 100% новый пользователь
  if (!doc.exists) {
    let tag = '';
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 50) {
      attempts++;
      const randomDigits = Math.floor(10000 + Math.random() * 90000); 
      tag = '@user' + randomDigits;
      const snapshot = await db.collection('users').where('tag', '==', tag).get();
      if (snapshot.empty) isUnique = true;
    }
    
    if (!isUnique) {
      tag = '@user' + Date.now().toString().slice(-6);
    }

    const avatarUrl = user.photoURL || '';

    // ВАЖНО: Принудительно обновляем displayName
    await user.updateProfile({ 
      displayName: cleanNickname + '|' + tag,
      photoURL: avatarUrl
    });

    await db.collection('users').doc(user.uid).set({
      nickname: cleanNickname,
      tag: tag,
      email: user.email,
      avatar: avatarUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Создан новый аккаунт:', cleanNickname, tag);
    return user;
  }

  // Если документ существует - проверяем, не удален ли он
  const data = doc.data();
  
  // Если аккаунт был удален (email пустой)
  if (data.email === '') {
    let tag = '';
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 50) {
      attempts++;
      const randomDigits = Math.floor(10000 + Math.random() * 90000); 
      tag = '@user' + randomDigits;
      const snapshot = await db.collection('users').where('tag', '==', tag).get();
      if (snapshot.empty) isUnique = true;
    }
    
    if (!isUnique) {
      tag = '@user' + Date.now().toString().slice(-6);
    }

    const avatarUrl = user.photoURL || '';

    // ВАЖНО: Принудительно обновляем displayName
    await user.updateProfile({ 
      displayName: cleanNickname + '|' + tag,
      photoURL: avatarUrl
    });

    // СОЗДАЕМ НОВЫЙ документ с НОВЫМ UID
    await db.collection('users').doc(user.uid).set({
      nickname: cleanNickname,
      tag: tag,
      email: user.email,
      avatar: avatarUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Создан новый аккаунт (старый был удален):', cleanNickname, tag);
    return user;
  }

  // Если аккаунт существует и не удален - проверяем тег
  // Также проверяем, не содержит ли displayName @undefined
  const currentDisplayName = user.displayName || '';
  const hasUndefinedTag = currentDisplayName.includes('@undefined') || 
                          !data.tag || 
                          data.tag === '@undefined' || 
                          data.tag === '';

  if (hasUndefinedTag) {
    let tag = '';
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 50) {
      attempts++;
      const randomDigits = Math.floor(10000 + Math.random() * 90000);
      tag = '@user' + randomDigits;
      const snapshot = await db.collection('users').where('tag', '==', tag).get();
      if (snapshot.empty) isUnique = true;
    }
    
    if (!isUnique) {
      tag = '@user' + Date.now().toString().slice(-6);
    }

    // ВАЖНО: Принудительно обновляем displayName
    await user.updateProfile({ 
      displayName: cleanNickname + '|' + tag
    });

    await db.collection('users').doc(user.uid).update({
      tag: tag,
      nickname: cleanNickname
    });
    
    console.log('✅ Исправлен сломанный тег для пользователя:', cleanNickname, tag);
  } else {
    // Дополнительная проверка: если displayName не совпадает с данными в Firestore
    const expectedDisplayName = data.nickname + '|' + data.tag;
    if (currentDisplayName !== expectedDisplayName) {
      await user.updateProfile({ 
        displayName: expectedDisplayName
      });
      console.log('✅ Синхронизирован displayName:', expectedDisplayName);
    }
  }
  
  return user;
}