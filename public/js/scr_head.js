const burger = document.querySelector('.burger');
const nav = document.querySelector('.nav');
const overlay = document.getElementById('overlay');
const navLinks = document.querySelectorAll('.nav-link');
const accountLink = document.querySelector('.header-right a[href="/public/html/user-account.html"]');

function closeMobileMenu() {
    burger?.classList.remove('active');
    nav?.classList.remove('active');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
}

if (burger && nav && overlay) {
    burger.addEventListener('click', () => {
        burger.classList.toggle('active');
        nav.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
    });

    overlay.addEventListener('click', closeMobileMenu);
}

navLinks.forEach((link) => {
    link.addEventListener('click', closeMobileMenu);
});

if (accountLink) {
    accountLink.addEventListener('click', (event) => {
        const token = localStorage.getItem('carzen_token') || localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('carzen_user') || 'null');

        event.preventDefault();
        closeMobileMenu();

        if (!token) {
            window.location.href = '/public/html/login.html';
            return;
        }

        if (user?.role === 'admin') {
            window.location.href = '/public/html/admin-panel.html';
            return;
        }

        window.location.href = '/public/html/user-account.html';
    });
}

