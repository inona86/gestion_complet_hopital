require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const swaggerUi    = require('swagger-ui-express');
const pool         = require('./db');
const { ROLES, ensureAuthTable, requireAuth, requireAccess, hasAccess, generateToken, bcrypt } = require('./auth');
const { ensureLogsTable, recordLog } = require('./logs');
const { ensureStockTable } = require('./stock');
const { ensureLitsTable } = require('./lits');
const { ensureRhTables } = require('./rh');
const { streamFacturePDF, streamDossierPDF } = require('./pdf');
const { sendRdvConfirmation, ensureMailTransport } = require('./mail');
const swaggerSpec  = require('./swagger');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// CSP désactivée : le frontend utilise du JS inline dans chaque page (pas de
// build step), incompatible avec la politique par défaut de Helmet. Les autres
// protections (X-Frame-Options, X-Content-Type-Options, HSTS, etc.) restent actives.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'MediBase API — Documentation' }));

// ── CRUD générique ────────────────────────────────────────────────────────────
// afterCreate (optionnel) : callback async(row) déclenché après un POST réussi,
// sans jamais bloquer ni faire échouer la réponse (ex. email de confirmation RDV).
function crud(table, pk, allowed, afterCreate) {
  const r = express.Router();

  r.get('/', async (req, res) => {
    try {
      const [rows] = await pool.query(`SELECT * FROM ${table}`);
      res.json(rows);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  r.get('/:id', async (req, res) => {
    try {
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE ${pk}=?`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  r.post('/', async (req, res) => {
    try {
      const fields = allowed.filter(f => req.body[f] !== undefined);
      if (!fields.length) return res.status(400).json({ error: 'Aucun champ fourni' });
      const [result] = await pool.query(
        `INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,
        fields.map(f => req.body[f])
      );
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE ${pk}=?`, [result.insertId]);
      recordLog(req.user, 'CREATE', table, result.insertId, fields);
      res.status(201).json(rows[0]);
      if (afterCreate) {
        afterCreate(rows[0]).catch(e => console.error(`⚠️  afterCreate(${table}) :`, e.message));
      }
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  r.put('/:id', async (req, res) => {
    try {
      const fields = allowed.filter(f => req.body[f] !== undefined);
      if (!fields.length) return res.status(400).json({ error: 'Aucun champ' });
      await pool.query(
        `UPDATE ${table} SET ${fields.map(f=>f+'=?').join(',')} WHERE ${pk}=?`,
        [...fields.map(f => req.body[f]), req.params.id]
      );
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE ${pk}=?`, [req.params.id]);
      recordLog(req.user, 'UPDATE', table, req.params.id, fields);
      res.json(rows[0]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  r.delete('/:id', async (req, res) => {
    try {
      const [result] = await pool.query(`DELETE FROM ${table} WHERE ${pk}=?`, [req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Non trouvé' });
      recordLog(req.user, 'DELETE', table, req.params.id, null);
      res.json({ message: 'Supprimé', id: req.params.id });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  return r;
}

// ── Authentification ──────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // 5 tentatives / IP / fenêtre
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' }
});

app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

    const [rows] = await pool.query('SELECT * FROM Utilisateur WHERE email=? AND actif=1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Identifiants invalides' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.mot_de_passe);
    if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id_utilisateur, nom: user.nom, prenom: user.prenom, email: user.email, role: user.role }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' });
  next();
}

// ── Gestion des comptes (admin) ──────────────────────────────────────────────
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id_utilisateur, nom, prenom, email, role, actif, cree_le FROM Utilisateur ORDER BY cree_le DESC'
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { nom, prenom, email, password, role } = req.body;
    if (!nom || !prenom || !email || !password || !role) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO Utilisateur (nom, prenom, email, mot_de_passe, role) VALUES (?,?,?,?,?)',
      [nom, prenom, email, hash, role]
    );
    recordLog(req.user, 'CREATE', 'Utilisateur', result.insertId, { nom, prenom, email, role });
    res.status(201).json({ id_utilisateur: result.insertId, nom, prenom, email, role, actif: 1 });
  } catch(e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Cet email existe déjà' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { nom, prenom, email, role, actif, password } = req.body;
    if (role !== undefined && !ROLES.includes(role)) return res.status(400).json({ error: 'Rôle invalide' });

    const fields = []; const values = [];
    if (nom !== undefined)    { fields.push('nom=?');    values.push(nom); }
    if (prenom !== undefined) { fields.push('prenom=?'); values.push(prenom); }
    if (email !== undefined)  { fields.push('email=?');  values.push(email); }
    if (role !== undefined)   { fields.push('role=?');   values.push(role); }
    if (actif !== undefined)  { fields.push('actif=?');  values.push(actif ? 1 : 0); }
    if (password)              { fields.push('mot_de_passe=?'); values.push(await bcrypt.hash(password, 10)); }
    if (!fields.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });

    values.push(req.params.id);
    await pool.query(`UPDATE Utilisateur SET ${fields.join(',')} WHERE id_utilisateur=?`, values);
    const [rows] = await pool.query(
      'SELECT id_utilisateur, nom, prenom, email, role, actif FROM Utilisateur WHERE id_utilisateur=?', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
    recordLog(req.user, 'UPDATE', 'Utilisateur', req.params.id, { nom, prenom, email, role, actif });
    res.json(rows[0]);
  } catch(e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Cet email existe déjà' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }
    const [result] = await pool.query('DELETE FROM Utilisateur WHERE id_utilisateur=?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Non trouvé' });
    recordLog(req.user, 'DELETE', 'Utilisateur', req.params.id, null);
    res.json({ message: 'Supprimé', id: req.params.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Mon profil : changer son propre mot de passe ─────────────────────────────
app.post('/api/me/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });

    const [rows] = await pool.query('SELECT * FROM Utilisateur WHERE id_utilisateur=?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const ok = await bcrypt.compare(currentPassword, rows[0].mot_de_passe);
    if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE Utilisateur SET mot_de_passe=? WHERE id_utilisateur=?', [hash, req.user.id]);
    res.json({ message: 'Mot de passe mis à jour' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Vérification allergie ↔ prescription ─────────────────────────────────────
// Appelée par le frontend avant l'enregistrement d'une prescription : ne bloque
// rien, renvoie juste un avertissement si la posologie mentionne une allergie
// connue du dossier concerné.
app.post('/api/prescriptions/check-allergie', requireAuth, requireAccess('prescriptions'), async (req, res) => {
  try {
    const { id_dossier, posologie } = req.body;
    if (!id_dossier || !posologie) return res.json({ warning: null });

    const [rows] = await pool.query('SELECT allergie_connue FROM Dossier_medical WHERE id_dossier=?', [id_dossier]);
    const allergie = (rows[0]?.allergie_connue || '').trim();
    const negligeable = ['', 'aucune', 'aucun', 'none', 'rien'].includes(allergie.toLowerCase());

    if (!negligeable && posologie.toLowerCase().includes(allergie.toLowerCase())) {
      return res.json({
        warning: `⚠️ Allergie connue sur ce dossier : "${allergie}". Vérifiez cette prescription avant de continuer.`
      });
    }
    res.json({ warning: null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Routes CRUD ───────────────────────────────────────────────────────────────
app.use('/api/medecins',      requireAuth, requireAccess('medecins'),      crud('Medecin',          'id_medecin',     ['nom','prenom','specialite','email_pro','signature_electronique']));
app.use('/api/patients',      requireAuth, requireAccess('patients'),      crud('Patient',          'id_patient',     ['nom','prenom','date_naissance','adresse','numero_secu','telephone','email','id_medecin']));
app.use('/api/dossiers',      requireAuth, requireAccess('dossiers'),      crud('Dossier_medical',  'id_dossier',     ['date_ouverture','statut','groupe_sanguin','allergie_connue','parametres_vitaux','historique','observation','id_patient']));
app.use('/api/infirmiers',    requireAuth, requireAccess('infirmiers'),    crud('Infirmier',        'id_infirmier',   ['service','nom','prenom']));
app.use('/api/pharmaciens',   requireAuth, requireAccess('pharmaciens'),   crud('Pharmacien',       'id_pharmacien',  ['nom','prenom']));
app.use('/api/techniciens',   requireAuth, requireAccess('techniciens'),   crud('Technicien_examen','id_technicien',  ['nom','prenom','type_examen']));
app.use('/api/prescriptions', requireAuth, requireAccess('prescriptions'), crud('Prescription',     'id_prescription',['date_prescription','statut','posologie','duree','id_medecin','id_dossier','id_infirmier']));
app.use('/api/factures',      requireAuth, requireAccess('factures'),      crud('Facture',          'id_facture',     ['id_patient','date_facturation','montant','statut_paiement']));
app.use('/api/examens',       requireAuth, requireAccess('examens'),       crud('Examen',           'id_examen',      ['date_realisation','type_examen','resultat','statut','id_medecin','id_dossier']));
app.use('/api/rdv',           requireAuth, requireAccess('rdv'),           crud('RDV',              'id_rdv',         ['date_rendez','motif','statut','id_patient'], sendRdvConfirmation));
app.use('/api/stocks',        requireAuth, requireAccess('stocks'),        crud('Stock',            'id_stock',       ['nom_produit','categorie','quantite','seuil_alerte','unite','date_peremption','fournisseur']));
app.use('/api/lits',          requireAuth, requireAccess('lits'),          crud('Lit',               'id_lit',         ['numero','service','statut','id_patient']));
app.use('/api/rh',            requireAuth, requireAccess('rh'),            crud('Dossier_rh',        'id_rh',          ['nom','prenom','poste','service','date_embauche','formations','derniere_evaluation','statut']));
app.use('/api/gardes',        requireAuth, requireAccess('gardes'),        crud('Garde',             'id_garde',       ['nom_personnel','service','date_garde','plage','statut']));

// ── Export PDF (factures, dossiers) ──────────────────────────────────────────
app.get('/api/factures/:id/pdf', requireAuth, requireAccess('factures'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Facture WHERE id_facture=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Facture introuvable' });
    const facture = rows[0];
    let patient = null;
    if (facture.id_patient) {
      const [prows] = await pool.query('SELECT * FROM Patient WHERE id_patient=?', [facture.id_patient]);
      patient = prows[0] || null;
    }
    streamFacturePDF(res, facture, patient);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dossiers/:id/pdf', requireAuth, requireAccess('dossiers'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Dossier_medical WHERE id_dossier=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Dossier introuvable' });
    const dossier = rows[0];
    let patient = null;
    if (dossier.id_patient) {
      const [prows] = await pool.query('SELECT * FROM Patient WHERE id_patient=?', [dossier.id_patient]);
      patient = prows[0] || null;
    }
    streamDossierPDF(res, dossier, patient);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Statistiques analytiques (nouveau, réservé à l'administrateur) ──────────
app.get('/api/stats/analytics', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [facturation] = await pool.query(`
      SELECT DATE_FORMAT(date_facturation, '%Y-%m') AS mois, SUM(montant) AS total
      FROM Facture
      WHERE date_facturation >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY mois ORDER BY mois
    `);
    const [rdvStatut] = await pool.query(`SELECT statut, COUNT(*) n FROM RDV GROUP BY statut`);
    const [examensType] = await pool.query(`SELECT type_examen, COUNT(*) n FROM Examen GROUP BY type_examen`);

    let litsStatut = [];
    try { [litsStatut] = await pool.query(`SELECT statut, COUNT(*) n FROM Lit GROUP BY statut`); } catch {}

    let personnelService = [];
    try { [personnelService] = await pool.query(`SELECT service, COUNT(*) n FROM Dossier_rh GROUP BY service`); } catch {}

    res.json({ facturation, rdvStatut, examensType, litsStatut, personnelService });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Fiche patient 360° ────────────────────────────────────────────────────────
// Agrège en un seul appel tout ce qui concerne un patient : identité, dossier
// médical, rendez-vous, prescriptions (via son dossier) et factures.
app.get('/api/patients/:id/fiche', requireAuth, requireAccess('patients'), async (req, res) => {
  try {
    const id = req.params.id;
    const [prows] = await pool.query('SELECT * FROM Patient WHERE id_patient=?', [id]);
    if (!prows.length) return res.status(404).json({ error: 'Patient introuvable' });
    const patient = prows[0];

    const [dossiers] = await pool.query('SELECT * FROM Dossier_medical WHERE id_patient=?', [id]);
    const dossier = dossiers[0] || null;

    const [rdv] = await pool.query('SELECT * FROM RDV WHERE id_patient=? ORDER BY date_rendez DESC', [id]);
    const [factures] = await pool.query('SELECT * FROM Facture WHERE id_patient=? ORDER BY date_facturation DESC', [id]);

    let prescriptions = [];
    if (dossier) {
      const [pr] = await pool.query('SELECT * FROM Prescription WHERE id_dossier=? ORDER BY date_prescription DESC', [dossier.id_dossier]);
      prescriptions = pr;
    }

    res.json({ patient, dossier, rdv, factures, prescriptions });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Notifications internes ───────────────────────────────────────────────────
// Alertes calculées à la volée, filtrées selon les modules accessibles au rôle
// de l'utilisateur (pas de fuite d'information hors de son périmètre).
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const notifs = [];

    if (hasAccess(req.user.role, 'stocks', 'r')) {
      const [rows] = await pool.query('SELECT nom_produit, quantite, seuil_alerte FROM Stock WHERE quantite <= seuil_alerte ORDER BY quantite ASC');
      rows.forEach(r => notifs.push({
        type: r.quantite === 0 ? 'danger' : 'warning',
        message: r.quantite === 0
          ? `Rupture de stock : ${r.nom_produit}`
          : `Stock bas : ${r.nom_produit} (${r.quantite}/${r.seuil_alerte})`
      }));
    }

    if (hasAccess(req.user.role, 'factures', 'r')) {
      const [rows] = await pool.query(
        "SELECT id_facture, montant FROM Facture WHERE statut_paiement='Impayée' AND date_facturation <= DATE_SUB(CURDATE(), INTERVAL 30 DAY)"
      );
      rows.forEach(r => notifs.push({
        type: 'warning',
        message: `Facture #${r.id_facture} impayée depuis plus de 30 jours (${Number(r.montant).toLocaleString()} FCFA)`
      }));
    }

    if (hasAccess(req.user.role, 'rdv', 'r')) {
      const [rows] = await pool.query("SELECT id_rdv, motif FROM RDV WHERE date_rendez = CURDATE()");
      rows.forEach(r => notifs.push({
        type: 'info',
        message: `Rendez-vous aujourd'hui : ${r.motif || 'motif non précisé'}`
      }));
    }

    res.json(notifs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Stats globales ────────────────────────────────────────────────────────────
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const [[med]]  = await pool.query('SELECT COUNT(*) n FROM Medecin');
    const [[pat]]  = await pool.query('SELECT COUNT(*) n FROM Patient');
    const [[pre]]  = await pool.query('SELECT COUNT(*) n FROM Prescription');
    const [[exa]]  = await pool.query('SELECT COUNT(*) n FROM Examen');
    const [[fac]]  = await pool.query('SELECT COUNT(*) n FROM Facture');
    const [[fpay]] = await pool.query("SELECT COUNT(*) n FROM Facture WHERE statut_paiement='Payée'");
    const [[fimp]] = await pool.query("SELECT COUNT(*) n FROM Facture WHERE statut_paiement='Impayée'");
    const [[tot]]  = await pool.query('SELECT COALESCE(SUM(montant),0) total FROM Facture');
    const [[rdv]]  = await pool.query('SELECT COUNT(*) n FROM RDV');
    let alertes_stock = 0;
    try {
      const [[alertRow]] = await pool.query('SELECT COUNT(*) n FROM Stock WHERE quantite <= seuil_alerte');
      alertes_stock = alertRow.n;
    } catch { /* table pas encore prête au tout premier appel — sans conséquence */ }
    res.json({
      medecins: med.n, patients: pat.n, prescriptions: pre.n,
      examens: exa.n, factures: fac.n, factures_payees: fpay.n,
      factures_impayees: fimp.n, total_facturation: tot.total, rdv: rdv.n,
      alertes_stock
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Journal d'activité (admin uniquement) ──────────────────────────────────────
app.get('/api/logs', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' });
  try {
    const [rows] = await pool.query('SELECT * FROM Log_activite ORDER BY date_action DESC LIMIT 200');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Ping DB ───────────────────────────────────────────────────────────────────
app.get('/api/ping', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch(e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// ── Fallback SPA ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, async () => {
  console.log(`\n🏥  MediBase API → http://localhost:${PORT}`);
  console.log(`📚  Documentation API (Swagger) → http://localhost:${PORT}/api-docs\n`);
  try {
    await ensureAuthTable();
    await ensureLogsTable();
    await ensureStockTable();
    await ensureLitsTable();
    await ensureRhTables();
  } catch (e) {
    console.error('⚠️  Impossible d\'initialiser la table Utilisateur :', e.message);
  }
  try {
    await ensureMailTransport();
  } catch (e) {
    console.error('⚠️  Impossible d\'initialiser le transport email :', e.message);
  }
});
