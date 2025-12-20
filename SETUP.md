# 🚀 Installation Rapide - Musician Tools

## Installation depuis zéro

Pour installer et lancer le projet complet:

```bash
make setup
```

Cette commande va:
1. ✅ Installer les dépendances frontend (npm install)
2. ✅ Installer les dépendances backend (npm install)
3. ✅ Démarrer Docker (PostgreSQL + Adminer + Backend)
4. ✅ Attendre que la base de données soit prête
5. ✅ Exécuter les migrations de base de données

Après le setup, lancez le frontend:

```bash
make dev
```

Ou lancez tout d'un coup avec:

```bash
make start
```

---

## 🎯 Commandes Principales

### 🚀 Démarrage
```bash
make setup    # Installation complète depuis zéro
make start    # Démarrer Docker + Frontend
make stop     # Arrêter tous les services
```

### 🔨 Développement
```bash
make dev      # Frontend dev server
make logs     # Voir les logs du backend
make ps       # État des services Docker
```

### 🗄️ Base de données
```bash
make migrate     # Exécuter les migrations
make reset-db    # Réinitialiser la DB
make db-psql     # Console PostgreSQL
make db-backup   # Créer un backup
```

### 📖 Aide
```bash
make help     # Voir toutes les commandes disponibles
```

---

## 📍 URLs des Services

Après `make start`:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **Adminer (DB UI)**: http://localhost:8080
  - Serveur: `db`
  - Utilisateur: `musician_user`
  - Mot de passe: `musician_pass`
  - Base: `musician_tools`

---

## 🐛 Dépannage

### Port déjà utilisé
```bash
make stop
# ou
docker compose down
```

### Réinstaller les dépendances
```bash
make install
```

### Réinitialiser complètement
```bash
make stop
rm -rf node_modules backend/node_modules
make setup
```

### Voir les logs
```bash
make logs       # Backend
make logs-db    # PostgreSQL
```
