// Admin Panel Logic
import { auth, db, storage } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  collection,
  doc,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

// =====================
// UI Elements
// =====================
const loginScreen = document.getElementById('login-screen');
const adminApp    = document.getElementById('admin-app');
const loginForm   = document.getElementById('login-form');
const loginError  = document.getElementById('login-error');
const loginBtn    = document.getElementById('login-btn');
const logoutBtn   = document.getElementById('logout-btn');
const toast       = document.getElementById('toast');

// =====================
// State
// =====================
let sectionsCache = { 'ready-made': [], 'tailored': [], 'fabrics': [] };
// Stores all rendered image items per category for select-all
let allImageItems = { 'ready-made': [], 'tailored': [], 'fabrics': [] };

// =====================
// Toast
// =====================
let toastTimer;
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// =====================
// Auth
// =====================
onAuthStateChanged(auth, user => {
  if (user) {
    loginScreen.style.display = 'none';
    adminApp.classList.add('visible');
    initDashboard();
  } else {
    loginScreen.style.display = 'flex';
    adminApp.classList.remove('visible');
  }
});

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  loginBtn.disabled = true;
  loginBtn.textContent = 'جارٍ الدخول...';
  loginError.classList.remove('show');

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = getAuthErrorMessage(err.code);
    loginError.classList.add('show');
    loginBtn.disabled = false;
    loginBtn.textContent = 'تسجيل الدخول';
  }
});

logoutBtn.addEventListener('click', async () => {
  if (confirm('هل تريد تسجيل الخروج؟')) {
    await signOut(auth);
  }
});

function getAuthErrorMessage(code) {
  const map = {
    'auth/invalid-email': 'البريد الإلكتروني غير صحيح.',
    'auth/user-not-found': 'المستخدم غير موجود.',
    'auth/wrong-password': 'كلمة المرور غير صحيحة.',
    'auth/too-many-requests': 'محاولات كثيرة. يرجى الانتظار.',
    'auth/invalid-credential': 'بيانات الدخول غير صحيحة.',
  };
  return map[code] || 'حدث خطأ. يرجى المحاولة مجدداً.';
}

// =====================
// Category Tabs
// =====================
const tabBtns = document.querySelectorAll('.tab-btn');
const panels  = document.querySelectorAll('.sections-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    panels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    clearSelection();

    if (btn.dataset.tab === 'orders') {
      document.getElementById('panel-orders').classList.add('active');
      loadOrders();
    } else {
      document.getElementById(`panel-${btn.dataset.category}`).classList.add('active');
    }
  });
});

// =====================
// Init Dashboard
// =====================
async function initDashboard() {
  await loadSectionsCache();
  await Promise.all([renderCategory('ready-made'), renderCategory('tailored'), renderCategory('fabrics')]);
}

// =====================
// Load all sections into cache
// =====================
async function loadSectionsCache() {
  for (const category of ['ready-made', 'tailored', 'fabrics']) {
    const snap = await getDocs(query(
      collection(db, 'sections'),
      where('category', '==', category)
    ));

    sectionsCache[category] = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (sectionsCache[category].length === 0) {
      const name = category === 'ready-made' ? 'دشاديش جاهزة' : category === 'tailored' ? 'دشاديش فصال' : 'أقمشة';
      const newDoc = await addDoc(collection(db, 'sections'), {
        name, category, order: 1, isDefault: true, createdAt: serverTimestamp()
      });
      sectionsCache[category] = [{ id: newDoc.id, name, category, order: 1, isDefault: true }];
    }
  }
}

// =====================
// Populate upload section dropdowns
// =====================
function populateUploadSectionSelect(category) {
  const sel = document.getElementById(`upload-section-${category}`);
  if (!sel) return;
  const sections = sectionsCache[category];
  sel.innerHTML = sections.map(s =>
    `<option value="${s.id}">${escapeHtml(s.name)}${s.isDefault ? ' (رئيسي)' : ''}</option>`
  ).join('');
}

function getUploadSectionId(category) {
  const sel = document.getElementById(`upload-section-${category}`);
  if (sel && sel.value) return sel.value;
  return getDefaultSectionId(category);
}

function getDefaultSectionId(category) {
  const sections = sectionsCache[category];
  const def = sections.find(s => s.isDefault);
  return def ? def.id : sections[0].id;
}

// =====================
// Inline "add section" toolbar
// =====================
document.querySelectorAll('.btn-new-section').forEach(btn => {
  btn.addEventListener('click', () => {
    const category = btn.dataset.category;
    const inline = document.getElementById(`add-section-inline-${category}`);
    inline.classList.toggle('show');
    if (inline.classList.contains('show')) {
      inline.querySelector('.inline-section-input').focus();
    }
  });
});

document.querySelectorAll('.btn-cancel-inline').forEach(btn => {
  btn.addEventListener('click', () => {
    const category = btn.dataset.category;
    const inline = document.getElementById(`add-section-inline-${category}`);
    inline.classList.remove('show');
    inline.querySelector('.inline-section-input').value = '';
  });
});

document.querySelectorAll('.inline-section-save').forEach(btn => {
  btn.addEventListener('click', async () => {
    const category = btn.dataset.category;
    const inline = document.getElementById(`add-section-inline-${category}`);
    const input = inline.querySelector('.inline-section-input');
    const name = input.value.trim();
    if (!name) { input.focus(); return; }

    btn.disabled = true;
    btn.textContent = 'جارٍ الحفظ...';

    try {
      let maxOrder = 0;
      sectionsCache[category].forEach(s => { if ((s.order || 0) > maxOrder) maxOrder = s.order; });

      await addDoc(collection(db, 'sections'), {
        name, category, order: maxOrder + 1, createdAt: serverTimestamp()
      });

      input.value = '';
      inline.classList.remove('show');
      showToast('تم إضافة القسم', 'success');

      await loadSectionsCache();
      populateUploadSectionSelect(category);
      renderSectionsList(category);
      await loadPhotos(category);

      // Select the new section in the dropdown
      const sel = document.getElementById(`upload-section-${category}`);
      const newSection = sectionsCache[category].find(s => s.name === name);
      if (sel && newSection) sel.value = newSection.id;

    } catch (err) {
      console.error(err);
      showToast('حدث خطأ', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'حفظ';
    }
  });
});

// Allow Enter key in inline input
document.querySelectorAll('.inline-section-input').forEach(input => {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.closest('.add-section-inline').querySelector('.inline-section-save').click();
    }
    if (e.key === 'Escape') {
      input.closest('.add-section-inline').querySelector('.btn-cancel-inline').click();
    }
  });
});

// =====================
// Render full category panel
// =====================
async function renderCategory(category) {
  populateUploadSectionSelect(category);
  renderSectionsList(category);
  await loadPhotos(category);
}

// =====================
// Render Sections List (in the details/summary)
// =====================
function renderSectionsList(category) {
  const container = document.getElementById(`list-${category}`);
  const sections = sectionsCache[category];
  container.innerHTML = '';

  if (sections.length === 0) {
    container.innerHTML = '<div class="loading-text">لا توجد أقسام.</div>';
    return;
  }

  sections.forEach(section => {
    const row = document.createElement('div');
    row.className = 'section-row';
    row.innerHTML = `
      <span class="section-row-name">${escapeHtml(section.name)}</span>
      <span class="section-row-badge">${section.isDefault ? 'رئيسي' : ''}</span>
      <button class="section-row-delete" title="حذف">✕</button>
    `;

    row.querySelector('.section-row-delete').addEventListener('click', async () => {
      if (section.isDefault) { showToast('لا يمكن حذف القسم الرئيسي', 'error'); return; }
      if (!confirm(`حذف قسم "${section.name}"؟ سيتم نقل صوره إلى القسم الرئيسي.`)) return;

      try {
        const defaultId = getDefaultSectionId(category);
        const imgSnap = await getDocs(query(collection(db, 'images'), where('sectionId', '==', section.id)));
        const batch = writeBatch(db);
        imgSnap.docs.forEach(imgDoc => { batch.update(imgDoc.ref, { sectionId: defaultId }); });
        batch.delete(doc(db, 'sections', section.id));
        await batch.commit();

        showToast('تم حذف القسم ونقل صوره', 'success');
        await loadSectionsCache();
        populateUploadSectionSelect(category);
        await renderCategory(category);
      } catch (err) {
        console.error(err);
        showToast('تعذّر حذف القسم', 'error');
      }
    });

    container.appendChild(row);
  });
}

// =====================
// Quick Upload
// =====================
['ready-made', 'tailored', 'fabrics'].forEach(category => {
  const uploadArea = document.getElementById(`quick-upload-${category}`);
  const fileInput  = document.getElementById(`quick-file-${category}`);

  fileInput.addEventListener('change', () => quickUpload(fileInput.files, category));

  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    quickUpload(e.dataTransfer.files, category);
  });
});

async function quickUpload(files, category) {
  if (!files || files.length === 0) return;

  const MAX_SIZE = 5 * 1024 * 1024;
  const largeFiles = Array.from(files).filter(f => f.size > MAX_SIZE);
  if (largeFiles.length > 0) {
    const names = largeFiles.map(f => f.name).join(', ');
    if (!confirm(`هذه الصور كبيرة الحجم (أكثر من 5MB):\n${names}\n\nهل تريد المتابعة؟`)) return;
  }

  const progressWrap = document.getElementById(`quick-progress-${category}`);
  const progressBar  = document.getElementById(`quick-bar-${category}`);

  progressWrap.classList.add('show');
  progressBar.style.width = '0%';

  try {
    // Use selected section from dropdown
    const sectionId = getUploadSectionId(category);

    let orderCounter = 0;
    for (const sec of sectionsCache[category]) {
      const snap = await getDocs(query(collection(db, 'images'), where('sectionId', '==', sec.id)));
      snap.docs.forEach(d => { const o = d.data().order || 0; if (o > orderCounter) orderCounter = o; });
    }

    const fileArr = Array.from(files);
    let done = 0;

    for (const file of fileArr) {
      try {
        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const storagePath = `images/${category}/${fileName}`;
        const storageRef = ref(storage, storagePath);

        await new Promise((resolve, reject) => {
          const task = uploadBytesResumable(storageRef, file);
          task.on('state_changed',
            snapshot => {
              const pct = ((done + snapshot.bytesTransferred / snapshot.totalBytes) / fileArr.length) * 100;
              progressBar.style.width = `${Math.round(pct)}%`;
            },
            reject,
            async () => {
              const url = await getDownloadURL(task.snapshot.ref);
              orderCounter++;
              await addDoc(collection(db, 'images'), {
                sectionId, storageUrl: url, storagePath,
                fileName: file.name, description: '', order: orderCounter,
                createdAt: serverTimestamp()
              });
              done++;
              progressBar.style.width = `${Math.round((done / fileArr.length) * 100)}%`;
              resolve();
            }
          );
        });
      } catch (err) {
        console.error('Upload failed:', file.name, err);
        showToast(`فشل رفع: ${file.name}`, 'error');
        done++;
      }
    }

    progressBar.style.width = '100%';
    setTimeout(() => { progressWrap.classList.remove('show'); progressBar.style.width = '0%'; }, 600);

    showToast(`تم رفع ${done} صورة بنجاح`, 'success');
    document.getElementById(`quick-file-${category}`).value = '';
    await loadPhotos(category);

  } catch (err) {
    console.error(err);
    showToast('حدث خطأ أثناء الرفع', 'error');
    progressWrap.classList.remove('show');
  }
}

// =====================
// Load & Render Photos
// =====================
async function loadPhotos(category) {
  const grid = document.getElementById(`photos-${category}`);
  grid.innerHTML = '<div class="loading-text">جارٍ التحميل...</div>';
  allImageItems[category] = [];

  try {
    const sections = sectionsCache[category];
    let hasAnyImages = false;
    grid.innerHTML = '';

    for (const section of sections) {
      const imgsSnap = await getDocs(query(
        collection(db, 'images'),
        where('sectionId', '==', section.id)
      ));

      if (imgsSnap.empty) continue;
      hasAnyImages = true;

      const images = imgsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      const header = document.createElement('div');
      header.className = 'photo-section-header';
      header.innerHTML = `
        <h3>${escapeHtml(section.name)}</h3>
        <div style="display:flex;align-items:center;gap:0.75rem">
          <button class="btn-select-section" data-section="${section.id}" data-category="${category}">تحديد القسم</button>
          <span class="photo-count">${images.length} صورة</span>
        </div>
      `;
      grid.appendChild(header);

      const imgGrid = document.createElement('div');
      imgGrid.className = 'admin-image-grid';

      images.forEach(img => {
        const item = buildImageItem(img, category);
        imgGrid.appendChild(item);
        allImageItems[category].push({ img, element: item });
      });

      grid.appendChild(imgGrid);
    }

    if (!hasAnyImages) {
      grid.innerHTML = '<div class="loading-text">لا توجد صور. اضغط على المنطقة أعلاه لإضافة صور.</div>';
    }

    // Wire up "select section" buttons
    grid.querySelectorAll('.btn-select-section').forEach(btn => {
      btn.addEventListener('click', () => {
        const sectionId = btn.dataset.section;
        const cat = btn.dataset.category;
        const items = allImageItems[cat].filter(i => i.img.sectionId === sectionId);
        items.forEach(({ img, element }) => {
          if (!selectedImages.find(s => s.id === img.id)) {
            selectedImages.push({ id: img.id, storagePath: img.storagePath, storageUrl: img.storageUrl, sectionId: img.sectionId, fileName: img.fileName || '', description: img.description || '', element, category: cat });
            element.classList.add('selected');
          }
        });
        updateSelectionPanel();
      });
    });

  } catch (err) {
    console.error(err);
    grid.innerHTML = '<div class="loading-text">تعذّر التحميل.</div>';
  }
}

// =====================
// Build Image Item
// =====================
function buildImageItem(img, category) {
  const item = document.createElement('div');
  item.className = 'admin-image-item';
  item.innerHTML = `
    <img src="${img.storageUrl}" alt="${escapeHtml(img.description || img.fileName || '')}" loading="lazy" />
    <button class="btn-delete-img" title="حذف الصورة">✕</button>
  `;

  item.addEventListener('click', (e) => {
    if (e.target.closest('.btn-delete-img')) return;
    toggleSelectImage(img, category, item);
  });

  item.querySelector('.btn-delete-img').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('هل تريد حذف هذه الصورة؟')) return;
    try {
      if (img.storagePath) {
        try { await deleteObject(ref(storage, img.storagePath)); } catch (_) {}
      }
      await deleteDoc(doc(db, 'images', img.id));
      item.remove();
      allImageItems[category] = allImageItems[category].filter(i => i.img.id !== img.id);
      // Remove from selection if selected
      const idx = selectedImages.findIndex(s => s.id === img.id);
      if (idx >= 0) { selectedImages.splice(idx, 1); updateSelectionPanel(); }
      showToast('تم حذف الصورة', 'success');
    } catch (err) {
      console.error(err);
      showToast('تعذّر حذف الصورة', 'error');
    }
  });

  return item;
}

// =====================
// Select All / Deselect All
// =====================
document.querySelectorAll('.btn-select-all').forEach(btn => {
  btn.addEventListener('click', () => {
    const category = btn.dataset.category;
    allImageItems[category].forEach(({ img, element }) => {
      if (!selectedImages.find(s => s.id === img.id)) {
        selectedImages.push({ id: img.id, storagePath: img.storagePath, storageUrl: img.storageUrl, sectionId: img.sectionId, fileName: img.fileName || '', description: img.description || '', element, category });
        element.classList.add('selected');
      }
    });
    updateSelectionPanel();
  });
});

document.querySelectorAll('.btn-deselect-all').forEach(btn => {
  btn.addEventListener('click', () => {
    clearSelection();
  });
});

// =====================
// Bulk Selection + Side Panel
// =====================
const selectionPanel  = document.getElementById('selection-panel');
const selCount        = document.getElementById('sel-count');
const selMoveSelect   = document.getElementById('sel-move-select');
const selMoveBtn      = document.getElementById('sel-move-btn');
const selDuplicateBtn = document.getElementById('sel-duplicate-btn');
const selDeleteBtn    = document.getElementById('sel-delete-btn');
const selCancelBtn    = document.getElementById('sel-cancel-btn');

let selectedImages = [];

function toggleSelectImage(imgData, category, element) {
  const idx = selectedImages.findIndex(s => s.id === imgData.id);
  if (idx >= 0) {
    selectedImages.splice(idx, 1);
    element.classList.remove('selected');
  } else {
    selectedImages.push({ id: imgData.id, storagePath: imgData.storagePath, storageUrl: imgData.storageUrl, sectionId: imgData.sectionId, fileName: imgData.fileName || '', description: imgData.description || '', element, category });
    element.classList.add('selected');
  }
  updateSelectionPanel();
}

function updateSelectionPanel() {
  if (selectedImages.length === 0) {
    selectionPanel.classList.remove('show');
    return;
  }
  selectionPanel.classList.add('show');
  selCount.textContent = `${selectedImages.length} صورة محددة`;

  // Show ALL sections across all categories, grouped
  const catLabels = { 'ready-made': 'جاهز', 'tailored': 'فصال', 'fabrics': 'أقمشة' };
  selMoveSelect.innerHTML = '<option value="">اختر القسم...</option>';
  for (const cat of ['ready-made', 'tailored', 'fabrics']) {
    const sections = sectionsCache[cat] || [];
    if (sections.length === 0) continue;
    const group = document.createElement('optgroup');
    group.label = `── ${catLabels[cat]} ──`;
    sections.forEach(s => {
      const opt = document.createElement('option');
      opt.value = `${s.id}|${cat}`;
      opt.textContent = escapeHtml(s.name);
      group.appendChild(opt);
    });
    selMoveSelect.appendChild(group);
  }
}

function clearSelection() {
  selectedImages.forEach(s => s.element.classList.remove('selected'));
  selectedImages = [];
  updateSelectionPanel();
}

selCancelBtn.addEventListener('click', clearSelection);

// Bulk Delete
selDeleteBtn.addEventListener('click', async () => {
  if (!confirm(`هل تريد حذف ${selectedImages.length} صورة؟`)) return;
  const category = selectedImages[0].category;
  let deleted = 0;
  for (const img of selectedImages) {
    try {
      if (img.storagePath) {
        try { await deleteObject(ref(storage, img.storagePath)); } catch (_) {}
      }
      await deleteDoc(doc(db, 'images', img.id));
      deleted++;
    } catch (err) {
      console.error('Failed to delete:', img.id, err);
    }
  }
  showToast(`تم حذف ${deleted} صورة`, 'success');
  selectedImages = [];
  selectionPanel.classList.remove('show');
  await loadPhotos(category);
});

// Parse "sectionId|category" from select value
function parseSelectValue(val) {
  const [sectionId, cat] = val.split('|');
  return { sectionId, cat };
}

// Bulk Move
selMoveBtn.addEventListener('click', async () => {
  if (!selMoveSelect.value) { showToast('اختر القسم المستهدف أولاً', 'error'); return; }
  const { sectionId: newSectionId, cat: targetCat } = parseSelectValue(selMoveSelect.value);
  const sourceCategory = selectedImages[0].category;
  let moved = 0;
  for (const img of selectedImages) {
    try {
      await updateDoc(doc(db, 'images', img.id), { sectionId: newSectionId });
      moved++;
    } catch (err) {
      console.error('Failed to move:', img.id, err);
    }
  }
  showToast(`تم نقل ${moved} صورة`, 'success');
  const affectedCategories = new Set([sourceCategory, targetCat]);
  selectedImages = [];
  selectionPanel.classList.remove('show');
  for (const cat of affectedCategories) await loadPhotos(cat);
});

// Bulk Duplicate (copy to section — keeps original, creates new Firestore record)
selDuplicateBtn.addEventListener('click', async () => {
  if (!selMoveSelect.value) { showToast('اختر القسم المستهدف أولاً', 'error'); return; }
  const { sectionId: newSectionId, cat: targetCat } = parseSelectValue(selMoveSelect.value);
  const sourceCategory = selectedImages[0].category;

  let maxOrder = 0;
  const snap = await getDocs(query(collection(db, 'images'), where('sectionId', '==', newSectionId)));
  snap.docs.forEach(d => { const o = d.data().order || 0; if (o > maxOrder) maxOrder = o; });

  let copied = 0;
  for (const img of selectedImages) {
    try {
      maxOrder++;
      await addDoc(collection(db, 'images'), {
        sectionId: newSectionId,
        storageUrl: img.storageUrl,
        storagePath: img.storagePath || '',
        fileName: img.fileName || '',
        description: img.description || '',
        order: maxOrder,
        createdAt: serverTimestamp()
      });
      copied++;
    } catch (err) {
      console.error('Failed to copy:', img.id, err);
    }
  }
  showToast(`تم نسخ ${copied} صورة إلى القسم`, 'success');
  const affectedCategories = new Set([sourceCategory, targetCat]);
  selectedImages = [];
  selectionPanel.classList.remove('show');
  for (const cat of affectedCategories) await loadPhotos(cat);
});


// =====================
// Orders — Sub-nav
// =====================
document.querySelectorAll('.orders-subnav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.orders-subnav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    document.getElementById('orders-pipeline-view').style.display  = view === 'pipeline'  ? 'block' : 'none';
    document.getElementById('orders-customers-view').style.display = view === 'customers' ? 'block' : 'none';
    if (view === 'customers') loadCustomers();
  });
});

document.getElementById('customers-search').addEventListener('input', e => {
  renderCustomers(window._allCustomers || [], e.target.value.trim());
});

// =====================
// Load Orders
// =====================
const STATUS_LABELS = {
  new: '🆕 جديد',
  in_progress: '⚙️ قيد التنفيذ',
  ready: '✅ جاهز',
  delivered: '📦 تم التسليم'
};

async function loadOrders() {
  // Clear columns
  ['new','in_progress','ready','delivered'].forEach(s => {
    const el = document.getElementById(`col-${s}`);
    if (el) el.innerHTML = '<div class="loading-text">جارٍ التحميل...</div>';
  });

  try {
    const snap = await getDocs(collection(db, 'orders'));
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.seconds || 0;
        const tb = b.createdAt?.seconds || 0;
        return tb - ta; // newest first
      });

    ['new','in_progress','ready','delivered'].forEach(status => {
      const col = document.getElementById(`col-${status}`);
      if (!col) return;
      const colOrders = orders.filter(o => (o.status || 'new') === status);
      col.innerHTML = '';
      if (colOrders.length === 0) {
        col.innerHTML = '<div class="kanban-empty">لا توجد طلبات</div>';
        return;
      }
      colOrders.forEach(order => col.appendChild(buildOrderCard(order)));
    });

  } catch (err) {
    console.error('Failed to load orders:', err);
    document.getElementById('col-new').innerHTML = '<div class="loading-text">تعذّر التحميل</div>';
  }
}

// =====================
// Build Order Card
// =====================
function buildOrderCard(order) {
  const card = document.createElement('div');
  card.className = 'order-card';

  const shortId   = order.id.slice(-6).toUpperCase();
  const name      = order.customerName || 'بدون اسم';
  const phone     = order.customerPhone || '';
  const fabricUrl = order.fabricUrl || '';
  const m         = order.measurements || {};
  const date      = order.createdAt?.seconds
    ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('ar-IQ', { day:'numeric', month:'short' })
    : '';

  card.innerHTML = `
    <div class="order-card-top">
      <span class="order-card-id">#${shortId}</span>
      <span class="order-card-date">${date}</span>
    </div>
    <div class="order-card-name">${escapeHtml(name)}</div>
    ${phone ? `<div class="order-card-phone">📱 ${escapeHtml(phone)}</div>` : ''}
    ${fabricUrl ? `<img class="order-card-fabric" src="${fabricUrl}" alt="القماش" loading="lazy" />` : ''}
    <div class="order-card-measurements">
      ${m.totalLength ? `<span>الطول: ${m.totalLength}</span>` : ''}
      ${m.chest       ? `<span>الصدر: ${m.chest}</span>` : ''}
    </div>
  `;

  card.addEventListener('click', () => openOrderDrawer(order));
  return card;
}

// =====================
// Order Detail Drawer
// =====================
const orderDrawer        = document.getElementById('order-drawer');
const orderDrawerOverlay = document.getElementById('order-drawer-overlay');
const orderDrawerClose   = document.getElementById('order-drawer-close');
const orderDrawerBody    = document.getElementById('order-drawer-body');
const orderDrawerIdEl    = document.getElementById('order-drawer-id');
const orderDrawerDateEl  = document.getElementById('order-drawer-date');

orderDrawerOverlay.addEventListener('click', closeOrderDrawer);
orderDrawerClose.addEventListener('click', closeOrderDrawer);

function closeOrderDrawer() {
  orderDrawer.classList.remove('open');
}

function openOrderDrawer(order) {
  const shortId = order.id.slice(-6).toUpperCase();
  const m       = order.measurements || {};
  const date    = order.createdAt?.seconds
    ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('ar-IQ', { year:'numeric', month:'long', day:'numeric' })
    : '';

  orderDrawerIdEl.textContent   = `#${shortId}`;
  orderDrawerDateEl.textContent = date;

  const measureRows = [
    { label: 'الطول الكلي', value: m.totalLength },
    { label: 'الصدر',       value: m.chest },
    { label: 'الكتف',       value: m.shoulder },
    { label: 'الياخة',      value: m.neck },
    { label: 'طول الردن',   value: m.sleeveLength },
    { label: 'عرض الردن',   value: m.sleeveWidth },
  ].filter(r => r.value);

  const statusOptions = Object.entries(STATUS_LABELS)
    .map(([val, label]) => `<option value="${val}" ${(order.status || 'new') === val ? 'selected' : ''}>${label}</option>`)
    .join('');

  const waLink = order.customerPhone
    ? `https://wa.me/${order.customerPhone.replace(/\D/g,'')}?text=${encodeURIComponent(`مرحباً ${order.customerName || ''}، بخصوص طلبك #${shortId}`)}`
    : '';

  orderDrawerBody.innerHTML = `
    ${order.customerName ? `<div class="drawer-section"><div class="drawer-label">العميل</div><div class="drawer-value drawer-name">${escapeHtml(order.customerName)}</div></div>` : ''}
    ${order.customerPhone ? `
      <div class="drawer-section">
        <div class="drawer-label">رقم الهاتف</div>
        <div class="drawer-value">
          <a href="${waLink}" class="drawer-phone-btn" target="_blank" rel="noopener">
            📱 ${escapeHtml(order.customerPhone)}
          </a>
        </div>
      </div>` : ''}

    <div class="drawer-section">
      <div class="drawer-label">القياسات (سم)</div>
      <div class="drawer-measurements">
        ${measureRows.map(r => `<div class="drawer-measure-row"><span>${r.label}</span><strong>${r.value}</strong></div>`).join('')}
      </div>
    </div>

    ${order.fabricUrl ? `
      <div class="drawer-section">
        <div class="drawer-label">القماش المختار</div>
        <img class="drawer-fabric-img" src="${order.fabricUrl}" alt="القماش" />
      </div>` : ''}

    ${order.notes ? `
      <div class="drawer-section">
        <div class="drawer-label">ملاحظات</div>
        <div class="drawer-value">${escapeHtml(order.notes)}</div>
      </div>` : ''}

    <div class="drawer-section">
      <div class="drawer-label">حالة الطلب</div>
      <select class="drawer-status-select" id="drawer-status-${order.id}">
        ${statusOptions}
      </select>
      <button class="drawer-status-btn" data-id="${order.id}">حفظ الحالة</button>
    </div>

    <button class="drawer-delete-btn" data-id="${order.id}">🗑️ حذف الطلب</button>
  `;

  // Wire status save
  orderDrawerBody.querySelector('.drawer-status-btn').addEventListener('click', async e => {
    const id  = e.target.dataset.id;
    const sel = document.getElementById(`drawer-status-${id}`);
    try {
      await updateDoc(doc(db, 'orders', id), {
        status: sel.value,
        updatedAt: serverTimestamp()
      });
      showToast('تم تحديث الحالة', 'success');
      order.status = sel.value;
      closeOrderDrawer();
      loadOrders();
    } catch (err) {
      console.error(err);
      showToast('تعذّر التحديث', 'error');
    }
  });

  // Wire delete
  orderDrawerBody.querySelector('.drawer-delete-btn').addEventListener('click', async e => {
    if (!confirm('هل تريد حذف هذا الطلب نهائياً؟')) return;
    try {
      await deleteDoc(doc(db, 'orders', e.target.dataset.id));
      showToast('تم حذف الطلب', 'success');
      closeOrderDrawer();
      loadOrders();
    } catch (err) {
      console.error(err);
      showToast('تعذّر الحذف', 'error');
    }
  });

  orderDrawer.classList.add('open');
}

// =====================
// Customers
// =====================
async function loadCustomers() {
  const list = document.getElementById('customers-list');
  list.innerHTML = '<div class="loading-text">جارٍ التحميل...</div>';

  try {
    const snap = await getDocs(collection(db, 'orders'));
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Build unique customers by phone (or name if no phone)
    const map = {};
    orders.forEach(o => {
      const key = o.customerPhone || o.customerName || 'unknown';
      if (!key || key === 'unknown') return;
      if (!map[key]) {
        map[key] = { name: o.customerName || '', phone: o.customerPhone || '', orders: [], measurements: o.measurements };
      }
      map[key].orders.push(o);
    });

    const customers = Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    window._allCustomers = customers;
    renderCustomers(customers, document.getElementById('customers-search').value.trim());
  } catch (err) {
    console.error(err);
    list.innerHTML = '<div class="loading-text">تعذّر التحميل</div>';
  }
}

function renderCustomers(customers, search = '') {
  const list = document.getElementById('customers-list');
  let filtered = customers;
  if (search) {
    const q = search.toLowerCase();
    filtered = customers.filter(c =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  }

  if (filtered.length === 0) {
    list.innerHTML = '<div class="loading-text">لا يوجد عملاء مطابقون</div>';
    return;
  }

  list.innerHTML = '';
  filtered.forEach(customer => {
    const row = document.createElement('div');
    row.className = 'customer-row';
    const orderCount = customer.orders.length;
    const lastDate   = customer.orders.reduce((latest, o) => {
      const t = o.createdAt?.seconds || 0;
      return t > latest ? t : latest;
    }, 0);
    const lastDateStr = lastDate
      ? new Date(lastDate * 1000).toLocaleDateString('ar-IQ', { day:'numeric', month:'short', year:'numeric' })
      : '';

    row.innerHTML = `
      <div class="customer-row-info">
        <div class="customer-row-name">${escapeHtml(customer.name) || 'بدون اسم'}</div>
        ${customer.phone ? `<div class="customer-row-phone">📱 ${escapeHtml(customer.phone)}</div>` : ''}
      </div>
      <div class="customer-row-meta">
        <span class="customer-orders-badge">${orderCount} ${orderCount === 1 ? 'طلب' : 'طلبات'}</span>
        ${lastDateStr ? `<span class="customer-last-date">${lastDateStr}</span>` : ''}
      </div>
    `;

    row.addEventListener('click', () => showCustomerOrders(customer));
    list.appendChild(row);
  });
}

function showCustomerOrders(customer) {
  // Open drawer showing all orders for this customer
  const shortName = customer.name || customer.phone || 'عميل';
  orderDrawerIdEl.textContent   = escapeHtml(shortName);
  orderDrawerDateEl.textContent = `${customer.orders.length} طلب`;

  const waLink = customer.phone
    ? `https://wa.me/${customer.phone.replace(/\D/g,'')}?text=${encodeURIComponent(`مرحباً ${customer.name}`)}`
    : '';

  orderDrawerBody.innerHTML = `
    ${customer.phone ? `<div class="drawer-section"><a href="${waLink}" class="drawer-phone-btn" target="_blank">📱 تواصل عبر واتساب</a></div>` : ''}
    <div class="drawer-section">
      <div class="drawer-label">سجل الطلبات</div>
      ${customer.orders.map(o => {
        const shortId = o.id.slice(-6).toUpperCase();
        const date    = o.createdAt?.seconds
          ? new Date(o.createdAt.seconds * 1000).toLocaleDateString('ar-IQ', { day:'numeric', month:'short' })
          : '';
        return `
          <div class="customer-order-item" data-id="${o.id}">
            <span>#${shortId}</span><span>${STATUS_LABELS[o.status || 'new'] || ''}</span><span>${date}</span>
          </div>`;
      }).join('')}
    </div>
    ${customer.measurements ? `
      <div class="drawer-section">
        <div class="drawer-label">آخر قياسات مسجّلة</div>
        <div class="drawer-measurements">
          ${Object.entries(customer.measurements).map(([k, v]) => v ? `<div class="drawer-measure-row"><span>${k}</span><strong>${v} سم</strong></div>` : '').join('')}
        </div>
      </div>` : ''}
  `;

  // Tap order item → open that order's drawer
  orderDrawerBody.querySelectorAll('.customer-order-item').forEach(el => {
    el.addEventListener('click', () => {
      const o = customer.orders.find(x => x.id === el.dataset.id);
      if (o) openOrderDrawer(o);
    });
  });

  orderDrawer.classList.add('open');
}

// =====================
// Utility
// =====================
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
