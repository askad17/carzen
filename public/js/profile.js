// Проверка авторизации при загрузке
async function checkAuth() {
    const token = getToken();
    
    if (!token) {
        window.location.href = '/public/html/login.html';
        return;
    }
    
    try {
        const response = await api.auth.me();
        loadUserData(response.user);
    } catch (error) {
        console.error('Ошибка авторизации:', error);
        removeToken();
        window.location.href = '/public/html/login.html';
    }
}

// Загрузка данных пользователя
function loadUserData(userData) {
    const profileName = document.querySelector('.profile-name');
    const profileAge = document.querySelector('.profile-age');
    
    if (profileName) {
        profileName.textContent = userData.fullName || 'Пользователь';
    }
    
    if (profileAge && userData.age) {
        profileAge.textContent = `${userData.age} лет`;
    }
    
    // Сохраняем для модального окна
    window.currentUserData = userData;
}

// Выход из аккаунта
const btnLogout = document.querySelector('.btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', function() {
        if (confirm('Выйти из аккаунта?')) {
            removeToken();
            window.location.href = '/public/html/menu.html';
        }
    });
}

// Запускаем проверку
checkAuth();