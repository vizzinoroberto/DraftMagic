# ⚔️ Magic Draft Tournament — QUEI DEE CARTE DA CUEO

Web app per gestire tornei di draft Magic: The Gathering all'italiana (round-robin), con registro tornei su Firebase Firestore, dashboard admin e deploy su Vercel.

---

## 🚀 Setup passo per passo

### 1. Firebase — Crea il database

1. Vai su [console.firebase.google.com](https://console.firebase.google.com) e accedi con Google
2. Clicca **"Add project"** → dai un nome → disabilita Google Analytics (non serve) → **Create project**
3. Nel menu laterale clicca **Firestore Database** → **Create database**
4. Scegli **"Start in production mode"** → scegli la region più vicina (es. `europe-west1`) → **Enable**

#### ⚠️ IMPORTANTE — Security Rules (il motivo dei problemi precedenti)

Appena creato il database, Firestore blocca tutto di default. Devi subito:

1. Vai su **Firestore Database → Rules**
2. Sostituisci tutto il contenuto con quello del file `firestore.rules`:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /tournaments/{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
3. Clicca **Publish**

#### Recupera le credenziali

1. Vai su **Project Settings** (icona ingranaggio in alto a sinistra) → **General**
2. Scorri fino a **"Your apps"** → clicca **"</> Web"**
3. Dai un nome all'app (es. "magic-tournament-web") → **Register app**
4. Copia i valori da `firebaseConfig` — ti servono tutti per il prossimo step

---

### 2. GitHub — Carica il progetto

1. Crea un repository su [github.com](https://github.com)
2. Nella cartella estratta dallo zip, esegui:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/TUO_UTENTE/NOME_REPO.git
   git push -u origin main
   ```

---

### 3. Vercel — Deploy

1. Vai su [vercel.com](https://vercel.com) e accedi con GitHub
2. Clicca **Add New → Project** → seleziona il repository
3. Vercel rileva automaticamente Vite ✅
4. Prima del deploy, aggiungi le **Environment Variables**:

| Nome variabile | Dove trovarlo |
|---|---|
| `VITE_FIREBASE_API_KEY` | firebaseConfig → apiKey |
| `VITE_FIREBASE_AUTH_DOMAIN` | firebaseConfig → authDomain |
| `VITE_FIREBASE_PROJECT_ID` | firebaseConfig → projectId |
| `VITE_FIREBASE_STORAGE_BUCKET` | firebaseConfig → storageBucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | firebaseConfig → messagingSenderId |
| `VITE_FIREBASE_APP_ID` | firebaseConfig → appId |
| `VITE_ADMIN_PASSWORD` | Password a scelta per la dashboard admin |

5. Clicca **Deploy** 🎉

---

## 🔄 Aggiornamenti futuri

Ogni `git push` rideploya automaticamente su Vercel.

---

## 💻 Sviluppo locale

```bash
npm install
cp .env.example .env
# Modifica .env con le tue credenziali Firebase
npm run dev
```

---

## 🔐 Admin

Il bottone **Admin** in basso apre una dashboard protetta da password (`VITE_ADMIN_PASSWORD`).  
Da lì puoi vedere e cancellare tutti i tornei.

---

## 🗃️ Struttura dati Firestore

Ogni torneo è un singolo documento nella collection `tournaments`:

```
tournaments/
  └── {id automatico}
        ├── createdAt: timestamp
        ├── player_count: number
        ├── total_rounds: number
        ├── tournament_standings: [ { position, player_name, points, ... } ]
        └── rounds: [ { round_number, matches: [ { player1_name, score_p1, ... } ] } ]
```
