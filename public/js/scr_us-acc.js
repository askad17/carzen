let currentRentalsFilter = 'all';

document.addEventListener('DOMContentLoaded', async function () {
    const API_URL = '/api';
    const token = localStorage.getItem('carzen_token') || localStorage.getItem('token');

    if (!token) {
        window.location.href = '/public/html/login.html';
        return;
    }

    const userInfoModal = document.getElementById('userInfoModal');
    const editProfileModal = document.getElementById('editProfileModal');
    const userInfoClose = userInfoModal?.querySelector('.modal-close');
    const editProfileClose = editProfileModal?.querySelector('.modal-close');
    const btnDetails = document.querySelector('.btn-details');
    const btnLogout = document.querySelector('.btn-logout');
    const btnChange = document.querySelector('.btn-change');
    const editProfileForm = document.getElementById('editProfileForm');
    const avatarInput = document.getElementById('editAvatar');
    const avatarPreview = document.getElementById('editAvatarPreview');

    const supportModal = document.getElementById('supportModal');
    const supportTrigger = document.querySelector('.support-trigger');
    const supportClose = document.querySelector('.support-modal-close');
    const supportForm = document.getElementById('supportForm');
    const supportInput = document.getElementById('supportInput');
    const supportChat = document.getElementById('supportChatMessages');
    const supportSubmitBtn = document.getElementById('supportSubmitBtn');

    let currentUser = null;

    try {
        const response = await fetch(`${API_URL}/me`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('auth_failed');
        }

        const result = await response.json();
        currentUser = result.user;

        if (currentUser?.role === 'admin') {
            localStorage.setItem('carzen_user', JSON.stringify(currentUser));
            window.location.href = '/public/html/admin-panel.html';
            return;
        }

        syncUserState(currentUser);
        await loadUserRentals();
    } catch (error) {
        console.error('Profile load error:', error);
        localStorage.removeItem('carzen_token');
        localStorage.removeItem('token');
        localStorage.removeItem('carzen_user');
        window.location.href = '/public/html/login.html';
        return;
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', function () {
            localStorage.removeItem('carzen_token');
            localStorage.removeItem('token');
            localStorage.removeItem('carzen_user');
            window.location.href = '/public/html/login.html';
        });
    }

    if (btnDetails && userInfoModal) {
        btnDetails.addEventListener('click', function () {
            openModal(userInfoModal);
        });
    }

    if (btnChange && editProfileModal) {
        btnChange.addEventListener('click', function () {
            fillEditForm(currentUser);
            closeModal(userInfoModal);
            openModal(editProfileModal);
        });
    }

    if (userInfoClose) {
        userInfoClose.addEventListener('click', function () {
            closeModal(userInfoModal);
        });
    }

    if (editProfileClose) {
        editProfileClose.addEventListener('click', function () {
            closeModal(editProfileModal);
        });
    }

    [userInfoModal, editProfileModal, supportModal].forEach((modal) => {
        modal?.addEventListener('click', function (event) {
            if (event.target === modal) {
                closeModal(modal);
            }
        });
    });

    if (avatarInput) {
        avatarInput.addEventListener('change', function () {
            const [file] = avatarInput.files || [];
            if (!file || !avatarPreview) {
                return;
            }

            avatarPreview.src = URL.createObjectURL(file);
        });
    }

    if (editProfileForm) {
        editProfileForm.addEventListener('submit', async function (event) {
            event.preventDefault();

            const formData = new FormData(editProfileForm);
            const submitButton = editProfileForm.querySelector('button[type="submit"]');

            if (!avatarInput?.files?.length) {
                formData.delete('avatar');
            }

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Сохраняем...';
            }

            try {
                const response = await fetch(`${API_URL}/me`, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    body: formData
                });

                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Не удалось сохранить профиль');
                }

                currentUser = result.user;
                syncUserState(currentUser);
                closeModal(editProfileModal);
                openModal(userInfoModal);
            } catch (error) {
                console.error('Profile save error:', error);
                alert(error.message || 'Не удалось сохранить профиль');
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Сохранить';
                }
            }
        });
    }

    if (supportTrigger && supportModal) {
        supportTrigger.addEventListener('click', function (e) {
            e.preventDefault();
            openModal(supportModal);
            setTimeout(() => supportInput?.focus(), 100);
        });
    }

    if (supportClose) {
        supportClose.addEventListener('click', function () {
            closeModal(supportModal);
        });
    }

    if (supportForm) {
        supportForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const message = supportInput?.value.trim();
            if (!message) {
                return;
            }

            appendSupportMessage(message, 'user', supportChat);
            supportInput.value = '';
            if (supportSubmitBtn) {
                supportSubmitBtn.disabled = true;
                supportSubmitBtn.textContent = 'Отправляем...';
            }

            try {
                const response = await fetch(`${API_URL}/ai-support`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ message })
                });

                const data = await response.json();
                appendSupportMessage(
                    data.reply || 'С этим вопросом обратитесь напрямую к оператору по номеру 89123420973.',
                    'bot',
                    supportChat
                );
            } catch (error) {
                console.error('AI support error:', error);
                appendSupportMessage(
                    'AI-консультант временно недоступен. С этим вопросом обратитесь напрямую к оператору по номеру 89123420973.',
                    'bot',
                    supportChat
                );
            } finally {
                if (supportSubmitBtn) {
                    supportSubmitBtn.disabled = false;
                    supportSubmitBtn.textContent = 'Отправить';
                }
                supportInput?.focus();
            }
        });
    }

    const promosModal = document.getElementById('promosModal');
    const promosTrigger = document.querySelector('.promos-trigger');
    const promosModalClose = document.querySelector('.promos-modal-close');

    if (promosTrigger && promosModal) {
        promosTrigger.addEventListener('click', function (e) {
            e.preventDefault();
            loadUserPromos();
            openModal(promosModal);
        });
    }

    if (promosModalClose) {
        promosModalClose.addEventListener('click', function () {
            closeModal(promosModal);
        });
    }

    if (promosModal) {
        promosModal.addEventListener('click', function (event) {
            if (event.target === promosModal) {
                closeModal(promosModal);
            }
        });
    }

    const rentalsModal = document.getElementById('rentalsModal');
    const rentalsTrigger = document.querySelector('.rentals-trigger');
    const rentalsModalClose = document.querySelector('.rentals-modal-close');

    if (rentalsTrigger && rentalsModal) {
        rentalsTrigger.addEventListener('click', function (e) {
            e.preventDefault();
            loadUserRentals();
            openModal(rentalsModal);
        });
    }

    if (rentalsModalClose) {
        rentalsModalClose.addEventListener('click', function () {
            closeModal(rentalsModal);
        });
    }

    if (rentalsModal) {
        rentalsModal.addEventListener('click', function (event) {
            if (event.target === rentalsModal) {
                closeModal(rentalsModal);
            }
        });

        document.querySelectorAll('.rentals-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.rentals-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                currentRentalsFilter = this.dataset.filter;
                filterRentals(currentRentalsFilter);
            });
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') {
            return;
        }

        [userInfoModal, editProfileModal, supportModal, promosModal].forEach((modal) => {
            if (modal?.classList.contains('active')) {
                closeModal(modal);
            }
        });
    });

    function syncUserState(user) {
        currentUser = user;
        localStorage.setItem('carzen_user', JSON.stringify(user));
        fillProfileHeader(user);
        fillModalData(user);
    }
});

async function loadUserPromos() {
    const token = localStorage.getItem('carzen_token') || localStorage.getItem('token');
    const API_URL = '/api';
    const promosList = document.getElementById('promosList');

    try {
        const response = await fetch(`${API_URL}/user/promos`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load promos');
        }

        const data = await response.json();
        const promos = data.promos || [];

        if (promos.length === 0) {
            promosList.innerHTML = '<div class="promos-empty"><p>У вас пока нет промокодов</p></div>';
            return;
        }

        promosList.innerHTML = promos.map(promo => {
            const expiresDate = promo.expiresAt || promo.userPromoExpires
                ? new Date(promo.expiresAt || promo.userPromoExpires).toLocaleDateString('ru-RU')
                : 'Не ограничен';

            return `
                <div class="promo-card">
                    <div class="promo-info">
                        <div class="promo-code-display" data-code="${promo.code}">${promo.code}</div>
                        <div class="promo-details">
                            <p class="promo-title">${promo.title || 'Промокод'}</p>
                            <p class="promo-discount">Скидка ${promo.discountPercent}%</p>
                            <p class="promo-expires">Срок: ${expiresDate}</p>
                        </div>
                    </div>
                    <button class="promo-copy-btn" data-code="${promo.code}">Скопировать</button>
                </div>
            `;
        }).join('');

        // Add copy button handlers
        document.querySelectorAll('.promo-copy-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const code = this.dataset.code;
                navigator.clipboard.writeText(code).then(() => {
                    const originalText = this.textContent;
                    this.textContent = 'Скопировано!';
                    this.classList.add('copied');
                    setTimeout(() => {
                        this.textContent = originalText;
                        this.classList.remove('copied');
                    }, 2000);
                });
            });
        });
    } catch (error) {
        console.error('Load promos error:', error);
        promosList.innerHTML = '<div class="promos-empty"><p>Ошибка загрузки промокодов</p></div>';
    }
}

function openModal(modal) {
    if (!modal) {
        return;
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    if (!modal) {
        return;
    }

    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function appendSupportMessage(text, role, container) {
    if (!container) {
        return;
    }

    const messageEl = document.createElement('div');
    messageEl.className = `support-message ${role === 'user' ? 'support-message-user' : 'support-message-bot'}`;
    messageEl.textContent = text;
    container.appendChild(messageEl);
    container.scrollTop = container.scrollHeight;
}

function fillProfileHeader(user) {
    const profileName = document.querySelector('.profile-name');
    const profileAge = document.querySelector('.profile-age');
    const profileAvatar = document.querySelector('.avatar-image');

    if (profileName) {
        profileName.textContent = formatFullName(user);
    }

    if (profileAge) {
        profileAge.textContent = user.birthDate ? `${calculateAge(user.birthDate)} лет` : 'Возраст не указан';
    }

    if (profileAvatar) {
        profileAvatar.src = user.avatarUrl || '/image/avatar.png';
    }
}

function fillModalData(user) {
    const modalAvatar = document.querySelector('.avatar-img');
    const fullnameEl = document.getElementById('modalFullname');
    const birthdateEl = document.getElementById('modalBirthdate');
    const phoneEl = document.getElementById('modalPhone');
    const emailEl = document.getElementById('modalEmail');
    const loginEl = document.getElementById('modalLogin');
    const regDateEl = document.getElementById('modalRegDate');

    if (modalAvatar) {
        modalAvatar.src = user.avatarUrl || '/image/avatar.png';
    }

    if (fullnameEl) {
        fullnameEl.textContent = formatFullName(user);
    }

    if (birthdateEl) {
        birthdateEl.textContent = user.birthDate
            ? new Date(user.birthDate).toLocaleDateString('ru-RU')
            : 'Не указана';
    }

    if (phoneEl) {
        phoneEl.textContent = user.phone || 'Не указан';
    }

    if (emailEl) {
        emailEl.textContent = user.email || 'Не указан';
    }

    if (loginEl && user.login) {
        const login = user.login;
        loginEl.textContent = login.length <= 4
            ? '*'.repeat(login.length)
            : login.slice(0, 2) + '*'.repeat(login.length - 4) + login.slice(-2);
    }

    if (regDateEl && user.createdAt) {
        regDateEl.textContent = new Date(user.createdAt).toLocaleDateString('ru-RU');
    }
}

function fillEditForm(user) {
    const avatarPreview = document.getElementById('editAvatarPreview');
    const avatarInput = document.getElementById('editAvatar');
    const loginInput = document.getElementById('editLogin');
    const firstNameInput = document.getElementById('editFirstName');
    const lastNameInput = document.getElementById('editLastName');
    const passwordInput = document.getElementById('editPassword');
    const passwordConfirmInput = document.getElementById('editPasswordConfirm');
    const middleNameInput = document.getElementById('editMiddleName');
    const phoneInput = document.getElementById('editPhone');
    const emailInput = document.getElementById('editEmail');
    const birthDateInput = document.getElementById('editBirthDate');

    if (avatarPreview) {
        avatarPreview.src = user.avatarUrl || '/image/avatar.png';
    }

    if (avatarInput) {
        avatarInput.value = '';
    }

    if (loginInput) loginInput.value = user.login || '';
    if (firstNameInput) firstNameInput.value = user.firstName || '';
    if (lastNameInput) lastNameInput.value = user.lastName || '';
    if (passwordInput) passwordInput.value = '';
    if (passwordConfirmInput) passwordConfirmInput.value = '';
    if (middleNameInput) middleNameInput.value = user.middleName || '';
    if (phoneInput) phoneInput.value = user.phone || '';
    if (emailInput) emailInput.value = user.email || '';
    if (birthDateInput) birthDateInput.value = user.birthDate || '';
}

let userBookings = [];

async function loadUserRentals() {
    const token = localStorage.getItem('carzen_token') || localStorage.getItem('token');
    const rentalsList = document.getElementById('rentalsList');
    if (!rentalsList) return;

    try {
        const response = await fetch('/api/bookings/my', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Не удалось загрузить аренды');
        }
        userBookings = data.bookings || [];
        filterRentals(currentRentalsFilter);
        renderCurrentRentalsSummary(userBookings);
    } catch (error) {
        console.error('Load user rentals error:', error);
        rentalsList.innerHTML = '<div class="rentals-empty"><p>Не удалось загрузить аренды.</p></div>';
        renderCurrentRentalsSummary([]);
    }
}

function filterRentals(filter) {
    const today = new Date().toISOString().slice(0, 10);
    let filtered = userBookings.slice();

    if (filter === 'current') {
        filtered = filtered.filter((booking) => {
            return booking.status !== 'cancelled' && booking.endDate >= today && booking.startDate <= today;
        });
    } else if (filter === 'past') {
        filtered = filtered.filter((booking) => {
            return booking.status === 'cancelled' || booking.endDate < today;
        });
    }

    renderRentals(filtered);
}

function renderRentals(bookings) {
    const rentalsList = document.getElementById('rentalsList');
    if (!rentalsList) return;

    if (!bookings.length) {
        rentalsList.innerHTML = '<div class="rentals-empty"><p>У вас пока нет аренд по выбранному фильтру</p></div>';
        return;
    }

    rentalsList.innerHTML = bookings.map((booking) => {
        const statusText = getBookingStatusText(booking.status);
        const optionsText = Array.isArray(booking.selectedOptions) && booking.selectedOptions.length
            ? booking.selectedOptions.map((option) => option.title || `Опция ${option.id}`).join(', ')
            : 'Нет дополнительных опций';
        const carTitle = booking.carTitle || 'Автомобиль';
        const carModel = booking.carBrand || '';
        const totalPrice = new Intl.NumberFormat('ru-RU').format(booking.totalPrice || 0);

        return `
            <div class="rentals-card">
                <div class="rentals-card-header">
                    <div>
                        <h3>${carTitle}</h3>
                        <p>${carModel}</p>
                    </div>
                    <span class="status ${booking.status}">${statusText}</span>
                </div>
                <div class="rentals-card-body">
                    <p><strong>Даты:</strong> ${booking.startDate} — ${booking.endDate}</p>
                    <p><strong>Сумма:</strong> ${totalPrice} ₽</p>
                    <p><strong>Опции:</strong> ${optionsText}</p>
                    <p><strong>Email:</strong> ${booking.customerEmail || 'Не указан'}</p>
                    <p><strong>Телефон:</strong> ${booking.customerPhone || 'Не указан'}</p>
                </div>
                <div class="rentals-card-actions">
                    ${['pending', 'payment_link_sent'].includes(booking.status) ? `<button class="btn btn-secondary cancel-booking-btn" data-id="${booking.id}">Отменить</button>` : ''}
                    <button class="btn btn-primary view-booking-btn" data-id="${booking.id}">Подробнее</button>
                </div>
            </div>
        `;
    }).join('');

    rentalsList.querySelectorAll('.cancel-booking-btn').forEach((button) => {
        button.addEventListener('click', async () => {
            const bookingId = button.dataset.id;
            if (!confirm('Отменить бронирование?')) return;
            try {
                const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('carzen_token') || localStorage.getItem('token')}`
                    }
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Не удалось отменить бронирование');
                await loadUserRentals();
            } catch (error) {
                console.error('Cancel booking failed:', error);
                alert(error.message || 'Ошибка отмены бронирования');
            }
        });
    });

    rentalsList.querySelectorAll('.view-booking-btn').forEach((button) => {
        button.addEventListener('click', async () => {
            const bookingId = button.dataset.id;
            viewBookingDetails(bookingId);
        });
    });
}

function getBookingStatusText(status) {
    switch (status) {
        case 'pending': return 'Ожидает';
        case 'payment_link_sent': return 'Ссылка отправлена';
        case 'paid': return 'Оплачено';
        case 'cancelled': return 'Отменено';
        default: return status;
    }
}

function renderCurrentRentalsSummary(bookings) {
    const profileMain = document.querySelector('.profile-main');
    if (!profileMain) {
        return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const currentBookings = bookings.filter((booking) => {
        return booking.status !== 'cancelled' && booking.endDate >= today && booking.startDate <= today;
    });

    if (!currentBookings.length) {
        profileMain.innerHTML = '<div class="rentals-empty"><p class="empty-text">Текущих аренд нет</p></div>';
        return;
    }

    profileMain.innerHTML = `
        <div class="rentals-list">
            ${currentBookings.map((booking) => {
                const statusText = getBookingStatusText(booking.status);
                const optionsText = Array.isArray(booking.selectedOptions) && booking.selectedOptions.length
                    ? booking.selectedOptions.map((option) => option.title || `Опция ${option.id}`).join(', ')
                    : 'Нет дополнительных опций';
                const carTitle = booking.carTitle || 'Автомобиль';
                const carModel = booking.carBrand || '';
                const totalPrice = new Intl.NumberFormat('ru-RU').format(booking.totalPrice || 0);

                return `
                    <div class="rentals-card">
                        <div class="rentals-card-header">
                            <div>
                                <h3>${carTitle}</h3>
                                <p>${carModel}</p>
                            </div>
                            <span class="status ${booking.status}">${statusText}</span>
                        </div>
                        <div class="rentals-card-body">
                            <p><strong>Даты:</strong> ${booking.startDate} — ${booking.endDate}</p>
                            <p><strong>Сумма:</strong> ${totalPrice} ₽</p>
                            <p><strong>Опции:</strong> ${optionsText}</p>
                            <p><strong>Email:</strong> ${booking.customerEmail || 'Не указан'}</p>
                            <p><strong>Телефон:</strong> ${booking.customerPhone || 'Не указан'}</p>
                        </div>
                        <div class="rentals-card-actions">
                            ${['pending', 'payment_link_sent'].includes(booking.status) ? `<button class="btn btn-secondary cancel-booking-btn" data-id="${booking.id}">Отменить</button>` : ''}
                            <button class="btn btn-primary view-booking-btn" data-id="${booking.id}">Подробнее</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    profileMain.querySelectorAll('.cancel-booking-btn').forEach((button) => {
        button.addEventListener('click', async () => {
            const bookingId = button.dataset.id;
            if (!confirm('Отменить бронирование?')) return;
            try {
                const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('carzen_token') || localStorage.getItem('token')}`
                    }
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Не удалось отменить бронирование');
                await loadUserRentals();
            } catch (error) {
                console.error('Cancel booking failed:', error);
                alert(error.message || 'Ошибка отмены бронирования');
            }
        });
    });

    profileMain.querySelectorAll('.view-booking-btn').forEach((button) => {
        button.addEventListener('click', async () => {
            const bookingId = button.dataset.id;
            viewBookingDetails(bookingId);
        });
    });
}

async function viewBookingDetails(bookingId) {
    try {
        const response = await fetch(`/api/bookings/${bookingId}`, {
            headers: {
                Authorization: `Bearer ${localStorage.getItem('carzen_token') || localStorage.getItem('token')}`
            }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить детали бронирования');
        const booking = data.booking;
        alert(`Бронирование #${booking.id}\nАвто: ${booking.carTitle} ${booking.carBrand || ''} ${booking.carModel || ''}\nДаты: ${booking.startDate} - ${booking.endDate}\nСтатус: ${getBookingStatusText(booking.status)}\nСумма: ${new Intl.NumberFormat('ru-RU').format(booking.totalPrice || 0)} ₽`);
    } catch (error) {
        console.error('View booking details error:', error);
        alert(error.message || 'Не удалось получить детали бронирования');
    }
}

function formatFullName(user) {
    return [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ') || 'Пользователь';
}

function calculateAge(birthDate) {
    const birth = new Date(birthDate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    const dayDiff = now.getDate() - birth.getDate();

    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        age -= 1;
    }

    return age;
}
