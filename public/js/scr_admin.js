// === ПРОСТАЯ ВЕРСИЯ ДЛЯ ТЕСТА ===
console.log('✅ scr_admin.js ЗАГРУЖЕН!');

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM загружен');
    
    // Проверка токена
    const token = localStorage.getItem('carzen_token') || localStorage.getItem('token');
    if (!token) {
        console.log('❌ Нет токена → редирект на вход');
        window.location.href = '/public/html/login.html';
        return;
    }
    
    // Проверка админа
    fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` }})
        .then(r => r.json())
        .then(data => {
            if (data.user?.role !== 'admin') {
                window.location.href = '/public/html/menu.html';
                return;
            }
            console.log('✅ Админ подтверждён');
            
            // Загружаем данные
            loadConsultations(token);
            loadUsers(token);
            
            // Инициализируем модальное окно
            setupAddUserModal(token);
        })
        .catch(err => {
            console.error('❌ Ошибка:', err);
            window.location.href = '/public/html/menu.html';
        });
    
    // Выход
    document.querySelector('.logout')?.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.clear();
        window.location.href = '/public/html/menu.html';
    });
});

// === ЗАГРУЗКА ЗАЯВОК ===
async function loadConsultations(token) {
    try {
        const res = await fetch('/api/admin/consultations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            const tbody = document.getElementById('consultations-tbody');
            if (tbody) {
                tbody.innerHTML = data.consultations?.map(c => `
                    <tr>
                        <td>${c.id||''}</td>
                        <td>${c.name||''}</td>
                        <td>${c.phone||''}</td>
                        <td>${c.city||''}</td>
                        <td>${c.createdAt ? new Date(c.createdAt).toLocaleString('ru-RU') : ''}</td>
                    </tr>
                `).join('') || '<tr><td colspan="5">Нет заявок</td></tr>';
            }
        }
    } catch(e) { console.error('Заявки:', e); }
}

// === ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ ===
async function loadUsers(token) {
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
                        <td>${u.email||'-'}</td>
                        <td>${new Date(u.createdAt).toLocaleString('ru-RU')}</td>
                        <td>
                            <button class="action-icon-btn delete-user" data-id="${u.id}">Удалить</button>
                        </td>
                    </tr>
                `).join('') || '';
                
                // Удаление
                document.querySelectorAll('.delete-user').forEach(btn => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        if (confirm('Удалить?')) {
                            fetch(`/api/admin/users/${btn.dataset.id}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` }
                            }).then(() => loadUsers(token));
                        }
                    };
                });
            }
        }
    } catch(e) { console.error('Пользователи:', e); }
}

// === МОДАЛЬНОЕ ОКНО ===
function setupAddUserModal(token) {
    const btn = document.getElementById('addUserBtn');
    const modal = document.getElementById('addUserModal');
    const form = document.getElementById('addUserForm');
    const closeBtn = modal?.querySelector('.modal-close');
    const cancelBtn = document.getElementById('cancelAddUser');
    
    console.log('🔍 Элементы:', { btn: !!btn, modal: !!modal, form: !!form });
    
    if (!btn || !modal) {
        console.error('❌ Не найдены кнопка или модальное окно!');
        return;
    }
    
    // Открытие
    btn.onclick = (e) => {
        e.preventDefault();
        console.log('🎯 Кнопка нажата!');
        modal.classList.add('active');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    };
    
    // Закрытие
    const close = () => {
        modal.classList.remove('active');
        modal.style.display = 'none';
        document.body.style.overflow = '';
        if (form) form.reset();
    };
    
    if (closeBtn) closeBtn.onclick = close;
    if (cancelBtn) cancelBtn.onclick = close;
    if (modal) modal.onclick = (e) => { if (e.target === modal) close(); };
    document.onkeydown = (e) => { if (e.key === 'Escape' && modal.classList.contains('active')) close(); };
    
    // Отправка формы
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                login: document.getElementById('newLogin').value,
                password: document.getElementById('newPassword').value,
                passwordConfirm: document.getElementById('newPasswordConfirm').value,
                firstName: document.getElementById('newFirstName').value,
                lastName: document.getElementById('newLastName').value,
                middleName: document.getElementById('newMiddleName').value || '',
                phone: document.getElementById('newPhone').value || '',
                email: document.getElementById('newEmail').value,
                birthDate: document.getElementById('newBirthDate').value || '',
                role: document.getElementById('newRole').value || 'user'
            };
            
            if (data.password !== data.passwordConfirm) {
                alert('Пароли не совпадают!');
                return;
            }
            
            try {
                const res = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                
                if (res.ok) {
                    alert('✅ Пользователь создан!');
                    close();
                    loadUsers(token);
                } else {
                    alert('❌ ' + (result.error || 'Ошибка'));
                }
            } catch(err) {
                console.error(err);
                alert('Ошибка соединения');
            }
        };
    }
}