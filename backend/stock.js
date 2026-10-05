const pool = require('./db');

// ── Provisionnement automatique de la table Stock ────────────────────────────
// Gestion des stocks de médicaments/équipements, avec seuil d'alerte par
// produit (rupture / stock bas / ok). Créée et peuplée au premier démarrage.
async function ensureStockTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Stock (
      id_stock         INT AUTO_INCREMENT PRIMARY KEY,
      nom_produit      VARCHAR(150) NOT NULL,
      categorie        VARCHAR(60)  NOT NULL,
      quantite         INT          NOT NULL DEFAULT 0,
      seuil_alerte     INT          NOT NULL DEFAULT 0,
      unite            VARCHAR(30)  NOT NULL DEFAULT 'unité(s)',
      date_peremption  DATE         NULL,
      fournisseur      VARCHAR(150) NULL,
      maj_le           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM Stock');
  if (n > 0) return;

  const seed = [
    ['Paracétamol 500mg',    'Médicament',   340,  100, 'boîtes',  '2027-03-01', 'PharmaCam'],
    ['Amoxicilline 500mg',   'Médicament',    18,   50, 'boîtes',  '2026-11-15', 'PharmaCam'],
    ['Sérum physiologique',  'Médicament',     0,   30, 'flacons', '2027-06-01', 'MediSupply'],
    ['Gants latex (boîte)',  'Consommable',  220,   80, 'boîtes',  null,         'HygiènePro'],
    ['Compresses stériles',  'Consommable',   45,   60, 'paquets', null,         'HygiènePro'],
    ['Seringues 5ml',        'Consommable',   12,   40, 'boîtes',  null,         'MediSupply'],
    ['Alcool médical 70°',   'Médicament',    95,   40, 'litres',  '2027-01-20', 'PharmaCam'],
    ['Kit perfusion',        'Consommable',   30,   25, 'unités',  null,         'MediSupply'],
    ['Tensiomètre',          'Équipement',     6,    4, 'unités',  null,         'MedEquip'],
    ['Oxymètre de pouls',    'Équipement',     2,    3, 'unités',  null,         'MedEquip']
  ];

  for (const [nom_produit, categorie, quantite, seuil_alerte, unite, date_peremption, fournisseur] of seed) {
    await pool.query(
      'INSERT INTO Stock (nom_produit, categorie, quantite, seuil_alerte, unite, date_peremption, fournisseur) VALUES (?,?,?,?,?,?,?)',
      [nom_produit, categorie, quantite, seuil_alerte, unite, date_peremption, fournisseur]
    );
  }
}

module.exports = { ensureStockTable };
