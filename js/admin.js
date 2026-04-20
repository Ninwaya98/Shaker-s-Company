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
// Image Compression
// =====================
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

async function compressImage(file) {
  if (file.size <= MAX_FILE_SIZE) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // Scale down if very large
      const maxDim = 2048;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Try decreasing quality until under 2MB
      let quality = 0.85;
      const tryCompress = () => {
        canvas.toBlob((blob) => {
          if (blob.size <= MAX_FILE_SIZE || quality <= 0.3) {
            const compressed = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
            resolve(compressed);
          } else {
            quality -= 0.1;
            tryCompress();
          }
        }, 'image/jpeg', quality);
      };
      tryCompress();
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function compressFiles(files) {
  const result = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) { result.push(file); continue; }
    const compressed = await compressImage(file);
    if (compressed.size !== file.size) {
      const saved = ((1 - compressed.size / file.size) * 100).toFixed(0);
      console.log(`Compressed ${file.name}: ${(file.size/1024/1024).toFixed(1)}MB → ${(compressed.size/1024/1024).toFixed(1)}MB (-${saved}%)`);
    }
    result.push(compressed);
  }
  return result;
}

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

    document.getElementById(`panel-${btn.dataset.category}`).classList.add('active');
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
  const cats = ['ready-made', 'tailored', 'fabrics'];
  const snaps = await Promise.all(cats.map(cat =>
    getDocs(query(collection(db, 'sections'), where('category', '==', cat)))
  ));

  for (let i = 0; i < cats.length; i++) {
    const category = cats[i];
    sectionsCache[category] = snaps[i].docs
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
// Active section tracking (per category)
// =====================
let activeSectionId = { 'ready-made': null, 'tailored': null, 'fabrics': null };

function getUploadSectionId(category) {
  if (activeSectionId[category]) return activeSectionId[category];
  return getDefaultSectionId(category);
}

function getDefaultSectionId(category) {
  const sections = sectionsCache[category];
  const def = sections.find(s => s.isDefault);
  return def ? def.id : sections[0].id;
}

// =====================
// Section Pills Bar
// =====================
function renderSectionPills(category) {
  const container = document.getElementById(`section-pills-${category}`);
  if (!container) return;
  const sections = sectionsCache[category];
  container.innerHTML = '';

  // Set default active if not set
  if (!activeSectionId[category] || !sections.find(s => s.id === activeSectionId[category])) {
    activeSectionId[category] = getDefaultSectionId(category);
  }

  sections.forEach((section, idx) => {
    const pill = document.createElement('div');
    pill.className = 'section-pill';
    pill.dataset.sectionId = section.id;
    pill.dataset.category = category;
    pill.draggable = true;

    if (section.isDefault) pill.classList.add('default');
    if (section.id === activeSectionId[category]) pill.classList.add('active');

    // Badge for default
    const badge = document.createElement('span');
    badge.className = 'pill-badge';
    badge.textContent = 'رئيسي';
    pill.appendChild(badge);

    // Name (contenteditable on double-click)
    const name = document.createElement('span');
    name.className = 'pill-name';
    name.textContent = section.name;
    pill.appendChild(name);

    // Arrow buttons
    const arrows = document.createElement('span');
    arrows.className = 'pill-arrows';
    if (idx > 0) {
      const leftArrow = document.createElement('button');
      leftArrow.className = 'pill-arrow';
      leftArrow.innerHTML = '►';
      leftArrow.title = 'تقديم';
      leftArrow.addEventListener('click', (e) => { e.stopPropagation(); reorderSection(category, section.id, -1); });
      arrows.appendChild(leftArrow);
    }
    if (idx < sections.length - 1) {
      const rightArrow = document.createElement('button');
      rightArrow.className = 'pill-arrow';
      rightArrow.innerHTML = '◄';
      rightArrow.title = 'تأخير';
      rightArrow.addEventListener('click', (e) => { e.stopPropagation(); reorderSection(category, section.id, 1); });
      arrows.appendChild(rightArrow);
    }
    pill.appendChild(arrows);

    // Delete button (hidden for default)
    const del = document.createElement('button');
    del.className = 'pill-delete';
    del.innerHTML = '✕';
    del.title = 'حذف القسم';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteSection(category, section); });
    pill.appendChild(del);

    // Click to select
    pill.addEventListener('click', () => {
      activeSectionId[category] = section.id;
      container.querySelectorAll('.section-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });

    // Double-click to rename
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      name.contentEditable = 'true';
      name.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(name);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
      if (e.key === 'Escape') { name.textContent = section.name; name.contentEditable = 'false'; }
    });

    name.addEventListener('blur', () => {
      name.contentEditable = 'false';
      const newName = name.textContent.trim();
      if (newName && newName !== section.name) {
        renameSection(section.id, newName, category);
      } else {
        name.textContent = section.name;
      }
    });

    // Drag handlers
    pill.addEventListener('dragstart', (e) => {
      pill.classList.add('dragging');
      e.dataTransfer.setData('text/plain', section.id);
      e.dataTransfer.effectAllowed = 'move';
    });

    pill.addEventListener('dragend', () => {
      pill.classList.remove('dragging');
      container.querySelectorAll('.section-pill').forEach(p => p.classList.remove('drag-over'));
    });

    pill.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const dragging = container.querySelector('.dragging');
      if (dragging && dragging !== pill) {
        pill.classList.add('drag-over');
      }
    });

    pill.addEventListener('dragleave', () => {
      pill.classList.remove('drag-over');
    });

    pill.addEventListener('drop', async (e) => {
      e.preventDefault();
      pill.classList.remove('drag-over');
      const draggedId = e.dataTransfer.getData('text/plain');
      if (draggedId && draggedId !== section.id) {
        await reorderByDrop(category, draggedId, section.id);
      }
    });

    // Touch drag support
    let touchStartX = 0;
    let touchClone = null;

    pill.addEventListener('touchstart', (e) => {
      // Only start drag on long press (handled via CSS or timer)
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    container.appendChild(pill);
  });

  // Add section button
  const addBtn = document.createElement('button');
  addBtn.className = 'section-pill-add';
  addBtn.innerHTML = '+ قسم جديد';
  addBtn.addEventListener('click', () => {
    showAddSectionInput(category, container, addBtn);
  });
  container.appendChild(addBtn);
}

// =====================
// Add Section (inline input in pill bar)
// =====================
function showAddSectionInput(category, container, addBtn) {
  // Replace the + button with an input form
  const wrapper = document.createElement('div');
  wrapper.className = 'section-pill-add';
  wrapper.style.borderStyle = 'solid';
  wrapper.style.background = '#fff';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'اسم القسم...';
  input.maxLength = 60;

  const actions = document.createElement('span');
  actions.className = 'pill-add-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'pill-add-btn';
  saveBtn.textContent = '✓';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pill-cancel-btn';
  cancelBtn.textContent = '✕';

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  wrapper.appendChild(input);
  wrapper.appendChild(actions);

  addBtn.replaceWith(wrapper);
  input.focus();

  async function save() {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }

    saveBtn.disabled = true;
    try {
      let maxOrder = 0;
      sectionsCache[category].forEach(s => { if ((s.order || 0) > maxOrder) maxOrder = s.order; });

      const newDoc = await addDoc(collection(db, 'sections'), {
        name, category, order: maxOrder + 1, createdAt: serverTimestamp()
      });

      showToast('تم إضافة القسم', 'success');
      await loadSectionsCache();
      activeSectionId[category] = newDoc.id;
      renderSectionPills(category);
      await loadPhotos(category);
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ', 'error');
      wrapper.replaceWith(addBtn);
    }
  }

  function cancel() {
    wrapper.replaceWith(addBtn);
  }

  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', cancel);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') cancel();
  });
}

// =====================
// Rename Section
// =====================
async function renameSection(sectionId, newName, category) {
  try {
    await updateDoc(doc(db, 'sections', sectionId), { name: newName });
    // Update cache
    const section = sectionsCache[category].find(s => s.id === sectionId);
    if (section) section.name = newName;
    showToast('تم تغيير الاسم', 'success');
  } catch (err) {
    console.error(err);
    showToast('تعذّر تغيير الاسم', 'error');
    renderSectionPills(category); // revert display
  }
}

// =====================
// Reorder Section (arrow buttons)
// =====================
async function reorderSection(category, sectionId, direction) {
  const sections = sectionsCache[category];
  const idx = sections.findIndex(s => s.id === sectionId);
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= sections.length) return;

  const a = sections[idx];
  const b = sections[swapIdx];

  try {
    const batchOp = writeBatch(db);
    const tempOrder = a.order;
    batchOp.update(doc(db, 'sections', a.id), { order: b.order });
    batchOp.update(doc(db, 'sections', b.id), { order: tempOrder });
    await batchOp.commit();

    // Swap in cache
    const tmp = a.order;
    a.order = b.order;
    b.order = tmp;
    sectionsCache[category].sort((x, y) => (x.order || 0) - (y.order || 0));

    renderSectionPills(category);
    await loadPhotos(category);
  } catch (err) {
    console.error(err);
    showToast('تعذّر إعادة الترتيب', 'error');
  }
}

// =====================
// Reorder by Drag & Drop
// =====================
async function reorderByDrop(category, draggedId, targetId) {
  const sections = sectionsCache[category];
  const draggedIdx = sections.findIndex(s => s.id === draggedId);
  const targetIdx = sections.findIndex(s => s.id === targetId);
  if (draggedIdx === -1 || targetIdx === -1) return;

  // Move dragged to target position
  const [moved] = sections.splice(draggedIdx, 1);
  sections.splice(targetIdx, 0, moved);

  // Reassign order values
  try {
    const batchOp = writeBatch(db);
    sections.forEach((s, i) => {
      const newOrder = i + 1;
      if (s.order !== newOrder) {
        batchOp.update(doc(db, 'sections', s.id), { order: newOrder });
        s.order = newOrder;
      }
    });
    await batchOp.commit();

    renderSectionPills(category);
    await loadPhotos(category);
  } catch (err) {
    console.error(err);
    showToast('تعذّر إعادة الترتيب', 'error');
    await loadSectionsCache();
    renderSectionPills(category);
  }
}

// =====================
// Delete Section
// =====================
async function deleteSection(category, section) {
  if (section.isDefault) { showToast('لا يمكن حذف القسم الرئيسي', 'error'); return; }
  if (!confirm(`حذف قسم "${section.name}"؟ سيتم نقل صوره إلى القسم الرئيسي.`)) return;

  try {
    const defaultId = getDefaultSectionId(category);
    const imgSnap = await getDocs(query(collection(db, 'images'), where('sectionId', '==', section.id)));
    const batchOp = writeBatch(db);
    imgSnap.docs.forEach(imgDoc => { batchOp.update(imgDoc.ref, { sectionId: defaultId }); });
    batchOp.delete(doc(db, 'sections', section.id));
    await batchOp.commit();

    showToast('تم حذف القسم ونقل صوره', 'success');

    // If deleted section was active, switch to default
    if (activeSectionId[category] === section.id) {
      activeSectionId[category] = defaultId;
    }

    await loadSectionsCache();
    renderSectionPills(category);
    await loadPhotos(category);
  } catch (err) {
    console.error(err);
    showToast('تعذّر حذف القسم', 'error');
  }
}

// =====================
// Render full category panel
// =====================
async function renderCategory(category) {
  renderSectionPills(category);
  await loadPhotos(category);
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

  // Auto-compress images over 2MB
  const compressed = await compressFiles(Array.from(files));
  const hasCompressed = compressed.some((f, i) => f.size !== Array.from(files)[i]?.size);
  if (hasCompressed) showToast('تم ضغط بعض الصور تلقائياً', 'success');

  // Ready-made: redirect to upload modal with mandatory fields
  if (category === 'ready-made') {
    uploadQueue = compressed;
    uploadQueueIndex = 0;
    document.getElementById(`quick-file-${category}`).value = '';
    showUploadModal();
    return;
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

    let done = 0;

    for (const file of compressed) {
      try {
        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const storagePath = `images/${category}/${fileName}`;
        const storageRef = ref(storage, storagePath);

        await new Promise((resolve, reject) => {
          const task = uploadBytesResumable(storageRef, file);
          task.on('state_changed',
            snapshot => {
              const pct = ((done + snapshot.bytesTransferred / snapshot.totalBytes) / compressed.length) * 100;
              progressBar.style.width = `${Math.round(pct)}%`;
            },
            reject,
            async () => {
              const url = await getDownloadURL(task.snapshot.ref);
              orderCounter++;
              const imgDoc = {
                sectionId, storageUrl: url, storagePath,
                fileName: file.name, description: '', order: orderCounter,
                createdAt: serverTimestamp()
              };
              await addDoc(collection(db, 'images'), imgDoc);
              done++;
              progressBar.style.width = `${Math.round((done / compressed.length) * 100)}%`;
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

  // Hide grid toolbar for ready-made (uses inventory table instead)
  const gridToolbar = document.getElementById(`grid-toolbar-${category}`);
  if (gridToolbar) gridToolbar.style.display = category === 'ready-made' ? 'none' : '';

  try {
    const sections = sectionsCache[category];
    let allSectionImages = []; // for inventory table
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

      // For ready-made: collect for inventory table
      if (category === 'ready-made') {
        allSectionImages.push({ section, images });
        images.forEach(img => {
          allImageItems[category].push({ img, element: null });
        });
        continue;
      }

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

    // Ready-made: render inventory table
    if (category === 'ready-made') {
      if (allSectionImages.length === 0) {
        grid.innerHTML = '<div class="loading-text">لا توجد منتجات. اضغط على المنطقة أعلاه لإضافة منتج جديد.</div>';
      } else {
        renderInventoryTable(grid, allSectionImages);
      }
      return;
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

  let metaHtml = '';
  if (category === 'tailored' || category === 'fabrics') {
    const currentPrice = img.pricePerMeter || '';
    metaHtml = `<div class="admin-price-wrap">
        <input type="number" class="admin-price-input" value="${currentPrice}" placeholder="سعر/م" min="0" step="500" />
        <span class="admin-price-unit">د.ع</span>
       </div>`;
  } else if (category === 'ready-made') {
    const priceDisplay = img.price ? `${Number(img.price).toLocaleString()} د.ع` : '';
    const stockDisplay = img.quantity != null ? img.quantity : 0;
    metaHtml = `<div class="admin-readymade-summary">
      ${priceDisplay ? `<span class="rm-summary-price">${priceDisplay}</span>` : ''}
      <span class="rm-summary-stock">${stockDisplay} قطعة</span>
    </div>
    <button class="btn-edit-item" title="تعديل المنتج">✎</button>`;
  }

  item.innerHTML = `
    <img src="${img.storageUrl}" alt="${escapeHtml(img.description || img.fileName || '')}" loading="lazy" />
    <button class="btn-delete-img" title="حذف الصورة">✕</button>
    ${metaHtml}
  `;

  // Save price on change (tailored/fabrics)
  const priceInput = item.querySelector('.admin-price-input');
  if (priceInput) {
    priceInput.addEventListener('click', e => e.stopPropagation());
    priceInput.addEventListener('change', async () => {
      const val = Number(priceInput.value) || 0;
      try {
        await updateDoc(doc(db, 'images', img.id), { pricePerMeter: val });
        img.pricePerMeter = val;
        showToast('تم حفظ السعر', 'success');
      } catch (err) {
        console.error(err);
        showToast('تعذّر حفظ السعر', 'error');
      }
    });
  }

  // Edit button for ready-made items
  const editBtn = item.querySelector('.btn-edit-item');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditDrawer(img, category, item);
    });
  }

  item.addEventListener('click', (e) => {
    if (e.target.closest('.btn-delete-img') || e.target.closest('.admin-price-wrap') || e.target.closest('.btn-edit-item') || e.target.closest('.admin-readymade-summary')) return;
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
    document.body.classList.remove('sel-panel-open');
    return;
  }
  selectionPanel.classList.add('show');
  document.body.classList.add('sel-panel-open');
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
// Inventory Table (Ready-Made)
// =====================
function renderInventoryTable(container, sectionImages) {
  // Desktop table
  const tableWrap = document.createElement('div');
  tableWrap.className = 'inventory-table-wrap';

  let tableHtml = `<table class="inventory-table">
    <thead><tr>
      <th>صورة</th><th>اسم المنتج</th><th>السعر</th><th>الكمية</th>
      <th>المقاسات</th><th>الألوان</th><th>الحالة</th><th>إجراءات</th>
    </tr></thead><tbody>`;

  sectionImages.forEach(({ section, images }) => {
    tableHtml += `<tr class="inventory-section-header"><td colspan="8">${escapeHtml(section.name)} (${images.length})</td></tr>`;
    images.forEach(img => {
      const sizes = Array.isArray(img.sizes) ? img.sizes : [];
      const colors = Array.isArray(img.colors) ? img.colors : [];
      const price = img.price ? Number(img.price).toLocaleString() : '—';
      const qty = img.quantity != null ? img.quantity : 0;
      const statusClass = qty > 0 ? 'available' : 'sold-out';
      const statusText = qty > 0 ? 'متوفر' : 'نفذت';
      const name = img.description || img.fileName || '—';

      tableHtml += `<tr data-id="${img.id}">
        <td><img class="inventory-thumb" src="${img.storageUrl}" alt="" loading="lazy" /></td>
        <td>${escapeHtml(name)}</td>
        <td>${price} د.ع</td>
        <td>${qty}</td>
        <td><div class="inventory-chips">${sizes.map(s => `<span class="inventory-chip">${escapeHtml(s)}</span>`).join('')}</div></td>
        <td><div class="inventory-chips">${colors.map(c => `<span class="inventory-chip">${escapeHtml(c)}</span>`).join('')}</div></td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td><div class="inventory-actions">
          <button class="btn-table-edit" data-imgid="${img.id}" title="تعديل">✎</button>
          <button class="btn-table-delete" data-imgid="${img.id}" title="حذف">✕</button>
        </div></td>
      </tr>`;
    });
  });

  tableHtml += '</tbody></table>';
  tableWrap.innerHTML = tableHtml;
  container.appendChild(tableWrap);

  // Mobile card view
  const cardsWrap = document.createElement('div');
  cardsWrap.className = 'inventory-cards';

  sectionImages.forEach(({ section, images }) => {
    const secHeader = document.createElement('div');
    secHeader.className = 'inventory-section-card-header';
    secHeader.textContent = `${section.name} (${images.length})`;
    cardsWrap.appendChild(secHeader);

    images.forEach(img => {
      const sizes = Array.isArray(img.sizes) ? img.sizes : [];
      const colors = Array.isArray(img.colors) ? img.colors : [];
      const price = img.price ? Number(img.price).toLocaleString() : '—';
      const qty = img.quantity != null ? img.quantity : 0;
      const statusClass = qty > 0 ? 'available' : 'sold-out';
      const statusText = qty > 0 ? 'متوفر' : 'نفذت';
      const name = img.description || img.fileName || '—';

      const card = document.createElement('div');
      card.className = 'inventory-card';
      card.dataset.id = img.id;
      card.innerHTML = `
        <img class="inventory-card-thumb" src="${img.storageUrl}" alt="" loading="lazy" />
        <div class="inventory-card-info">
          <div class="inventory-card-name">${escapeHtml(name)}</div>
          <div class="inventory-card-details">
            <span>${price} د.ع</span>
            <span>${qty} قطعة</span>
          </div>
          <div class="inventory-chips">${sizes.map(s => `<span class="inventory-chip">${escapeHtml(s)}</span>`).join('')} ${colors.map(c => `<span class="inventory-chip">${escapeHtml(c)}</span>`).join('')}</div>
          <div class="inventory-card-bottom">
            <span class="status-badge ${statusClass}">${statusText}</span>
            <div class="inventory-actions">
              <button class="btn-table-edit" data-imgid="${img.id}" title="تعديل">✎</button>
              <button class="btn-table-delete" data-imgid="${img.id}" title="حذف">✕</button>
            </div>
          </div>
        </div>
      `;
      cardsWrap.appendChild(card);
    });
  });

  container.appendChild(cardsWrap);

  // Wire up edit/delete buttons (both table and cards)
  container.querySelectorAll('.btn-table-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const imgId = btn.dataset.imgid;
      const found = allImageItems['ready-made'].find(i => i.img.id === imgId);
      if (found) openEditDrawer(found.img, 'ready-made', btn.closest('tr') || btn.closest('.inventory-card'));
    });
  });

  container.querySelectorAll('.btn-table-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const imgId = btn.dataset.imgid;
      const found = allImageItems['ready-made'].find(i => i.img.id === imgId);
      if (!found) return;
      if (!confirm('هل تريد حذف هذا المنتج؟')) return;
      try {
        if (found.img.storagePath) {
          try { await deleteObject(ref(storage, found.img.storagePath)); } catch (_) {}
        }
        await deleteDoc(doc(db, 'images', imgId));
        showToast('تم حذف المنتج', 'success');
        await loadPhotos('ready-made');
      } catch (err) {
        console.error(err);
        showToast('تعذّر حذف المنتج', 'error');
      }
    });
  });
}

// =====================
// Upload Modal (Ready-Made)
// =====================
let uploadQueue = [];
let uploadQueueIndex = 0;

const uploadModal     = document.getElementById('upload-modal');
const umImg           = document.getElementById('upload-modal-img');
const umCounter       = document.getElementById('upload-modal-counter');
const umName          = document.getElementById('um-name');
const umSection       = document.getElementById('um-section');
const umPrice         = document.getElementById('um-price');
const umQty           = document.getElementById('um-quantity');
const umSizesWrap     = document.getElementById('um-sizes');
const umColorsWrap    = document.getElementById('um-colors');
const umCustomColors  = document.getElementById('um-custom-colors');
const umCustomInput   = document.getElementById('um-custom-color');
const umBtnAddColor   = document.getElementById('um-btn-add-color');
const umSubmitBtn     = document.getElementById('um-submit-btn');
const umSkipBtn       = document.getElementById('um-skip-btn');
const umCloseBtn      = document.getElementById('upload-modal-close');

function showUploadModal() {
  if (uploadQueueIndex >= uploadQueue.length) {
    closeUploadModal();
    return;
  }

  const file = uploadQueue[uploadQueueIndex];

  // Show image preview
  const reader = new FileReader();
  reader.onload = (e) => { umImg.src = e.target.result; };
  reader.readAsDataURL(file);

  // Counter
  if (uploadQueue.length > 1) {
    umCounter.textContent = `المنتج ${uploadQueueIndex + 1} من ${uploadQueue.length}`;
    umSkipBtn.style.display = '';
  } else {
    umCounter.textContent = '';
    umSkipBtn.style.display = 'none';
  }

  // Reset form fields
  umName.value = '';
  umPrice.value = '';
  umQty.value = '';
  umSizesWrap.querySelectorAll('.edit-chip').forEach(c => c.classList.remove('active'));
  umColorsWrap.querySelectorAll('.edit-chip').forEach(c => c.classList.remove('active'));
  umCustomColors.innerHTML = '';
  umCustomInput.value = '';

  // Populate section dropdown
  const sections = sectionsCache['ready-made'];
  const currentSel = getUploadSectionId('ready-made');
  umSection.innerHTML = sections.map(s =>
    `<option value="${s.id}" ${s.id === currentSel ? 'selected' : ''}>${escapeHtml(s.name)}${s.isDefault ? ' (رئيسي)' : ''}</option>`
  ).join('');

  // Clear validation
  uploadModal.querySelectorAll('.edit-field.invalid').forEach(f => f.classList.remove('invalid'));
  umSubmitBtn.disabled = true;
  umSubmitBtn.textContent = 'إضافة المنتج';
  umSubmitBtn.classList.remove('success');

  // Show modal
  uploadModal.classList.add('show');
  document.body.classList.add('edit-drawer-open');
}

function closeUploadModal() {
  uploadModal.classList.remove('show');
  document.body.classList.remove('edit-drawer-open');
  uploadQueue = [];
  uploadQueueIndex = 0;
}

function validateUploadForm() {
  let valid = true;
  const fields = [
    { id: 'um-field-name', check: () => umName.value.trim().length > 0 },
    { id: 'um-field-price', check: () => Number(umPrice.value) > 0 },
    { id: 'um-field-quantity', check: () => Number(umQty.value) >= 1 },
    { id: 'um-field-sizes', check: () => umSizesWrap.querySelectorAll('.edit-chip.active').length > 0 },
    { id: 'um-field-colors', check: () => umColorsWrap.querySelectorAll('.edit-chip.active').length > 0 || umCustomColors.querySelectorAll('.edit-chip').length > 0 },
  ];

  fields.forEach(f => {
    const el = document.getElementById(f.id);
    if (!f.check()) {
      el.classList.add('invalid');
      valid = false;
    } else {
      el.classList.remove('invalid');
    }
  });

  umSubmitBtn.disabled = !valid;
  return valid;
}

async function submitUploadItem() {
  if (!validateUploadForm()) return;

  let file = uploadQueue[uploadQueueIndex];
  if (file.size > MAX_FILE_SIZE) {
    file = await compressImage(file);
    uploadQueue[uploadQueueIndex] = file;
  }
  const sectionId = umSection.value;
  const description = umName.value.trim();
  const price = Number(umPrice.value) || 0;
  const quantity = Number(umQty.value) || 0;

  const sizes = [];
  umSizesWrap.querySelectorAll('.edit-chip.active').forEach(c => sizes.push(c.dataset.value));

  const colors = [];
  umColorsWrap.querySelectorAll('.edit-chip.active').forEach(c => colors.push(c.dataset.value));
  umCustomColors.querySelectorAll('.edit-chip').forEach(c => colors.push(c.dataset.value));

  umSubmitBtn.disabled = true;
  umSubmitBtn.textContent = 'جارٍ الرفع...';

  try {
    // Get max order
    let orderCounter = 0;
    for (const sec of sectionsCache['ready-made']) {
      const snap = await getDocs(query(collection(db, 'images'), where('sectionId', '==', sec.id)));
      snap.docs.forEach(d => { const o = d.data().order || 0; if (o > orderCounter) orderCounter = o; });
    }

    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const storagePath = `images/ready-made/${fileName}`;
    const storageRef = ref(storage, storagePath);

    await new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file);
      task.on('state_changed', null, reject, async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        await addDoc(collection(db, 'images'), {
          sectionId, storageUrl: url, storagePath,
          fileName: file.name, description, order: orderCounter + 1,
          price, quantity, sizes, colors,
          createdAt: serverTimestamp()
        });
        resolve();
      });
    });

    showToast('تم إضافة المنتج', 'success');
    umSubmitBtn.textContent = 'تم ✓';
    umSubmitBtn.classList.add('success');

    // Next file or close
    uploadQueueIndex++;
    if (uploadQueueIndex < uploadQueue.length) {
      setTimeout(() => showUploadModal(), 400);
    } else {
      setTimeout(async () => {
        closeUploadModal();
        await loadPhotos('ready-made');
      }, 400);
    }

  } catch (err) {
    console.error(err);
    showToast('فشل رفع المنتج', 'error');
    umSubmitBtn.disabled = false;
    umSubmitBtn.textContent = 'إضافة المنتج';
  }
}

// Upload modal chip toggles
umSizesWrap.addEventListener('click', e => {
  const chip = e.target.closest('.edit-chip');
  if (chip) { chip.classList.toggle('active'); validateUploadForm(); }
});

umColorsWrap.addEventListener('click', e => {
  const chip = e.target.closest('.edit-chip');
  if (chip) { chip.classList.toggle('active'); validateUploadForm(); }
});

// Upload modal custom color
function umAddCustomColor() {
  const val = umCustomInput.value.trim();
  if (!val) return;
  // Check predefined
  const predefined = umColorsWrap.querySelector(`.edit-chip[data-value="${val}"]`);
  if (predefined) { predefined.classList.add('active'); umCustomInput.value = ''; validateUploadForm(); return; }
  // Check duplicate
  if (umCustomColors.querySelector(`.edit-chip[data-value="${val}"]`)) { umCustomInput.value = ''; return; }
  // Create chip
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'edit-chip active';
  chip.dataset.value = val;
  chip.innerHTML = `${escapeHtml(val)} <span class="chip-remove">✕</span>`;
  chip.querySelector('.chip-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    chip.remove();
    validateUploadForm();
  });
  umCustomColors.appendChild(chip);
  umCustomInput.value = '';
  validateUploadForm();
}

umBtnAddColor.addEventListener('click', umAddCustomColor);
umCustomInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); umAddCustomColor(); }
});

// Live validation on input
umName.addEventListener('input', validateUploadForm);
umPrice.addEventListener('input', validateUploadForm);
umQty.addEventListener('input', validateUploadForm);

// Upload modal buttons
umSubmitBtn.addEventListener('click', submitUploadItem);
umSkipBtn.addEventListener('click', () => {
  uploadQueueIndex++;
  if (uploadQueueIndex < uploadQueue.length) {
    showUploadModal();
  } else {
    closeUploadModal();
    loadPhotos('ready-made');
  }
});
umCloseBtn.addEventListener('click', () => {
  if (uploadQueue.length > 1 && uploadQueueIndex < uploadQueue.length - 1) {
    if (!confirm('هل تريد إلغاء إضافة بقية المنتجات؟')) return;
  }
  closeUploadModal();
  loadPhotos('ready-made');
});


// =====================
// Edit Drawer (Ready-Made)
// =====================
let editDrawerImageData = null;

const editDrawer    = document.getElementById('edit-drawer');
const editBackdrop  = document.getElementById('edit-drawer-backdrop');
const editDrawerImg = document.getElementById('edit-drawer-img');
const editDesc      = document.getElementById('edit-description');
const editPrice     = document.getElementById('edit-price');
const editQty       = document.getElementById('edit-quantity');
const editSizesWrap = document.getElementById('edit-sizes');
const editColorsWrap = document.getElementById('edit-colors');
const editCustomColorsWrap = document.getElementById('edit-custom-colors');
const editCustomColorInput = document.getElementById('edit-custom-color');
const btnAddCustomColor    = document.getElementById('btn-add-custom-color');
const editSaveBtn   = document.getElementById('edit-save-btn');
const editCloseBtn  = document.getElementById('edit-drawer-close');

// Predefined color values (must match HTML chips data-value)
const PREDEFINED_COLORS = ['أبيض','بيج','رمادي','أسود','كحلي','سكري','زيتي','بني','سماوي','خمري'];

function openEditDrawer(img, category, element) {
  editDrawerImageData = { img, category, element };

  // Populate fields
  editDrawerImg.src = img.storageUrl || '';
  editDesc.value = img.description || '';
  editPrice.value = img.price || '';
  editQty.value = img.quantity != null ? img.quantity : '';

  // Activate size chips
  const sizes = Array.isArray(img.sizes) ? img.sizes : [];
  editSizesWrap.querySelectorAll('.edit-chip').forEach(chip => {
    chip.classList.toggle('active', sizes.includes(chip.dataset.value));
  });

  // Activate color chips
  const colors = Array.isArray(img.colors) ? img.colors : [];
  editColorsWrap.querySelectorAll('.edit-chip').forEach(chip => {
    chip.classList.toggle('active', colors.includes(chip.dataset.value));
  });

  // Add custom color chips for non-predefined colors
  editCustomColorsWrap.innerHTML = '';
  colors.forEach(c => {
    if (!PREDEFINED_COLORS.includes(c)) {
      addCustomColorChip(c);
    }
  });

  // Show drawer
  editDrawer.classList.add('show');
  editBackdrop.classList.add('show');
  document.body.classList.add('edit-drawer-open');
}

function closeEditDrawer() {
  editDrawer.classList.remove('show');
  editBackdrop.classList.remove('show');
  document.body.classList.remove('edit-drawer-open');
  editDrawerImageData = null;
  editCustomColorsWrap.innerHTML = '';
  editCustomColorInput.value = '';
  editSaveBtn.classList.remove('success');
  editSaveBtn.disabled = false;
  editSaveBtn.textContent = 'حفظ التعديلات';
}

async function saveEditDrawer() {
  if (!editDrawerImageData) return;

  const description = editDesc.value.trim();
  const price = Number(editPrice.value) || 0;
  const quantity = Number(editQty.value) || 0;

  // Collect active sizes
  const sizes = [];
  editSizesWrap.querySelectorAll('.edit-chip.active').forEach(chip => {
    sizes.push(chip.dataset.value);
  });

  // Collect active colors (predefined + custom)
  const colors = [];
  editColorsWrap.querySelectorAll('.edit-chip.active').forEach(chip => {
    colors.push(chip.dataset.value);
  });
  editCustomColorsWrap.querySelectorAll('.edit-chip').forEach(chip => {
    colors.push(chip.dataset.value);
  });

  editSaveBtn.disabled = true;
  editSaveBtn.textContent = 'جارٍ الحفظ...';

  try {
    await updateDoc(doc(db, 'images', editDrawerImageData.img.id), {
      description, price, quantity, sizes, colors
    });

    // Update in-memory data
    const img = editDrawerImageData.img;
    img.description = description;
    img.price = price;
    img.quantity = quantity;
    img.sizes = sizes;
    img.colors = colors;

    // Success feedback
    editSaveBtn.textContent = 'تم الحفظ ✓';
    editSaveBtn.classList.add('success');
    showToast('تم حفظ التعديلات', 'success');

    setTimeout(async () => {
      closeEditDrawer();
      // Refresh the inventory table to reflect changes
      await loadPhotos('ready-made');
    }, 600);
  } catch (err) {
    console.error(err);
    showToast('تعذّر حفظ التعديلات', 'error');
    editSaveBtn.disabled = false;
    editSaveBtn.textContent = 'حفظ التعديلات';
  }
}

function addCustomColorChip(colorName) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'edit-chip active';
  chip.dataset.value = colorName;
  chip.innerHTML = `${escapeHtml(colorName)} <span class="chip-remove">✕</span>`;
  chip.querySelector('.chip-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    chip.remove();
  });
  editCustomColorsWrap.appendChild(chip);
}

// Chip toggle — sizes
editSizesWrap.addEventListener('click', e => {
  const chip = e.target.closest('.edit-chip');
  if (chip) chip.classList.toggle('active');
});

// Chip toggle — colors
editColorsWrap.addEventListener('click', e => {
  const chip = e.target.closest('.edit-chip');
  if (chip) chip.classList.toggle('active');
});

// Add custom color
function handleAddCustomColor() {
  const val = editCustomColorInput.value.trim();
  if (!val) return;
  // Check if it matches a predefined color — just activate it
  const predefined = editColorsWrap.querySelector(`.edit-chip[data-value="${val}"]`);
  if (predefined) {
    predefined.classList.add('active');
    editCustomColorInput.value = '';
    return;
  }
  // Check for duplicates in custom chips
  const existing = editCustomColorsWrap.querySelector(`.edit-chip[data-value="${val}"]`);
  if (existing) {
    editCustomColorInput.value = '';
    return;
  }
  addCustomColorChip(val);
  editCustomColorInput.value = '';
}

btnAddCustomColor.addEventListener('click', handleAddCustomColor);
editCustomColorInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); handleAddCustomColor(); }
});

// Save button
editSaveBtn.addEventListener('click', saveEditDrawer);

// Close handlers
editCloseBtn.addEventListener('click', closeEditDrawer);
editBackdrop.addEventListener('click', closeEditDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && editDrawerImageData) closeEditDrawer();
});

// Close drawer on tab switch
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (editDrawerImageData) closeEditDrawer();
  });
});


// =====================
// Orders Dashboard
// =====================
const ordersToggleBtn = document.getElementById('orders-toggle-btn');
const ordersView      = document.getElementById('orders-view');
const adminMain       = document.querySelector('.admin-main');
const ordersList      = document.getElementById('orders-list');
const ordersSearch    = document.getElementById('orders-search');

let allOrders = [];
let ordersFilterStatus = null;
let ordersFilterType = 'all';

const STATUS_CONFIG = {
  'ordered':    { label: 'تم الطلب',    color: '#C9A84C' },
  'sewing':     { label: 'قيد الخياطة',  color: '#7b1fa2' },
  'delivering': { label: 'جاري التوصيل', color: '#1976d2' },
  'delivered':  { label: 'تم التوصيل',  color: '#2e7d32' },
  'returned':   { label: 'مرتجع',      color: '#e53935' }
};

const DISHDASHA_LABELS = {
  'iraqi1': 'عراقي سحاب', 'iraqi2': 'عراقي ظاهري', 'iraqi3': 'عراقي مخفي',
  'kuwaiti1': 'كويتي مخفي', 'kuwaiti2': 'كويتي ظاهري', 'kuwaiti3': 'كويتي مخفي (حشوه)'
};
const COLLAR_LABELS = { '1': 'ياخة قميص كبيرة', '2': 'ياخة قميص وسط', '3': 'ياخة دگمة وحدة', '4': 'ياخة دگمتين', '5': 'ياخة فراشة' };
const POCKET_LABELS = { '1': 'جيب ١', '2': 'جيب ٢', '3': 'جيب ٣', '4': 'جيب ٤' };
const SLEEVE_LABELS = { 'flat': 'فلات', 'bazma': 'بزمة' };

// 3-way view toggle: gallery / orders / measurements
const measurementsToggleBtn = document.getElementById('measurements-toggle-btn');
const measurementsView = document.getElementById('measurements-view');
let activeView = 'gallery';

function switchView(viewName) {
  ordersView.classList.remove('visible');
  if (measurementsView) measurementsView.classList.remove('visible');
  adminMain.style.display = 'none';
  ordersToggleBtn.classList.remove('active');
  if (measurementsToggleBtn) measurementsToggleBtn.classList.remove('active');

  switch (viewName) {
    case 'gallery':
      adminMain.style.display = '';
      break;
    case 'orders':
      ordersView.classList.add('visible');
      ordersToggleBtn.classList.add('active');
      loadOrders();
      break;
    case 'measurements':
      if (measurementsView) {
        measurementsView.classList.add('visible');
        measurementsToggleBtn.classList.add('active');
        loadMeasurements();
      }
      break;
  }
  activeView = viewName;
}

if (ordersToggleBtn) {
  ordersToggleBtn.addEventListener('click', () => {
    switchView(activeView === 'orders' ? 'gallery' : 'orders');
  });
}
if (measurementsToggleBtn) {
  measurementsToggleBtn.addEventListener('click', () => {
    switchView(activeView === 'measurements' ? 'gallery' : 'measurements');
  });
}

// Load all orders from Firestore
async function loadOrders() {
  if (!ordersList) { console.error('orders-list element not found'); return; }
  ordersList.innerHTML = '<div class="loading-text">جارٍ تحميل الطلبات...</div>';
  try {
    console.log('Loading orders from Firestore...');
    const snap = await getDocs(collection(db, 'orders'));
    console.log(`Loaded ${snap.docs.length} orders from Firestore`);

    if (snap.docs.length > 0) {
      console.log('First order raw data:', JSON.stringify(snap.docs[0].data()).slice(0, 300));
    }

    allOrders = snap.docs.map(d => {
      const data = d.data();
      // Handle measurements: SDK returns plain object, values are already unwrapped strings
      const rawMeasurements = data.measurements || {};
      const measurements = {};
      for (const [k, v] of Object.entries(rawMeasurements)) {
        measurements[k] = typeof v === 'object' && v !== null && v.stringValue ? v.stringValue : v;
      }

      return {
        id: d.id,
        orderType: data.orderType || 'tailored',
        customerName: data.customerName || '',
        customerPhone: data.customerPhone || '',
        status: (data.status === 'new' || data.status === 'sold' || !data.status) ? 'ordered' : data.status,
        createdAt: parseTimestamp(data.createdAt),
        updatedAt: parseTimestamp(data.updatedAt),
        measurements,
        price: Number(data.price) || 0,
        // Tailored fields
        fabricUrl: data.fabricUrl || '',
        dishdashaType: data.dishdashaType || '',
        collarType: data.collarType || '',
        pocketType: data.pocketType || '',
        sleeveType: data.sleeveType || '',
        notes: data.notes || '',
        // Ready-made fields
        imageId: data.imageId || '',
        imageUrl: data.imageUrl || '',
        itemName: data.itemName || '',
        size: data.size || '',
        color: data.color || ''
      };
    });

    // Sort newest first
    allOrders.sort((a, b) => b.createdAt - a.createdAt);
    console.log('Processed orders:', allOrders.length, allOrders.map(o => ({ id: o.id.slice(-6), type: o.orderType, status: o.status, name: o.customerName })));
    renderOrdersView();
  } catch (err) {
    console.error('Failed to load orders:', err);
    ordersList.innerHTML = `<div class="loading-text">تعذّر تحميل الطلبات: ${escapeHtml(err.message)}</div>`;
  }
}

// Render everything
function renderOrdersView() {
  renderStats();
  renderOrdersList();
}

// Stats cards
function renderStats() {
  const counts = { ordered: 0, sewing: 0, delivering: 0, delivered: 0, returned: 0 };
  let totalSales = 0;
  let monthlySales = 0;
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  allOrders.forEach(order => {
    const status = order.status || 'ordered';
    if (counts[status] !== undefined) counts[status]++;

    if (status === 'delivered' && order.price > 0) {
      totalSales += order.price;
      if (order.createdAt.getMonth() === thisMonth && order.createdAt.getFullYear() === thisYear) {
        monthlySales += order.price;
      }
    }
  });

  document.getElementById('stat-ordered-count').textContent = counts.ordered;
  document.getElementById('stat-sewing-count').textContent = counts.sewing;
  document.getElementById('stat-delivering-count').textContent = counts.delivering;
  document.getElementById('stat-delivered-count').textContent = counts.delivered;
  document.getElementById('stat-returned-count').textContent = counts.returned;

  document.getElementById('total-sales').textContent = totalSales > 0 ? `${totalSales.toLocaleString()} د.ع` : '0 د.ع';
  document.getElementById('monthly-sales').textContent = monthlySales > 0 ? `${monthlySales.toLocaleString()} د.ع` : '0 د.ع';
}

// Filter + render orders list
function renderOrdersList() {
  const searchVal = ordersSearch.value.trim().toLowerCase();

  const filtered = allOrders.filter(order => {
    if (ordersFilterStatus && order.status !== ordersFilterStatus) return false;
    if (ordersFilterType !== 'all' && order.orderType !== ordersFilterType) return false;
    if (searchVal) {
      const name = (order.customerName || '').toLowerCase();
      const phone = (order.customerPhone || '').toLowerCase();
      if (!name.includes(searchVal) && !phone.includes(searchVal)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    ordersList.innerHTML = '<div class="orders-empty">لا توجد طلبات</div>';
    return;
  }

  ordersList.innerHTML = '';
  filtered.forEach(order => {
    ordersList.appendChild(renderOrderCard(order));
  });
}

// Render a single order card
function renderOrderCard(order) {
  const card = document.createElement('div');
  card.className = 'order-card';
  card.dataset.id = order.id;

  const isReadyMade = order.orderType === 'ready-made';
  const typeBadgeClass = isReadyMade ? 'ready-made' : 'tailored';
  const typeBadgeText = isReadyMade ? 'جاهز' : 'فصال';

  const thumbUrl = isReadyMade ? (order.imageUrl || '') : (order.fabricUrl || '');
  const price = order.price || 0;
  const shortId = order.id ? `#${order.id.slice(-6).toUpperCase()}` : '';

  const dateStr = order.createdAt ? order.createdAt.toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const cleanPhone = (order.customerPhone || '').replace(/[^0-9]/g, '');
  const waLink = cleanPhone ? `https://wa.me/${cleanPhone}` : '#';

  // Status select options
  const statusOptions = Object.entries(STATUS_CONFIG).map(([key, cfg]) =>
    `<option value="${key}" ${order.status === key ? 'selected' : ''}>${cfg.label}</option>`
  ).join('');

  // Header — restructured for clarity
  const header = document.createElement('div');
  header.className = 'order-card-header';
  header.innerHTML = `
    ${thumbUrl ? `<img class="order-thumb" src="${thumbUrl}" alt="" loading="lazy" />` : ''}
    <div class="order-info">
      <div class="order-row-main">
        <span class="order-customer-name">${escapeHtml(order.customerName || 'بدون اسم')}</span>
        <select class="order-status-select status-${order.status}" data-order-id="${order.id}">
          ${statusOptions}
        </select>
      </div>
      <div class="order-row-contact">
        <a class="order-phone-link" href="${waLink}" target="_blank" rel="noopener">${escapeHtml(order.customerPhone || '')}</a>
        <span class="order-type-badge ${typeBadgeClass}">${typeBadgeText}</span>
      </div>
      <div class="order-row-meta">
        <span class="order-date">${dateStr}</span>
        <span class="order-id">${shortId}</span>
        ${price > 0 ? `<span class="order-price-display">${price.toLocaleString()} د.ع</span>` : ''}
      </div>
    </div>
    <span class="order-expand-icon">▼</span>
  `;

  // Status change handler
  const statusSelect = header.querySelector('.order-status-select');
  statusSelect.addEventListener('click', e => e.stopPropagation());
  statusSelect.addEventListener('change', async () => {
    const newStatus = statusSelect.value;
    await updateOrderStatus(order.id, newStatus, statusSelect);
    order.status = newStatus;
    renderStats();
  });

  // Toggle expand
  header.addEventListener('click', () => {
    card.classList.toggle('expanded');
  });

  card.appendChild(header);

  // Body (details)
  const body = document.createElement('div');
  body.className = 'order-card-body';

  if (isReadyMade) {
    body.innerHTML = buildReadyMadeDetails(order);
  } else {
    body.innerHTML = buildTailoredDetails(order);
  }

  // Tailored price input handler
  if (!isReadyMade) {
    const priceInput = body.querySelector('.order-price-input');
    if (priceInput) {
      priceInput.addEventListener('change', async () => {
        const newPrice = Number(priceInput.value) || 0;
        await updateOrderPrice(order.id, newPrice);
        order.price = newPrice;
        // Update price display in header
        const priceDisplay = header.querySelector('.order-price-display');
        if (priceDisplay) {
          priceDisplay.textContent = newPrice > 0 ? `${newPrice.toLocaleString()} د.ع` : '';
        } else if (newPrice > 0) {
          const span = document.createElement('span');
          span.className = 'order-price-display';
          span.textContent = `${newPrice.toLocaleString()} د.ع`;
          statusSelect.before(span);
        }
        renderStats();
      });
    }
  }

  // Restock button (for ordered/returned ready-made items)
  if (isReadyMade && order.imageId && (order.status === 'ordered' || order.status === 'returned')) {
    const restockBtn = document.createElement('button');
    restockBtn.className = 'order-restock-btn';
    restockBtn.innerHTML = '↩ إرجاع للمخزن';
    restockBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('هل تريد إرجاع هذه القطعة إلى المخزن؟ سيتم زيادة الكمية.')) return;
      restockBtn.disabled = true;
      restockBtn.textContent = 'جارٍ...';
      try {
        // Increment quantity on the product image doc
        const imgSnap = await getDocs(query(collection(db, 'images'), where('__name__', '==', order.imageId)));
        if (!imgSnap.empty) {
          const imgDoc = imgSnap.docs[0];
          const currentQty = Number(imgDoc.data().quantity) || 0;
          await updateDoc(doc(db, 'images', order.imageId), { quantity: currentQty + 1 });
        }
        // Update order status to returned if it was ordered
        await updateDoc(doc(db, 'orders', order.id), {
          status: 'returned',
          restocked: true,
          updatedAt: serverTimestamp()
        });
        order.status = 'returned';
        showToast('تم إرجاع القطعة للمخزن', 'success');
        loadOrders(); // Refresh
      } catch (err) {
        console.error('Restock failed:', err);
        showToast('تعذّر إرجاع القطعة', 'error');
        restockBtn.disabled = false;
        restockBtn.innerHTML = '↩ إرجاع للمخزن';
      }
    });
    body.appendChild(restockBtn);
  }

  card.appendChild(body);
  return card;
}

function buildReadyMadeDetails(order) {
  const details = [];
  if (order.itemName) details.push({ label: 'المنتج', value: order.itemName });
  if (order.size) details.push({ label: 'المقاس', value: order.size });
  if (order.color) details.push({ label: 'اللون', value: order.color });
  if (order.price) details.push({ label: 'السعر', value: `${Number(order.price).toLocaleString()} د.ع` });

  let html = '<div class="order-detail-grid">';
  details.forEach(d => {
    html += `<div class="order-detail-item"><span class="order-detail-label">${d.label}</span><span class="order-detail-value">${escapeHtml(String(d.value))}</span></div>`;
  });
  html += '</div>';
  return html;
}

function buildTailoredDetails(order) {
  const m = order.measurements || {};
  const details = [];

  if (order.dishdashaType) details.push({ label: 'نوع الدشداشة', value: DISHDASHA_LABELS[order.dishdashaType] || order.dishdashaType });
  if (order.collarType) details.push({ label: 'الياخة', value: COLLAR_LABELS[order.collarType] || order.collarType });
  if (order.pocketType) details.push({ label: 'الجيب', value: POCKET_LABELS[order.pocketType] || order.pocketType });
  if (order.sleeveType) details.push({ label: 'الردن', value: SLEEVE_LABELS[order.sleeveType] || order.sleeveType });

  // Measurements
  const measureKeys = [
    ['totalLength', 'الطول الكلي'], ['chest', 'الصدر'], ['shoulder', 'الكتف'],
    ['neck', 'الياخة'], ['sleeveLength', 'طول الردن'], ['sleeveWidth', 'عرض الردن']
  ];
  measureKeys.forEach(([key, label]) => {
    if (m[key]) details.push({ label, value: `${m[key]} سم` });
  });

  let html = '<div class="order-detail-grid">';
  details.forEach(d => {
    html += `<div class="order-detail-item"><span class="order-detail-label">${d.label}</span><span class="order-detail-value">${escapeHtml(String(d.value))}</span></div>`;
  });
  html += '</div>';

  // Price input for tailored
  html += `
    <div class="order-price-edit">
      <label>السعر:</label>
      <input type="number" class="order-price-input" value="${order.price || ''}" placeholder="0" min="0" step="500" inputmode="numeric" />
      <span class="order-price-unit">د.ع</span>
    </div>
  `;

  // Notes
  if (order.notes) {
    html += `<div class="order-notes"><strong>ملاحظات:</strong> ${escapeHtml(order.notes)}</div>`;
  }

  return html;
}

// Update order status in Firestore
async function updateOrderStatus(orderId, newStatus, selectEl) {
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      status: newStatus,
      updatedAt: serverTimestamp()
    });
    // Update select class
    selectEl.className = `order-status-select status-${newStatus}`;
    showToast(`تم تحديث الحالة: ${STATUS_CONFIG[newStatus]?.label || newStatus}`, 'success');
  } catch (err) {
    console.error(err);
    showToast('تعذّر تحديث الحالة', 'error');
  }
}

// Update tailored order price
async function updateOrderPrice(orderId, price) {
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      price,
      updatedAt: serverTimestamp()
    });
    showToast('تم حفظ السعر', 'success');
  } catch (err) {
    console.error(err);
    showToast('تعذّر حفظ السعر', 'error');
  }
}

// Stats card click → filter by status
document.querySelectorAll('.stat-card').forEach(card => {
  card.addEventListener('click', () => {
    const status = card.dataset.status;
    if (ordersFilterStatus === status) {
      ordersFilterStatus = null;
      card.classList.remove('active');
    } else {
      document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
      ordersFilterStatus = status;
      card.classList.add('active');
    }
    renderOrdersList();
  });
});

// Type filter buttons
document.querySelectorAll('.type-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.type-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ordersFilterType = btn.dataset.type;
    renderOrdersList();
  });
});

// Search input
ordersSearch.addEventListener('input', () => {
  renderOrdersList();
});


// =====================
// Utility
// =====================
function parseTimestamp(ts) {
  if (!ts) return new Date();
  if (ts.toDate) return ts.toDate(); // Firestore Timestamp object
  if (ts.seconds) return new Date(ts.seconds * 1000); // Firestore seconds
  if (typeof ts === 'string') return new Date(ts); // ISO string from REST API
  if (ts instanceof Date) return ts;
  return new Date();
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// =============================================
// Measurements Section (القياسات)
// =============================================
let allMeasurements = [];
let measFilterTimer = null;
function debounceMeasFilter() {
  clearTimeout(measFilterTimer);
  measFilterTimer = setTimeout(() => renderMeasList(), 200);
}
let measEditingId = null;
let measLoaded = false;

// --- Load ---
async function loadMeasurements() {
  if (measLoaded) { renderMeasList(); return; }
  const list = document.getElementById('meas-list');
  if (!list) return;
  list.innerHTML = '<div class="loading-text">جارٍ تحميل القياسات...</div>';
  try {
    const snap = await getDocs(collection(db, 'measurements'));
    allMeasurements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allMeasurements.sort((a, b) => {
      const numA = parseInt(a.fileNumber) || 0;
      const numB = parseInt(b.fileNumber) || 0;
      return numB - numA;
    });
    measLoaded = true;
    renderMeasStats();
    renderMeasList();
  } catch (err) {
    console.error('Error loading measurements:', err);
    list.innerHTML = '<div class="loading-text">تعذّر تحميل القياسات</div>';
  }
}

// --- Stats ---
function renderMeasStats() {
  const totalEl = document.getElementById('meas-stat-total');
  const waEl = document.getElementById('meas-stat-whatsapp');
  if (totalEl) totalEl.textContent = allMeasurements.length;
  if (waEl) waEl.textContent = allMeasurements.filter(m => m.whatsappNumber && m.whatsappNumber.length > 5).length;
}

// --- Filter ---
function getFilteredMeasurements() {
  let items = allMeasurements;

  // Text filter
  const q = (document.getElementById('meas-search-input')?.value || '').trim().toLowerCase();
  if (q) {
    items = items.filter(m =>
      (m.customerName || '').toLowerCase().includes(q) ||
      (m.fileNumber || '').toLowerCase().includes(q) ||
      (m.whatsappNumber || '').includes(q) ||
      (m.designType || '').toLowerCase().includes(q)
    );
  }

  // Measurement filter — sort by closest match
  const shoulder  = parseFloat(document.getElementById('search-shoulder')?.value);
  const sleeve    = parseFloat(document.getElementById('search-sleeve')?.value);
  const sleeveW   = parseFloat(document.getElementById('search-sleeveWidth')?.value);
  const chest     = parseFloat(document.getElementById('search-chest')?.value);
  const length    = parseFloat(document.getElementById('search-length')?.value);
  const neck      = parseFloat(document.getElementById('search-neck')?.value);

  const measFilters = [
    { val: shoulder, key: 'shoulderMeasurement' },
    { val: sleeve,   key: 'sleeveMeasurement' },
    { val: sleeveW,  key: 'sleeveWidthMeasurement' },
    { val: chest,    key: 'chestMeasurement' },
    { val: length,   key: 'lengthMeasurement' },
    { val: neck,     key: 'neckMeasurement' },
  ].filter(f => !isNaN(f.val));

  if (measFilters.length > 0) {
    items = items.map(m => {
      const totalDiff = measFilters.reduce((sum, f) => sum + Math.abs((m[f.key] || 0) - f.val), 0);
      return { ...m, _matchDiff: totalDiff };
    }).sort((a, b) => a._matchDiff - b._matchDiff);
  }

  updateFilterBadge(measFilters.length);
  return items;
}

function updateFilterBadge(activeCount) {
  const badge = document.getElementById('meas-filter-count');
  const panel = document.getElementById('meas-filter-panel');
  if (!badge) return;
  if (activeCount > 0 && !panel?.classList.contains('open')) {
    badge.textContent = activeCount;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// --- Render List ---
function renderMeasList(data) {
  const list = document.getElementById('meas-list');
  if (!list) return;
  const items = data || getFilteredMeasurements();

  if (items.length === 0) {
    list.innerHTML = '<div class="meas-empty">لا توجد قياسات</div>';
    return;
  }

  list.innerHTML = '';
  items.forEach(m => list.appendChild(renderMeasCard(m)));
}

// --- Single Card ---
function renderMeasCard(m) {
  const card = document.createElement('div');
  card.className = 'meas-card';
  card.dataset.id = m.id;

  const cleanPhone = (m.whatsappNumber || '').replace(/[^0-9+]/g, '');
  const waLink = cleanPhone.length > 5 ? `https://wa.me/${cleanPhone.replace('+', '')}` : '';

  const header = document.createElement('div');
  header.className = 'meas-card-header';
  header.innerHTML = `
    <div class="meas-card-info">
      <div class="meas-card-name">${escapeHtml(m.customerName)}</div>
      <div class="meas-card-meta">
        <span class="meas-file-badge">#${escapeHtml(m.fileNumber)}</span>
        ${m.designType ? `<span class="meas-design-badge">${escapeHtml(m.designType)}</span>` : ''}
        ${waLink ? `<a class="order-phone-link" href="${waLink}" target="_blank" onclick="event.stopPropagation()">${escapeHtml(m.whatsappNumber)}</a>` : ''}
      </div>
    </div>
    <div class="meas-card-actions">
      <button class="meas-edit-btn" title="تعديل">✎</button>
      <button class="meas-delete-btn" title="حذف">✕</button>
    </div>
    <span class="meas-expand-icon">▼</span>
  `;

  header.addEventListener('click', (e) => {
    if (e.target.closest('.meas-edit-btn') || e.target.closest('.meas-delete-btn') || e.target.closest('a')) return;
    card.classList.toggle('expanded');
  });

  header.querySelector('.meas-edit-btn').addEventListener('click', () => openMeasDrawer(m));

  header.querySelector('.meas-delete-btn').addEventListener('click', async () => {
    if (!confirm(`حذف قياس "${m.customerName}"؟`)) return;
    try {
      await deleteDoc(doc(db, 'measurements', m.id));
      allMeasurements = allMeasurements.filter(x => x.id !== m.id);
      card.remove();
      renderMeasStats();
      showToast('تم حذف القياس', 'success');
    } catch (err) {
      console.error(err);
      showToast('تعذّر الحذف', 'error');
    }
  });

  card.appendChild(header);

  const swVal = m.sleeveWidthMeasurement;
  const hasSleeveWidth = swVal && swVal > 0;

  const body = document.createElement('div');
  body.className = 'meas-card-body';
  body.innerHTML = `
    <div class="meas-detail-grid">
      <div class="meas-detail-item">
        <span class="meas-detail-label">الكتف</span>
        <span class="meas-detail-value">${m.shoulderMeasurement || 0}<span class="meas-detail-unit"> سم</span></span>
      </div>
      <div class="meas-detail-item">
        <span class="meas-detail-label">الردن</span>
        <span class="meas-detail-value">${m.sleeveMeasurement || 0}<span class="meas-detail-unit"> سم</span></span>
      </div>
      <div class="meas-detail-item">
        <span class="meas-detail-label">عرض الردن</span>
        <span class="meas-detail-value">${hasSleeveWidth ? `${swVal}<span class="meas-detail-unit"> سم</span>` : '<span class="meas-detail-empty">—</span>'}</span>
      </div>
      <div class="meas-detail-item">
        <span class="meas-detail-label">الصدر</span>
        <span class="meas-detail-value">${m.chestMeasurement || 0}<span class="meas-detail-unit"> سم</span></span>
      </div>
      <div class="meas-detail-item">
        <span class="meas-detail-label">الطول</span>
        <span class="meas-detail-value">${m.lengthMeasurement || 0}<span class="meas-detail-unit"> سم</span></span>
      </div>
      <div class="meas-detail-item">
        <span class="meas-detail-label">الياخة</span>
        <span class="meas-detail-value">${m.neckMeasurement || 0}<span class="meas-detail-unit"> سم</span></span>
      </div>
    </div>
    ${waLink ? `<a class="meas-wa-btn" href="${waLink}" target="_blank">📱 واتساب</a>` : ''}
  `;
  card.appendChild(body);
  return card;
}

// --- Drawer ---
function openMeasDrawer(m) {
  measEditingId = m ? m.id : null;
  const title = document.getElementById('meas-drawer-title');
  const saveBtn = document.getElementById('meas-save-btn');
  if (title) title.textContent = m ? 'تعديل القياس' : 'إضافة قياس';
  if (saveBtn) { saveBtn.textContent = m ? 'حفظ التعديلات' : 'إضافة القياس'; saveBtn.disabled = false; }

  document.getElementById('meas-customerName').value = m ? m.customerName || '' : '';
  document.getElementById('meas-fileNumber').value = m ? m.fileNumber || '' : '';
  document.getElementById('meas-designType').value = m ? m.designType || '' : '';
  document.getElementById('meas-whatsapp').value = m ? m.whatsappNumber || '' : '+964';
  document.getElementById('meas-shoulder').value = m ? m.shoulderMeasurement || '' : '';
  document.getElementById('meas-sleeve').value = m ? m.sleeveMeasurement || '' : '';
  document.getElementById('meas-sleeveWidth').value = m ? m.sleeveWidthMeasurement || '' : '';
  document.getElementById('meas-chest').value = m ? m.chestMeasurement || '' : '';
  document.getElementById('meas-length').value = m ? m.lengthMeasurement || '' : '';
  document.getElementById('meas-neck').value = m ? m.neckMeasurement || '' : '';

  document.getElementById('meas-drawer').classList.add('show');
  document.getElementById('meas-drawer-backdrop').classList.add('show');
  document.body.classList.add('edit-drawer-open');
}

function closeMeasDrawer() {
  document.getElementById('meas-drawer')?.classList.remove('show');
  document.getElementById('meas-drawer-backdrop')?.classList.remove('show');
  document.body.classList.remove('edit-drawer-open');
  measEditingId = null;
}

async function saveMeasurement() {
  const customerName = document.getElementById('meas-customerName').value.trim();
  const fileNumber = document.getElementById('meas-fileNumber').value.trim();
  const shoulder = parseInt(document.getElementById('meas-shoulder').value);
  const sleeve = parseInt(document.getElementById('meas-sleeve').value);
  const sleeveWidth = parseInt(document.getElementById('meas-sleeveWidth').value);
  const chest = parseInt(document.getElementById('meas-chest').value);
  const length = parseInt(document.getElementById('meas-length').value);
  const neck = parseInt(document.getElementById('meas-neck').value);

  if (!customerName || !fileNumber || isNaN(shoulder) || isNaN(sleeve) || isNaN(chest) || isNaN(length) || isNaN(neck)) {
    showToast('أكمل جميع الحقول المطلوبة', 'error');
    return;
  }

  const data = {
    customerName,
    fileNumber,
    designType: document.getElementById('meas-designType').value.trim(),
    whatsappNumber: document.getElementById('meas-whatsapp').value.trim(),
    shoulderMeasurement: shoulder,
    sleeveMeasurement: sleeve,
    sleeveWidthMeasurement: isNaN(sleeveWidth) ? 0 : sleeveWidth,
    chestMeasurement: chest,
    lengthMeasurement: length,
    neckMeasurement: neck,
    updatedAt: serverTimestamp()
  };

  const saveBtn = document.getElementById('meas-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جارٍ الحفظ...';

  try {
    if (measEditingId) {
      await updateDoc(doc(db, 'measurements', measEditingId), data);
      const idx = allMeasurements.findIndex(m => m.id === measEditingId);
      if (idx >= 0) allMeasurements[idx] = { ...allMeasurements[idx], ...data };
      showToast('تم تعديل القياس', 'success');
    } else {
      data.createdAt = serverTimestamp();
      const newDoc = await addDoc(collection(db, 'measurements'), data);
      allMeasurements.unshift({ id: newDoc.id, ...data });
      showToast('تم إضافة القياس', 'success');
    }
    renderMeasStats();
    renderMeasList();
    setTimeout(closeMeasDrawer, 300);
  } catch (err) {
    console.error(err);
    showToast('حدث خطأ', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = measEditingId ? 'حفظ التعديلات' : 'إضافة القياس';
  }
}

// --- Print ---
function printMeasurements() {
  const items = getFilteredMeasurements();
  if (items.length === 0) { showToast('لا توجد بيانات للطباعة', 'error'); return; }

  let overlay = document.querySelector('.meas-print-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.className = 'meas-print-overlay';
  overlay.style.display = 'none';

  let rows = '';
  items.forEach(m => {
    const sw = m.sleeveWidthMeasurement && m.sleeveWidthMeasurement > 0 ? m.sleeveWidthMeasurement : '—';
    rows += `<tr>
      <td>${escapeHtml(m.customerName)}</td>
      <td>${escapeHtml(m.fileNumber)}</td>
      <td>${escapeHtml(m.designType || '')}</td>
      <td dir="ltr">${escapeHtml(m.whatsappNumber || '')}</td>
      <td>${m.shoulderMeasurement || 0}</td>
      <td>${m.sleeveMeasurement || 0}</td>
      <td>${sw}</td>
      <td>${m.chestMeasurement || 0}</td>
      <td>${m.lengthMeasurement || 0}</td>
      <td>${m.neckMeasurement || 0}</td>
    </tr>`;
  });

  overlay.innerHTML = `
    <h2>سجل القياسات — شاكر للدشاديش (${items.length} سجل)</h2>
    <table class="meas-print-table">
      <thead>
        <tr>
          <th>الاسم</th><th>رقم الملف</th><th>التصميم</th><th>واتساب</th>
          <th>الكتف</th><th>الردن</th><th>عرض الردن</th><th>الصدر</th><th>الطول</th><th>الياخة</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  document.body.appendChild(overlay);
  window.print();
  setTimeout(() => overlay.remove(), 1000);
}

// --- Event Listeners ---
(function initMeasurements() {
  const addBtn = document.getElementById('meas-add-btn');
  const saveBtn = document.getElementById('meas-save-btn');
  const closeBtn = document.getElementById('meas-drawer-close');
  const backdrop = document.getElementById('meas-drawer-backdrop');
  const searchInput = document.getElementById('meas-search-input');
  const printBtn = document.getElementById('meas-print-btn');

  if (addBtn) addBtn.addEventListener('click', () => openMeasDrawer(null));
  if (saveBtn) saveBtn.addEventListener('click', saveMeasurement);
  if (closeBtn) closeBtn.addEventListener('click', closeMeasDrawer);
  if (backdrop) backdrop.addEventListener('click', closeMeasDrawer);

  // Text search — live filter
  if (searchInput) searchInput.addEventListener('input', () => renderMeasList());

  // Measurement inputs — live filter with debounce
  document.querySelectorAll('.meas-search-grid input').forEach(inp => {
    inp.addEventListener('input', debounceMeasFilter);
  });

  // Toggle measurement filter panel
  const filterToggle = document.getElementById('meas-filter-toggle');
  const filterPanel = document.getElementById('meas-filter-panel');
  if (filterToggle && filterPanel) {
    filterToggle.addEventListener('click', () => {
      filterToggle.classList.toggle('active');
      filterPanel.classList.toggle('open');
      updateFilterBadge(
        [...document.querySelectorAll('.meas-search-grid input')].filter(i => i.value).length
      );
    });
  }

  // Clear measurement filters
  const filterClear = document.getElementById('meas-filter-clear');
  if (filterClear) {
    filterClear.addEventListener('click', () => {
      document.querySelectorAll('.meas-search-grid input').forEach(inp => { inp.value = ''; });
      renderMeasList();
    });
  }


  if (printBtn) printBtn.addEventListener('click', printMeasurements);

  // Escape key for drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const measDrawer = document.getElementById('meas-drawer');
      if (measDrawer && measDrawer.classList.contains('show')) closeMeasDrawer();
    }
  });
})();
