document.addEventListener('DOMContentLoaded', function() {
    const registrationForm = document.getElementById('registrationForm');
    const notification = document.getElementById('successNotification');
    
    registrationForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Получение данных из формы
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
        
        // Проверка совпадения паролей
        if (formData.password !== formData.passwordConfirm) {
            alert('Пароли не совпадают!');
            return;
        }
        
        // Расчет возраста
        const birthDate = new Date(formData.birthDate);
        const ageDifMs = Date.now() - birthDate.getTime();
        const ageDate = new Date(ageDifMs);
        const age = Math.abs(ageDate.getUTCFullYear() - 1970);
        
        // Сохранение данных пользователя в localStorage
        const userData = {
            fullName: `${formData.lastName} ${formData.firstName} ${formData.middleName}`.trim(),
            firstName: formData.firstName,
            lastName: formData.lastName,
            middleName: formData.middleName,
            age: age,
            email: formData.email,
            phone: formData.phone,
            isLoggedIn: true
        };
        
        localStorage.setItem('carzen_user', JSON.stringify(userData));
        
        // Показ уведомления
        notification.classList.add('show');
        
        // Скрытие уведомления через 2 секунды и переход
        setTimeout(() => {
            notification.classList.remove('show');
            
            // Переход в личный кабинет
            window.location.href = '/public/html/user-account.html';
        }, 2000);
        
        // Очистка формы
        registrationForm.reset();
    });
});