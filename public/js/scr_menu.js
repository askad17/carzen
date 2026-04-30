function parseDateRange(value) {
  const parts = String(value || '').split('—').map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return {};
  const [start, end] = parts.map((part) => {
    const [day, month, year] = part.split('.');
    if (!day || !month || !year) return '';
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  });
  return { startDate: start, endDate: end };
}

function renderHomeCarCard(car) {
  const image = Array.isArray(car.gallery) && car.gallery.length ? car.gallery[0] : car.imageUrl;
  return `
    <a href="/public/html/kia-card.html?id=${car.id}">
      <div class="rent-card dynamic-car-card" style="background-image:url('${image}')">
        <div class="up-block">
          <p class="card-title">${car.title}</p>
          <div class="advice">Совет дня</div>
        </div>
        <div class="down-block">
          <p class="price">${new Intl.NumberFormat('ru-RU').format(car.pricePerDay)}</p>
          <p class="mileage">${car.mileage ? `${new Intl.NumberFormat('ru-RU').format(car.mileage)} км пробега` : 'Отличное состояние'}</p>
          <div class="down-left">
            <div class="people">${car.seats || 5}</div>
            <div class="box">${car.transmission || 'АКПП'}</div>
          </div>
        </div>
      </div>
    </a>
  `;
}

async function loadHomeCars() {
  const grid = document.getElementById('homeCarsGrid');
  if (!grid) return;
  try {
    const response = await fetch('/api/cars');
    const data = await response.json();
    const cars = (data.cars || []).slice(0, 4);
    grid.innerHTML = cars.map(renderHomeCarCard).join('') || '<p class="feedback-text">Автомобили скоро появятся.</p>';
  } catch (error) {
    console.error('Home cars error:', error);
    grid.innerHTML = '<p class="feedback-text">Не удалось загрузить автомобили.</p>';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  flatpickr('#dates', {
    mode: 'range',
    dateFormat: 'd.m.Y',
    minDate: 'today',
    showMonths: 2,
    static: true,
    onClose(selectedDates, dateStr, instance) {
      if (selectedDates.length === 2) {
        const startDate = instance.formatDate(selectedDates[0], 'd.m.Y');
        const endDate = instance.formatDate(selectedDates[1], 'd.m.Y');
        instance.input.value = `${startDate} — ${endDate}`;
      }
    }
  });

  loadHomeCars();

  const searchBtn = document.querySelector('.search-btn');
  searchBtn?.addEventListener('click', function() {
    const city = document.getElementById('city')?.value || '';
    const brand = document.getElementById('brand')?.value || '';
    const dates = document.getElementById('dates')?.value || '';
    const parsedDates = parseDateRange(dates);

    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (brand) params.set('brand', brand);
    if (parsedDates.startDate) params.set('startDate', parsedDates.startDate);
    if (parsedDates.endDate) params.set('endDate', parsedDates.endDate);

    window.location.href = `/public/html/catalog.html?${params.toString()}`;
  });
});
