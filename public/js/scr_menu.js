document.addEventListener('DOMContentLoaded', function() {
    // Инициализация календаря
    const dateInput = flatpickr("#dates", {
        mode: "range",           // Выбор диапазона дат
        dateFormat: "d.m.Y",     // Формат: 27.02.2026
        locale: "ru",            // Русский язык
        minDate: "today",        // Минимальная дата — сегодня
        defaultDate: [],         // Пустое значение по умолчанию
        showMonths: 2,           // Показывать 2 месяца
        animate: true,           // Анимация
        static: true,            // Прикрепить к body (чтобы не обрезался)
        
        // Кастомные классы
        onReady: function(selectedDates, dateStr, instance) {
            instance.calendarContainer.classList.add('custom-flatpickr');
        },
        
        // При закрытии
        onClose: function(selectedDates, dateStr, instance) {
            if (selectedDates.length === 2) {
                // Форматируем диапазон
                const startDate = instance.formatDate(selectedDates[0], "d.m.Y");
                const endDate = instance.formatDate(selectedDates[1], "d.m.Y");
                instance.input.value = `${startDate} — ${endDate}`;
            }
            }
    });
    
    // Обработка кнопки поиска
    const searchBtn = document.querySelector('.search-btn');
    const citySelect = document.getElementById('city');
    const brandSelect = document.getElementById('brand');
    
    searchBtn.addEventListener('click', function() {
        const city = citySelect.value;
        const dates = document.getElementById('dates').value;
        const brand = brandSelect.value;
        
        if (!city || !dates || !brand) {
            // Анимация ошибки
            const emptyFields = [];
            if (!city) emptyFields.push(citySelect.parentElement);
            if (!dates) emptyFields.push(document.getElementById('dates').parentElement);
            if (!brand) emptyFields.push(brandSelect.parentElement);
            
            emptyFields.forEach(field => {
                field.style.animation = 'shake 0.5s ease';
                field.querySelector('input, select').style.borderColor = '#ff4444';
                setTimeout(() => {
                    field.style.animation = '';
                    field.querySelector('input, select').style.borderColor = '';
                }, 500);
            });
            
            return;
        }
        // Успешная валидация
        console.log('Поиск:', { city, dates, brand });
        // Здесь можно добавить перенаправление или AJAX запрос
    });
});