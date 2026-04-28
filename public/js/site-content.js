document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/api/site-content');
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const content = data.content || {};

    document.querySelectorAll('[data-content-key]').forEach((element) => {
      const key = element.dataset.contentKey;
      if (!content[key]) {
        return;
      }

      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = content[key];
        return;
      }

      element.textContent = content[key];

      if (element.tagName === 'A' && key === 'support_phone') {
        element.href = `tel:${String(content[key]).replace(/[^\d+]/g, '')}`;
      }

      if (element.tagName === 'A' && key === 'support_email') {
        element.href = `mailto:${content[key]}`;
      }
    });
  } catch (error) {
    console.error('Не удалось загрузить контент сайта:', error);
  }
});
