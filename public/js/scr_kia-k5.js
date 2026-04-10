class CarGallerySlider {
    constructor() {
        this.gallery = document.querySelector('.car-gallery');
        this.mainImage = document.querySelector('.main-car-image');
        this.prevBtn = document.querySelector('.gallery-nav.prev');
        this.nextBtn = document.querySelector('.gallery-nav.next');
        this.dots = document.querySelectorAll('.dot');
        this.currentIndex = 0;
        
        // Массив изображений
        this.images = [
            '/image/kia-k5.png',   
            '/image/kia-k5-2.png',    
            '/image/kia-cabin.png'     
        ];
        
        this.init();
    }
    
    init() {
        // Обработчики кнопок
        if (this.prevBtn) {
            this.prevBtn.addEventListener('click', () => this.prev());
        }
        
        if (this.nextBtn) {
            this.nextBtn.addEventListener('click', () => this.next());
        }
        
        // Обработчики точек
        this.dots.forEach((dot, index) => {
            dot.addEventListener('click', () => this.goToSlide(index));
        });
        
        // Загрузка первого изображения
        this.loadImage(this.currentIndex);
    }
    
    loadImage(index) {
        if (!this.mainImage) return;
        
        // Добавление эффекта исчезновения
        this.mainImage.style.opacity = '0';
        this.mainImage.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            // Изменение изображения
            this.mainImage.src = this.images[index];
            
            // После загрузки нового изображения
            this.mainImage.onload = () => {
                this.mainImage.style.opacity = '1';
                this.mainImage.style.transform = 'scale(1)';
            };
        }, 300);
        
        // Обновляем точки
        this.updateDots();
    }
    
    next() {
        this.currentIndex = (this.currentIndex + 1) % this.images.length;
        this.loadImage(this.currentIndex);
    }
    
    prev() {
        this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
        this.loadImage(this.currentIndex);
    }
    
    goToSlide(index) {
        this.currentIndex = index;
        this.loadImage(this.currentIndex);
    }
    
    updateDots() {
        this.dots.forEach((dot, index) => {
            if (index === this.currentIndex) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }
    
    startAutoPlay(interval = 5000) {
        setInterval(() => {
            this.next();
        }, interval);
    }
}

class CarReviews {
    constructor() {
        this.pageSection = document.querySelector('.car-details-section');
        this.carId = this.pageSection?.dataset.carId || 'kia-k5';
        this.reviewsList = document.getElementById('reviewsList');
        this.reviewForm = document.getElementById('reviewForm');
        this.authorInput = document.getElementById('reviewAuthorName');
        this.ratingInput = document.getElementById('reviewRating');
        this.textInput = document.getElementById('reviewText');
        this.formNote = document.getElementById('reviewFormNote');
        this.submitButton = this.reviewForm?.querySelector('.review-submit-btn');
        this.token = localStorage.getItem('carzen_token') || localStorage.getItem('token');
    }

    init() {
        if (!this.reviewsList || !this.reviewForm) {
            return;
        }

        this.prefillUserName();
        this.loadReviews();
        this.reviewForm.addEventListener('submit', (event) => this.handleSubmit(event));
    }

    prefillUserName() {
        try {
            const rawUser = localStorage.getItem('carzen_user');
            if (!rawUser || !this.authorInput) {
                return;
            }

            const user = JSON.parse(rawUser);
            const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
            if (fullName) {
                this.authorInput.value = fullName;
            }
        } catch (error) {
            console.error('Не удалось заполнить имя пользователя:', error);
        }
    }

    async loadReviews() {
        try {
            const response = await fetch(`/api/cars/${this.carId}/reviews`);
            const result = await this.readJsonSafely(response);

            if (!response.ok) {
                throw new Error(result.error || 'Не удалось загрузить отзывы');
            }

            this.renderReviews(result.reviews || []);
        } catch (error) {
            console.error('Ошибка загрузки отзывов:', error);
            this.reviewsList.innerHTML = `
                <div class="feedback-card feedback-card-empty">
                    <p class="feedback-text">Не удалось загрузить отзывы. Попробуйте обновить страницу немного позже.</p>
                </div>
            `;
        }
    }

    renderReviews(reviews) {
        if (!reviews.length) {
            this.reviewsList.innerHTML = `
                <div class="feedback-card feedback-card-empty">
                    <p class="feedback-text">Пока опубликованных отзывов нет. Вы можете стать первым, кто поделится впечатлением об автомобиле.</p>
                </div>
            `;
            return;
        }

        this.reviewsList.innerHTML = reviews.map((review) => `
            <div class="feedback-card">
                <div class="feedback-meta">
                    <div>
                        <p class="feedback-name">${this.escapeHtml(review.authorName)}</p>
                        <div class="feedback-data">${this.formatDate(review.publishedAt || review.createdAt)}</div>
                    </div>
                    <div class="feedback-rating" aria-label="Оценка ${review.rating} из 5">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
                </div>
                <p class="feedback-text">${this.escapeHtml(review.text)}</p>
            </div>
        `).join('');
    }

    async handleSubmit(event) {
        event.preventDefault();

        const payload = {
            carId: this.carId,
            authorName: this.authorInput.value.trim(),
            rating: Number(this.ratingInput.value),
            text: this.textInput.value.trim()
        };

        this.setFormState(true, 'Отправляем отзыв...');

        try {
            const headers = {
                'Content-Type': 'application/json'
            };

            if (this.token) {
                headers.Authorization = `Bearer ${this.token}`;
            }

            const response = await fetch('/api/reviews', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            const result = await this.readJsonSafely(response);

            if (!response.ok) {
                throw new Error(result.error || 'Не удалось отправить отзыв');
            }

            this.reviewForm.reset();
            this.prefillUserName();
            this.formNote.textContent = result.message || 'Отзыв отправлен на модерацию';
            this.formNote.style.color = '#74E6FF';
        } catch (error) {
            console.error('Ошибка отправки отзыва:', error);
            this.formNote.textContent = error.message || 'Не удалось отправить отзыв';
            this.formNote.style.color = '#ff6b6b';
        } finally {
            this.setFormState(false, 'Отправить отзыв');
        }
    }

    setFormState(isSubmitting, buttonText) {
        if (this.submitButton) {
            this.submitButton.textContent = buttonText;
            this.submitButton.disabled = isSubmitting;
        }
    }

    formatDate(value) {
        if (!value) {
            return '';
        }

        return new Date(value).toLocaleDateString('ru-RU');
    }

    async readJsonSafely(response) {
        const rawText = await response.text();

        if (!rawText) {
            return {};
        }

        try {
            return JSON.parse(rawText);
        } catch (error) {
            console.error('Сервер вернул не JSON:', rawText);
            throw new Error('Сервер вернул некорректный ответ');
        }
    }

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    new CarGallerySlider();
    new CarReviews().init();
});
