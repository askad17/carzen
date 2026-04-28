class CarPage {
  constructor() {
    this.carId = new URLSearchParams(window.location.search).get('id') || '3';
    this.pageSection = document.querySelector('.car-details-section');
    this.pageSection.dataset.carId = this.carId;
    this.car = null;
    this.images = [];
    this.currentIndex = 0;
    this.options = [];
    this.selectedPromo = null;
    this.reviewsController = new CarReviews(() => this.carId);
  }

  async init() {
    await Promise.all([this.loadCar(), this.loadOptions()]);
    this.setupGalleryControls();
    this.setupBookingForm();
    this.reviewsController.init();
  }

  async loadCar() {
    const response = await fetch(`/api/cars/${this.carId}`);
    const data = await response.json();
    if (!response.ok) {
      document.getElementById('carTitle').textContent = data.error || 'Автомобиль не найден';
      return;
    }
    this.car = data.car;
    this.images = this.car.gallery?.length ? this.car.gallery : [this.car.imageUrl];
    this.renderCar();
  }

  async loadOptions() {
    const response = await fetch('/api/extra-options');
    const data = await response.json();
    this.options = data.options || [];
    this.renderOptions();
  }

  renderCar() {
    document.getElementById('carTitle').textContent = this.car.title;
    document.getElementById('bookingCarName').value = this.car.title;
    document.getElementById('carMainPrice').textContent = `${new Intl.NumberFormat('ru-RU').format(this.car.pricePerDay)} рублей/сутки`;
    document.getElementById('mainCarImage').src = this.images[0];
    document.getElementById('mainCarImage').alt = this.car.title;
    document.getElementById('carDescriptionLink').textContent = this.car.description || 'Описание автомобиля';
    document.title = `${this.car.title} - Carzen`;

    const specs = {
      Марка: this.car.brand,
      Модель: this.car.model,
      Год: this.car.year || '-',
      Город: this.car.city || '-',
      Топливо: this.car.fuelType || '-',
      Привод: this.car.driveType || '-',
      Мест: this.car.seats || '-',
      Кузов: this.car.bodyType || '-',
      Коробка: this.car.transmission || '-',
      Пробег: this.car.mileage ? `${new Intl.NumberFormat('ru-RU').format(this.car.mileage)} км` : '-'
    };
    Object.entries(this.car.specs || {}).forEach(([key, value]) => {
      specs[key] = value;
    });

    const entries = Object.entries(specs);
    const left = entries.slice(0, Math.ceil(entries.length / 2));
    const right = entries.slice(Math.ceil(entries.length / 2));
    document.getElementById('specsColumnLeft').innerHTML = left.map(([label, value]) => this.renderSpec(label, value)).join('');
    document.getElementById('specsColumnRight').innerHTML = right.map(([label, value]) => this.renderSpec(label, value)).join('');

    const tiers = this.car.priceTiers?.length ? this.car.priceTiers : [{ label: '1 сутки', price: this.car.pricePerDay }];
    document.getElementById('pricingTable').innerHTML = tiers.map((tier) => `
      <div class="price-tier">
        <div class="tier-days">${tier.label}</div>
        <hr>
        <div class="tier-price">${typeof tier.price === 'number' ? new Intl.NumberFormat('ru-RU').format(tier.price) : tier.price}</div>
      </div>
    `).join('');

    this.renderDots();
    this.prefillUser();
    this.updateSummary();
  }

  renderSpec(label, value) {
    return `
      <div class="spec-row">
        <span class="spec-label">${label}:</span>
        <span class="spec-value">${value}</span>
      </div>
    `;
  }

  renderDots() {
    const dotsRoot = document.getElementById('galleryDots');
    dotsRoot.innerHTML = this.images.map((_, index) => `<span class="dot ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`).join('');
    dotsRoot.querySelectorAll('.dot').forEach((dot) => {
      dot.addEventListener('click', () => this.goToSlide(Number(dot.dataset.index)));
    });
  }

  setupGalleryControls() {
    document.querySelector('.gallery-nav.prev')?.addEventListener('click', () => this.goToSlide(this.currentIndex - 1));
    document.querySelector('.gallery-nav.next')?.addEventListener('click', () => this.goToSlide(this.currentIndex + 1));
    document.getElementById('heroBookBtn')?.addEventListener('click', () => document.getElementById('bookingSection').scrollIntoView({ behavior: 'smooth' }));
    document.getElementById('pricingBookBtn')?.addEventListener('click', () => document.getElementById('bookingSection').scrollIntoView({ behavior: 'smooth' }));
    setInterval(() => {
      if (this.images.length > 1) this.goToSlide(this.currentIndex + 1);
    }, 5000);
  }

  goToSlide(index) {
    if (!this.images.length) return;
    this.currentIndex = (index + this.images.length) % this.images.length;
    const image = document.getElementById('mainCarImage');
    image.style.opacity = '0.2';
    setTimeout(() => {
      image.src = this.images[this.currentIndex];
      image.style.opacity = '1';
    }, 180);
    document.querySelectorAll('.dot').forEach((dot, dotIndex) => {
      dot.classList.toggle('active', dotIndex === this.currentIndex);
    });
  }

  renderOptions() {
    const optionsRoot = document.getElementById('bookingOptions');
    if (!optionsRoot) return;
    if (!this.options.length) {
      optionsRoot.innerHTML = '<p class="feedback-text">Дополнительные опции скоро появятся.</p>';
      return;
    }
    optionsRoot.innerHTML = this.options.map((option) => `
      <label class="booking-option-card">
        <input type="checkbox" value="${option.id}" class="booking-option-input">
        <span>${option.title}</span>
        <strong>${new Intl.NumberFormat('ru-RU').format(option.price)} ₽ ${option.chargeType === 'day' ? '/ день' : ''}</strong>
      </label>
    `).join('');
    optionsRoot.querySelectorAll('.booking-option-input').forEach((input) => {
      input.addEventListener('change', () => this.updateSummary());
    });
  }

  prefillUser() {
    try {
      const user = JSON.parse(localStorage.getItem('carzen_user') || 'null');
      if (!user) return;
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
      document.getElementById('bookingCustomerName').value = fullName;
      document.getElementById('bookingCustomerEmail').value = user.email || '';
      document.getElementById('bookingCustomerPhone').value = user.phone || '';
    } catch (error) {
      console.error(error);
    }
  }

  getSelectedOptions() {
    return Array.from(document.querySelectorAll('.booking-option-input:checked')).map((input) => Number(input.value));
  }

  async applyPromo() {
    const code = document.getElementById('bookingPromoCode').value.trim();
    const meta = document.getElementById('promoMeta');
    if (!code) {
      this.selectedPromo = null;
      meta.textContent = '';
      this.updateSummary();
      return;
    }

    const response = await fetch(`/api/promo-codes/validate?code=${encodeURIComponent(code)}`);
    const data = await response.json();
    if (!response.ok) {
      this.selectedPromo = null;
      meta.textContent = data.error || 'Промокод не применён';
      meta.style.color = '#ff6b6b';
      this.updateSummary();
      return;
    }

    this.selectedPromo = data.promo;
    meta.textContent = `${data.promo.title || 'Промокод применён'}: скидка ${data.promo.discountPercent}%`;
    meta.style.color = '#74E6FF';
    this.updateSummary();
  }

  updateSummary() {
    if (!this.car) return;
    const startDate = document.getElementById('bookingStartDate').value;
    const endDate = document.getElementById('bookingEndDate').value;
    const days = startDate && endDate ? Math.max(0, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000)) : 0;
    const basePrice = days * this.car.pricePerDay;
    const optionsPrice = this.getSelectedOptions().reduce((sum, id) => {
      const option = this.options.find((item) => item.id === id);
      if (!option) return sum;
      return sum + (option.chargeType === 'day' ? option.price * days : option.price);
    }, 0);
    const discountPercent = this.selectedPromo?.discountPercent || 0;
    const discountAmount = Math.round((basePrice + optionsPrice) * (discountPercent / 100));
    const totalPrice = Math.max(0, basePrice + optionsPrice - discountAmount);

    document.getElementById('bookingSummary').innerHTML = `
      <div class="booking-summary-card">
        <span>Суток</span><strong>${days || 0}</strong>
      </div>
      <div class="booking-summary-card">
        <span>Базовая стоимость</span><strong>${new Intl.NumberFormat('ru-RU').format(basePrice)} ₽</strong>
      </div>
      <div class="booking-summary-card">
        <span>Опции</span><strong>${new Intl.NumberFormat('ru-RU').format(optionsPrice)} ₽</strong>
      </div>
      <div class="booking-summary-card">
        <span>Скидка</span><strong>${new Intl.NumberFormat('ru-RU').format(discountAmount)} ₽</strong>
      </div>
      <div class="booking-summary-card">
        <span>Итого</span><strong>${new Intl.NumberFormat('ru-RU').format(totalPrice)} ₽</strong>
      </div>
    `;
  }

  setNotice(text, type = 'info') {
    const notice = document.getElementById('bookingNotice');
    notice.textContent = text;
    notice.className = `booking-notice ${type}`;
  }

  setupBookingForm() {
    document.getElementById('bookingStartDate')?.addEventListener('change', () => this.updateSummary());
    document.getElementById('bookingEndDate')?.addEventListener('change', () => this.updateSummary());
    document.getElementById('applyPromoBtn')?.addEventListener('click', () => this.applyPromo());
    document.getElementById('checkAvailabilityBtn')?.addEventListener('click', async () => {
      const startDate = document.getElementById('bookingStartDate').value;
      const endDate = document.getElementById('bookingEndDate').value;
      const response = await fetch(`/api/cars/${this.carId}/availability?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
      const data = await response.json();
      if (!response.ok) {
        this.setNotice(data.error || 'Не удалось проверить доступность', 'error');
        return;
      }
      this.setNotice(data.available ? 'Автомобиль доступен на выбранные даты' : 'Автомобиль занят на выбранные даты', data.available ? 'success' : 'error');
    });

    document.getElementById('bookingForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const token = localStorage.getItem('carzen_token') || localStorage.getItem('token');
      const payload = {
        carId: Number(this.carId),
        customerName: document.getElementById('bookingCustomerName').value.trim(),
        customerEmail: document.getElementById('bookingCustomerEmail').value.trim(),
        customerPhone: document.getElementById('bookingCustomerPhone').value.trim(),
        startDate: document.getElementById('bookingStartDate').value,
        endDate: document.getElementById('bookingEndDate').value,
        promoCode: document.getElementById('bookingPromoCode').value.trim(),
        selectedOptionIds: this.getSelectedOptions()
      };

      try {
        const response = await fetch('/api/bookings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Не удалось создать бронь');
        }
        this.setNotice(`${data.message}. Сумма: ${new Intl.NumberFormat('ru-RU').format(data.booking.totalPrice)} ₽`, 'success');
        document.getElementById('bookingForm').reset();
        this.selectedPromo = null;
        document.getElementById('promoMeta').textContent = '';
        this.renderOptions();
        this.prefillUser();
        this.updateSummary();
      } catch (error) {
        console.error(error);
        this.setNotice(error.message || 'Ошибка бронирования', 'error');
      }
    });
  }
}

class CarReviews {
  constructor(getCarId) {
    this.getCarId = getCarId;
    this.reviewsList = document.getElementById('reviewsList');
    this.reviewForm = document.getElementById('reviewForm');
    this.authorInput = document.getElementById('reviewAuthorName');
    this.ratingInput = document.getElementById('reviewRating');
    this.textInput = document.getElementById('reviewText');
    this.formNote = document.getElementById('reviewFormNote');
    this.submitButton = this.reviewForm?.querySelector('.review-submit-btn');
  }

  init() {
    if (!this.reviewsList || !this.reviewForm) return;
    this.prefillUserName();
    this.loadReviews();
    this.reviewForm.addEventListener('submit', (event) => this.handleSubmit(event));
  }

  prefillUserName() {
    try {
      const user = JSON.parse(localStorage.getItem('carzen_user') || 'null');
      if (!user) return;
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
      if (fullName) this.authorInput.value = fullName;
    } catch (error) {
      console.error(error);
    }
  }

  async loadReviews() {
    const response = await fetch(`/api/cars/${this.getCarId()}/reviews`);
    const result = await response.json();
    if (!response.ok) {
      this.reviewsList.innerHTML = '<div class="feedback-card feedback-card-empty"><p class="feedback-text">Не удалось загрузить отзывы.</p></div>';
      return;
    }
    const reviews = result.reviews || [];
    if (!reviews.length) {
      this.reviewsList.innerHTML = '<div class="feedback-card feedback-card-empty"><p class="feedback-text">Пока опубликованных отзывов нет.</p></div>';
      return;
    }
    this.reviewsList.innerHTML = reviews.map((review) => `
      <div class="feedback-card">
        <div class="feedback-meta">
          <div>
            <p class="feedback-name">${this.escapeHtml(review.authorName)}</p>
            <div class="feedback-data">${new Date(review.publishedAt || review.createdAt).toLocaleDateString('ru-RU')}</div>
          </div>
          <div class="feedback-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
        </div>
        <p class="feedback-text">${this.escapeHtml(review.text)}</p>
      </div>
    `).join('');
  }

  async handleSubmit(event) {
    event.preventDefault();
    this.setFormState(true, 'Отправляем отзыв...');
    try {
      const token = localStorage.getItem('carzen_token') || localStorage.getItem('token');
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          carId: this.getCarId(),
          authorName: this.authorInput.value.trim(),
          rating: Number(this.ratingInput.value),
          text: this.textInput.value.trim()
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось отправить отзыв');
      this.reviewForm.reset();
      this.prefillUserName();
      this.formNote.textContent = result.message || 'Отзыв отправлен на модерацию';
      this.formNote.style.color = '#74E6FF';
    } catch (error) {
      console.error(error);
      this.formNote.textContent = error.message || 'Не удалось отправить отзыв';
      this.formNote.style.color = '#ff6b6b';
    } finally {
      this.setFormState(false, 'Отправить отзыв');
    }
  }

  setFormState(disabled, text) {
    this.submitButton.disabled = disabled;
    this.submitButton.textContent = text;
  }

  escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new CarPage().init().catch((error) => {
    console.error('Car page init error:', error);
  });
});
