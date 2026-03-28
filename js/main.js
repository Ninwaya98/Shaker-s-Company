// Public Site — Gallery Logic (uses Firestore REST API)
const API_KEY   = "AIzaSyBV3KD5Hsd06PAkRxHoRcVKSM5TFUfD4ec";
const PROJECT   = "shaker-s-dishdasha";
const QUERY_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery?key=${API_KEY}`;
const WA_NUMBER = "9647730666777";

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
const modal      = document.getElementById('image-modal');
const modalImage = document.getElementById('modal-image');
const modalDesc  = document.getElementById('modal-desc');
const modalWA    = document.getElementById('modal-whatsapp');
const modalClose = document.getElementById('modal-close');
const modalCancel= document.getElementById('modal-cancel');

function openModal(imgSrc, description, waLink) {
  modalImage.src       = imgSrc;
  modalImage.alt       = description;
  modalDesc.textContent= description;
  modalWA.href         = waLink;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
  modalImage.src = '';
}

modalWA.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

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

      container.appendChild(buildSectionEl(section, images));
    }

    if (!container.hasChildNodes()) {
      container.innerHTML = `<div class="gallery-empty">لا توجد صور حتى الآن</div>`;
    }

  } catch (err) {
    console.error('Error loading gallery:', err);
    container.innerHTML = `<div class="gallery-empty">تعذّر تحميل المعرض. يرجى المحاولة لاحقاً.</div>`;
  }
}

function buildSectionEl(section, images) {
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
    card.className  = 'gallery-card';
    card.title      = label;
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
    card.addEventListener('click', () => openModal(img.storageUrl, label, waLink));
    grid.appendChild(card);
  });

  wrap.appendChild(grid);
  return wrap;
}

// ---- Init ----
loadCategory('ready-made');
loadCategory('tailored');
loadCategory('fabrics');
