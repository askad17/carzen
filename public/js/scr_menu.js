document.addEventListener('DOMContentLoaded', function() {
    
    const dateInput = flatpickr("#dates", {
        mode: "range",          
        dateFormat: "d.m.Y",    
        locale: "ru",            
        minDate: "today",        
        defaultDate: [],         
        showMonths: 2,          
        animate: true,          
        static: true,           
        
        onReady: function(selectedDates, dateStr, instance) {
            instance.calendarContainer.classList.add('custom-flatpickr');
        },

        onClose: function(selectedDates, dateStr, instance) {
            if (selectedDates.length === 2) {
                const startDate = instance.formatDate(selectedDates[0], "d.m.Y");
                const endDate = instance.formatDate(selectedDates[1], "d.m.Y");
                instance.input.value = `${startDate} — ${endDate}`;
            }
            }
    });
    
   
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

        console.log('Поиск:', { city, dates, brand });

    });
});