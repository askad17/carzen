// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let token = null;

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Админка загружается...');
    
    // Проверка токена
    token = localStorage.getItem('carzen_token') || localStorage.getItem('token');
    console.log('🔑 Токен:', token ? 'Найден ✓' : 'Не найден ✗');
    
    if (!token) {
        window.location.href = '/public/html/login.html';
        return;
    }
    
    // Проверка прав администратора
    try {
        const response = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (!response.ok || result.user?.role !== 'admin') {
            console.log('❌ Не администратор');
            localStorage.clear();
            window.location.href = '/public/html/menu.html';
            return;
        }
        console.log('✅ Администратор подтверждён');
    } catch (error) {
        console.error('❌ Ошибка авторизации:', error);
        localStorage.clear();
        window.location.href = '/public/html/menu.html';
        return;
    }
    
    // === ЗАГРУЗКА ДАННЫХ ===
    loadConsultations();
    loadRecentUsers();
    
    // === ИНИЦИАЛИЗАЦИЯ МОДАЛЬНОГО ОКНА (ОТДЕЛЬНО!) ===
    initAddUserModal();
    
    // === КНОПКА ВЫХОДА ===
    document.querySelector('.logout')?.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.clear();
        window.location.href = '/public/html/menu.html';
    });
});

// === ЗАГРУЗКА ЗАЯВОК ===
async function loadConsultations() {
    try {
        const res = await fetch('/api/admin/consultations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('📋 Заявки статус:', res.status);
        
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
        console.error('❌ Ошибка загрузки заявок:', e);
    }
}

// === ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ ===
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
                        <td>
                            <button class="action-icon-btn delete-user" data-id="${u.id}" title="Удалить">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </td>
                    </tr>
                `).join('') || '';
                
                // Обработчики удаления
                document.querySelectorAll('.delete-user').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteUser(btn.dataset.id);
                    });
                });
            }
        }
    } catch(e) {
        console.error('❌ Ошибка загрузки пользователей:', e);
    }
}

// === УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ ===
async function deleteUser(userId) {
    if (!confirm('Удалить этого пользователя?')) return;
    
    try {
        const res = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const result = await res.json();
        
        if (res.ok) {
            showNotification('Пользователь удалён ✓', 'success');
            loadRecentUsers();
        } else {
            showNotification(result.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('❌ Delete error:', error);
        showNotification('Ошибка соединения', 'error');
    }
}

// === ИНИЦИАЛИЗАЦИЯ МОДАЛЬНОГО ОКНА ===
function initAddUserModal() {
    const addUserBtn = document.getElementById('addUserBtn');
    const addUserModal = document.getElementById('addUserModal');
    const addUserForm = document.getElementById('addUserForm');
    const cancelAddBtn = document.getElementById('cancelAddUser');
    const modalClose = document.querySelector('#addUserModal .modal-close');
    
    console.log('🔍 Элементы модалки:');
    console.log('  - Кнопка:', addUserBtn ? '✓' : '✗');
    console.log('  - Модальное окно:', addUserModal ? '✓' : '✗');
    console.log('  - Форма:', addUserForm ? '✓' : '✗');
    
    // Открытие
    if (addUserBtn && addUserModal) {
        addUserBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🎯 Кнопка "Добавить" нажата!');
            addUserModal.classList.add('active');
            addUserModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            console.log('✅ Модальное окно открыто');
        });
    }
    
    // Закрытие по крестику
    if (modalClose && addUserModal) {
        modalClose.addEventListener('click', function() {
            closeAddUserModal(addUserModal, addUserForm);
        });
    }
    
    // Закрытие по "Отмена"
    if (cancelAddBtn && addUserModal) {
        cancelAddBtn.addEventListener('click', function() {
            closeAddUserModal(addUserModal, addUserForm);
        });
    }
    
    // Закрытие по клику вне
    if (addUserModal) {
        addUserModal.addEventListener('click', function(e) {
            if (e.target === addUserModal) {
                closeAddUserModal(addUserModal, addUserForm);
            }
        });
        
        // Закрытие по Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && addUserModal.classList.contains('active')) {
                closeAddUserModal(addUserModal, addUserForm);
            }
        });
    }
    
    // Отправка формы
    if (addUserForm) {
        addUserForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            console.log('📤 Отправка формы...');
            
            const formData = {
                login: document.getElementById('newLogin')?.value,
                password: document.getElementById('newPassword')?.value,
                passwordConfirm: document.getElementById('newPasswordConfirm')?.value,
                firstName: document.getElementById('newFirstName')?.value,
                lastName: document.getElementById('newLastName')?.value,
                middleName: document.getElementById('newMiddleName')?.value || '',
                phone: document.getElementById('newPhone')?.value || '',
                email: document.getElementById('newEmail')?.value,
                birthDate: document.getElementById('newBirthDate')?.value || '',
                role: document.getElementById('newRole')?.value || 'user'
            };
            
            if (formData.password !== formData.passwordConfirm) {
                showNotification('Пароли не совпадают', 'error');
                return;
            }
            
            try {
                const res = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
                
                const result = await res.json();
                
                if (res.ok) {
                    showNotification('Пользователь создан ✓', 'success');
                    closeAddUserModal(addUserModal, addUserForm);
                    loadRecentUsers();
                } else {
                    showNotification(result.error || 'Ошибка', 'error');
                }
            } catch (error) {
                console.error('❌ Create error:', error);
                showNotification('Ошибка соединения', 'error');
            }
        });
    }
}

// === ЗАКРЫТИЕ МОДАЛЬНОГО ОКНА ===
function closeAddUserModal(modal, form) {
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    if (form) form.reset();
    console.log('🔒 Модальное окно закрыто');
}

// === УВЕДОМЛЕНИЯ ===
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #0a0a0a;
        border: 2px solid ${type === 'success' ? '#4CAF50' : '#ff4444'};
        border-radius: 12px;
        padding: 15px 25px;
        z-index: 10001;
        color: #fff;
        font-family: Onest, sans-serif;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        transform: translateX(400px);
        transition: transform 0.3s ease;
    `;
    notification.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${type === 'success' ? '#4CAF50' : '#ff4444'}" stroke-width="2">
            ${type === 'success' 
                ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
                : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
            }
        </svg>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => { notification.style.transform = 'translateX(0)'; }, 100);
    setTimeout(() => {
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => { document.body.removeChild(notification); }, 300);
    }, 3000);
}