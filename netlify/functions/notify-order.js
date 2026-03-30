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

  const orderType = data.orderType || 'tailored';
  const orderId = data.orderId || '';
  const customerName = data.customerName || '';
  const customerPhone = data.customerPhone || '';
  const shortId = orderId ? `#${orderId.slice(-6).toUpperCase()}` : '#—';

  let text;

  if (orderType === 'ready-made') {
    // ---- Ready-Made Order ----
    const { itemName = '', imageUrl = '', price = 0, size = '', color = '' } = data;
    const lines = [
      '🆕 طلب دشداشة جاهزة!',
      '━━━━━━━━━━━━━━━━',
      `📋 رقم الطلب: ${shortId}`,
    ];
    if (customerName) lines.push(`👤 الاسم: ${customerName}`);
    if (customerPhone) {
      lines.push(`📱 الهاتف: ${customerPhone}`);
      const cleanPhone = customerPhone.replace(/[^0-9]/g, '');
      lines.push(`💬 واتساب: https://wa.me/${cleanPhone}`);
    }
    lines.push('━━━━━━━━━━━━━━━━');
    if (itemName) lines.push(`👔 المنتج: ${itemName}`);
    if (price) lines.push(`💰 السعر: ${Number(price).toLocaleString()} د.ع`);
    if (size) lines.push(`📏 المقاس: ${size}`);
    if (color) lines.push(`🎨 اللون: ${color}`);
    if (imageUrl) lines.push(`🖼️ الصورة: ${imageUrl}`);
    text = lines.join('\n');

  } else {
    // ---- Tailored Order ----
    const {
      measurements = [], fabricUrl = '', notes = '',
      dishdashaType = '', collarType = '', pocketType = '', sleeveType = ''
    } = data;

    const measureLabels = ['الطول الكلي', 'الصدر', 'الكتف', 'الياخة', 'طول الردن', 'عرض الردن'];
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

    lines.push('━━━━━━━━━━━━━━━━', '📐 القياسات (سم):', measureLines, '━━━━━━━━━━━━━━━━');

    const dishdashaLabels = {
      'iraqi1': 'عراقي سحاب', 'iraqi2': 'عراقي ظاهري', 'iraqi3': 'عراقي مخفي',
      'kuwaiti1': 'كويتي مخفي', 'kuwaiti2': 'كويتي ظاهري', 'kuwaiti3': 'كويتي مخفي (حشوه)'
    };
    if (dishdashaType) lines.push(`🪡 نوع الدشداشة: ${dishdashaLabels[dishdashaType] || dishdashaType}`);

    const collarLabels = { '1': 'ياخة قميص كبيرة', '2': 'ياخة قميص وسط', '3': 'ياخة دگمة وحدة', '4': 'ياخة دگمتين', '5': 'ياخة فراشة' };
    if (collarType) lines.push(`👔 نوع الياخة: ${collarLabels[collarType] || collarType}`);

    const pocketLabels = { '1': 'جيب ١', '2': 'جيب ٢', '3': 'جيب ٣', '4': 'جيب ٤' };
    if (pocketType) lines.push(`🧥 نوع الجيب: ${pocketLabels[pocketType] || pocketType}`);

    const sleeveLabels = { 'flat': 'فلات', 'bazma': 'بزمة' };
    if (sleeveType) lines.push(`🫲 نوع الردن: ${sleeveLabels[sleeveType] || sleeveType}`);

    if (fabricUrl) lines.push(`🧵 القماش: ${fabricUrl}`);
    if (notes) lines.push(`📝 ملاحظات: ${notes}`);
    text = lines.join('\n');
  }

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
