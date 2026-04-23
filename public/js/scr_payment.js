function paymentTokenFromUrl() {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1];
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
      payButton.textContent = 'Уже оплачено';
      paymentNote.textContent = 'Бронирование уже оплачено.';
      return;
    }

    payButton.addEventListener('click', async () => {
      payButton.disabled = true;
      payButton.textContent = 'Оплачиваем...';
      const payResponse = await fetch(`/api/bookings/pay/${token}`, { method: 'POST' });
      const payData = await payResponse.json();
      if (!payResponse.ok) {
        throw new Error(payData.error || 'Ошибка оплаты');
      }
      paymentNote.textContent = `${payData.message}${payData.emailPreview ? ` Письмо сохранено: ${payData.emailPreview}` : ''}`;
      payButton.textContent = 'Оплачено';
    });
  } catch (error) {
    console.error('Payment page error:', error);
    paymentInfo.textContent = error.message;
    payButton.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', loadPaymentPage);
