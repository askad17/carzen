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

            const message = supportInput.value.trim();
            if (!message) {
                return;
            }

            appendSupportMessage(message, 'user', supportChat);
            supportInput.value = '';
            supportSubmitBtn.disabled = true;
            supportSubmitBtn.textContent = 'Отправляем...';

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
                supportSubmitBtn.disabled = false;
                supportSubmitBtn.textContent = 'Отправить';
                supportInput.focus();
            }
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') {
            return;
        }

        [userInfoModal, editProfileModal, supportModal].forEach((modal) => {
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
    const firstNameInput = document.getElementById('editFirstName');
    const lastNameInput = document.getElementById('editLastName');
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

    if (firstNameInput) firstNameInput.value = user.firstName || '';
    if (lastNameInput) lastNameInput.value = user.lastName || '';
    if (middleNameInput) middleNameInput.value = user.middleName || '';
    if (phoneInput) phoneInput.value = user.phone || '';
    if (emailInput) emailInput.value = user.email || '';
    if (birthDateInput) birthDateInput.value = user.birthDate || '';
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
