# Shaker's Dishdasha Website — Project Instructions

## Overview
Arabic-language website for Shaker, a men's traditional clothing (dishdasha) tailor and retailer.
- **Public site:** `index.html` — Hero + Gallery (فصال default) + Contact
- **Admin panel:** `admin/index.html` — Manage photos & sections (Shaker only)

## Tech Stack
- Vanilla HTML/CSS/JS (no framework)
- Firebase (Auth, Firestore, Storage) — free tier
- Google Fonts: Cairo (RTL-friendly)

## File Structure
```
Shaker's Website/
├── index.html              → public gallery/contact page
├── lining dshdsh.svg       → Illustrator dishdasha diagram (used in فصال form)
├── admin/
│   └── index.html          → admin panel
├── css/
│   ├── style.css           → public site styles
│   └── admin.css           → admin panel styles
├── js/
│   ├── firebase-config.js  → Firebase init (admin only)
│   ├── main.js             → public gallery logic (Firestore REST API)
│   └── admin.js            → admin: upload, sections, auth
└── assets/
    └── logo/               → logo-gold.png (already in place)
```

## Gallery Tabs
Three categories, **فصال is the default active tab**:
- `جاهز` (ready-made) — photo grid only
- `فصال` (tailored) — measurement order form + photo gallery below
- `أقمشة` (fabrics) — photo grid only

## فصال Order Form
The form is in `#fabric-form` inside `#cat-tailored`. It contains:
- Dishdasha SVG diagram (`lining dshdsh.svg`) with 6 gold annotation arrows
- 6 measurement inputs (cm): الطول الكلي، الصدر، الكتف، الياخة، طول الردن، عرض الردن
- Notes textarea
- WhatsApp submit button → sends Arabic-formatted message to `WA_NUMBER`
- Fabric selection: clicking a photo in the gallery below opens the modal with "اختر هذا القماش" button; selected fabric is shown in a strip above the form

### WhatsApp Message Format
```
طلب فصال جديد 🪡
━━━━━━━━━━━━━━━━
القياسات (سم):
• الطول الكلي: ...
• الصدر: ...
• الكتف: ...
• الياخة: ...
• طول الردن: ...
• عرض الردن: ...
━━━━━━━━━━━━━━━━
القماش المختار: [url or "لم يُحدد"]
━━━━━━━━━━━━━━━━
ملاحظات: [text or "لا يوجد"]
```

## Setup — Do This Once

### 1. Firebase Project
1. Go to https://console.firebase.google.com → Create project
2. Enable **Authentication** → Sign-in method → Email/Password
3. Create Shaker's account in Authentication → Users → Add user
4. Enable **Firestore Database** → Start in production mode
5. Enable **Storage**

### 2. Firebase Config
`js/firebase-config.js` already has real credentials for project `shaker-s-dishdasha`.
The public site uses the **Firestore REST API** — no SDK needed for `index.html`.

### 3. Firestore Security Rules
> **IMPORTANT:** The `orders` collection MUST have a `create` rule allowing public writes,
> otherwise customer orders from the public site will silently fail (no auth on public site).
> The `images` collection MUST allow public updates to the `quantity` field only,
> so stock decrements work when customers place orders (no auth on public site).
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sections/{id} { allow read; allow write: if request.auth != null; }
    match /images/{id}   {
      allow read;
      allow write: if request.auth != null;
      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['quantity']);
    }
    match /orders/{id}   { allow create; allow read, update, delete: if request.auth != null; }
  }
}
```

### 4. Storage Security Rules
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read;
      allow write: if request.auth != null;
    }
  }
}
```

### 5. Measurement Video
Add the measurement tutorial video file to `assets/` and set its path in `index.html`:
```html
<source src="assets/measurement-guide.mp4" type="video/mp4" />
```
The video plays in an overlay when the user clicks "كيف تأخذ قياساتك؟" below the dishdasha diagram.

### 6. WhatsApp Number
Set to `9647730666777` in:
- `index.html` (contact button)
- `js/main.js` (`WA_NUMBER` constant)

### 6. Social Links
- Instagram: https://www.instagram.com/shaker.company/
- Facebook: https://www.facebook.com/shaker.emart
- TikTok: https://www.tiktok.com/@hajiishker

## Running Locally
```bash
python -m http.server 8000
```
Then open: http://localhost:8000

> **Note:** `js/main.js` uses the **Firestore REST API** directly (no Firebase SDK).
> The admin panel still uses the Firebase SDK via `js/firebase-config.js`.

## Design
- Colors: Navy `#0B1C3D` + Gold `#C9A84C` + Cream `#F5F0E8`
- RTL layout (Arabic), Font: Cairo
- Mobile-first responsive: 2-column image grid on phones, stacked buttons, touch-friendly targets

## Firestore Schema
```
sections/{id}
  name: string        (Arabic, e.g. "صيف ٢٠٢٥")
  category: "ready-made" | "tailored" | "fabrics"
  order: number
  createdAt: timestamp

images/{id}
  sectionId: string
  storageUrl: string
  description: string (Arabic, optional)
  order: number
  createdAt: timestamp
  fileName: string
  pricePerMeter: number     (tailored/fabrics only — price per meter in IQD)
  price: number             (ready-made only — fixed price in IQD)
  quantity: number           (ready-made only — stock count)
  sizes: array<string>       (ready-made only — e.g. ["S","M","L"])
  colors: array<string>      (ready-made only — e.g. ["أبيض","بيج"])

orders/{id}
  orderType: "tailored" | "ready-made"
  customerName: string
  customerPhone: string
  status: string ("new")
  createdAt: timestamp
  updatedAt: timestamp
  # Tailored orders:
  measurements: map (totalLength, chest, shoulder, neck, sleeveLength, sleeveWidth)
  fabricUrl: string
  dishdashaType: string
  collarType: string
  pocketType: string
  sleeveType: string
  notes: string
  # Ready-made orders:
  imageId: string
  imageUrl: string
  itemName: string
  price: number
  size: string
  color: string
```
