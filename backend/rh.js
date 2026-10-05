const pool = require('./db');

// ── Provisionnement automatique des tables RH ────────────────────────────────
// Dossier_rh : fiche de chaque membre du personnel (poste, formations, évaluation).
// Garde : planning des gardes par service et par plage horaire.
// Créées et peuplées au premier démarrage, comme les autres modules techniques.
async function ensureRhTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Dossier_rh (
      id_rh            INT AUTO_INCREMENT PRIMARY KEY,
      nom               VARCHAR(100) NOT NULL,
      prenom            VARCHAR(100) NOT NULL,
      poste             VARCHAR(100) NOT NULL,
      service           VARCHAR(100) NULL,
      date_embauche     DATE NULL,
      formations        VARCHAR(255) NULL,
      derniere_evaluation VARCHAR(100) NULL,
      statut            VARCHAR(30) NOT NULL DEFAULT 'Actif',
      maj_le            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Garde (
      id_garde     INT AUTO_INCREMENT PRIMARY KEY,
      nom_personnel VARCHAR(150) NOT NULL,
      service      VARCHAR(100) NOT NULL,
      date_garde   DATE NOT NULL,
      plage        VARCHAR(30) NOT NULL DEFAULT 'Matin',
      statut       VARCHAR(30) NOT NULL DEFAULT 'Planifiée'
    )
  `);

  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM Dossier_rh');
  if (n === 0) {
    const seed = [
      ['Kamara', 'Aminata', 'Médecin cardiologue', 'Médecine générale', '2021-03-01', 'Cardiologie interventionnelle (2023)', 'Très satisfaisant (2025)', 'Actif'],
      ['Ngono', 'Paul', 'Infirmier', 'Urgences', '2022-06-15', 'Gestes d\'urgence (2024)', 'Satisfaisant (2025)', 'Actif'],
      ['Diallo', 'Ibrahim', 'Pharmacien', 'Pharmacie centrale', '2020-01-10', 'Pharmacovigilance (2022)', 'Très satisfaisant (2024)', 'Actif'],
      ['Ndiaye', 'Fatou', 'Technicienne de laboratoire', 'Laboratoire', '2023-09-01', '—', 'Non évalué', 'Actif'],
      ['Mballa', 'Sara', 'Secrétaire médicale', 'Accueil / Admissions', '2019-11-20', 'Accueil patient (2021)', 'Satisfaisant (2024)', 'Congé'],
      ['Zogo', 'Paul', 'Agent de facturation', 'Facturation', '2021-08-05', '—', 'Satisfaisant (2025)', 'Actif']
    ];
    for (const row of seed) {
      await pool.query(
        'INSERT INTO Dossier_rh (nom,prenom,poste,service,date_embauche,formations,derniere_evaluation,statut) VALUES (?,?,?,?,?,?,?,?)',
        row
      );
    }
  }

  const [[{ n: ng }]] = await pool.query('SELECT COUNT(*) n FROM Garde');
  if (ng === 0) {
    const today = new Date();
    const fmt = d => d.toISOString().slice(0, 10);
    const services = ['Urgences', 'Médecine générale', 'Chirurgie', 'Pédiatrie'];
    const noms = ['Ngono Paul', 'Fotso Alice', 'Biya Serge', 'Mvondo Claire'];
    const plages = ['Matin', 'Après-midi', 'Nuit'];
    let i = 0;
    for (let d = 0; d < 5; d++) {
      const date = new Date(today); date.setDate(today.getDate() + d);
      for (const service of services) {
        const plage = plages[i % plages.length];
        const nom = noms[i % noms.length];
        await pool.query(
          'INSERT INTO Garde (nom_personnel, service, date_garde, plage, statut) VALUES (?,?,?,?,?)',
          [nom, service, fmt(date), plage, d === 0 ? 'Effectuée' : 'Planifiée']
        );
        i++;
      }
    }
  }
}

module.exports = { ensureRhTables };
