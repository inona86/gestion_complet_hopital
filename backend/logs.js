const pool = require('./db');

// ── Provisionnement automatique de la table Log_activite ────────────────────
async function ensureLogsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Log_activite (
      id_log          INT AUTO_INCREMENT PRIMARY KEY,
      id_utilisateur  INT,
      nom_utilisateur VARCHAR(150),
      role            VARCHAR(30),
      action          VARCHAR(10)  NOT NULL,
      table_cible     VARCHAR(50)  NOT NULL,
      id_cible        INT,
      details         TEXT,
      date_action     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Enregistre une action. Ne doit jamais faire échouer la requête principale :
// une erreur de journalisation est seulement notée en console.
async function recordLog(user, action, tableCible, idCible, details) {
  try {
    await pool.query(
      `INSERT INTO Log_activite
        (id_utilisateur, nom_utilisateur, role, action, table_cible, id_cible, details)
       VALUES (?,?,?,?,?,?,?)`,
      [
        user?.id || null,
        user ? `${user.prenom} ${user.nom}` : 'Inconnu',
        user?.role || null,
        action,
        tableCible,
        idCible || null,
        details ? JSON.stringify(details) : null
      ]
    );
  } catch (e) {
    console.error("⚠️  Journal d'activité : échec d'écriture —", e.message);
  }
}

module.exports = { ensureLogsTable, recordLog };
