document.addEventListener('DOMContentLoaded', async function() {
    console.log('Админка загружается...');
    
    // Проверяем токен
    let token = localStorage.getItem('token') || localStorage.getItem('carzen_token');
    console.log('🔑 Токен найден:', token ? 'Да' : 'Нет');
    
    if (!token) {
        window.location.href = '/public/html/login.html';
        return;
    }

    // Проверка админа
    try {
        const response = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (!response.ok || result.user?.role !== 'admin') {
            console.log('Не админ');
            localStorage.clear();
            window.location.href = '/public/html/menu.html';
            return;
        }
        console.log('Админ OK');
    } catch (error) {
        console.error('Авторизация:', error);
        localStorage.clear();
        window.location.href = '/public/html/menu.html';
        return;
    }

    // Загрузка заявок
    async function loadConsultations() {
        try {
            const res = await fetch('/api/admin/consultations', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log('Заявки статус:', res.status);
            
            if (res.ok) {
                const data = await res.json();
                const tbody = document.getElementById('consultations-tbody');
                if (tbody) {
                    tbody.innerHTML = data.consultations?.map(c => `
                        <tr>
                            <td>${c.id || ''}</td>
                            <td>${c.name || ''}</td>
                            <td>${c.phone || ''}</td>
                            <td>${c.city || ''}</td>
                            <td>${c.createdAt ? new Date(c.createdAt).toLocaleString('ru-RU') : ''}</td>
                        </tr>
                    `).join('') || '<tr><td colspan="5">Нет заявок</td></tr>';
                }
            }
        } catch(e) {
            console.error('Заявки:', e);
        }
    }

    // Загрузка пользователей
    async function loadRecentUsers() {
        try {
            const res = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const tbody = document.querySelector('.admin-table tbody');
                if (tbody) {
                    tbody.innerHTML = data.users?.map(u => `
                        <tr>
                            <td>${u.id}</td>
                            <td>${u.firstName} ${u.lastName}</td>
                            <td>${u.email || 'Не указан'}</td>
                            <td>${new Date(u.createdAt).toLocaleString('ru-RU')}</td>
                        </tr>
                    `).join('') || '';
                }
            }
        } catch(e) {
            console.error('Пользователи:', e);
        }
    }

    // Запуск
    loadConsultations();
    loadRecentUsers();

    // Выход
    document.querySelector('.logout')?.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.clear();
        window.location.href = '/public/html/menu.html';
    });
});
