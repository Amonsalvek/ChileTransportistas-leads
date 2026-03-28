importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAQ-oSswExq-C3IX0wP0Vmzh3ZCYY50GDE",
  authDomain: "chiletransportistas-d44ce.firebaseapp.com",
  projectId: "chiletransportistas-d44ce",
  storageBucket: "chiletransportistas-d44ce.firebasestorage.app",
  messagingSenderId: "448616206348",
  appId: "1:448616206348:web:bab54d05346df56760de29"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    // icon: '/logo.png',
    data: { url: payload.data?.url || 'https://chiletransportistas.com' }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || 'https://chiletransportistas.com';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('chiletransportistas') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});