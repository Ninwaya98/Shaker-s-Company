// Telegram Order Notification — Netlify Function
// Sends new order details to a Telegram group via Bot API

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TOKEN || !CHAT_ID) {
    return { statusCode: 500, body: 'Telegram not configured' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const {
    orderId = '',
    customerName = '',
    customerPhone = '',
    measurements = [],
    fabricUrl = '',
    notes = '',
    collarType = '',
    pocketType = '',
    siteUrl = ''
  } = data;

  const shortId = orderId ? `#${orderId.slice(-6).toUpperCase()}` : '#—';

  const measureLabels = [
    'الطول الكلي', 'الصدر', 'الكتف',
    'الياخة', 'طول الردن', 'عرض الردن'
  ];

  const measureLines = measurements.map((m, i) => {
    const label = m.label || measureLabels[i] || '';
    const value = m.value || '—';
    return `• ${label}: ${value}`;
  }).join('\n');

  const lines = [
    '🆕 طلب فصال جديد!',
    '━━━━━━━━━━━━━━━━',
    `📋 رقم الطلب: ${shortId}`,
  ];

  if (customerName) lines.push(`👤 الاسم: ${customerName}`);
  if (customerPhone) {
    lines.push(`📱 الهاتف: ${customerPhone}`);
    const cleanPhone = customerPhone.replace(/[^0-9]/g, '');
    lines.push(`💬 واتساب: https://wa.me/${cleanPhone}`);
  }

  lines.push(
    '━━━━━━━━━━━━━━━━',
    '📐 القياسات (سم):',
    measureLines,
    '━━━━━━━━━━━━━━━━'
  );

  // Collar & Pocket SVG filenames (some have spaces in them)
  const collarFiles = { '1': 'neck1.svg', '2': 'neck 2.svg', '3': 'neck 3.svg', '4': 'neck4.svg', '5': 'neck5.svg' };
  const pocketFiles = { '1': 'pocket1.svg', '2': 'pocket2.svg', '3': 'pocket 3.svg', '4': 'pocket 4.svg' };

  if (collarType) {
    const file = collarFiles[collarType];
    const imgUrl = siteUrl && file ? `${siteUrl}/assets/${encodeURIComponent(file)}` : '';
    lines.push(`👔 نوع الياخة: ياخة ${collarType}${imgUrl ? '\n🔗 ' + imgUrl : ''}`);
  }
  if (pocketType) {
    const file = pocketFiles[pocketType];
    const imgUrl = siteUrl && file ? `${siteUrl}/assets/${encodeURIComponent(file)}` : '';
    lines.push(`🧥 نوع الجيب: جيب ${pocketType}${imgUrl ? '\n🔗 ' + imgUrl : ''}`);
  }

  if (fabricUrl) lines.push(`🧵 القماش: ${fabricUrl}`);
  if (notes) lines.push(`📝 ملاحظات: ${notes}`);

  const text = lines.join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        disable_web_page_preview: false
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Telegram API error:', err);
      return { statusCode: 502, body: 'Telegram send failed' };
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Telegram fetch error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
