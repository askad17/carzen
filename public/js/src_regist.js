
document.addEventListener('DOMContentLoaded', function() {
    const registrationForm = document.getElementById('registrationForm');
    const notification = document.getElementById('successNotification');
    
    // Проверка: если уже авторизован — сразу в личный кабинет
    const token = localStorage.getItem('carzen_token');
    const savedUser = JSON.parse(localStorage.getItem('carzen_user') || 'null');
    if (token) {
        window.location.href = savedUser?.role === 'admin'
            ? '/public/html/admin-panel.html'
            : '/public/html/user-account.html';
        return;
    }
    
    const API_URL = '/api';
    
    registrationForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = {
            login: document.getElementById('login').value,
            password: document.getElementById('password').value,
            passwordConfirm: document.getElementById('passwordConfirm').value,
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            middleName: document.getElementById('middleName').value,
            phone: document.getElementById('phone').value,
            email: document.getElementById('email').value,
            birthDate: document.getElementById('birthDate').value
        };
        
        // Проверка паролей
        if (formData.password !== formData.passwordConfirm) {
            alert('Пароли не совпадают!');
            return;
        }
        
        // Проверка длины пароля
        if (formData.password.length < 6) {
            alert('Пароль должен содержать минимум 6 символов');
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                if (notification) {
                    notification.classList.add('show');
                }
    
    localStorage.setItem('carzen_token', result.token);
    localStorage.setItem('carzen_user', JSON.stringify(result.user));
    
    // Личный кабинет
    setTimeout(() => {
        if (notification) notification.classList.remove('show');
        window.location.href = '/public/html/user-account.html';
    }, 1500);


                
                registrationForm.reset();
            } else {
                alert(result.error || 'Ошибка регистрации');
            }
            
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Не удалось подключиться к серверу. Убедитесь, что сервер запущен.');
        }
    });
});
