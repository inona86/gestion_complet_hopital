#!/bin/bash
echo ""
echo " ============================================="
echo "  MediBase — Démarrage du serveur local"
echo " ============================================="
echo ""

cd "$(dirname "$0")/backend"

echo " [1/2] Installation des dépendances..."
npm install

echo ""
echo " [2/2] Démarrage du serveur..."
echo ""
echo " ➜  Ouvrir : http://localhost:3000"
echo ""
echo " Pour configurer MySQL, éditez backend/db.js"
echo " (host, user, password, database)"
echo ""
node server.js
