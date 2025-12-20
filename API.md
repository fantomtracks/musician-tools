# Musician Tools - API Documentation

## Base URL
```
http://localhost:3001/api
```

## Endpoints

### Songs

#### GET /api/songs
Récupérer toutes les chansons.

**Response:**
```json
[
  {
    "uid": "cc9792bd-782f-4b9c-89a4-a9b842aa11cd",
    "title": "Stairway to Heaven",
    "bpm": 82,
    "key": "Am",
    "chords": "Am - C/G - D/F# - F - Am - C/G - D/F#",
    "tabs": "e|---0---0---|",
    "instrument": "Guitar",
    "artist": "Led Zeppelin",
    "lastPlayed": null,
    "createdAt": "2025-12-20T13:25:40.726Z",
    "updatedAt": "2025-12-20T13:25:40.726Z"
  }
]
```

#### GET /api/songs/:uid
Récupérer une chanson spécifique par son UID.

**Parameters:**
- `uid` - UUID de la chanson

**Response:**
```json
{
  "uid": "cc9792bd-782f-4b9c-89a4-a9b842aa11cd",
  "title": "Stairway to Heaven",
  "bpm": 82,
  "key": "Am",
  "chords": "Am - C/G - D/F# - F - Am - C/G - D/F#",
  "tabs": "e|---0---0---|",
  "instrument": "Guitar",
  "artist": "Led Zeppelin",
  "lastPlayed": null,
  "createdAt": "2025-12-20T13:25:40.726Z",
  "updatedAt": "2025-12-20T13:25:40.726Z"
}
```

#### POST /api/songs
Créer une nouvelle chanson.

**Request Body:**
```json
{
  "title": "Stairway to Heaven",
  "bpm": 82,
  "key": "Am",
  "chords": "Am - C/G - D/F# - F - Am - C/G - D/F#",
  "tabs": "e|---0---0---|",
  "instrument": "Guitar",
  "artist": "Led Zeppelin",
  "lastPlayed": "2025-12-20T13:00:00.000Z"
}
```

**Required Fields:**
- `title` - Titre de la chanson (obligatoire)

**Optional Fields:**
- `bpm` - Tempo (par défaut: 120)
- `key` - Tonalité
- `chords` - Accords
- `tabs` - Tablatures
- `instrument` - Instrument
- `artist` - Artiste
- `lastPlayed` - Date de dernière lecture (format ISO 8601)

**Response:** Objet Song créé avec status 201

#### PUT /api/songs/:uid
Mettre à jour une chanson existante.

**Parameters:**
- `uid` - UUID de la chanson

**Request Body:** (tous les champs sont optionnels)
```json
{
  "title": "Nouveau titre",
  "bpm": 90,
  "lastPlayed": "2025-12-20T14:00:00.000Z"
}
```

**Response:** Objet Song mis à jour

#### DELETE /api/songs/:uid
Supprimer une chanson.

**Parameters:**
- `uid` - UUID de la chanson

**Response:**
```json
{
  "message": "Song deleted successfully"
}
```

## Exemples avec curl

### Créer une chanson
```bash
curl -X POST http://localhost:3001/api/songs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Wonderwall",
    "bpm": 87,
    "key": "Em",
    "artist": "Oasis",
    "instrument": "Guitar"
  }'
```

### Lister toutes les chansons
```bash
curl http://localhost:3001/api/songs
```

### Récupérer une chanson
```bash
curl http://localhost:3001/api/songs/cc9792bd-782f-4b9c-89a4-a9b842aa11cd
```

### Mettre à jour une chanson
```bash
curl -X PUT http://localhost:3001/api/songs/cc9792bd-782f-4b9c-89a4-a9b842aa11cd \
  -H "Content-Type: application/json" \
  -d '{
    "bpm": 85,
    "lastPlayed": "2025-12-20T14:30:00.000Z"
  }'
```

### Supprimer une chanson
```bash
curl -X DELETE http://localhost:3001/api/songs/cc9792bd-782f-4b9c-89a4-a9b842aa11cd
```

## Codes d'erreur

- `200` - Succès
- `201` - Ressource créée
- `400` - Requête invalide
- `404` - Ressource non trouvée
- `500` - Erreur serveur

## Structure de la base de données

### Table: Songs

| Colonne | Type | Description |
|---------|------|-------------|
| uid | UUID | Identifiant unique (clé primaire) |
| title | STRING | Titre de la chanson (obligatoire) |
| bpm | INTEGER | Tempo (par défaut: 120) |
| key | STRING | Tonalité musicale |
| chords | TEXT | Accords de la chanson |
| tabs | TEXT | Tablatures |
| instrument | STRING | Instrument principal |
| artist | STRING | Nom de l'artiste |
| last_played | DATE | Date de dernière lecture |
| createdAt | TIMESTAMP | Date de création |
| updatedAt | TIMESTAMP | Date de dernière modification |

**Index:**
- Index sur `title` pour recherche rapide
- Index sur `artist` pour filtrage par artiste
