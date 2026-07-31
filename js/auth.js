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
