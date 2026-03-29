document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const errorNotification = document.getElementById('errorNotification');
    
    // Проверка: если уже авторизован — сразу в личный кабинет
    const token = localStorage.getItem('carzen_token');
    if (token) {
        window.location.href = '/public/html/user-account.html';
        return;
    }
    
    const API_URL = 'http://localhost:3000/api';
    
    loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const login = document.getElementById('login').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            localStorage.setItem('carzen_token', result.token);
            localStorage.setItem('carzen_user', JSON.stringify(result.user));
            
            if (result.user.role === 'admin') {
                window.location.href = '/public/html/admin-panel.html';
            } else {
                window.location.href = '/public/html/user-account.html';
            }
        } else {
            if (errorNotification) {
                errorNotification.classList.add('show');
                setTimeout(() => {
                    errorNotification.classList.remove('show');
                }, 3000);
            } else {
                alert(result.error || 'Неверный логин или пароль');
            }
        }
        
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Не удалось подключиться к серверу');
    }
});

});