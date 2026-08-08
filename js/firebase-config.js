// Конфигурация Firebase - замените на свои данные из консоли Firebase
const firebaseConfig = {

  apiKey: "AIzaSyD6MPCkQ2nDpiyimGTEnacxxIg84v-FlnU",

  authDomain: "dial0q.firebaseapp.com",

  projectId: "dial0q",

  storageBucket: "dial0q.firebasestorage.app",

  messagingSenderId: "959232097004",

  appId: "1:959232097004:web:b2da69dfb6a40c2bf983c9",

  measurementId: "G-ZBGMG33BCD"

};


// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Включаем постоянное сохранение сессии
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .then(() => console.log('✅ Сессия будет сохраняться постоянно'))
  .catch((error) => console.log('❌ Ошибка настройки сессии:', error));

// Настройка Firestore для работы оффлайн (кеширование данных)
db.enablePersistence()
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.log('⚠️ Несколько вкладок открыто, persistence работает в ограниченном режиме');
    } else if (err.code === 'unimplemented') {
      console.log('⚠️ Браузер не поддерживает persistence');
    }
  });