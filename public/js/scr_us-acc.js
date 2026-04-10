document.addEventListener('DOMContentLoaded', async function() {
    const API_URL = '/api';
    const token = localStorage.getItem('carzen_token');

    if (!token) {
        window.location.href = '/public/html/login.html';
        return;
    }

    const userInfoModal = document.getElementById('userInfoModal');
    const userInfoClose = userInfoModal?.querySelector('.modal-close');
    const btnDetails = document.querySelector('.btn-details');
    const btnLogout = document.querySelector('.btn-logout');
    const btnChange = document.querySelector('.btn-change');

    const supportModal = document.getElementById('supportModal');
    const supportTrigger = document.querySelector('.support-trigger');
    const supportClose = document.querySelector('.support-modal-close');
    const supportForm = document.getElementById('supportForm');
    const supportInput = document.getElementById('supportInput');
    const supportChat = document.getElementById('supportChatMessages');
    const supportSubmitBtn = document.getElementById('supportSubmitBtn');

    try {
        const response = await fetch(`${API_URL}/me`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            localStorage.removeItem('carzen_token');
            localStorage.removeItem('carzen_user');
            window.location.href = '/public/html/login.html';
            return;
        }

        const result = await response.json();
        const user = result.user;

        const profileName = document.querySelector('.profile-name');
        const profileAge = document.querySelector('.profile-age');

        if (profileName) {
            profileName.textContent = `${user.lastName} ${user.firstName} ${user.middleName || ''}`.trim();
        }

        if (profileAge && user.birthDate) {
            const birthDate = new Date(user.birthDate);
            const age = new Date().getFullYear() - birthDate.getFullYear();
            const monthDiff = new Date().getMonth() - birthDate.getMonth();
            const dayDiff = new Date().getDate() - birthDate.getDate();
            const finalAge = (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) ? age - 1 : age;
            profileAge.textContent = `${finalAge} лет`;
        }

        localStorage.setItem('carzen_user', JSON.stringify(user));
        fillModalData(user);
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        localStorage.removeItem('carzen_token');
        localStorage.removeItem('carzen_user');
        window.location.href = '/public/html/login.html';
        return;
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', function() {
            localStorage.removeItem('carzen_token');
            localStorage.removeItem('carzen_user');
            window.location.href = '/public/html/login.html';
        });
    }

    if (btnDetails && userInfoModal) {
        btnDetails.addEventListener('click', function() {
            openModal(userInfoModal);
        });
    }

    if (userInfoClose) {
        userInfoClose.addEventListener('click', function() {
            closeModal(userInfoModal);
        });
    }

    if (userInfoModal) {
        userInfoModal.addEventListener('click', function(e) {
            if (e.target === userInfoModal) {
                closeModal(userInfoModal);
            }
        });
    }

    if (btnChange) {
        btnChange.addEventListener('click', function() {
            alert('Функция редактирования в разработке');
        });
    }

    if (supportTrigger && supportModal) {
        supportTrigger.addEventListener('click', function(e) {
            e.preventDefault();
            openModal(supportModal);
            setTimeout(() => supportInput?.focus(), 100);
        });
    }

    if (supportClose) {
        supportClose.addEventListener('click', function() {
            closeModal(supportModal);
        });
    }

    if (supportModal) {
        supportModal.addEventListener('click', function(e) {
            if (e.target === supportModal) {
                closeModal(supportModal);
            }
        });
    }

    if (supportForm) {
        supportForm.addEventListener('submit', async function(e) {
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

    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') {
            return;
        }

        if (userInfoModal?.classList.contains('active')) {
            closeModal(userInfoModal);
        }

        if (supportModal?.classList.contains('active')) {
            closeModal(supportModal);
        }
    });
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

function fillModalData(user) {
    const fullnameEl = document.getElementById('modalFullname');
    const birthdateEl = document.getElementById('modalBirthdate');
    const phoneEl = document.getElementById('modalPhone');
    const emailEl = document.getElementById('modalEmail');
    const loginEl = document.getElementById('modalLogin');
    const regDateEl = document.getElementById('modalRegDate');

    if (fullnameEl) {
        fullnameEl.textContent = `${user.lastName} ${user.firstName} ${user.middleName || ''}`.trim();
    }

    if (birthdateEl && user.birthDate) {
        birthdateEl.textContent = new Date(user.birthDate).toLocaleDateString('ru-RU');
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
