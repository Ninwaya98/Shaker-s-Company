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

  if (category === 'tailored') {
    // Tailored: show select fabric + cancel, hide WhatsApp
    modalSelectFabric.style.display = 'inline-flex';
    modalWA.style.display = 'none';
  } else {
    // Fabrics / ready-made: show WhatsApp + cancel, hide select fabric
    modalSelectFabric.style.display = 'none';
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

// ---- Collar & Pocket Selection ----
let selectedCollar = null; // data-value string
let selectedPocket = null;

document.querySelectorAll('.style-option').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type; // 'collar' or 'pocket'
    const value = btn.dataset.value;

    // Deselect siblings of the same type
    document.querySelectorAll(`.style-option[data-type="${type}"]`).forEach(b => b.classList.remove('selected'));

    // Toggle: if same button clicked again, deselect
    if ((type === 'collar' && selectedCollar === value) || (type === 'pocket' && selectedPocket === value)) {
      if (type === 'collar') selectedCollar = null;
      else selectedPocket = null;
      return;
    }

    btn.classList.add('selected');
    if (type === 'collar') selectedCollar = value;
    else selectedPocket = value;
  });
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
        collarType:  { stringValue: selectedCollar || '' },
        pocketType:  { stringValue: selectedPocket || '' },
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

  // 2. Validate collar
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

  // 4. Validate fabric selection
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

  // Send Telegram notification
  fetch('/.netlify/functions/notify-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: docId || 'NO-ID',
      customerName, customerPhone,
      measurements: values,
      fabricUrl, notes,
      collarType: selectedCollar || '',
      pocketType: selectedPocket || '',
      siteUrl: window.location.origin
    })
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
  // Clear collar & pocket selections
  selectedCollar = null;
  selectedPocket = null;
  document.querySelectorAll('.style-option').forEach(b => b.classList.remove('selected'));
  document.getElementById('collar-selector').classList.remove('input-error');
  document.getElementById('pocket-selector').classList.remove('input-error');
  // Hide error & confirmation, show submit button
  document.getElementById('order-error').style.display = 'none';
  document.getElementById('place-order-btn').style.display = 'flex';
  document.getElementById('order-confirmation').style.display = 'none';
  // Scroll to form
  document.getElementById('fabric-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

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

      const images = imagesRows.map(r => ({
        id:          r.document.name.split('/').pop(),
        storageUrl:  field(r.document, 'storageUrl'),
        description: field(r.document, 'description'),
        order:       Number(field(r.document, 'order') || 0)
      })).sort((a, b) => a.order - b.order);

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
    const openThisModal = () => openModal(img.storageUrl, label, waLink, category);
    card.addEventListener('click', openThisModal);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openThisModal(); }
    });
    grid.appendChild(card);
  });

  wrap.appendChild(grid);
  return wrap;
}

// ---- Init ---- (only load default active tab; others load on first click)
loadedCategories.add('tailored');
loadCategory('tailored');
