const burger = document.querySelector('.burger');
const nav = document.querySelector('.nav');
const overlay = document.getElementById('overlay');
const navLinks = document.querySelectorAll('.nav-link');
// Открытие/закрытие меню
burger.addEventListener('click', () => {
    burger.classList.toggle('active');
    nav.classList.toggle('active');
    overlay.classList.toggle('active');
    document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
});
// Закрытие меню при клике на оверлей
overlay.addEventListener('click', () => {
    burger.classList.remove('active');
    nav.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
});
// Закрытие меню при клике на ссылку
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        burger.classList.remove('active');
        nav.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    });
});