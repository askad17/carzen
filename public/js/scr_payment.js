function paymentTokenFromUrl() {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1];
}

async function pollBookingStatus(token, paymentNote, payButton) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const response = await fetch(`/api/bookings/pay/${token}`);
      const data = await response.json();
      if (!response.ok) break;
      const booking = data.booking;
      if (booking.status === 'paid') {
        paymentNote.textContent = 'Оплата подтверждена. Статус: оплачен.';
        payButton.disabled = true;
        payButton.textContent = 'Оплачено';
        return;
      }
    } catch (error) {
      break;
    }
  }
  paymentNote.textContent = 'Оплата пока не подтверждена. Страница обновится автоматически через несколько секунд.';
}

async function loadPaymentPage() {
  const token = paymentTokenFromUrl();
  const paymentInfo = document.getElementById('paymentInfo');
  const paymentNote = document.getElementById('paymentNote');
  const payButton = document.getElementById('payButton');

  try {
    const response = await fetch(`/api/bookings/pay/${token}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить оплату');

    const booking = data.booking;
    paymentInfo.innerHTML = `
      <div>Автомобиль: ${booking.car?.title || '-'}</div>
      <div>Клиент: ${booking.customerName}</div>
      <div>Даты: ${booking.startDate} - ${booking.endDate}</div>
      <div>Сумма: ${new Intl.NumberFormat('ru-RU').format(booking.totalPrice)} руб.</div>
      <div>Статус: ${booking.status}</div>
    `;

    if (booking.status === 'paid') {
      payButton.disabled = true;
      payButton.textContent = 'Оплачено';
      paymentNote.textContent = 'Бронирование уже оплачено.';
      return;
    }

    if (booking.paymentGatewayUrl) {
      paymentNote.textContent = 'Оплата ожидает подтверждения. Если вы только что оплатили, подождите несколько секунд.';
      pollBookingStatus(token, paymentNote, payButton);
    }

    payButton.addEventListener('click', async () => {
      payButton.disabled = true;
      payButton.textContent = 'Подготовка оплаты...';
      const payResponse = await fetch(`/api/bookings/pay/${token}`, { method: 'POST' });
      const payData = await payResponse.json();
      if (!payResponse.ok) {
        throw new Error(payData.error || 'Ошибка оплаты');
      }
      if (payData.paymentUrl) {
        paymentNote.textContent = 'Перенаправляем на безопасную страницу оплаты...';
        window.location.href = payData.paymentUrl;
        return;
      }
      paymentNote.textContent = payData.message || 'Платёж создан.';
      payButton.textContent = 'Оплатить';
      payButton.disabled = false;
    });
  } catch (error) {
    console.error('Payment page error:', error);
    paymentInfo.textContent = error.message;
    payButton.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', loadPaymentPage);
