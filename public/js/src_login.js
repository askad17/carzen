document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const errorNotification = document.getElementById('errorNotification');
    
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const login = document.getElementById('login').value;
        const password = document.getElementById('password').value;
        
        // Получение данных пользователя из localStorage
        const userData = JSON.parse(localStorage.getItem('carzen_user'));
        
        // Проверка данных (в реальном проекте здесь был бы запрос к серверу)
        if (userData && userData.login === login && userData.password === password) {
            // Успешная авторизация
            localStorage.setItem('carzen_logged_in', 'true');
            
            // Переход в личный кабинет
            window.location.href = '/public/html/user-account.html';
        } else {
            // Ошибка авторизации
            showErrorNotification();
        }
    });
    
    function showErrorNotification() {
        errorNotification.classList.add('show');
        
        setTimeout(() => {
            errorNotification.classList.remove('show');
        }, 3000);
    }
    
    // Проверка авторизации при загрузке
    const isLoggedIn = localStorage.getItem('carzen_logged_in');
    if (isLoggedIn === 'true') {
        window.location.href = '/public/html/user-account.html';
    }
});