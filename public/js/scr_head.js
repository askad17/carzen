document.addEventListener('DOMContentLoaded', () => {
    // Получение элементов навигации
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav');
    const overlay = document.getElementById('overlay');
    const navLinks = document.querySelectorAll('.nav-link');
    // Проверка существования всех необходимых элементов
    if (!burger || !nav || !overlay) return;
    // Функция закрытия мобильного меню
    const closeMobileMenu = () => {
        burger.classList.remove('active');
        nav.classList.remove('active');
        overlay.classList.remove('active');
        
        document.body.style.overflow = '';
        burger.setAttribute('aria-expanded', 'false');
        burger.focus(); // Возврат фокуса на кнопку для доступности
    };
    // Обработчик клика по кнопке burger
    burger.addEventListener('click', () => {
        const isOpen = nav.classList.contains('active');
        
        burger.classList.toggle('active');
        nav.classList.toggle('active');
        overlay.classList.toggle('active');
        
        document.body.style.overflow = isOpen ? '' : 'hidden';
        burger.setAttribute('aria-expanded', String(!isOpen));
    });
    // Обработчик клика по затемняющему фону (overlay)
    overlay.addEventListener('click', closeMobileMenu);
    // Обработчики клика по навигационным ссылкам
    navLinks.forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });
    // Обработчик клавиши Escape для закрытия меню (доступность)
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && nav.classList.contains('active')) {
            closeMobileMenu();
        }
    });

    function safeGetStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (err) {
            return null;
        }
    }

    function safeParse(value) {
        try {
            return JSON.parse(value);
        } catch (err) {
            return null;
        }
    }

    const accountLink = document.querySelector('.header-right a');
    if (accountLink) {
        const token = safeGetStorage('carzen_token') || safeGetStorage('token');
        const user = safeParse(safeGetStorage('carzen_user'));
        if (!token) {
            accountLink.href = '/public/html/login.html';
        } else {
            accountLink.href = user?.role === 'admin' ? '/public/html/admin-panel.html' : '/public/html/user-account.html';
        }

        accountLink.addEventListener('click', (event) => {
            event.preventDefault();
            closeMobileMenu();
            const tokenValue = safeGetStorage('carzen_token') || safeGetStorage('token');
            const currentUser = safeParse(safeGetStorage('carzen_user'));

            if (!tokenValue) {
                window.location.href = '/public/html/login.html';
                return;
            }
            if (currentUser?.role === 'admin') {
                window.location.href = '/public/html/admin-panel.html';
                return;
            }
            window.location.href = '/public/html/user-account.html';
        });
    }
});

