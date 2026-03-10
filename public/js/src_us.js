document.addEventListener('DOMContentLoaded', function() {
    document.querySelector('.terms-grid').addEventListener('click', function(event) {
        const header = event.target.closest('.terms-header');
        
        if (header) {
            event.preventDefault();
            const item = header.closest('.terms-item');
            
            // Переключаем текущий
            item.classList.toggle('active');
        }
    });
});
