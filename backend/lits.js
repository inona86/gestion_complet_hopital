const pool = require('./db');

// ── Provisionnement automatique de la table Lit ──────────────────────────────
// Occupation des lits par service, pour une vue temps réel de la disponibilité.
// Créée et peuplée au premier démarrage (5 lits x 4 services de soins avec
// hébergement — les consultations externes, ambulatoires, n'en ont pas).
async function ensureLitsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Lit (
      id_lit      INT AUTO_INCREMENT PRIMARY KEY,
      numero      VARCHAR(20)  NOT NULL,
      service     VARCHAR(60)  NOT NULL,
      statut      VARCHAR(20)  NOT NULL DEFAULT 'Libre',
      id_patient  INT          NULL,
      maj_le      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM Lit');
  if (n > 0) return;

  const services = ['Urgences', 'Médecine générale', 'Chirurgie', 'Pédiatrie'];
  const statuts  = ['Libre', 'Libre', 'Occupé', 'Occupé', 'Réservé'];   // pondéré pour une démo réaliste

  const rows = [];
  services.forEach((service, sIdx) => {
    for (let i = 1; i <= 5; i++) {
      const statut = i === 5 && sIdx === 2 ? 'Maintenance' : statuts[(sIdx + i) % statuts.length];
      rows.push([
        `${service.slice(0,1).toUpperCase()}${sIdx+1}-${String(i).padStart(2,'0')}`,
        service,
        statut
      ]);
    }
  });

  for (const [numero, service, statut] of rows) {
    await pool.query('INSERT INTO Lit (numero, service, statut) VALUES (?,?,?)', [numero, service, statut]);
  }
}

module.exports = { ensureLitsTable };
