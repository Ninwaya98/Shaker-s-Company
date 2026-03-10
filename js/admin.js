// Admin Panel Logic — Simplified for ease of use
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
// In-memory sections cache (reloaded from Firestore)
// =====================
let sectionsCache = { 'ready-made': [], 'tailored': [], 'fabrics': [] };

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
    const cat = btn.dataset.category;
    tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    panels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById(`panel-${cat}`).classList.add('active');
  });
});

// =====================
// Init Dashboard — loads sections then photos
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

    // Auto-create default section if none exist
    if (sectionsCache[category].length === 0) {
      const name = category === 'ready-made' ? 'دشاديش جاهزة' : category === 'tailored' ? 'دشاديش فصال' : 'أقمشة';
      const newDoc = await addDoc(collection(db, 'sections'), {
        name,
        category,
        order: 1,
        isDefault: true,
        createdAt: serverTimestamp()
      });
      sectionsCache[category] = [{ id: newDoc.id, name, category, order: 1, isDefault: true }];
    }
  }
}

// =====================
// Get default section ID for a category
// =====================
function getDefaultSectionId(category) {
  const sections = sectionsCache[category];
  const def = sections.find(s => s.isDefault);
  return def ? def.id : sections[0].id;
}

// =====================
// Render full category panel (sections list + photos)
// =====================
async function renderCategory(category) {
  renderSectionsList(category);
  await loadPhotos(category);
}

// =====================
// Render Sections List
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
      if (section.isDefault) {
        showToast('لا يمكن حذف القسم الرئيسي', 'error');
        return;
      }
      if (!confirm(`حذف قسم "${section.name}"؟ سيتم نقل صوره إلى القسم الرئيسي.`)) return;

      try {
        const defaultId = getDefaultSectionId(category);
        // Move all images to default section
        const imgSnap = await getDocs(query(collection(db, 'images'), where('sectionId', '==', section.id)));
        const batch = writeBatch(db);
        imgSnap.docs.forEach(imgDoc => {
          batch.update(imgDoc.ref, { sectionId: defaultId });
        });
        batch.delete(doc(db, 'sections', section.id));
        await batch.commit();

        showToast('تم حذف القسم ونقل صوره', 'success');
        await loadSectionsCache();
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
// Add Section Forms
// =====================
document.querySelectorAll('.add-section-form').forEach(form => {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const category = form.dataset.category;
    const input    = form.querySelector('input');
    const name     = input.value.trim();
    if (!name) return;

    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'جارٍ الحفظ...';

    try {
      let maxOrder = 0;
      sectionsCache[category].forEach(s => {
        if ((s.order || 0) > maxOrder) maxOrder = s.order;
      });

      await addDoc(collection(db, 'sections'), {
        name,
        category,
        order: maxOrder + 1,
        createdAt: serverTimestamp()
      });

      input.value = '';
      showToast('تم إضافة القسم', 'success');

      // Reload sections and re-render
      await loadSectionsCache();
      renderSectionsList(category);
      // Re-render photos so dropdowns update with new section
      await loadPhotos(category);
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '+ إضافة قسم';
    }
  });
});

// =====================
// Quick Upload (Big Button)
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

  // Warn about large files (>5MB)
  const MAX_SIZE = 5 * 1024 * 1024;
  const largeFiles = Array.from(files).filter(f => f.size > MAX_SIZE);
  if (largeFiles.length > 0) {
    const names = largeFiles.map(f => f.name).join(', ');
    if (!confirm(`هذه الصور كبيرة الحجم (أكثر من 5MB):\n${names}\n\nهل تريد المتابعة؟`)) return;
  }

  const progressWrap = document.getElementById(`quick-progress-${category}`);
  const progressBar  = document.getElementById(`quick-bar-${category}`);
  const grid         = document.getElementById(`photos-${category}`);

  progressWrap.classList.add('show');
  progressBar.style.width = '0%';

  try {
    const sectionId = getDefaultSectionId(category);

    // Get current max order across ALL images in this category
    let orderCounter = 0;
    for (const sec of sectionsCache[category]) {
      const snap = await getDocs(query(collection(db, 'images'), where('sectionId', '==', sec.id)));
      snap.docs.forEach(d => {
        const o = d.data().order || 0;
        if (o > orderCounter) orderCounter = o;
      });
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
                sectionId,
                storageUrl: url,
                storagePath,
                fileName: file.name,
                description: '',
                order: orderCounter,
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
    setTimeout(() => {
      progressWrap.classList.remove('show');
      progressBar.style.width = '0%';
    }, 600);

    showToast(`تم رفع ${done} صورة بنجاح`, 'success');

    // Reset file input & reload the photos grid
    document.getElementById(`quick-file-${category}`).value = '';
    await loadPhotos(category);

  } catch (err) {
    console.error(err);
    showToast('حدث خطأ أثناء الرفع', 'error');
    progressWrap.classList.remove('show');
  }
}

// =====================
// Load & Render Photos (grouped by section)
// =====================
async function loadPhotos(category) {
  const grid = document.getElementById(`photos-${category}`);
  grid.innerHTML = '<div class="loading-text">جارٍ التحميل...</div>';

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

      // Section header
      const header = document.createElement('div');
      header.className = 'photo-section-header';
      header.innerHTML = `<h3>${escapeHtml(section.name)}</h3><span class="photo-count">${images.length} صورة</span>`;
      grid.appendChild(header);

      // Images grid
      const imgGrid = document.createElement('div');
      imgGrid.className = 'admin-image-grid';

      images.forEach(img => {
        imgGrid.appendChild(buildImageItem(img, category));
      });

      grid.appendChild(imgGrid);
    }

    if (!hasAnyImages) {
      grid.innerHTML = '<div class="loading-text">لا توجد صور. اضغط على المنطقة أعلاه لإضافة صور.</div>';
    }
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<div class="loading-text">تعذّر التحميل.</div>';
  }
}

// =====================
// Build Image Item — simple: image + X delete button, tap to select
// =====================
function buildImageItem(img, category) {
  const item = document.createElement('div');
  item.className = 'admin-image-item';

  item.innerHTML = `
    <img src="${img.storageUrl}" alt="${escapeHtml(img.description || img.fileName || '')}" loading="lazy" />
    <button class="btn-delete-img" title="حذف الصورة">✕</button>
  `;

  // Tap image to select/deselect
  item.addEventListener('click', (e) => {
    if (e.target.closest('.btn-delete-img')) return;
    toggleSelectImage(img, category, item);
  });

  // Single delete via X button
  item.querySelector('.btn-delete-img').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('هل تريد حذف هذه الصورة؟')) return;
    try {
      if (img.storagePath) {
        try { await deleteObject(ref(storage, img.storagePath)); } catch (_) {}
      }
      await deleteDoc(doc(db, 'images', img.id));
      item.remove();
      showToast('تم حذف الصورة', 'success');
    } catch (err) {
      console.error(err);
      showToast('تعذّر حذف الصورة', 'error');
    }
  });

  return item;
}

// =====================
// Bulk Selection + Side Panel
// =====================
const selectionPanel = document.getElementById('selection-panel');
const selCount       = document.getElementById('sel-count');
const selMoveSelect  = document.getElementById('sel-move-select');
const selMoveBtn     = document.getElementById('sel-move-btn');
const selDeleteBtn   = document.getElementById('sel-delete-btn');
const selCancelBtn   = document.getElementById('sel-cancel-btn');

let selectedImages = [];

function toggleSelectImage(imgData, category, element) {
  const idx = selectedImages.findIndex(s => s.id === imgData.id);
  if (idx >= 0) {
    selectedImages.splice(idx, 1);
    element.classList.remove('selected');
  } else {
    selectedImages.push({ id: imgData.id, storagePath: imgData.storagePath, sectionId: imgData.sectionId, element, category });
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

  const category = selectedImages[0].category;
  const sections = sectionsCache[category] || [];
  selMoveSelect.innerHTML = '<option value="">اختر القسم...</option>';
  sections.forEach(s => {
    selMoveSelect.innerHTML += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
  });
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

// Bulk Move
selMoveBtn.addEventListener('click', async () => {
  const newSectionId = selMoveSelect.value;
  if (!newSectionId) {
    showToast('اختر القسم أولاً', 'error');
    return;
  }
  const category = selectedImages[0].category;
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
  selectedImages = [];
  selectionPanel.classList.remove('show');
  await loadPhotos(category);
});

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
