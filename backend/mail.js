const nodemailer = require('nodemailer');
const pool = require('./db');

// ── Transport SMTP ────────────────────────────────────────────────────────────
// Si SMTP_HOST / SMTP_USER / SMTP_PASS sont définis en variables d'environnement,
// ils sont utilisés (Gmail, Outlook, un serveur de l'université, etc.).
// Sinon, un compte de test Ethereal est créé automatiquement au démarrage :
// gratuit, aucune inscription, les emails ne partent pas vraiment mais un lien
// de prévisualisation est affiché dans la console — pratique pour une démo.
let transporter = null;
let usingEthereal = false;

async function ensureMailTransport() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    console.log(`📧  Emails envoyés via ${process.env.SMTP_HOST} (${process.env.SMTP_USER})`);
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
    usingEthereal = true;
    console.log('📧  Aucun SMTP configuré → compte de test Ethereal créé automatiquement.');
    console.log('    (Les emails de démo n\'arrivent nulle part réellement — un lien de prévisualisation');
    console.log('     s\'affiche dans cette console à chaque envoi. Pour un vrai envoi, définissez');
    console.log('     SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS en variables d\'environnement.)');
  }
  return transporter;
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' }); }
  catch { return d; }
}

// ── Envoi de la confirmation de RDV ──────────────────────────────────────────
// Appelée après la création d'un RDV (voir server.js). N'échoue jamais de façon
// bloquante : une erreur d'envoi est journalisée mais ne fait pas échouer la
// création du rendez-vous côté utilisateur.
async function sendRdvConfirmation(rdv) {
  if (!rdv.id_patient) return;

  const [rows] = await pool.query('SELECT nom, prenom, email FROM Patient WHERE id_patient=?', [rdv.id_patient]);
  const patient = rows[0];
  if (!patient || !patient.email) return;

  const t = await ensureMailTransport();
  const info = await t.sendMail({
    from: '"INONA HOSPITAL" <no-reply@inona-hospital.cm>',
    to: patient.email,
    subject: 'Confirmation de votre rendez-vous — INONA HOSPITAL',
    text:
`Bonjour ${patient.prenom} ${patient.nom},

Votre rendez-vous a bien été enregistré.

Date : ${fmtDate(rdv.date_rendez)}
Motif : ${rdv.motif || 'non précisé'}

Merci de vous présenter 15 minutes avant l'heure prévue avec une pièce d'identité.

— INONA HOSPITAL`,
    html:
`<div style="font-family:sans-serif;color:#1a1917;max-width:480px">
  <h2 style="color:#0c1e3c;margin-bottom:4px">INONA HOSPITAL</h2>
  <p style="color:#6b6961;font-size:13px;margin-top:0">Confirmation de rendez-vous</p>
  <p>Bonjour <b>${patient.prenom} ${patient.nom}</b>,</p>
  <p>Votre rendez-vous a bien été enregistré :</p>
  <table style="font-size:14px;margin:12px 0">
    <tr><td style="color:#6b6961;padding-right:12px">Date</td><td><b>${fmtDate(rdv.date_rendez)}</b></td></tr>
    <tr><td style="color:#6b6961;padding-right:12px">Motif</td><td>${rdv.motif || 'non précisé'}</td></tr>
  </table>
  <p style="font-size:13px;color:#6b6961">Merci de vous présenter 15 minutes avant l'heure prévue avec une pièce d'identité.</p>
</div>`
  });

  if (usingEthereal) {
    console.log(`📧  Email de confirmation RDV (démo) → aperçu : ${nodemailer.getTestMessageUrl(info)}`);
  } else {
    console.log(`📧  Email de confirmation RDV envoyé à ${patient.email}`);
  }
}

module.exports = { sendRdvConfirmation, ensureMailTransport };
