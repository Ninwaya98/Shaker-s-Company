// Public Site — Gallery Logic (uses Firestore REST API)
const API_KEY    = "AIzaSyBV3KD5Hsd06PAkRxHoRcVKSM5TFUfD4ec";
const PROJECT    = "shaker-s-dishdasha";
const FS_BASE    = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const QUERY_URL  = `${FS_BASE}:runQuery?key=${API_KEY}`;
const ORDERS_URL = `${FS_BASE}/orders?key=${API_KEY}`;
const WA_NUMBER  = "9647730666777";

// ---- Firestore REST helper ----
async function fsQuery(structuredQuery) {
  const res = await fetch(QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery })
  });
  if (!res.ok) throw new Error(`Firestore error ${res.status}`);
  const rows = await res.json();
  return rows.filter(r => r.document);
}

function field(doc, key) {
  const f = doc.fields?.[key];
  if (!f) return '';
  return f.stringValue ?? f.integerValue ?? f.doubleValue ?? '';
}

function fieldArray(doc, key) {
  const f = doc.fields?.[key];
  if (!f || !f.arrayValue || !f.arrayValue.values) return [];
  return f.arrayValue.values.map(v => v.stringValue || '');
}

// ---- Modal Elements ----
const modal             = document.getElementById('image-modal');
const modalImage        = document.getElementById('modal-image');
const modalDesc         = document.getElementById('modal-desc');
const modalWA           = document.getElementById('modal-whatsapp');
const modalClose        = document.getElementById('modal-close');
const modalCancel       = document.getElementById('modal-cancel');
const modalSelectFabric = document.getElementById('modal-select-fabric');
const modalRmOrder      = document.getElementById('modal-readymade-order');
const modalRmPrice      = document.getElementById('modal-rm-price');
const modalRmSize       = document.getElementById('modal-rm-size');
const modalRmColor      = document.getElementById('modal-rm-color');
const modalRmName       = document.getElementById('modal-rm-name');
const modalRmPhone      = document.getElementById('modal-rm-phone');
const modalRmError      = document.getElementById('modal-rm-error');
const modalRmSubmit     = document.getElementById('modal-rm-submit');
const modalRmConfirm    = document.getElementById('modal-rm-confirmation');

let currentModalData = null;

function openModal(imgSrc, label, waLink, category, price = 0, itemData = null) {
  currentModalData = { url: imgSrc, label, price, category, itemData };
  modalImage.src        = imgSrc;
  modalImage.alt        = label;
  modalDesc.textContent = label;
  modalWA.href          = waLink;

  // Hide all action variants
  modalSelectFabric.style.display = 'none';
  modalWA.style.display = 'none';
  modalRmOrder.style.display = 'none';
  document.querySelector('.modal-actions').style.display = '';

  if (category === 'tailored') {
    modalSelectFabric.style.display = 'inline-flex';
  } else if (category === 'ready-made' && itemData) {
    document.querySelector('.modal-actions').style.display = 'none';
    modalRmOrder.style.display = 'block';
    // Populate price
    modalRmPrice.textContent = price > 0 ? `${price.toLocaleString()} د.ع` : '';
    modalRmPrice.style.display = price > 0 ? '' : 'none';
    // Populate size dropdown
    modalRmSize.innerHTML = '<option value="">اختر المقاس</option>';
    (itemData.sizes || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      modalRmSize.appendChild(opt);
    });
    // Populate color dropdown
    modalRmColor.innerHTML = '<option value="">اختر اللون</option>';
    (itemData.colors || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      modalRmColor.appendChild(opt);
    });
    // Reset form state
    modalRmName.value = '';
    modalRmPhone.value = '';
    modalRmError.style.display = 'none';
    modalRmSubmit.style.display = '';
    modalRmConfirm.style.display = 'none';
    // Disable if out of stock
    if (itemData.quantity <= 0) {
      modalRmSubmit.disabled = true;
      modalRmSubmit.textContent = 'نفذت الكمية';
    } else {
      modalRmSubmit.disabled = false;
      modalRmSubmit.textContent = 'أرسل الطلب';
    }
  } else {
    modalWA.style.display = 'inline-flex';
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  modalClose.focus();
}

function closeModal() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
  modalImage.src = '';
  currentModalData = null;
  // Reset ready-made form
  modalRmOrder.style.display = 'none';
  modalRmError.style.display = 'none';
  document.querySelectorAll('.rm-field').forEach(f => f.classList.remove('input-error'));
  document.querySelector('.modal-actions').style.display = '';
}

modalWA.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => {
  if (!modal.classList.contains('open')) return;
  if (e.key === 'Escape') { closeModal(); return; }
  // Focus trap: keep Tab within modal
  if (e.key === 'Tab') {
    const focusable = modal.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
});

// ---- Measurement Video ----
const videoOverlay = document.getElementById('video-overlay');
const videoEl      = document.getElementById('measure-video');
const videoClose   = document.getElementById('video-close');

document.getElementById('watch-video-btn').addEventListener('click', () => {
  videoOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  videoEl.play().catch(() => {});
});

function closeVideo() {
  videoEl.pause();
  videoOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

videoClose.addEventListener('click', closeVideo);
videoOverlay.addEventListener('click', e => { if (e.target === videoOverlay) closeVideo(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && videoOverlay.classList.contains('open')) closeVideo();
});

// ---- Fabric Selection ----
let selectedFabric = null; // { url, label, cardEl }

modalSelectFabric.addEventListener('click', () => {
  if (!currentModalData) return;
  selectFabric(currentModalData.url, currentModalData.label, currentModalData.price);
  closeModal();
});

function selectFabric(url, label, price = 0) {
  // Remove highlight from previous selection
  if (selectedFabric && selectedFabric.cardEl) {
    selectedFabric.cardEl.classList.remove('fabric-selected-card');
  }

  selectedFabric = { url, label, price, cardEl: null };

  // Highlight the matching card in the tailored gallery
  document.querySelectorAll('#sections-tailored .gallery-card').forEach(card => {
    const img = card.querySelector('img');
    if (img && img.src === url) {
      card.classList.add('fabric-selected-card');
      selectedFabric.cardEl = card;
    }
  });

  // Update the fabric strip UI
  const strip = document.getElementById('selected-fabric-strip');
  document.getElementById('selected-fabric-thumb').src = url;
  document.getElementById('selected-fabric-label').textContent = label;
  const priceEl = document.getElementById('selected-fabric-price');
  if (price > 0) {
    priceEl.textContent = `${price.toLocaleString()} د.ع / متر`;
    priceEl.style.display = 'block';
  } else {
    priceEl.style.display = 'none';
  }
  strip.style.display = 'flex';

  // Scroll to the form
  document.getElementById('fabric-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearFabric() {
  if (selectedFabric && selectedFabric.cardEl) {
    selectedFabric.cardEl.classList.remove('fabric-selected-card');
  }
  selectedFabric = null;
  document.getElementById('selected-fabric-strip').style.display = 'none';
  document.getElementById('selected-fabric-thumb').src = '';
  document.getElementById('selected-fabric-label').textContent = '';
}

document.getElementById('clear-fabric-btn').addEventListener('click', clearFabric);

// ---- Dishdasha Type, Collar & Pocket Selection ----
let selectedDishdashaType = null;
let selectedCollar = null;
let selectedPocket = null;
let selectedSleeveType = null;

const styleSelections = {
  dishdashaType: () => selectedDishdashaType,
  collar: () => selectedCollar,
  pocket: () => selectedPocket,
  sleeveType: () => selectedSleeveType
};

document.querySelectorAll('.style-option').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    const value = btn.dataset.value;

    // Deselect siblings of the same type
    document.querySelectorAll(`.style-option[data-type="${type}"]`).forEach(b => b.classList.remove('selected'));

    // Toggle: if same button clicked again, deselect
    if (styleSelections[type]() === value) {
      if (type === 'dishdashaType') selectedDishdashaType = null;
      else if (type === 'collar') selectedCollar = null;
      else if (type === 'pocket') selectedPocket = null;
      else if (type === 'sleeveType') selectedSleeveType = null;
      return;
    }

    btn.classList.add('selected');
    if (type === 'dishdashaType') selectedDishdashaType = value;
    else if (type === 'collar') selectedCollar = value;
    else if (type === 'pocket') selectedPocket = value;
    else if (type === 'sleeveType') selectedSleeveType = value;
  });
});

// ---- Tap outside input to dismiss keyboard ----
document.addEventListener('touchstart', e => {
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    if (!e.target.closest('input, textarea, label')) active.blur();
  }
});

// ---- Arabic/English Numeral Support ----
function normalizeArabicNums(str) {
  return str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// ---- Order Form ----
const measureFields = [
  { id: 'm-length',    label: 'الطول الكلي' },
  { id: 'm-chest',     label: 'الصدر' },
  { id: 'm-shoulder',  label: 'الكتف' },
  { id: 'm-neck',      label: 'الياخة' },
  { id: 'm-sleeve-len',label: 'طول الردن' },
  { id: 'm-sleeve-w',  label: 'عرض الردن' }
];

async function saveOrderToFirestore(measurements, fabricUrl, notes, customerName, customerPhone) {
  try {
    const body = {
      fields: {
        orderType:     { stringValue: 'tailored' },
        customerName:  { stringValue: customerName || '' },
        customerPhone: { stringValue: customerPhone || '' },
        measurements: { mapValue: { fields: {
          totalLength:  { stringValue: measurements[0].value },
          chest:        { stringValue: measurements[1].value },
          shoulder:     { stringValue: measurements[2].value },
          neck:         { stringValue: measurements[3].value },
          sleeveLength: { stringValue: measurements[4].value },
          sleeveWidth:  { stringValue: measurements[5].value },
        }}},
        fabricUrl:   { stringValue: fabricUrl || '' },
        dishdashaType: { stringValue: selectedDishdashaType || '' },
        collarType:  { stringValue: selectedCollar || '' },
        pocketType:  { stringValue: selectedPocket || '' },
        sleeveType:  { stringValue: selectedSleeveType || '' },
        notes:       { stringValue: notes || '' },
        status:      { stringValue: 'new' },
        createdAt:  { timestampValue: new Date().toISOString() },
        updatedAt:  { timestampValue: new Date().toISOString() },
      }
    };
    const res = await fetch(ORDERS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) return null;
    const doc = await res.json();
    return doc.name.split('/').pop(); // Firestore document ID
  } catch {
    return null; // Silent fail — WhatsApp still opens
  }
}

async function submitOrder() {
  const errorBox = document.getElementById('order-error');
  const missing = [];

  // 1. Validate measurements (accept Arabic ٠-٩ and English 0-9)
  const values = measureFields.map(f => {
    const el = document.getElementById(f.id);
    el.classList.remove('input-error');
    const raw = el.value.trim();
    const v = normalizeArabicNums(raw);
    el.value = v; // normalize display to English digits
    if (!v || Number(v) <= 0) {
      el.classList.add('input-error');
      missing.push(f.label);
      return null;
    }
    return { label: f.label, value: v };
  });

  // 2. Validate dishdasha type
  const typeSelector = document.getElementById('type-selector');
  typeSelector.classList.remove('input-error');
  if (!selectedDishdashaType) {
    typeSelector.classList.add('input-error');
    missing.push('نوع الدشداشة');
  }

  // 3. Validate collar
  const collarSelector = document.getElementById('collar-selector');
  collarSelector.classList.remove('input-error');
  if (!selectedCollar) {
    collarSelector.classList.add('input-error');
    missing.push('نوع الياخة');
  }

  // 3. Validate pocket
  const pocketSelector = document.getElementById('pocket-selector');
  pocketSelector.classList.remove('input-error');
  if (!selectedPocket) {
    pocketSelector.classList.add('input-error');
    missing.push('نوع الجيب');
  }

  // 4. Validate sleeve type
  const sleeveSelector = document.getElementById('sleeve-selector');
  sleeveSelector.classList.remove('input-error');
  if (!selectedSleeveType) {
    sleeveSelector.classList.add('input-error');
    missing.push('نوع الردن');
  }

  // 5. Validate fabric selection
  if (!selectedFabric) {
    missing.push('اختيار القماش');
  }

  // 5. Validate name
  const nameEl = document.getElementById('c-name');
  nameEl.classList.remove('input-error');
  const customerName = nameEl.value.trim();
  if (!customerName) {
    nameEl.classList.add('input-error');
    missing.push('الاسم');
  }

  // 6. Validate phone
  const phoneEl = document.getElementById('c-phone');
  phoneEl.classList.remove('input-error');
  const customerPhone = phoneEl.value.trim();
  if (!customerPhone) {
    phoneEl.classList.add('input-error');
    missing.push('رقم الهاتف');
  }

  // Show errors if any
  if (missing.length > 0) {
    errorBox.innerHTML = '⚠️ يرجى إكمال الحقول التالية:<br>' + missing.map(m => `• ${m}`).join('<br>');
    errorBox.style.display = 'block';
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  errorBox.style.display = 'none';
  const btn = document.getElementById('place-order-btn');
  btn.disabled = true;

  const notes    = document.getElementById('m-notes').value.trim();
  const fabricUrl = selectedFabric.url;

  // Save to Firestore
  const docId = await saveOrderToFirestore(values, fabricUrl, notes, customerName, customerPhone);

  const orderPayload = {
    orderType: 'tailored',
    orderId: docId || 'NO-ID',
    customerName, customerPhone,
    measurements: values,
    fabricUrl, notes,
    dishdashaType: selectedDishdashaType || '',
    collarType: selectedCollar || '',
    pocketType: selectedPocket || '',
    sleeveType: selectedSleeveType || '',
    fabricLabel: selectedFabric.label || '',
    fabricPrice: selectedFabric.price || 0,
    siteUrl: window.location.origin
  };

  // Send Telegram notification
  fetch('/.netlify/functions/notify-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload)
  }).catch(() => {});

  // Show confirmation
  const confirmation = document.getElementById('order-confirmation');
  const orderNum     = document.getElementById('order-confirm-num');
  orderNum.textContent = docId ? `#${docId.slice(-6).toUpperCase()}` : '—';
  btn.style.display = 'none';
  confirmation.style.display = 'flex';

  btn.disabled = false;
}

document.getElementById('place-order-btn').addEventListener('click', submitOrder);

document.getElementById('new-order-btn').addEventListener('click', () => {
  // Reset all measurement inputs
  measureFields.forEach(f => {
    const el = document.getElementById(f.id);
    el.value = '';
    el.classList.remove('input-error');
  });
  // Reset notes & customer info
  document.getElementById('m-notes').value = '';
  document.getElementById('c-name').value = '';
  document.getElementById('c-name').classList.remove('input-error');
  document.getElementById('c-phone').value = '';
  document.getElementById('c-phone').classList.remove('input-error');
  // Clear fabric selection
  clearFabric();
  // Clear dishdasha type, collar & pocket selections
  selectedDishdashaType = null;
  selectedCollar = null;
  selectedPocket = null;
  selectedSleeveType = null;
  document.querySelectorAll('.style-option').forEach(b => b.classList.remove('selected'));
  document.getElementById('type-selector').classList.remove('input-error');
  document.getElementById('collar-selector').classList.remove('input-error');
  document.getElementById('pocket-selector').classList.remove('input-error');
  document.getElementById('sleeve-selector').classList.remove('input-error');
  // Hide error & confirmation, show submit button
  document.getElementById('order-error').style.display = 'none';
  document.getElementById('place-order-btn').style.display = 'flex';
  document.getElementById('order-confirmation').style.display = 'none';
  // Scroll to form
  document.getElementById('fabric-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---- Ready-Made Order Submission ----
modalRmSubmit.addEventListener('click', submitReadymadeOrder);

async function submitReadymadeOrder() {
  const missing = [];
  const data = currentModalData;
  if (!data || !data.itemData) return;

  // Validate size
  const sizeField = modalRmSize.closest('.rm-field');
  sizeField.classList.remove('input-error');
  const size = modalRmSize.value;
  if (!size) { sizeField.classList.add('input-error'); missing.push('المقاس'); }

  // Validate color
  const colorField = modalRmColor.closest('.rm-field');
  colorField.classList.remove('input-error');
  const color = modalRmColor.value;
  if (!color) { colorField.classList.add('input-error'); missing.push('اللون'); }

  // Validate name
  const nameField = modalRmName.closest('.rm-field');
  nameField.classList.remove('input-error');
  const name = modalRmName.value.trim();
  if (!name) { nameField.classList.add('input-error'); missing.push('الاسم'); }

  // Validate phone
  const phoneField = modalRmPhone.closest('.rm-field');
  phoneField.classList.remove('input-error');
  const phone = modalRmPhone.value.trim();
  if (!phone) { phoneField.classList.add('input-error'); missing.push('رقم الهاتف'); }

  if (missing.length > 0) {
    modalRmError.innerHTML = '⚠️ يرجى إكمال الحقول التالية:<br>' + missing.map(m => `• ${m}`).join('<br>');
    modalRmError.style.display = 'block';
    return;
  }

  modalRmError.style.display = 'none';
  modalRmSubmit.disabled = true;

  // Save to Firestore
  let docId = null;
  try {
    const body = {
      fields: {
        orderType:     { stringValue: 'ready-made' },
        customerName:  { stringValue: name },
        customerPhone: { stringValue: phone },
        imageId:       { stringValue: data.itemData.id },
        imageUrl:      { stringValue: data.url },
        itemName:      { stringValue: data.label },
        price:         { integerValue: data.price },
        size:          { stringValue: size },
        color:         { stringValue: color },
        status:        { stringValue: 'new' },
        createdAt:     { timestampValue: new Date().toISOString() },
        updatedAt:     { timestampValue: new Date().toISOString() }
      }
    };
    const res = await fetch(ORDERS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const doc = await res.json();
      docId = doc.name.split('/').pop();
    }
  } catch {}

  // Decrement quantity (requires Firestore rule allowing public quantity updates)
  if (data.itemData.quantity > 0) {
    const newQty = Math.max(0, data.itemData.quantity - 1);
    const imgDocUrl = `${FS_BASE}/images/${data.itemData.id}?key=${API_KEY}&updateMask.fieldPaths=quantity`;
    try {
      await fetch(imgDocUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { quantity: { integerValue: newQty } } })
      });
      data.itemData.quantity = newQty;
    } catch (e) {
      console.error('Stock decrement failed:', e);
    }
  }

  const orderPayload = {
    orderType: 'ready-made',
    orderId: docId || 'NO-ID',
    customerName: name,
    customerPhone: phone,
    itemName: data.label,
    imageUrl: data.url,
    price: data.price,
    size, color,
    siteUrl: window.location.origin
  };

  // Telegram
  fetch('/.netlify/functions/notify-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload)
  }).catch(() => {});

  // Show confirmation
  document.getElementById('modal-rm-order-num').textContent = docId ? `#${docId.slice(-6).toUpperCase()}` : '—';
  modalRmSubmit.style.display = 'none';
  modalRmConfirm.style.display = 'flex';
  modalRmSubmit.disabled = false;
}

// ---- Category Toggle ----
const toggleBtns = document.querySelectorAll('.toggle-btn');
const categories = document.querySelectorAll('.gallery-category');
const loadedCategories = new Set();

toggleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.category;
    toggleBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected','true');
    categories.forEach(p => p.classList.remove('active'));
    document.getElementById(`cat-${cat}`).classList.add('active');
    // Lazy-load: only fetch on first visit
    if (!loadedCategories.has(cat)) {
      loadedCategories.add(cat);
      loadCategory(cat);
    }
  });
});

// ---- Load Gallery ----
async function loadCategory(category) {
  const container = document.getElementById(`sections-${category}`);

  try {
    const sectionsRows = await fsQuery({
      from: [{ collectionId: 'sections' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'category' },
          op: 'EQUAL',
          value: { stringValue: category }
        }
      }
    });

    if (!sectionsRows.length) {
      container.innerHTML = `<div class="gallery-empty">لا توجد أقسام حتى الآن</div>`;
      return;
    }

    const sections = sectionsRows.map(r => ({
      id:    r.document.name.split('/').pop(),
      name:  field(r.document, 'name'),
      order: Number(field(r.document, 'order') || 0)
    })).sort((a, b) => a.order - b.order);

    container.innerHTML = '';

    // Fetch all section images in parallel
    const imageResults = await Promise.all(sections.map(section =>
      fsQuery({
        from: [{ collectionId: 'images' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'sectionId' },
            op: 'EQUAL',
            value: { stringValue: section.id }
          }
        }
      })
    ));

    sections.forEach((section, i) => {
      const imagesRows = imageResults[i];
      if (!imagesRows.length) return;

      const images = imagesRows.map(r => {
        const img = {
          id:          r.document.name.split('/').pop(),
          storageUrl:  field(r.document, 'storageUrl'),
          description: field(r.document, 'description'),
          order:       Number(field(r.document, 'order') || 0),
          pricePerMeter: Number(field(r.document, 'pricePerMeter') || 0)
        };
        if (category === 'ready-made') {
          img.price    = Number(field(r.document, 'price') || 0);
          img.quantity = Number(field(r.document, 'quantity') || 0);
          img.sizes    = fieldArray(r.document, 'sizes');
          img.colors   = fieldArray(r.document, 'colors');
        }
        return img;
      }).sort((a, b) => a.order - b.order);

      container.appendChild(buildSectionEl(section, images, category));
    });

    if (!container.hasChildNodes()) {
      container.innerHTML = `<div class="gallery-empty">لا توجد صور حتى الآن</div>`;
    }

  } catch (err) {
    console.error('Error loading gallery:', err);
    container.innerHTML = `<div class="gallery-empty">تعذّر تحميل المعرض. يرجى المحاولة لاحقاً.</div>`;
  }
}

function buildSectionEl(section, images, category) {
  const wrap = document.createElement('div');
  wrap.className = 'gallery-section';

  const heading = document.createElement('h3');
  heading.textContent = section.name;
  wrap.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'image-grid';

  images.forEach(img => {
    const label  = img.description || 'قطعة من المعرض';
    const price  = category === 'ready-made' ? (img.price || 0) : (img.pricePerMeter || 0);
    const waText = encodeURIComponent(`أنا مهتم بهذه القطعة:\n${img.storageUrl}`);
    const waLink = `https://wa.me/${WA_NUMBER}?text=${waText}`;

    const card = document.createElement('div');
    card.className    = 'gallery-card';
    card.title        = label;
    card.style.cursor = 'pointer';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', label);

    const imgEl = document.createElement('img');
    imgEl.alt       = label;
    imgEl.loading   = 'lazy';
    imgEl.className = 'loading';
    imgEl.onload    = () => imgEl.classList.remove('loading');
    imgEl.onerror   = () => {
      imgEl.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23ede6d6"/><text x="50%" y="50%" text-anchor="middle" fill="%23999" font-size="14" dy=".3em">صورة</text></svg>';
      imgEl.classList.remove('loading');
    };
    imgEl.src = img.storageUrl;
    card.appendChild(imgEl);

    // Price badge
    if (category === 'tailored' && price > 0) {
      const badge = document.createElement('div');
      badge.className = 'price-badge';
      badge.textContent = `${price.toLocaleString()} د.ع/م`;
      card.appendChild(badge);
    } else if (category === 'ready-made' && price > 0) {
      const badge = document.createElement('div');
      badge.className = 'price-badge';
      badge.textContent = `${price.toLocaleString()} د.ع`;
      card.appendChild(badge);
    }

    // Stock count / out of stock for ready-made
    if (category === 'ready-made') {
      if (img.quantity <= 0) {
        const oos = document.createElement('div');
        oos.className = 'out-of-stock-badge';
        oos.innerHTML = '<span>نفذت الكمية</span>';
        card.appendChild(oos);
      } else {
        const stockBadge = document.createElement('div');
        stockBadge.className = 'stock-badge';
        stockBadge.textContent = `متبقي ${img.quantity} قطعة`;
        card.appendChild(stockBadge);
      }
    }

    const itemData = category === 'ready-made' ? { id: img.id, sizes: img.sizes, colors: img.colors, quantity: img.quantity } : null;
    const openThisModal = () => openModal(img.storageUrl, label, waLink, category, price, itemData);
    card.addEventListener('click', openThisModal);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openThisModal(); }
    });
    grid.appendChild(card);
  });

  wrap.appendChild(grid);
  return wrap;
}

// ---- Order Tracking ----
const TRACK_STATUS = {
  'new':        { label: 'قيد المراجعة',  icon: '🔵' },
  'ordered':    { label: 'تم الطلب',      icon: '🟡' },
  'sewing':     { label: 'قيد الخياطة',   icon: '🪡' },
  'delivering': { label: 'جاري التوصيل',  icon: '🚚' },
  'delivered':  { label: 'تم التوصيل',    icon: '🟢' },
  'returned':   { label: 'مرتجع',        icon: '🔴' }
};

function normalizePhone(phone) {
  let digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('00964')) digits = digits.slice(2);
  else if (digits.startsWith('964')) { /* already international */ }
  else if (digits.startsWith('0')) digits = '964' + digits.slice(1);
  return digits;
}

function phoneVariants(phone) {
  const norm = normalizePhone(phone);
  if (!norm || norm.length < 7) return [];
  const variants = [norm];
  // With leading 0 (local format)
  if (norm.startsWith('964')) {
    variants.push('0' + norm.slice(3));
  }
  // Raw digits without country code
  if (norm.startsWith('964')) {
    variants.push(norm.slice(3));
  }
  // With +
  variants.push('+' + norm);
  return [...new Set(variants)];
}

async function fetchOrdersByPhone(phone) {
  const variants = phoneVariants(phone);
  if (variants.length === 0) return [];

  // Query each variant (Firestore IN operator via REST is complex, simpler to do multiple queries)
  const allResults = [];
  const seenIds = new Set();

  for (const variant of variants) {
    try {
      const rows = await fsQuery({
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'customerPhone' },
            op: 'EQUAL',
            value: { stringValue: variant }
          }
        }
      });
      rows.forEach(r => {
        const id = r.document.name.split('/').pop();
        if (!seenIds.has(id)) {
          seenIds.add(id);
          allResults.push(r);
        }
      });
    } catch (e) {
      console.error('Order query failed for variant:', variant, e);
    }
  }

  return allResults.map(r => {
    const d = r.document;
    const id = d.name.split('/').pop();
    return {
      id,
      orderType: field(d, 'orderType') || 'tailored',
      status: field(d, 'status') || 'ordered',
      customerName: field(d, 'customerName'),
      customerPhone: field(d, 'customerPhone'),
      itemName: field(d, 'itemName'),
      imageUrl: field(d, 'imageUrl'),
      fabricUrl: field(d, 'fabricUrl'),
      price: Number(field(d, 'price')) || 0,
      size: field(d, 'size'),
      color: field(d, 'color'),
      dishdashaType: field(d, 'dishdashaType'),
      createdAt: field(d, 'createdAt')
    };
  }).sort((a, b) => {
    // newest first
    if (a.createdAt && b.createdAt) return b.createdAt.localeCompare(a.createdAt);
    return 0;
  });
}

function renderTrackOrders(orders) {
  const container = document.getElementById('track-orders');
  if (orders.length === 0) {
    container.innerHTML = '<div class="track-empty">لا توجد طلبات مرتبطة بهذا الرقم</div>';
    return;
  }

  container.innerHTML = '';
  orders.forEach(order => {
    const card = document.createElement('div');
    card.className = 'track-card';

    const statusInfo = TRACK_STATUS[order.status] || TRACK_STATUS['ordered'];
    const isReadyMade = order.orderType === 'ready-made';
    const thumbUrl = isReadyMade ? order.imageUrl : order.fabricUrl;
    const shortId = `#${order.id.slice(-6).toUpperCase()}`;
    const price = order.price > 0 ? `${order.price.toLocaleString()} د.ع` : '';

    let dateStr = '';
    if (order.createdAt) {
      try { dateStr = new Date(order.createdAt).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short' }); } catch {}
    }

    let details = '';
    if (isReadyMade) {
      const parts = [order.itemName, order.size, order.color].filter(Boolean);
      details = parts.join(' · ');
    } else {
      details = 'فصال';
      if (order.dishdashaType) {
        const labels = { 'iraqi1': 'عراقي سحاب', 'iraqi2': 'عراقي ظاهري', 'iraqi3': 'عراقي مخفي', 'kuwaiti1': 'كويتي مخفي', 'kuwaiti2': 'كويتي ظاهري', 'kuwaiti3': 'كويتي مخفي (حشوه)' };
        details += ' · ' + (labels[order.dishdashaType] || order.dishdashaType);
      }
    }

    card.innerHTML = `
      ${thumbUrl ? `<img class="track-card-thumb" src="${thumbUrl}" alt="" loading="lazy" />` : ''}
      <div class="track-card-info">
        <div class="track-card-top">
          <span class="track-card-id">${shortId}</span>
          <span class="track-card-date">${dateStr}</span>
        </div>
        <div class="track-card-details">${details}</div>
        ${price ? `<div class="track-card-price">${price}</div>` : ''}
        <div class="track-card-status">
          <span class="track-status-icon">${statusInfo.icon}</span>
          <span class="track-status-label">${statusInfo.label}</span>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

// Track form handlers
const trackPhoneInput = document.getElementById('track-phone');
const trackBtn = document.getElementById('track-btn');
const trackPhoneForm = document.getElementById('track-phone-form');
const trackSavedBar = document.getElementById('track-saved-bar');
const trackSavedPhone = document.getElementById('track-saved-phone');
const trackChangeBtn = document.getElementById('track-change-btn');
const trackOrders = document.getElementById('track-orders');

async function doTrack(phone) {
  if (!phone || phone.replace(/[^0-9]/g, '').length < 7) return;
  trackOrders.innerHTML = '<div class="spinner"></div>';
  localStorage.setItem('shaker_phone', phone);
  showSavedBar(phone);

  const orders = await fetchOrdersByPhone(phone);
  renderTrackOrders(orders);
}

function showSavedBar(phone) {
  trackPhoneForm.style.display = 'none';
  trackSavedBar.style.display = 'flex';
  trackSavedPhone.textContent = phone;
}

trackBtn.addEventListener('click', () => doTrack(trackPhoneInput.value.trim()));
trackPhoneInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); doTrack(trackPhoneInput.value.trim()); }
});

trackChangeBtn.addEventListener('click', () => {
  localStorage.removeItem('shaker_phone');
  trackPhoneForm.style.display = '';
  trackSavedBar.style.display = 'none';
  trackOrders.innerHTML = '';
  trackPhoneInput.value = '';
  trackPhoneInput.focus();
});

// Auto-load saved phone on page load
const savedPhone = localStorage.getItem('shaker_phone');
if (savedPhone) {
  doTrack(savedPhone);
}

// ---- Init ---- (only load default active tab; others load on first click)
loadedCategories.add('tailored');
loadCategory('tailored');
