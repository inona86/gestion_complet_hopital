// Spécification OpenAPI 3.0 de l'API MediBase — servie via /api-docs (swagger-ui-express).
// Écrite à la main pour refléter exactement les routes définies dans server.js.

const bearerAuth = { bearerAuth: [] };

const crudResponses = (name) => ({
  200: { description: `Liste ou élément ${name} récupéré avec succès` },
  201: { description: `${name} créé avec succès` },
  401: { description: 'Authentification requise (jeton manquant ou invalide)' },
  403: { description: "Accès refusé pour le rôle de l'utilisateur (module non autorisé ou lecture seule)" },
  404: { description: 'Ressource introuvable' }
});

function crudPaths(resource, label, idParam) {
  return {
    [`/api/${resource}`]: {
      get: {
        tags: [label], summary: `Lister les ${label.toLowerCase()}`,
        security: [bearerAuth], responses: crudResponses(label)
      },
      post: {
        tags: [label], summary: `Créer un(e) ${label.toLowerCase().replace(/s$/,'')}`,
        security: [bearerAuth],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: crudResponses(label)
      }
    },
    [`/api/${resource}/{id}`]: {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { tags: [label], summary: `Récupérer un(e) ${label.toLowerCase().replace(/s$/,'')} par ID`, security: [bearerAuth], responses: crudResponses(label) },
      put: {
        tags: [label], summary: `Modifier un(e) ${label.toLowerCase().replace(/s$/,'')}`,
        security: [bearerAuth],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: crudResponses(label)
      },
      delete: { tags: [label], summary: `Supprimer un(e) ${label.toLowerCase().replace(/s$/,'')}`, security: [bearerAuth], responses: crudResponses(label) }
    }
  };
}

const resourcePaths = Object.assign(
  {},
  crudPaths('medecins', 'Médecins'),
  crudPaths('patients', 'Patients'),
  crudPaths('infirmiers', 'Infirmiers'),
  crudPaths('pharmaciens', 'Pharmaciens'),
  crudPaths('techniciens', 'Techniciens'),
  crudPaths('dossiers', 'Dossiers médicaux'),
  crudPaths('prescriptions', 'Prescriptions'),
  crudPaths('examens', 'Examens'),
  crudPaths('rdv', 'Rendez-vous'),
  crudPaths('factures', 'Factures'),
  crudPaths('stocks', 'Stocks'),
  crudPaths('lits', 'Lits')
);

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'MediBase API — INONA HOSPITAL',
    version: '1.0.0',
    description:
      "API REST du système de gestion hospitalière MediBase (Hôpital militaire de Douala). " +
      "Toutes les routes (sauf /api/login et /api/ping) requièrent un jeton JWT obtenu via /api/login, " +
      "envoyé dans l'en-tête `Authorization: Bearer <token>`. L'accès à chaque module dépend du rôle " +
      "de l'utilisateur (lecture seule ou lecture/écriture) — voir la réponse 403 en cas de refus."
  },
  servers: [{ url: '/', description: 'Serveur local' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    }
  },
  tags: [
    { name: 'Authentification' }, { name: 'Mon profil' }, { name: 'Utilisateurs (admin)' },
    { name: 'Médecins' }, { name: 'Patients' }, { name: 'Infirmiers' }, { name: 'Pharmaciens' },
    { name: 'Techniciens' }, { name: 'Dossiers médicaux' }, { name: 'Prescriptions' }, { name: 'Examens' },
    { name: 'Rendez-vous' }, { name: 'Factures' }, { name: 'Stocks' }, { name: 'Lits' },
    { name: 'Documents PDF' }, { name: 'Journal d\'activité' }, { name: 'Statistiques' }
  ],
  paths: Object.assign({
    '/api/login': {
      post: {
        tags: ['Authentification'], summary: 'Se connecter et obtenir un jeton JWT',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object', required: ['email','password'],
            properties: { email: { type:'string' }, password: { type:'string' } }
          } } }
        },
        responses: {
          200: { description: 'Connexion réussie — retourne { token, user }' },
          401: { description: 'Identifiants invalides' }
        }
      }
    },
    '/api/me': {
      get: { tags: ['Mon profil'], summary: 'Récupérer mon profil', security: [bearerAuth], responses: { 200: { description: 'Profil utilisateur' } } }
    },
    '/api/me/password': {
      post: {
        tags: ['Mon profil'], summary: 'Changer mon mot de passe', security: [bearerAuth],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['currentPassword','newPassword'],
          properties: { currentPassword:{type:'string'}, newPassword:{type:'string'} }
        } } } },
        responses: { 200: { description: 'Mot de passe mis à jour' }, 401: { description: 'Mot de passe actuel incorrect' } }
      }
    },
    '/api/users': {
      get: { tags: ["Utilisateurs (admin)"], summary: 'Lister les comptes (admin uniquement)', security: [bearerAuth], responses: { 200:{description:'Liste des utilisateurs'}, 403:{description:'Réservé aux administrateurs'} } },
      post: { tags: ["Utilisateurs (admin)"], summary: 'Créer un compte (admin uniquement)', security: [bearerAuth],
        requestBody: { required:true, content:{ 'application/json':{ schema:{ type:'object' } } } },
        responses: { 201:{description:'Utilisateur créé'}, 403:{description:'Réservé aux administrateurs'}, 409:{description:'Email déjà utilisé'} } }
    },
    '/api/users/{id}': {
      parameters: [{ name:'id', in:'path', required:true, schema:{ type:'integer' } }],
      put: { tags: ["Utilisateurs (admin)"], summary: 'Modifier un compte (admin uniquement)', security: [bearerAuth],
        requestBody: { required:true, content:{ 'application/json':{ schema:{ type:'object' } } } },
        responses: { 200:{description:'Utilisateur mis à jour'}, 403:{description:'Réservé aux administrateurs'} } },
      delete: { tags: ["Utilisateurs (admin)"], summary: 'Supprimer un compte (admin uniquement)', security: [bearerAuth],
        responses: { 200:{description:'Utilisateur supprimé'}, 400:{description:'Impossible de supprimer son propre compte'} } }
    },
    '/api/prescriptions/check-allergie': {
      post: {
        tags: ['Prescriptions'], summary: "Vérifier une posologie contre l'allergie connue d'un dossier", security: [bearerAuth],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type:'object', required:['id_dossier','posologie'],
          properties: { id_dossier:{type:'integer'}, posologie:{type:'string'} }
        } } } },
        responses: { 200: { description: 'Retourne { warning: string|null }' } }
      }
    },
    '/api/factures/{id}/pdf': {
      parameters: [{ name:'id', in:'path', required:true, schema:{ type:'integer' } }],
      get: { tags: ['Documents PDF'], summary: 'Télécharger une facture au format PDF', security: [bearerAuth],
        responses: { 200: { description: 'Fichier PDF', content: { 'application/pdf': {} } }, 404:{description:'Facture introuvable'} } }
    },
    '/api/dossiers/{id}/pdf': {
      parameters: [{ name:'id', in:'path', required:true, schema:{ type:'integer' } }],
      get: { tags: ['Documents PDF'], summary: 'Télécharger un dossier médical au format PDF', security: [bearerAuth],
        responses: { 200: { description: 'Fichier PDF', content: { 'application/pdf': {} } }, 404:{description:'Dossier introuvable'} } }
    },
    '/api/logs': {
      get: { tags: ["Journal d'activité"], summary: "Consulter le journal d'activité (admin uniquement)", security: [bearerAuth],
        responses: { 200:{description:'Liste des actions enregistrées'}, 403:{description:'Réservé aux administrateurs'} } }
    },
    '/api/stats': {
      get: { tags: ['Statistiques'], summary: 'Statistiques globales du tableau de bord', security: [bearerAuth],
        responses: { 200: { description: 'Compteurs (médecins, patients, alertes_stock, etc.)' } } }
    },
    '/api/ping': {
      get: { tags: ['Statistiques'], summary: 'Vérifier la connexion à la base de données', responses: { 200:{description:'DB connectée'} } }
    }
  }, resourcePaths)
};

module.exports = swaggerSpec;
