class CatalogPage {
  constructor() {
    this.modal = document.getElementById('filtersModal');
    this.form = document.getElementById('filtersForm');
    this.grid = document.getElementById('catalogGrid');
    this.summary = document.getElementById('catalogSummary');
    this.urlParams = new URLSearchParams(window.location.search);
    this.filters = this.readFiltersFromUrl();
  }

  init() {
    document.querySelector('[data-open-filters]')?.addEventListener('click', () => this.openModal());
    document.querySelector('.filters-close')?.addEventListener('click', () => this.closeModal());
    document.getElementById('resetFilters')?.addEventListener('click', () => this.resetFilters());
    document.getElementById('catalogResetBtn')?.addEventListener('click', () => this.resetFilters());
    this.modal?.addEventListener('click', (event) => {
      if (event.target === this.modal) this.closeModal();
    });
    this.form?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.filters = this.readFiltersFromForm();
      this.writeFiltersToUrl();
      this.loadCars();
      this.closeModal();
    });
    this.fillForm();
    this.loadCars();
  }

  openModal() {
    this.modal?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  closeModal() {
    this.modal?.classList.remove('active');
    document.body.style.overflow = '';
  }

  readFiltersFromUrl() {
    return {
      city: this.urlParams.get('city') || '',
      brand: this.urlParams.get('brand') || '',
      startDate: this.urlParams.get('startDate') || '',
      endDate: this.urlParams.get('endDate') || '',
      minPrice: this.urlParams.get('minPrice') || '',
      maxPrice: this.urlParams.get('maxPrice') || '',
      fuelType: this.urlParams.get('fuelType') || '',
      transmission: this.urlParams.get('transmission') || '',
      driveType: this.urlParams.get('driveType') || '',
      bodyType: this.urlParams.get('bodyType') || '',
      seats: this.urlParams.get('seats') || ''
    };
  }

  readFiltersFromForm() {
    return {
      city: document.getElementById('filterCity')?.value.trim() || '',
      brand: document.getElementById('filterBrand')?.value.trim() || '',
      startDate: document.getElementById('filterStartDate')?.value || '',
      endDate: document.getElementById('filterEndDate')?.value || '',
      minPrice: document.getElementById('priceFrom')?.value || '',
      maxPrice: document.getElementById('priceTo')?.value || '',
      fuelType: document.getElementById('filterFuel')?.value.trim() || '',
      transmission: document.getElementById('filterTransmission')?.value.trim() || '',
      driveType: document.getElementById('filterDriveType')?.value.trim() || '',
      bodyType: document.getElementById('filterBodyType')?.value.trim() || '',
      seats: document.getElementById('filterSeats')?.value || ''
    };
  }

  fillForm() {
    document.getElementById('filterCity').value = this.filters.city;
    document.getElementById('filterBrand').value = this.filters.brand;
    document.getElementById('filterStartDate').value = this.filters.startDate;
    document.getElementById('filterEndDate').value = this.filters.endDate;
    document.getElementById('priceFrom').value = this.filters.minPrice;
    document.getElementById('priceTo').value = this.filters.maxPrice;
    document.getElementById('filterFuel').value = this.filters.fuelType;
    document.getElementById('filterTransmission').value = this.filters.transmission;
    document.getElementById('filterDriveType').value = this.filters.driveType;
    document.getElementById('filterBodyType').value = this.filters.bodyType;
    document.getElementById('filterSeats').value = this.filters.seats;
  }

  writeFiltersToUrl() {
    const params = new URLSearchParams();
    Object.entries(this.filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }

  resetFilters() {
    this.filters = {
      city: '',
      brand: '',
      startDate: '',
      endDate: '',
      minPrice: '',
      maxPrice: '',
      fuelType: '',
      transmission: '',
      driveType: '',
      bodyType: '',
      seats: ''
    };
    this.fillForm();
    this.writeFiltersToUrl();
    this.loadCars();
  }

  renderCard(car) {
    const image = Array.isArray(car.gallery) && car.gallery.length ? car.gallery[0] : car.imageUrl;
    return `
      <a href="/public/html/kia-card.html?id=${car.id}">
        <div class="rent-card dynamic-car-card" style="background-image:url('${image}')">
          <div class="up-block">
            <p class="card-title">${car.title}</p>
            <div class="advice">${car.city || 'Carzen'}</div>
          </div>
          <div class="down-block">
            <p class="price">${new Intl.NumberFormat('ru-RU').format(car.pricePerDay)}</p>
            <p class="mileage">${car.mileage ? `${new Intl.NumberFormat('ru-RU').format(car.mileage)} км пробега` : 'Авто готово к аренде'}</p>
            <div class="down-left">
              <div class="people">${car.seats || 5}</div>
              <div class="box">${car.transmission || 'АКПП'}</div>
            </div>
          </div>
        </div>
      </a>
    `;
  }

  async loadCars() {
    try {
      const params = new URLSearchParams();
      Object.entries(this.filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const response = await fetch(`/api/cars?${params.toString()}`);
      const data = await response.json();
      const cars = data.cars || [];
      this.summary.textContent = cars.length ? `Найдено автомобилей: ${cars.length}` : 'Автомобили по выбранным фильтрам не найдены';
      this.grid.innerHTML = cars.map((car) => this.renderCard(car)).join('') || '<p class="feedback-text">Попробуйте изменить фильтры.</p>';
    } catch (error) {
      console.error('Catalog load error:', error);
      this.grid.innerHTML = '<p class="feedback-text">Не удалось загрузить каталог.</p>';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new CatalogPage().init();
});
