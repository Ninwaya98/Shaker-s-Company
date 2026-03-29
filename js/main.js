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

// ---- Modal Elements ----
const modal             = document.getElementById('image-modal');
const modalImage        = document.getElementById('modal-image');
const modalDesc         = document.getElementById('modal-desc');
const modalWA           = document.getElementById('modal-whatsapp');
const modalClose        = document.getElementById('modal-close');
const modalCancel       = document.getElementById('modal-cancel');
const modalSelectFabric = document.getElementById('modal-select-fabric');

let currentModalData = null; // { url, label } of the image currently open in modal

function openModal(imgSrc, label, waLink, category) {
  currentModalData = { url: imgSrc, label };
  modalImage.src        = imgSrc;
  modalImage.alt        = label;
  modalDesc.textContent = label;
  modalWA.href          = waLink;

  // Show "select fabric" button only for tailored category
  if (category === 'tailored') {
    modalSelectFabric.style.display = 'block';
  } else {
    modalSelectFabric.style.display = 'none';
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
  modalImage.src = '';
  currentModalData = null;
}

modalWA.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

// ---- Fabric Selection ----
let selectedFabric = null; // { url, label, cardEl }

modalSelectFabric.addEventListener('click', () => {
  if (!currentModalData) return;
  selectFabric(currentModalData.url, currentModalData.label);
  closeModal();
});

function selectFabric(url, label) {
  // Remove highlight from previous selection
  if (selectedFabric && selectedFabric.cardEl) {
    selectedFabric.cardEl.classList.remove('fabric-selected-card');
  }

  selectedFabric = { url, label, cardEl: null };

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

// ---- Order Form ----
const measureFields = [
  { id: 'm-length',    label: 'الطول الكلي' },
  { id: 'm-chest',     label: 'الصدر' },
  { id: 'm-shoulder',  label: 'الكتف' },
  { id: 'm-neck',      label: 'الياخة' },
  { id: 'm-sleeve-len',label: 'طول الردن' },
  { id: 'm-sleeve-w',  label: 'عرض الردن' }
];

function buildOrderMessage() {
  let valid = true;

  // Validate & collect measurements
  const values = measureFields.map(f => {
    const el = document.getElementById(f.id);
    el.classList.remove('input-error');
    const v = el.value.trim();
    if (!v || Number(v) <= 0) {
      el.classList.add('input-error');
      // Re-trigger animation
      void el.offsetWidth;
      valid = false;
      return null;
    }
    return { label: f.label, value: v };
  });

  if (!valid) return null;

  const notes   = document.getElementById('m-notes').value.trim() || 'لا يوجد';
  const fabric  = selectedFabric ? selectedFabric.url : 'لم يُحدد';

  const lines = [
    'طلب فصال جديد 🪡',
    '━━━━━━━━━━━━━━━━',
    'القياسات (سم):',
    ...values.map(v => `• ${v.label}: ${v.value}`),
    '━━━━━━━━━━━━━━━━',
    `القماش المختار: ${fabric}`,
    '━━━━━━━━━━━━━━━━',
    `ملاحظات: ${notes}`
  ];

  return lines.join('\n');
}

async function saveOrderToFirestore(measurements, fabricUrl, notes, customerName, customerPhone) {
  try {
    const body = {
      fields: {
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
        fabricUrl:  { stringValue: fabricUrl || '' },
        notes:      { stringValue: notes || '' },
        status:     { stringValue: 'new' },
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
  const msg = buildOrderMessage();
  if (!msg) return;

  const btn = document.getElementById('order-whatsapp-btn');
  btn.disabled = true;

  // Collect customer info
  const customerName  = document.getElementById('c-name').value.trim();
  const customerPhone = document.getElementById('c-phone').value.trim();
  const notes         = document.getElementById('m-notes').value.trim();
  const fabricUrl     = selectedFabric ? selectedFabric.url : '';

  // Re-collect measurements for Firestore
  const values = measureFields.map(f => ({
    label: f.label,
    value: document.getElementById(f.id).value.trim()
  }));

  // Save to Firestore (non-blocking — open WhatsApp regardless)
  const docId = await saveOrderToFirestore(values, fabricUrl, notes, customerName, customerPhone);

  // Open WhatsApp
  const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener');

  // Show confirmation
  const confirmation = document.getElementById('order-confirmation');
  const orderNum     = document.getElementById('order-confirm-num');
  orderNum.textContent = docId ? `#${docId.slice(-6).toUpperCase()}` : '—';
  btn.style.display = 'none';
  confirmation.style.display = 'flex';

  btn.disabled = false;
}

document.getElementById('order-whatsapp-btn').addEventListener('click', submitOrder);

// ---- Category Toggle ----
const toggleBtns = document.querySelectorAll('.toggle-btn');
const categories = document.querySelectorAll('.gallery-category');

toggleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.category;
    toggleBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected','true');
    categories.forEach(p => p.classList.remove('active'));
    document.getElementById(`cat-${cat}`).classList.add('active');
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

    for (const section of sections) {
      const imagesRows = await fsQuery({
        from: [{ collectionId: 'images' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'sectionId' },
            op: 'EQUAL',
            value: { stringValue: section.id }
          }
        }
      });

      if (!imagesRows.length) continue;

      const images = imagesRows.map(r => ({
        id:          r.document.name.split('/').pop(),
        storageUrl:  field(r.document, 'storageUrl'),
        description: field(r.document, 'description'),
        order:       Number(field(r.document, 'order') || 0)
      })).sort((a, b) => a.order - b.order);

      container.appendChild(buildSectionEl(section, images, category));
    }

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
    const waText = encodeURIComponent(`أنا مهتم بهذه القطعة:\n${img.storageUrl}`);
    const waLink = `https://wa.me/${WA_NUMBER}?text=${waText}`;

    const card = document.createElement('div');
    card.className    = 'gallery-card';
    card.title        = label;
    card.style.cursor = 'pointer';

    const imgEl = document.createElement('img');
    imgEl.alt       = label;
    imgEl.className = 'loading';
    imgEl.onload    = () => imgEl.classList.remove('loading');
    imgEl.onerror   = () => {
      imgEl.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23ede6d6"/><text x="50%" y="50%" text-anchor="middle" fill="%23999" font-size="14" dy=".3em">صورة</text></svg>';
      imgEl.classList.remove('loading');
    };
    imgEl.src = img.storageUrl;

    card.appendChild(imgEl);
    card.addEventListener('click', () => openModal(img.storageUrl, label, waLink, category));
    grid.appendChild(card);
  });

  wrap.appendChild(grid);
  return wrap;
}

// ---- Init ----
loadCategory('ready-made');
loadCategory('tailored');
loadCategory('fabrics');
