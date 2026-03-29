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

// Инициализация слайдера после загрузки страницы
document.addEventListener('DOMContentLoaded', function() {
    new CarGallerySlider();
});