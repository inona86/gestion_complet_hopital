# MediBase — Guide d'installation locale

## Prérequis
- **Node.js** v16+ → https://nodejs.org
- **MySQL** 5.7+ ou 8.0+ (WAMP, XAMPP, MySQL Workbench, ou installation directe)

---

## Étape 1 — Créer la base de données

Dans MySQL, exécuter le script SQL fourni (votre schéma), puis s'assurer que la base s'appelle `medibase` :

```sql
CREATE DATABASE IF NOT EXISTS medibase CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE medibase;
-- coller ici tout votre script CREATE TABLE + ALTER TABLE
```

---

## Étape 2 — Configurer la connexion

Ouvrir `backend/db.js` et ajuster selon votre configuration MySQL :

```js
const pool = mysql.createPool({
  host:     'localhost',   // adresse MySQL
  port:     3306,          // port MySQL
  user:     'root',        // votre utilisateur
  password: '',            // votre mot de passe
  database: 'medibase'     // nom de la base
});
```

---

## Étape 3 — Lancer l'application

### Windows
Double-cliquer sur `start.bat`

### Linux / macOS
```bash
chmod +x start.sh
./start.sh
```

### Manuellement
```bash
cd backend
npm install
node server.js
```

---

## Étape 4 — Ouvrir dans le navigateur

→ **http://localhost:3000**

---

## Structure du projet

```
medibase/
├── backend/
│   ├── server.js       ← API Express (routes CRUD + stats)
│   ├── db.js           ← Configuration MySQL
│   └── package.json
├── frontend/
│   └── index.html      ← Interface complète (HTML/CSS/JS)
├── start.bat           ← Lancement Windows
├── start.sh            ← Lancement Linux/Mac
└── README.md
```

## Routes API disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | /api/medecins | Liste des médecins |
| POST | /api/medecins | Créer un médecin |
| PUT | /api/medecins/:id | Modifier un médecin |
| DELETE | /api/medecins/:id | Supprimer un médecin |
| GET | /api/patients | Liste des patients |
| GET | /api/dossiers | Dossiers médicaux |
| GET | /api/prescriptions | Prescriptions |
| GET | /api/examens | Examens |
| GET | /api/rdv | Rendez-vous |
| GET | /api/factures | Factures |
| GET | /api/infirmiers | Infirmiers |
| GET | /api/pharmaciens | Pharmaciens |
| GET | /api/techniciens | Techniciens |
| GET | /api/stats | Statistiques globales |
| GET | /api/ping | Test connexion MySQL |

Toutes les routes supportent GET / GET:id / POST / PUT:id / DELETE:id
