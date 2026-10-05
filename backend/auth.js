const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('./db');

// En production, définissez la variable d'environnement JWT_SECRET (voir .env.example).
const JWT_SECRET  = process.env.JWT_SECRET || 'medibase-dev-secret-a-changer-en-production';
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET non défini — utilisation d\'une clé de développement. À changer avant toute mise en ligne (voir backend/.env.example).');
}
const TOKEN_TTL   = '12h';

// ── Rôles et accès par module ────────────────────────────────────────────────
// Reprend les acteurs et droits décrits dans le rapport (médecin, infirmier,
// pharmacien, technicien, secrétariat, facturation, administration).
// Chaque ressource a un niveau : 'r' (lecture seule) ou 'rw' (lecture + écriture).
const ROLES = ['admin', 'medecin', 'infirmier', 'pharmacien', 'technicien', 'secretaire', 'caissier'];

const ROLE_ACCESS = {
  admin:       { '*': 'rw' },
  medecin:     { medecins:'r', patients:'rw', dossiers:'rw', prescriptions:'rw', examens:'rw', rdv:'rw', stocks:'r', lits:'r', gardes:'r' },
  infirmier:   { patients:'r', dossiers:'rw', prescriptions:'r', rdv:'rw', lits:'rw', gardes:'r' },
  pharmacien:  { prescriptions:'rw', patients:'r', pharmaciens:'r', stocks:'rw' },
  technicien:  { examens:'rw', techniciens:'r' },
  secretaire:  { patients:'rw', rdv:'rw', medecins:'r', lits:'rw' },
  caissier:    { factures:'rw', patients:'r' }
};

// mode: 'r' (lecture) ou 'w' (écriture). Un accès 'rw' couvre les deux ;
// un accès 'r' ne couvre que la lecture.
function hasAccess(role, resource, mode = 'r') {
  const allowed = ROLE_ACCESS[role];
  if (!allowed) return false;
  const level = allowed['*'] || allowed[resource];
  if (!level) return false;
  return mode === 'r' ? true : level === 'rw';
}

// ── Provisionnement automatique de la table Utilisateur ─────────────────────
// Crée la table si elle n'existe pas encore, et ajoute un compte par rôle
// (uniquement au tout premier démarrage, si la table est vide) pour que le
// projet soit utilisable immédiatement après un `npm install && node server.js`.
async function ensureAuthTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Utilisateur (
      id_utilisateur INT AUTO_INCREMENT PRIMARY KEY,
      nom            VARCHAR(100) NOT NULL,
      prenom         VARCHAR(100) NOT NULL,
      email          VARCHAR(150) NOT NULL UNIQUE,
      mot_de_passe   VARCHAR(255) NOT NULL,
      role           VARCHAR(30)  NOT NULL,
      actif          TINYINT(1)   NOT NULL DEFAULT 1,
      cree_le        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM Utilisateur');
  if (n > 0) return;

  const seedUsers = [
    { nom: 'Admin',     prenom: 'Système',  email: 'admin@inona-hospital.cm',      pass: 'admin123',     role: 'admin' },
    { nom: 'Kamara',    prenom: 'Aminata',  email: 'medecin@inona-hospital.cm',    pass: 'medecin123',   role: 'medecin' },
    { nom: 'Ngono',     prenom: 'Paul',     email: 'infirmier@inona-hospital.cm',  pass: 'infirmier123', role: 'infirmier' },
    { nom: 'Diallo',    prenom: 'Ibrahim',  email: 'pharmacien@inona-hospital.cm', pass: 'pharmacien123',role: 'pharmacien' },
    { nom: 'Ndiaye',    prenom: 'Fatou',    email: 'technicien@inona-hospital.cm', pass: 'technicien123',role: 'technicien' },
    { nom: 'Mballa',    prenom: 'Sara',     email: 'secretaire@inona-hospital.cm', pass: 'secretaire123',role: 'secretaire' },
    { nom: 'Zogo',      prenom: 'Paul',     email: 'caissier@inona-hospital.cm',   pass: 'caissier123',  role: 'caissier' }
  ];

  for (const u of seedUsers) {
    const hash = await bcrypt.hash(u.pass, 10);
    await pool.query(
      'INSERT INTO Utilisateur (nom, prenom, email, mot_de_passe, role) VALUES (?,?,?,?,?)',
      [u.nom, u.prenom, u.email, hash, u.role]
    );
  }

  console.log('\n🔐  Comptes de démonstration créés (à changer en production) :');
  seedUsers.forEach(u => console.log(`   • ${u.role.padEnd(11)} → ${u.email} / ${u.pass}`));
  console.log('');
}

// ── Middlewares ───────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }
}

function requireAccess(resource) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
    const mode = req.method === 'GET' ? 'r' : 'w';
    if (!hasAccess(req.user.role, resource, mode)) {
      return res.status(403).json({
        error: mode === 'w' ? 'Votre rôle a un accès en lecture seule à ce module' : "Accès non autorisé pour votre rôle"
      });
    }
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Réservé aux administrateurs' });
    next();
  };
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id_utilisateur, nom: user.nom, prenom: user.prenom, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

module.exports = {
  ROLES, ROLE_ACCESS, hasAccess,
  ensureAuthTable, requireAuth, requireAccess, requireRole, generateToken,
  bcrypt
};
