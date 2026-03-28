# Shaker's Dishdasha Website — Project Instructions

## Overview
Arabic-language website for Shaker, a men's traditional clothing (dishdasha) tailor and retailer.
- **Public site:** `index.html` — Hero + Gallery + Contact
- **Admin panel:** `admin/index.html` — Manage photos & sections (Shaker only)

## Tech Stack
- Vanilla HTML/CSS/JS (no framework)
- Firebase (Auth, Firestore, Storage) — free tier
- Google Fonts: Cairo (RTL-friendly)

## File Structure
```
Shaker's Website/
├── index.html              → public gallery/contact page
├── admin/
│   └── index.html          → admin panel
├── css/
│   ├── style.css           → public site styles
│   └── admin.css           → admin panel styles
├── js/
│   ├── firebase-config.js  → Firebase init (MUST update with real credentials)
│   ├── main.js             → public gallery logic
│   └── admin.js            → admin: upload, sections, auth
└── assets/
    └── logo/               → place Shaker's logo here as logo.png
```

## Setup — Do This Once

### 1. Firebase Project
1. Go to https://console.firebase.google.com → Create project
2. Enable **Authentication** → Sign-in method → Email/Password
3. Create Shaker's account in Authentication → Users → Add user
4. Enable **Firestore Database** → Start in production mode
5. Enable **Storage**

### 2. Firebase Config
Open `js/firebase-config.js` and replace the placeholder values with your project's real config.
Find them at: Firebase Console → Project Settings → General → Your Apps → Firebase SDK snippet.

### 3. Firestore Security Rules
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sections/{id} { allow read; allow write: if request.auth != null; }
    match /images/{id}   { allow read; allow write: if request.auth != null; }
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

### 5. Logo
Place Shaker's logo at `assets/logo/logo.png`.
Then in `index.html`, uncomment the `<img>` tag and remove the SVG placeholder.

### 6. WhatsApp Number
The WhatsApp number is set to `98647730666777` in:
- `index.html` (contact button)
- `js/main.js` (WA_NUMBER constant)

Update both if the number changes.

### 7. Social Links
Instagram, Facebook, and TikTok links are set in `index.html` contact section:
- Instagram: https://www.instagram.com/shaker.company/
- Facebook: https://www.facebook.com/shaker.emart
- TikTok: https://www.tiktok.com/@hajiishker

## Running Locally
```bash
# Python 3
python -m http.server 8000

# Node.js (npx)
npx serve .
```
Then open: http://localhost:8000

> **Note:** `js/main.js` (public site) uses the **Firestore REST API** directly — no Firebase SDK needed.
> The admin panel (`admin/index.html`) still uses the Firebase SDK via `js/firebase-config.js`.

## Design
- Colors: Navy `#0B1C3D` + Gold `#C9A84C` + Cream `#F5F0E8`
- RTL layout (Arabic)
- Font: Cairo

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
```
