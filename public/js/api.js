function getToken() {
  return localStorage.getItem('carzen_token') || localStorage.getItem('token');
}

function removeToken() {
  localStorage.removeItem('carzen_token');
  localStorage.removeItem('token');
  localStorage.removeItem('carzen_user');
}

async function authMe() {
  const token = getToken();
  if (!token) {
    throw new Error('Нет токена');
  }
  const response = await fetch('/api/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Ошибка авторизации');
  }
  return data;
}

window.getToken = getToken;
window.removeToken = removeToken;
window.api = {
  auth: {
    me: authMe
  }
};
