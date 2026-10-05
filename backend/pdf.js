const PDFDocument = require('pdfkit');

const NAVY = '#0c1e3c';
const BLUE = '#185fa5';
const MUTED = '#6b6961';
const INK = '#1a1917';

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return d; }
}

function header(doc, title, subtitle) {
  doc.fontSize(18).fillColor(NAVY).font('Helvetica-Bold').text('INONA HOSPITAL');
  doc.fontSize(9).fillColor(MUTED).font('Helvetica').text('MediBase — Système de gestion hospitalière');
  doc.moveDown(1.2);
  doc.fontSize(15).fillColor(INK).font('Helvetica-Bold').text(title);
  if (subtitle) doc.fontSize(9).fillColor(MUTED).font('Helvetica').text(subtitle);
  doc.moveDown(0.6);
  doc.strokeColor(BLUE).lineWidth(1.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);
}

function field(doc, label, value) {
  doc.fontSize(9).fillColor(MUTED).font('Helvetica').text(label, { continued: true });
  doc.fontSize(10).fillColor(INK).font('Helvetica-Bold').text('  ' + (value ?? '—'));
  doc.moveDown(0.35);
}

function sectionTitle(doc, txt) {
  doc.moveDown(0.4);
  doc.fontSize(11).fillColor(BLUE).font('Helvetica-Bold').text(txt);
  doc.moveDown(0.3);
}

function footer(doc) {
  doc.moveDown(2);
  doc.fontSize(8).fillColor(MUTED).font('Helvetica')
    .text(`Document généré le ${new Date().toLocaleString('fr-FR')} — INONA HOSPITAL / MediBase`, { align: 'center' });
}

function streamFacturePDF(res, facture, patient) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=facture-${facture.id_facture}.pdf`);
  doc.pipe(res);

  header(doc, `Facture #${facture.id_facture}`, `Émise le ${fmtDate(facture.date_facturation)}`);

  sectionTitle(doc, 'Patient');
  field(doc, 'Nom', patient ? `${patient.prenom} ${patient.nom}` : `ID #${facture.id_patient ?? '—'}`);
  if (patient) {
    field(doc, 'Téléphone', patient.telephone);
    field(doc, 'Email', patient.email);
  }

  sectionTitle(doc, 'Détail de la facture');
  field(doc, 'Montant', `${Number(facture.montant).toLocaleString('fr-FR')} FCFA`);
  field(doc, 'Statut du paiement', facture.statut_paiement);
  field(doc, 'Date de facturation', fmtDate(facture.date_facturation));

  footer(doc);
  doc.end();
}

function streamDossierPDF(res, dossier, patient) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=dossier-${dossier.id_dossier}.pdf`);
  doc.pipe(res);

  header(doc, `Dossier médical #${dossier.id_dossier}`, `Ouvert le ${fmtDate(dossier.date_ouverture)}`);

  sectionTitle(doc, 'Patient');
  field(doc, 'Nom', patient ? `${patient.prenom} ${patient.nom}` : `ID #${dossier.id_patient ?? '—'}`);
  if (patient) {
    field(doc, 'Date de naissance', fmtDate(patient.date_naissance));
    field(doc, 'Téléphone', patient.telephone);
  }

  sectionTitle(doc, 'Informations médicales');
  field(doc, 'Groupe sanguin', dossier.groupe_sanguin);
  field(doc, 'Allergie connue', dossier.allergie_connue);
  field(doc, 'Paramètres vitaux', dossier.parametres_vitaux);
  field(doc, 'Statut du dossier', dossier.statut ? 'Actif' : 'Fermé');

  if (dossier.historique || dossier.observation) {
    sectionTitle(doc, 'Historique / Observations');
    if (dossier.historique)  doc.fontSize(10).fillColor(INK).font('Helvetica').text(dossier.historique);
    if (dossier.observation) doc.fontSize(10).fillColor(INK).font('Helvetica').text(dossier.observation);
  }

  footer(doc);
  doc.end();
}

module.exports = { streamFacturePDF, streamDossierPDF };
