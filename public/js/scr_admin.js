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
            loadReviews(token);
            
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

async function loadReviews(token) {
    try {
        const res = await fetch('/api/admin/reviews', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        const tbody = document.getElementById('reviews-tbody');

        if (!tbody) {
            return;
        }

        if (!res.ok) {
            tbody.innerHTML = `<tr><td colspan="8">${data.error || 'Не удалось загрузить отзывы'}</td></tr>`;
            return;
        }

        const reviews = data.reviews || [];
        if (!reviews.length) {
            tbody.innerHTML = '<tr><td colspan="8">Отзывов пока нет</td></tr>';
            return;
        }

        tbody.innerHTML = reviews.map((review) => `
            <tr>
                <td>${review.id}</td>
                <td>${formatCarName(review.carId)}</td>
                <td>${escapeHtml(review.authorName)}${review.userLogin ? `<br><span class="status">${escapeHtml(review.userLogin)}</span>` : ''}</td>
                <td>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</td>
                <td class="review-text-cell">${escapeHtml(review.text)}</td>
                <td><span class="status ${review.status}">${formatReviewStatus(review.status)}</span></td>
                <td>${review.createdAt ? new Date(review.createdAt).toLocaleString('ru-RU') : ''}</td>
                <td>
                    ${review.status === 'pending' ? `
                        <div class="review-actions">
                            <button class="review-action-btn publish" data-id="${review.id}" data-status="published">Опубликовать</button>
                            <button class="review-action-btn reject" data-id="${review.id}" data-status="rejected">Отклонить</button>
                        </div>
                    ` : '<span class="status">Решение принято</span>'}
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.review-action-btn').forEach((button) => {
            button.addEventListener('click', () => moderateReview(token, button.dataset.id, button.dataset.status, button));
        });
    } catch (error) {
        console.error('Отзывы:', error);
    }
}

async function moderateReview(token, reviewId, status, button) {
    const actionLabel = status === 'published' ? 'опубликовать' : 'отклонить';
    if (!confirm(`Вы действительно хотите ${actionLabel} этот отзыв?`)) {
        return;
    }

    button.disabled = true;

    try {
        const res = await fetch(`/api/admin/reviews/${reviewId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });

        const result = await res.json();
        if (!res.ok) {
            throw new Error(result.error || 'Не удалось обновить статус');
        }

        loadReviews(token);
    } catch (error) {
        console.error('Модерация отзыва:', error);
        alert(error.message || 'Ошибка модерации отзыва');
        button.disabled = false;
    }
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

function formatReviewStatus(status) {
    if (status === 'published') {
        return 'Опубликован';
    }

    if (status === 'rejected') {
        return 'Отклонён';
    }

    return 'На модерации';
}

function formatCarName(carId) {
    const carNames = {
        'kia-k5': 'Kia K5'
    };

    return carNames[carId] || carId;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
