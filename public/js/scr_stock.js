document.addEventListener('DOMContentLoaded', function() {
    const promoCode = document.getElementById('promoCode');
    const notification = document.getElementById('copyNotification');
    let notificationTimeout;
    
    if (promoCode) {
        promoCode.addEventListener('click', async function() {
            // Получаем текст промокода (без кавычек)
            const code = this.textContent.replace(/"/g, '').trim();
            
            try {
                // Копирование в буфер обмена
                await navigator.clipboard.writeText(code);
                
                // Показываем уведомление
                showNotification();
                
                // Визуальный эффект на промокоде
                this.classList.add('copied');
                
                // Убираем эффект через 2 секунды
                setTimeout(() => {
                    this.classList.remove('copied');
                }, 2000);
                
            } catch (err) {
                // Фолбэк для старых браузеров
                fallbackCopy(code);
            }
        });
    }
    
    function showNotification() {
        // Показываем уведомление
        notification.classList.add('show');
        
        // Скрываем через 2 секунды
        clearTimeout(notificationTimeout);
        notificationTimeout = setTimeout(() => {
            notification.classList.remove('show');
        }, 2000);
    }
    
    function fallbackCopy(text) {
        // Создаем временный textarea
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            showNotification();
        } catch (err) {
            console.error('Не удалось скопировать:', err);
            alert('Промокод: ' + text);
        }
        
        document.body.removeChild(textarea);
    }
});