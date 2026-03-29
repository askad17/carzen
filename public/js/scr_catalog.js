class FiltersModal {
    constructor() {
        this.modal = document.getElementById('filtersModal');
        this.openBtn = document.querySelector('[data-open-filters]');
        this.closeBtn = document.querySelector('.filters-close');
        this.resetBtn = document.getElementById('resetFilters');
        this.form = document.getElementById('filtersForm');
        this.selectBtns = document.querySelectorAll('.filter-select-btn');
        this.toggleBtns = document.querySelectorAll('.filter-toggle-btn');
        this.dropdowns = document.querySelectorAll('.filter-dropdown-content');
        
        this.selectedFilters = {};
        
        this.init();
    }

    init() {
        // Открытие модального окна
        if (this.openBtn) {
            this.openBtn.addEventListener('click', () => this.open());
        }

        // Закрытие
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        // Закрытие по клику вне окна
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.close();
                }
            });
        }

        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal?.classList.contains('active')) {
                this.close();
            }
        });

        // Обработка кнопок выбора (dropdown)
        this.selectBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown(btn);
            });
        });

        // Обработка опций dropdown
        document.querySelectorAll('.dropdown-option').forEach(option => {
            option.addEventListener('click', (e) => {
                this.selectOption(option);
            });
        });

        // Закрытие dropdown при клике вне
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-dropdown')) {
                this.closeAllDropdowns();
            }
        });

        // Обработка toggle кнопок
        this.toggleBtns.forEach(btn => {
            btn.addEventListener('click', () => this.handleToggle(btn));
        });

        // Сброс фильтров
        if (this.resetBtn) {
            this.resetBtn.addEventListener('click', () => this.reset());
        }

        // Отправка формы
        if (this.form) {
            this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
    }

    open() {
        if (this.modal) {
            this.modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    close() {
        if (this.modal) {
            this.modal.classList.remove('active');
            document.body.style.overflow = '';
            this.closeAllDropdowns();
        }
    }

    toggleDropdown(btn) {
        const field = btn.dataset.field;
        const dropdown = document.getElementById(`dropdown-${field}`);
        const isActive = btn.classList.contains('active');
        
        // Закрываем все dropdowns
        this.closeAllDropdowns();
        
        if (!isActive && dropdown) {
            // Открываем текущий
            btn.classList.add('active');
            dropdown.classList.add('active');
        }
    }

    closeAllDropdowns() {
        this.selectBtns.forEach(btn => {
            btn.classList.remove('active');
        });
        this.dropdowns.forEach(dropdown => {
            dropdown.classList.remove('active');
        });
    }

    selectOption(option) {
        const value = option.dataset.value;
        const text = option.textContent;
        const dropdown = option.closest('.filter-dropdown-content');
        const field = dropdown.id.replace('dropdown-', '');
        const btn = document.querySelector(`.filter-select-btn[data-field="${field}"]`);
        
        if (btn) {
            const selectText = btn.querySelector('.select-text');
            if (selectText) {
                selectText.textContent = text;
            }
            
            // Помечаем выбранную опцию
            dropdown.querySelectorAll('.dropdown-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            option.classList.add('selected');
            
            // Сохраняем выбор
            this.selectedFilters[field] = { value, text };
            
            // Закрываем dropdown
            btn.classList.remove('active');
            dropdown.classList.remove('active');
        }
    }

    handleToggle(btn) {
        const field = btn.dataset.field;
        const value = btn.dataset.value;
        const text = btn.textContent.trim();
        const groupBtns = document.querySelectorAll(`.filter-toggle-btn[data-field="${field}"]`);
        
        // Снимаем активность со всех кнопок группы
        groupBtns.forEach(b => b.classList.remove('active'));
        
        // Активируем текущую
        btn.classList.add('active');
        
        // Сохраняем выбор
        this.selectedFilters[field] = { value, text };
    }

    reset() {
        // Сброс всех select кнопок
        this.selectBtns.forEach(btn => {
            btn.classList.remove('active');
            const selectText = btn.querySelector('.select-text');
            if (selectText) {
                selectText.textContent = 'Выбрать';
            }
        });

        // Сброс всех dropdowns
        this.dropdowns.forEach(dropdown => {
            dropdown.classList.remove('active');
            dropdown.querySelectorAll('.dropdown-option').forEach(opt => {
                opt.classList.remove('selected');
            });
        });

        // Сброс всех toggle кнопок
        this.toggleBtns.forEach(btn => {
            btn.classList.remove('active');
        });

        // Сброс input полей
        const inputs = this.form.querySelectorAll('.filter-input, .filter-input-date');
        inputs.forEach(input => {
            input.value = '';
        });

        // Очистка выбранных фильтров
        this.selectedFilters = {};
    }

    handleSubmit(e) {
        e.preventDefault();
        
        // Собираем данные из input полей
        const priceFrom = document.getElementById('priceFrom')?.value;
        const priceTo = document.getElementById('priceTo')?.value;
        const date = document.getElementById('filterDate')?.value;
        
        if (priceFrom) this.selectedFilters.priceFrom = priceFrom;
        if (priceTo) this.selectedFilters.priceTo = priceTo;
        if (date) this.selectedFilters.date = date;

        console.log('Отправка фильтров:', this.selectedFilters);
        
        // Здесь логика применения фильтров
        // Например, фильтрация каталога
        
        alert('Фильтры применены! (см. консоль)');
        this.close();
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    window.filtersModal = new FiltersModal();
});

