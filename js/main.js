// Public Site — Gallery Logic
import { db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const WA_NUMBER = "9647730666777";

// ---- Modal Elements ----
const modal        = document.getElementById('image-modal');
const modalImage   = document.getElementById('modal-image');
const modalDesc    = document.getElementById('modal-desc');
const modalWA      = document.getElementById('modal-whatsapp');
const modalClose   = document.getElementById('modal-close');
const modalCancel  = document.getElementById('modal-cancel');

// Store current modal data
let currentModal = {};

function openModal(imgSrc, description, waLink) {
  currentModal = { imgSrc, description, waLink };
  modalImage.src = imgSrc;
  modalImage.alt = description;
  modalDesc.textContent = description;
  modalWA.href = waLink;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// Handle WhatsApp button click
modalWA.addEventListener('click', function() {
  closeModal();
});

function closeModal() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
  modalImage.src = '';
}

modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modal.addEventListener('click', e => {
  if (e.target === modal) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

// ---- Category Toggle ----
const toggleBtns = document.querySelectorAll('.toggle-btn');
const categories = document.querySelectorAll('.gallery-category');

toggleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.category;

    toggleBtns.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');

    categories.forEach(panel => {
      panel.classList.remove('active');
    });
    document.getElementById(`cat-${cat}`).classList.add('active');
  });
});

// ---- Load Gallery ----
async function loadCategory(category) {
  const container = document.getElementById(`sections-${category}`);

  try {
    const sectionsSnap = await getDocs(query(
      collection(db, 'sections'),
      where('category', '==', category)
    ));

    if (sectionsSnap.empty) {
      container.innerHTML = `<div class="gallery-empty">لا توجد أقسام حتى الآن</div>`;
      return;
    }

    const sections = sectionsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    container.innerHTML = '';

    for (const section of sections) {
      const imagesSnap = await getDocs(query(
        collection(db, 'images'),
        where('sectionId', '==', section.id)
      ));

      if (imagesSnap.empty) continue;

      const images = imagesSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      const sectionEl = buildSectionEl(section, images);
      container.appendChild(sectionEl);
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
    const label = img.description || 'قطعة من المعرض';
    const waText = encodeURIComponent(`أنا مهتم بهذه القطعة:\n${img.storageUrl}`);
    const waLink = `https://wa.me/${WA_NUMBER}?text=${waText}`;

    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.title = label;
    card.style.cursor = 'pointer';

    const imgEl = document.createElement('img');
    imgEl.src = img.storageUrl;
    imgEl.alt = label;
    imgEl.loading = 'lazy';
    imgEl.className = 'loading';
    imgEl.onload = () => imgEl.classList.remove('loading');
    imgEl.onerror = () => {
      imgEl.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23ede6d6"/><text x="50%" y="50%" text-anchor="middle" fill="%23999" font-size="14" dy=".3em">صورة</text></svg>';
      imgEl.classList.remove('loading');
    };

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
