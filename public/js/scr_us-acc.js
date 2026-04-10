document.addEventListener('DOMContentLoaded', async function() {
    const API_URL = '/api';
    
    // Проверка авторизации
    const token = localStorage.getItem('carzen_token');
    
    if (!token) {
        // Если нет токена — перенаправляем на вход
        window.location.href = '/public/html/login.html';
        return;
    }
    
    // Загрузка данных пользоателя
    try {
        const response = await fetch(`${API_URL}/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            // Токен недействителен — выходим
            localStorage.removeItem('carzen_token');
            localStorage.removeItem('carzen_user');
            window.location.href = '/public/html/login.html';
            return;
        }
        
        const result = await response.json();
        const user = result.user;
        
        // Обновляем данные на странице
        const profileName = document.querySelector('.profile-name');
        const profileAge = document.querySelector('.profile-age');
        
        if (profileName) {
            profileName.textContent = `${user.lastName} ${user.firstName} ${user.middleName || ''}`.trim();
        }
        
        if (profileAge && user.birthDate) {
            const birthDate = new Date(user.birthDate);
            const age = new Date().getFullYear() - birthDate.getFullYear();
            // Корректировка, если день рождения ещё не был в этом году
            const monthDiff = new Date().getMonth() - birthDate.getMonth();
            const dayDiff = new Date().getDate() - birthDate.getDate();
            const finalAge = (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) ? age - 1 : age;
            profileAge.textContent = `${finalAge} лет`;
        }
        
        // Сохраняем полные данные
        localStorage.setItem('carzen_user', JSON.stringify(user));
        
        // Заполняем модальное окно
        fillModalData(user);
        
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        localStorage.removeItem('carzen_token');
        window.location.href = '/public/html/login.html';
    }
    
    // Выйти - кнопка
    const btnLogout = document.querySelector('.btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', function() {
            localStorage.removeItem('carzen_token');
            localStorage.removeItem('carzen_user');
            window.location.href = '/public/html/login.html';
        });
    }
    
    // Окно - подробнее
    const modal = document.getElementById('userInfoModal');
    const btnDetails = document.querySelector('.btn-details');
    const btnClose = document.querySelector('.modal-close');
    
    if (btnDetails && modal) {
        btnDetails.addEventListener('click', function() {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }
    
    function closeModal() {
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    
    if (btnClose) {
        btnClose.addEventListener('click', closeModal);
    }
    
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal?.classList.contains('active')) {
            closeModal();
        }
    });
    
    // Кнопка "Изменить"
    const btnChange = document.querySelector('.btn-change');
    if (btnChange) {
        btnChange.addEventListener('click', function() {
            alert('Функция редактирования в разработке');
        });
    }
});

// Функция заполнения модального окна
function fillModalData(user) {
    const fullnameEl = document.getElementById('modalFullname');
    const birthdateEl = document.getElementById('modalBirthdate');
    const phoneEl = document.getElementById('modalPhone');
    const emailEl = document.getElementById('modalEmail');
    const loginEl = document.getElementById('modalLogin');
    const regDateEl = document.getElementById('modalRegDate');
    
    if (fullnameEl) {
        fullnameEl.textContent = `${user.lastName} ${user.firstName} ${user.middleName || ''}`.trim();
    }
    if (birthdateEl && user.birthDate) {
        const date = new Date(user.birthDate);
        birthdateEl.textContent = date.toLocaleDateString('ru-RU');
    }
    if (phoneEl) {
        phoneEl.textContent = user.phone || 'Не указан';
    }
    if (emailEl) {
        emailEl.textContent = user.email || 'Не указан';
    }
    if (loginEl && user.login) {
        // Маскируем логин: показываем первые 2 и последние 2 символа
        const login = user.login;
        if (login.length <= 4) {
            loginEl.textContent = '*'.repeat(login.length);
        } else {
            loginEl.textContent = login.slice(0, 2) + '*'.repeat(login.length - 4) + login.slice(-2);
        }
    }
    if (regDateEl && user.createdAt) {
        const date = new Date(user.createdAt);
        regDateEl.textContent = date.toLocaleDateString('ru-RU');
    }
}
