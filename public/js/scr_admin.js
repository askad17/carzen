class AdminPanel {
  constructor(token) {
    this.token = token;
    this.headers = { Authorization: `Bearer ${token}` };
  }

  async init() {
    this.setupModals();
    this.bindEvents();
    this.setupShowMoreButtons();
    await this.reload();
  }

  async request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(data.error || 'Ошибка запроса');
    return data;
  }

  bindEvents() {
    document.querySelector('.logout')?.addEventListener('click', (event) => {
      event.preventDefault();
      localStorage.clear();
      window.location.href = '/public/html/menu.html';
    });

    document.getElementById('reloadAdminBtn')?.addEventListener('click', () => this.reload());
    document.getElementById('exportPdfBtn')?.addEventListener('click', () => {
      this.exportPdf();
    });

    document.getElementById('addUserForm')?.addEventListener('submit', (event) => this.createUser(event));
    document.getElementById('addCarForm')?.addEventListener('submit', (event) => this.createCar(event));
    document.querySelectorAll('input[name="galleryImages"]')?.forEach((input) => {
      input.addEventListener('change', (event) => this.handleGalleryImagesChange(event));
    });
    document.getElementById('promoForm')?.addEventListener('submit', (event) => this.savePromo(event));
    document.getElementById('optionForm')?.addEventListener('submit', (event) => this.saveOption(event));
    document.getElementById('carPromoForm')?.addEventListener('submit', (event) => this.saveCarPromotion(event));
    document.getElementById('siteContentForm')?.addEventListener('submit', (event) => this.saveContent(event));
    document.getElementById('assignPromoForm')?.addEventListener('submit', (event) => this.assignPromoToUser(event));
  }

  setupModals() {
    const userModal = document.getElementById('addUserModal');
    const carModal = document.getElementById('addCarModal');
    const assignPromoModal = document.getElementById('assignPromoModal');
    document.getElementById('addCarBtn')?.addEventListener('click', () => {
      if (!carModal) return;
      carModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
    document.getElementById('addUserBtn')?.addEventListener('click', () => {
      if (!userModal) return;
      userModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
    document.getElementById('closeAddCar')?.addEventListener('click', () => this.closeModal(carModal));
    document.getElementById('cancelAddCar')?.addEventListener('click', () => this.closeModal(carModal));
    document.getElementById('cancelAddUser')?.addEventListener('click', () => this.closeModal(userModal));
    document.getElementById('closeAssignPromo')?.addEventListener('click', () => this.closeModal(assignPromoModal));
    document.getElementById('cancelAssignPromo')?.addEventListener('click', () => this.closeModal(assignPromoModal));
    userModal?.querySelector('.modal-close')?.addEventListener('click', () => this.closeModal(userModal));

    [userModal, carModal, assignPromoModal].forEach((modal) => {
      modal?.addEventListener('click', (event) => {
        if (event.target === modal) this.closeModal(modal);
      });
    });
  }

  closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
    modal.querySelector('form')?.reset();
    if (modal.id === 'addCarModal') {
      document.getElementById('galleryPreviewContainer')?.querySelectorAll('*')?.forEach((node) => node.remove());
    }
  }

  async reload() {
    await Promise.all([
      this.loadStats(),
      this.loadUsers(),
      this.loadConsultations(),
      this.loadReviews(),
      this.loadCars(),
      this.loadBookings(),
      this.loadPromos(),
      this.loadCarPromotions(),
      this.loadOptions(),
      this.loadContent(),
      this.loadNotifications(),
      this.loadActivity()
    ]);
    this.updateAdminShowMore();
  }

  async loadStats() {
    const data = await this.request('/api/admin/stats');
    document.getElementById('statUsers').textContent = data.totalUsers;
    document.getElementById('statRentals').textContent = data.activeRentals;
    document.getElementById('statTodayBookings').textContent = data.newBookingsToday;
    document.getElementById('statRevenue').textContent = `${new Intl.NumberFormat('ru-RU').format(data.revenueMonth)} ₽`;
  }

  async loadUsers() {
    const data = await this.request('/api/admin/users');
    const tbody = document.getElementById('usersTbody');
    tbody.innerHTML = data.users.map((user) => `
      <tr>
        <td>${user.id}</td>
        <td>${user.firstName} ${user.lastName}<br><span class="status">${user.login}</span></td>
        <td>${user.email || '-'}</td>
        <td>${user.role}</td>
        <td>${new Date(user.createdAt).toLocaleString('ru-RU')}</td>
        <td>
          <button class="assign-promo-btn" data-id="${user.id}" data-name="${user.firstName} ${user.lastName}">Промокод</button>
          <button class="delete-user" data-id="${user.id}">Удалить</button>
        </td>
      </tr>
    `).join('');
    tbody.querySelectorAll('.assign-promo-btn').forEach((button) => {
      button.addEventListener('click', () => {
        this.showAssignPromoModal(button.dataset.id, button.dataset.name);
      });
    });
    tbody.querySelectorAll('.delete-user').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Удалить пользователя?')) return;
        await this.request(`/api/admin/users/${button.dataset.id}`, { method: 'DELETE' });
        await this.loadUsers();
      });
    });
  }

  async loadConsultations() {
    const data = await this.request('/api/admin/consultations');
    document.getElementById('consultationsTbody').innerHTML = data.consultations.map((item) => `
      <tr>
        <td>${item.id}</td>
        <td>${item.name}</td>
        <td>${item.phone}</td>
        <td>${item.city}</td>
        <td>${new Date(item.createdAt).toLocaleString('ru-RU')}</td>
      </tr>
    `).join('');
  }

  async loadReviews() {
    const data = await this.request('/api/admin/reviews');
    const tbody = document.getElementById('reviewsTbody');
    tbody.innerHTML = data.reviews.map((review) => `
      <tr>
        <td>${review.id}</td>
        <td>${review.carId}</td>
        <td>${this.escapeHtml(review.authorName)}</td>
        <td>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</td>
        <td class="review-text-cell">${this.escapeHtml(review.text)}</td>
        <td><span class="status ${review.status}">${review.status}</span></td>
        <td>${new Date(review.createdAt).toLocaleString('ru-RU')}</td>
        <td>
          ${review.status === 'pending' ? `
            <div class="review-actions">
              <button class="review-action-btn publish" data-id="${review.id}" data-status="published">Опубликовать</button>
              <button class="review-action-btn reject" data-id="${review.id}" data-status="rejected">Отклонить</button>
            </div>
          ` : '<span class="status">Обработано</span>'}
        </td>
      </tr>
    `).join('');
    tbody.querySelectorAll('.review-action-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        await this.request(`/api/admin/reviews/${button.dataset.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: button.dataset.status })
        });
        await this.loadReviews();
      });
    });
  }

  async loadCars() {
    const data = await this.request('/api/admin/cars');
    const tbody = document.getElementById('carsTbody');
    tbody.innerHTML = data.cars.map((car) => `
      <tr>
        <td>${car.id}</td>
        <td>${car.title}<br><span class="status">${car.brand} ${car.model}</span></td>
        <td>${car.city || '-'}</td>
        <td>${new Intl.NumberFormat('ru-RU').format(car.pricePerDay)} ₽</td>
        <td>${car.status}</td>
        <td><button class="delete-user admin-delete-car" data-id="${car.id}">Удалить</button></td>
      </tr>
    `).join('');
    this.populateCarSelect(data.cars);
    tbody.querySelectorAll('.admin-delete-car').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Удалить автомобиль?')) return;
        await this.request(`/api/admin/cars/${button.dataset.id}`, { method: 'DELETE' });
        await this.loadCars();
      });
    });
  }

  async loadBookings() {
    const data = await this.request('/api/admin/bookings');
    const tbody = document.getElementById('bookingsTbody');
    tbody.innerHTML = data.bookings.map((booking) => {
      const statusLabels = {
        pending: 'Ожидает',
        payment_link_sent: 'Ссылка отправлена',
        paid: 'Оплачено',
        cancelled: 'Отменено'
      };
      const statuses = ['pending', 'payment_link_sent', 'paid', 'cancelled'];
      const currentStatus = booking.status || 'pending';
      const options = statuses.map((status) => `
        <option value="${status}" ${status === currentStatus ? 'selected' : ''}>
          ${statusLabels[status] || status}
        </option>`).join('');
      return `
      <tr>
        <td>${booking.id}</td>
        <td>${booking.carTitle || '-'}</td>
        <td>${booking.customerName}<br><span class="status">${booking.customerPhone || ''}</span></td>
        <td>${booking.customerEmail || '-'}</td>
        <td>${booking.startDate} - ${booking.endDate}</td>
        <td>${new Intl.NumberFormat('ru-RU').format(booking.totalPrice)} ₽</td>
        <td><span class="status ${currentStatus === 'paid' ? 'published' : currentStatus === 'payment_link_sent' ? 'pending' : currentStatus === 'cancelled' ? 'blocked' : ''}">${statusLabels[currentStatus] || currentStatus}</span></td>
        <td>
          <div class="review-actions">
            <select class="booking-status-select" data-id="${booking.id}">${options}</select>
            <button class="review-action-btn publish apply-status-btn" data-id="${booking.id}">Обновить</button>
            <button class="review-action-btn publish send-link-btn" data-id="${booking.id}">Ссылка</button>
            <button class="review-action-btn reject delete-booking-btn" data-id="${booking.id}">Удалить</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.send-link-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const result = await this.request(`/api/admin/bookings/${button.dataset.id}/send-payment-link`, { method: 'POST' });
        alert(`${result.message}\n\n${result.smsText}`);
        await this.loadBookings();
      });
    });

    tbody.querySelectorAll('.apply-status-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const bookingId = button.dataset.id;
        const select = tbody.querySelector(`select.booking-status-select[data-id="${bookingId}"]`);
        if (!select) return;
        const status = select.value;
        await this.request(`/api/admin/bookings/${bookingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status })
        });
        await this.loadBookings();
      });
    });

    tbody.querySelectorAll('.delete-booking-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Удалить бронирование?')) return;
        await this.request(`/api/admin/bookings/${button.dataset.id}`, { method: 'DELETE' });
        await this.loadBookings();
      });
    });
  }

  async loadPromos() {
    const data = await this.request('/api/admin/promo-codes');
    document.getElementById('promoTbody').innerHTML = data.promoCodes.map((promo) => `
      <tr>
        <td>${promo.code}</td>
        <td>${promo.discountPercent}%</td>
        <td>${promo.isActive ? 'Да' : 'Нет'}</td>
        <td>
          <div class="review-actions">
            <button class="review-action-btn publish edit-promo-btn" data-id="${promo.id}">Изменить</button>
            <button class="review-action-btn reject delete-promo-btn" data-id="${promo.id}">Удалить</button>
          </div>
        </td>
      </tr>
    `).join('');
    document.querySelectorAll('.edit-promo-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const promo = data.promoCodes.find((item) => item.id === Number(button.dataset.id));
        document.getElementById('promoId').value = promo.id;
        document.getElementById('promoCodeInput').value = promo.code;
        document.getElementById('promoTitleInput').value = promo.title || '';
        document.getElementById('promoDiscountInput').value = promo.discountPercent;
        document.getElementById('promoExpiresInput').value = promo.expiresAt ? promo.expiresAt.slice(0, 10) : '';
      });
    });
    document.querySelectorAll('.delete-promo-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        await this.request(`/api/admin/promo-codes/${button.dataset.id}`, { method: 'DELETE' });
        await this.loadPromos();
      });
    });
  }

  async loadCarPromotions() {
    try {
      const data = await this.request('/api/admin/car-promotions');
      const tbody = document.getElementById('carPromoTbody');
      tbody.innerHTML = data.promotions.map((promo) => `
        <tr>
          <td>${this.escapeHtml(promo.car?.title || '')}<br><span class="status">${this.escapeHtml(promo.car?.brand || '')} ${this.escapeHtml(promo.car?.model || '')}</span></td>
          <td>${new Intl.NumberFormat('ru-RU').format(promo.promoPrice)} ₽</td>
          <td>${promo.startDate} - ${promo.endDate}</td>
          <td>${promo.isActive ? 'Да' : 'Нет'}</td>
          <td>
            <div class="review-actions">
              <button class="review-action-btn publish edit-car-promo-btn" data-id="${promo.id}">Изменить</button>
              <button class="review-action-btn reject delete-car-promo-btn" data-id="${promo.id}">Удалить</button>
            </div>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.edit-car-promo-btn').forEach((button) => {
        button.addEventListener('click', () => {
          const promo = data.promotions.find((item) => item.id === Number(button.dataset.id));
          if (!promo) return;
          document.getElementById('carPromoId').value = promo.id;
          document.getElementById('carPromoTitleInput').value = promo.title || '';
          document.getElementById('carPromoCarSelect').value = promo.carId;
          document.getElementById('carPromoPriceInput').value = promo.promoPrice;
          document.getElementById('carPromoStartDateInput').value = promo.startDate;
          document.getElementById('carPromoEndDateInput').value = promo.endDate;
          document.getElementById('carPromoActiveInput').checked = promo.isActive;
        });
      });

      tbody.querySelectorAll('.delete-car-promo-btn').forEach((button) => {
        button.addEventListener('click', async () => {
          if (!confirm('Удалить акцию на автомобиль?')) return;
          await this.request(`/api/admin/car-promotions/${button.dataset.id}`, { method: 'DELETE' });
          await this.loadCarPromotions();
        });
      });
    } catch (error) {
      console.error('Load car promotions error:', error);
      alert('Не удалось загрузить акции на автомобили');
    }
  }

  async saveCarPromotion(event) {
    event.preventDefault();
    const id = document.getElementById('carPromoId').value;
    const payload = {
      carId: Number(document.getElementById('carPromoCarSelect').value),
      promoPrice: Number(document.getElementById('carPromoPriceInput').value),
      title: document.getElementById('carPromoTitleInput').value,
      startDate: document.getElementById('carPromoStartDateInput').value,
      endDate: document.getElementById('carPromoEndDateInput').value,
      isActive: document.getElementById('carPromoActiveInput').checked
    };
    if (!payload.carId || !payload.promoPrice || !payload.startDate || !payload.endDate) {
      alert('Заполните все обязательные поля акции');
      return;
    }
    await this.request(id ? `/api/admin/car-promotions/${id}` : '/api/admin/car-promotions', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    event.target.reset();
    document.getElementById('carPromoId').value = '';
    document.getElementById('carPromoActiveInput').checked = true;
    await this.loadCarPromotions();
  }

  populateCarSelect(cars) {
    const select = document.getElementById('carPromoCarSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Выберите автомобиль</option>' +
      cars.map((car) => `
        <option value="${car.id}">${this.escapeHtml(car.title)} ${this.escapeHtml(car.brand)} ${this.escapeHtml(car.model)} (${new Intl.NumberFormat('ru-RU').format(car.pricePerDay)} ₽)</option>
      `).join('');
  }

  async loadOptions() {
    const data = await this.request('/api/admin/extra-options');
    document.getElementById('optionsTbody').innerHTML = data.options.map((option) => `
      <tr>
        <td>${option.title}</td>
        <td>${new Intl.NumberFormat('ru-RU').format(option.price)} ₽</td>
        <td>${option.chargeType}</td>
        <td>
          <div class="review-actions">
            <button class="review-action-btn publish edit-option-btn" data-id="${option.id}">Изменить</button>
            <button class="review-action-btn reject delete-option-btn" data-id="${option.id}">Удалить</button>
          </div>
        </td>
      </tr>
    `).join('');
    document.querySelectorAll('.edit-option-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const option = data.options.find((item) => item.id === Number(button.dataset.id));
        document.getElementById('optionId').value = option.id;
        document.getElementById('optionCodeInput').value = option.code;
        document.getElementById('optionTitleInput').value = option.title;
        document.getElementById('optionPriceInput').value = option.price;
        document.getElementById('optionChargeTypeInput').value = option.chargeType;
      });
    });
    document.querySelectorAll('.delete-option-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        await this.request(`/api/admin/extra-options/${button.dataset.id}`, { method: 'DELETE' });
        await this.loadOptions();
      });
    });
  }

  async loadContent() {
    const data = await this.request('/api/admin/site-content');
    const content = data.content || {};
    document.getElementById('contentHeroTitle').value = content.hero_title || '';
    document.getElementById('contentHeroSubtitle').value = content.hero_subtitle || '';
    document.getElementById('contentPhone').value = content.support_phone || '';
    document.getElementById('contentEmail').value = content.support_email || '';
    document.getElementById('contentAddress1').value = content.footer_address_1 || '';
    document.getElementById('contentAddress2').value = content.footer_address_2 || '';
    document.getElementById('contentAddress3').value = content.footer_address_3 || '';
    document.getElementById('contentPromoLabel').value = content.promo_label || '';
    document.getElementById('contentPromoCode').value = content.promo_code || '';
  }

  async loadNotifications() {
    const data = await this.request('/api/admin/notifications');
    document.getElementById('notificationsTbody').innerHTML = data.notifications.map((item) => `
      <tr>
        <td>${item.channel}</td>
        <td>${item.recipient}</td>
        <td>${item.status}</td>
        <td>${this.escapeHtml(item.externalId || item.subject || '')}</td>
      </tr>
    `).join('');
  }

  async loadActivity() {
    const data = await this.request('/api/admin/activity-log');
    document.getElementById('activityTbody').innerHTML = data.activity.map((item) => `
      <tr>
        <td>${new Date(item.createdAt).toLocaleString('ru-RU')}</td>
        <td>${item.action}</td>
        <td>${this.escapeHtml(JSON.stringify(item.meta || {}))}</td>
      </tr>
    `).join('');
  }

  async createUser(event) {
    event.preventDefault();
    const payload = {
      login: document.getElementById('newLogin').value,
      password: document.getElementById('newPassword').value,
      firstName: document.getElementById('newFirstName').value,
      lastName: document.getElementById('newLastName').value,
      middleName: document.getElementById('newMiddleName').value,
      phone: document.getElementById('newPhone').value,
      email: document.getElementById('newEmail').value,
      birthDate: document.getElementById('newBirthDate').value,
      role: document.getElementById('newRole').value
    };
    if (payload.password !== document.getElementById('newPasswordConfirm').value) {
      alert('Пароли не совпадают');
      return;
    }
    await this.request('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) });
    this.closeModal(document.getElementById('addUserModal'));
    await this.loadUsers();
  }

  async createCar(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const result = await this.request('/api/admin/cars', { method: 'POST', body: formData });
    alert(result.message || 'Автомобиль успешно добавлен на сайт');
    this.closeModal(document.getElementById('addCarModal'));
    document.getElementById('galleryPreviewContainer')?.querySelectorAll('*')?.forEach((node) => node.remove());
    await this.loadCars();
  }

  handleGalleryImagesChange(event) {
    const container = document.getElementById('galleryPreviewContainer');
    container.innerHTML = '';
    const inputs = Array.from(document.querySelectorAll('input[name="galleryImages"]'));
    const files = inputs.flatMap((input) => Array.from(input.files || []));
    if (!files.length) {
      return;
    }
    files.forEach((file) => {
      const item = document.createElement('div');
      item.className = 'gallery-preview-item';
      item.innerHTML = `
        <span class="gallery-preview-name">${file.name}</span>
        <span class="gallery-preview-size">${Math.round(file.size / 1024)} КБ</span>
      `;
      container.appendChild(item);
    });
  }

  async savePromo(event) {
    event.preventDefault();
    const id = document.getElementById('promoId').value;
    const payload = {
      code: document.getElementById('promoCodeInput').value,
      title: document.getElementById('promoTitleInput').value,
      discountPercent: Number(document.getElementById('promoDiscountInput').value),
      expiresAt: document.getElementById('promoExpiresInput').value || null
    };
    await this.request(id ? `/api/admin/promo-codes/${id}` : '/api/admin/promo-codes', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    event.target.reset();
    document.getElementById('promoId').value = '';
    await this.loadPromos();
  }

  async saveOption(event) {
    event.preventDefault();
    const id = document.getElementById('optionId').value;
    const payload = {
      code: document.getElementById('optionCodeInput').value,
      title: document.getElementById('optionTitleInput').value,
      price: Number(document.getElementById('optionPriceInput').value),
      chargeType: document.getElementById('optionChargeTypeInput').value
    };
    await this.request(id ? `/api/admin/extra-options/${id}` : '/api/admin/extra-options', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    event.target.reset();
    document.getElementById('optionId').value = '';
    await this.loadOptions();
  }

  async saveContent(event) {
    event.preventDefault();
    const payload = {
      content: {
        hero_title: document.getElementById('contentHeroTitle').value,
        hero_subtitle: document.getElementById('contentHeroSubtitle').value,
        support_phone: document.getElementById('contentPhone').value,
        support_email: document.getElementById('contentEmail').value,
        footer_address_1: document.getElementById('contentAddress1').value,
        footer_address_2: document.getElementById('contentAddress2').value,
        footer_address_3: document.getElementById('contentAddress3').value,
        promo_label: document.getElementById('contentPromoLabel').value,
        promo_code: document.getElementById('contentPromoCode').value
      }
    };
    await this.request('/api/admin/site-content', { method: 'PUT', body: JSON.stringify(payload) });
    alert('Контент сайта обновлён');
  }

  async exportPdf() {
    const response = await fetch('/api/admin/export/report.pdf', { headers: this.headers });
    if (!response.ok) {
      alert('Не удалось сформировать отчет');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'carzen-report.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  async showAssignPromoModal(userId, userName) {
    const modal = document.getElementById('assignPromoModal');
    document.getElementById('assignPromoUserId').value = userId;
    document.getElementById('assignPromoUserName').textContent = userName;
    
    await this.loadPromosList();
    
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  async loadPromosList() {
    try {
      const data = await this.request('/api/admin/promo-codes');
      const select = document.getElementById('assignPromoSelect');
      const activePromos = data.promoCodes.filter(p => p.isActive);
      
      select.innerHTML = '<option value="">-- Выберите промокод --</option>' + 
        activePromos.map(promo => `
          <option value="${promo.id}">
            ${promo.code} - ${promo.title || 'Без названия'} (${promo.discountPercent}%)
          </option>
        `).join('');
    } catch (error) {
      console.error('Load promos list error:', error);
      alert('Не удалось загрузить список промокодов');
    }
  }

  async assignPromoToUser(event) {
    event.preventDefault();
    const userId = document.getElementById('assignPromoUserId').value;
    const promoId = document.getElementById('assignPromoSelect').value;
    
    if (!promoId) {
      alert('Выберите промокод');
      return;
    }
    
    try {
      await this.request(`/api/admin/users/${userId}/promos`, {
        method: 'POST',
        body: JSON.stringify({ promoId: Number(promoId) })
      });
      
      alert('Промокод успешно выдан пользователю');
      this.closeModal(document.getElementById('assignPromoModal'));
      document.getElementById('assignPromoForm').reset();
    } catch (error) {
      console.error('Assign promo error:', error);
      alert(error.message || 'Не удалось выдать промокод');
    }
  }

  setupShowMoreButtons() {
    document.querySelectorAll('.table-container').forEach((container) => {
      const tbody = container.querySelector('tbody');
      if (!tbody || !tbody.id) return;
      let button = container.querySelector(`button.show-more-btn[data-table="${tbody.id}"]`);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'show-more-btn btn btn-secondary';
        button.dataset.table = tbody.id;
        button.style.marginTop = '12px';
        button.style.display = 'none';
        container.appendChild(button);
      }
      button.addEventListener('click', () => this.toggleTableRows(tbody.id));
    });
  }

  applyShowMoreToTable(tableId) {
    const tbody = document.getElementById(tableId);
    const button = document.querySelector(`button.show-more-btn[data-table="${tableId}"]`);
    if (!tbody || !button) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length <= 6) {
      button.style.display = 'none';
      rows.forEach((row) => { row.style.display = ''; });
      button.dataset.expanded = 'false';
      return;
    }
    const hiddenCount = Math.max(0, rows.length - 6);
    rows.forEach((row, index) => {
      row.style.display = index >= 6 ? 'none' : '';
    });
    button.textContent = `Показать ещё (${hiddenCount})`;
    button.style.display = '';
    button.dataset.expanded = 'false';
  }

  toggleTableRows(tableId) {
    const tbody = document.getElementById(tableId);
    const button = document.querySelector(`button.show-more-btn[data-table="${tableId}"]`);
    if (!tbody || !button) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const expanded = button.dataset.expanded === 'true';
    if (expanded) {
      rows.forEach((row, index) => { row.style.display = index >= 6 ? 'none' : ''; });
      button.textContent = `Показать ещё (${Math.max(0, rows.length - 6)})`;
      button.dataset.expanded = 'false';
    } else {
      rows.forEach((row) => { row.style.display = ''; });
      button.textContent = 'Скрыть';
      button.dataset.expanded = 'true';
    }
  }

  updateAdminShowMore() {
    ['usersTbody', 'consultationsTbody', 'reviewsTbody', 'carsTbody', 'bookingsTbody', 'promoTbody', 'carPromoTbody', 'notificationsTbody', 'activityTbody'].forEach((id) => {
      this.applyShowMoreToTable(id);
    });
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('carzen_token') || localStorage.getItem('token');
  if (!token) {
    window.location.href = '/public/html/login.html';
    return;
  }

  try {
    const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok || data.user?.role !== 'admin') {
      window.location.href = '/public/html/menu.html';
      return;
    }
    const panel = new AdminPanel(token);
    await panel.init();
  } catch (error) {
    console.error(error);
    window.location.href = '/public/html/menu.html';
  }
});
