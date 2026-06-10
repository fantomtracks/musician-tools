---
baseline_commit: 1d28415
---

# Story 7.1: Éditer mon profil (name, email, mot de passe)

Status: backlog

## ⚠️ Bloquée

**Hors scope du PRD musician-tools** (l'auth est supposée préexistante). Prérequis avant dev : un mini **product-brief** (périmètre, cas limites) + un **design sécurité** (vérif mot de passe actuel, unicité, gestion d'erreurs, politique de mot de passe). Routage : PM / Architect (scope **Major**).

## Story

As a utilisateur,
I want pouvoir modifier mon nom, mon email et mon mot de passe,
so that je garde mon compte à jour sans support.

## Acceptance Criteria (esquisse — à raffiner au cadrage)

1. Une page **Profil** accessible depuis le Header (authentifié) permet d'éditer `name` et `email`.
2. Le changement de mot de passe exige le **mot de passe actuel** (vérifié via `validPassword`) ; nouveau mot de passe + confirmation.
3. **Unicité** email / name vérifiée (hors soi-même) ; erreurs explicites (400).
4. Le hachage passe par le **setter bcryptjs** du modèle (ne jamais hacher à la main).
5. Aucune fuite : la réponse ne renvoie jamais le hash.

## Tasks / Subtasks (esquisse)

- [ ] **Cadrage** : product-brief + design sécurité (PRÉREQUIS — ne pas coder avant)
- [ ] Backend — `PUT /api/auth/profile` + `POST /api/auth/change-password` (+ routes, ownership via session)
- [ ] Frontend — `ProfilePage` + service + lien Header
- [ ] Tests — vérif mot de passe actuel, unicité, rejets

## Dev Notes

northwood plus à l'aise front que back → back à piloter avec soin. Sécurité prioritaire (surface d'auth).
