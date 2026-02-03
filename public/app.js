const loginForm = document.getElementById('login-form');
const loginStatus = document.getElementById('login-status');
const notificationsSection = document.getElementById('notifications');
const notificationList = document.getElementById('notification-list');

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginStatus.textContent = 'Bezig met Magister login...';
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    const res = await fetch('/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Kon login niet starten');
    }
    window.location.href = data.authorizeUrl;
  } catch (error) {
    loginStatus.textContent = error.message;
  }
});

async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications');
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    notificationsSection.classList.remove('hidden');
    notificationList.innerHTML = '';
    data.notifications.forEach((item) => {
      const li = document.createElement('li');
      const date = new Date(item.created_at).toLocaleString('nl-NL');
      li.textContent = `${date} - ${item.message}`;
      notificationList.appendChild(li);
    });
  } catch (error) {
    console.error(error);
  }
}

setInterval(loadNotifications, 10000);
loadNotifications();
