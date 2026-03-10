
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('userInfoModal');
    const btnDetails = document.querySelector('.btn-details');
    const btnClose = document.querySelector('.modal-close');
    
    // Открытие модального окна
    if (btnDetails) {
        btnDetails.addEventListener('click', function() {
            // Загрузка данных пользователя из localStorage
            const userData = JSON.parse(localStorage.getItem('carzen_user'));
            
            if (userData) {
                // Заполнение данных в модальном окне
                document.getElementById('modalFullname').textContent = userData.fullName || 'Пользователь';
                document.getElementById('modalBirthdate').textContent = userData.birthDate || 'Не указано';
                document.getElementById('modalPhone').textContent = userData.phone || 'Не указано';
                document.getElementById('modalEmail').textContent = userData.email || 'Не указано';
                
                // Маскировка логина (показываем последние 2 символа)
                if (userData.login) {
                    const login = userData.login;
                    const maskedLogin = '*'.repeat(login.length - 2) + login.slice(-2);
                    document.getElementById('modalLogin').textContent = maskedLogin;
                }
                
                // Дата регистрации (можно сохранить при регистрации)
                const regDate = userData.registrationDate || new Date().toLocaleDateString('ru-RU');
                document.getElementById('modalRegDate').textContent = regDate;
            }
            
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }
    
    // Закрытие модального окна
    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    if (btnClose) {
        btnClose.addEventListener('click', closeModal);
    }
    
    // Закрытие по клику вне модального окна
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Закрытие по Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
    
    // Кнопка "Изменить"
    const btnChange = document.querySelector('.btn-change');
    if (btnChange) {
        btnChange.addEventListener('click', function() {
            // Здесь можно добавить переход на страницу редактирования
            alert('Функция редактирования в разработке');
        });
    }
});
