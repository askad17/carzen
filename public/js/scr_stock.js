// === ФУНКЦИИ ДЛЯ СТРАНИЦЫ АКЦИЙ ===

let siteContent = {};

// Загрузка контента
async function loadStockContent() {
  try {
    const response = await fetch('/api/site-content');
    const data = await response.json();
    siteContent = data.content || {};
    
    // Обновляем текст промокода
    const promoCode = document.getElementById('promoCode');
    if (promoCode) {
      const code = siteContent.promo_code || 'FIRSTCARZEN';
      promoCode.textContent = `"${code}"`;
      promoCode.dataset.code = code;
    }
  } catch (error) {
    console.error('Error loading stock content:', error);
  }
}

// Копирование промокода
function setupPromoCopy() {
  const promoCode = document.getElementById('promoCode');
  if (!promoCode) return;
  
  promoCode.style.cursor = 'pointer';
  promoCode.style.userSelect = 'none';
  
  promoCode.addEventListener('click', async () => {
    const code = promoCode.dataset.code || 'FIRSTCARZEN';
    // Удаляем кавычки, если они есть
    const cleanCode = code.replace(/[""]/g, '');
    
    try {
      await navigator.clipboard.writeText(cleanCode);
      
      // Показываем уведомление
      const notification = document.getElementById('copyNotification');
      if (notification) {
        notification.classList.add('show');
        setTimeout(() => {
          notification.classList.remove('show');
        }, 2000);
      }
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      alert(`Промокод: ${cleanCode}`);
    }
  });
}

async function loadStockPromotions() {
  try {
    const response = await fetch('/api/stock/promotions');
    const data = await response.json();
    const grid = document.getElementById('stockPromoGrid');
    const empty = document.getElementById('stockEmpty');
    if (!grid) return;
    if (!data.promotions || !data.promotions.length) {
      grid.innerHTML = '';
      if (empty) empty.textContent = 'Сейчас нет активных акций';
      return;
    }

    if (empty) empty.textContent = '';
    grid.innerHTML = data.promotions.map((promo) => {
      const car = promo.car || {};
      const imageUrl = car.imageUrl || '/image/avatar.png';
      const title = car.title || 'Автомобиль';
      const subtitle = promo.title || `${car.brand || ''} ${car.model || ''}`.trim() || 'Акция';
      return `
        <div class="rent-card" style="background-image:url('${imageUrl}'); background-size: cover; background-position: center;">
          <div class="up-block">
            <p class="card-title">${title}</p>
            <div class="advice">${subtitle}</div>
          </div>
          <div class="down-block">
            <p class="price">${new Intl.NumberFormat('ru-RU').format(promo.promoPrice)} ₽</p>
            <p class="mileage">${car.mileage ? `${car.mileage} км пробега` : ''}</p>
            <div class="down-left">
              <div class="people">${car.seats || '-'}</div>
              <div class="box">${car.transmission || '-'}</div>
            </div>
            <div class="right">
              <a class="btn-promo" href="/public/html/kia-card.html?id=${promo.carId}">Подробнее</a>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (error) {
    console.error('Error loading stock promotions:', error);
  }
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
  await loadStockContent();
  setupPromoCopy();
  await loadStockPromotions();
});