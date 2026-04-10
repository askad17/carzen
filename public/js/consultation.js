document.addEventListener('DOMContentLoaded', function() {
    const consultationForm = document.getElementById('consultationForm');
    const submitBtn = document.querySelector('.submit-btn');
    const formNote = document.querySelector('.form-note');

    consultationForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const formData = {
            city: document.getElementById('consultCity').value,
            name: document.getElementById('consultName').value,
            phone: document.getElementById('consultPhone').value
        };

        submitBtn.textContent = 'Отправляем...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/consultation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok) {
                // Успех
                formNote.textContent = result.message;
                formNote.style.color = '#74E6FF';
                consultationForm.reset();
            } else {
                // Ошибка
                formNote.textContent = result.error || 'Ошибка отправки';
                formNote.style.color = '#dc3545';
            }
        } catch (error) {
            console.error('Ошибка:', error);
            formNote.textContent = 'Не удалось подключиться к серверу';
            formNote.style.color = '#dc3545';
        } finally {
            // Возвращаем кнопку в исходное состояние
            submitBtn.textContent = 'Отправить';
            submitBtn.disabled = false;
        }
    });
});
