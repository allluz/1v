importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyAHblKUWQtVDfDxOUL9PV-sVxZWL82tcA0",
    authDomain: "umvale.firebaseapp.com",
    projectId: "umvale",
    storageBucket: "umvale.firebasestorage.app",
    messagingSenderId: "412475193381",
    appId: "1:412475193381:web:6f6827af7ddefd669ea7cc",
    measurementId: "G-CDVSWXSKQN",
    databaseURL: "https://umvale-default-rtdb.firebaseio.com"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || payload.data?.title || 'UM Vale';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'Nova atualização no Vale.',
    icon: 'https://umvale.wordpress.com/wp-content/uploads/2026/05/23e9addd-68b6-4407-bd96-4b62fd82db94.png?w=196&h=196',
    badge: 'https://umvale.wordpress.com/wp-content/uploads/2026/05/23e9addd-68b6-4407-bd96-4b62fd82db94.png?w=96&h=96',
    data: {
      url: payload.data?.url || 'https://umvale.web.app/'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || 'https://umvale.web.app/';
  event.waitUntil(clients.openWindow(url));
});
