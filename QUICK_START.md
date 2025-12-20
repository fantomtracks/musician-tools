# Quick Start Guide - Musician Tools Auth System

## ⚡ 5-Minute Setup

### Prerequisites
- Node.js 22.x
- PostgreSQL running locally
- Port 5173 (frontend) and 3001 (backend) available

### Step 1: Database Setup (1 min)

Make sure PostgreSQL is running with these credentials in `.env`:
```
DATABASE_URL_DEV=postgresql://musician_user:musician_pass@localhost:5433/musician_tools
```

### Step 2: Install Dependencies (2 min)

```bash
# Frontend
npm install

# Backend
cd backend
npm install
cd ..
```

### Step 3: Run Migrations (1 min)

```bash
cd backend
npx sequelize-cli db:migrate
cd ..
```

### Step 4: Start Servers (1 min)

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Listening on http://localhost:3001
```

**Terminal 2 - Frontend:**
```bash
npm run dev
# Listening on http://localhost:5173
```

### Step 5: Test It! (✨ Done)

1. Open http://localhost:5173
2. Click "Create account"
3. Register: `testuser` / `test@example.com` / `password123`
4. You're in! Create, edit, delete songs
5. Each user only sees their own songs 🔒

---

## 🔑 Key Features

✅ **User Registration** - Create account with email, username, password
✅ **Secure Login** - bcryptjs password hashing + bcrypt validation
✅ **Session Management** - 30-day session cookies + JWT tokens
✅ **Song Isolation** - Each user only sees/edits their own songs
✅ **Ownership Protection** - 403 Forbidden if you try to edit someone else's song
✅ **TypeScript** - Full type safety on frontend and in song service
✅ **Tailwind CSS** - Modern, responsive UI

---

## 📋 Project Structure

```
musician-tools/
├── src/                    # React frontend
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   └── SongsPage.tsx
│   ├── services/
│   │   ├── authService.ts
│   │   └── songService.ts
│   ├── contexts/
│   │   └── AuthContext.tsx
│   └── App.tsx
├── backend/                # Express backend
│   ├── models/
│   │   ├── user.js
│   │   └── song.js
│   ├── controllers/
│   │   ├── usercontroller.js
│   │   └── songcontroller.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── songs.js
│   ├── migrations/
│   │   ├── 20251220000001-create-users.js
│   │   └── 20251220000002-add-user-to-songs.js
│   └── server.js
└── package.json
```

---

## 🧪 Test Cases

### Registration
```
✓ Valid registration creates user
✓ Duplicate email rejected
✓ Duplicate username rejected
✓ Password hashed with bcryptjs
```

### Login
```
✓ Login with email works
✓ Login with username works
✓ Case-insensitive username lookup
✓ Wrong password rejected
✓ Session created (30-day cookie)
✓ JWT token generated (24h expiry)
```

### Songs
```
✓ User only sees their own songs
✓ Creating song assigns to current user
✓ Edit own song works
✓ Cannot edit other user's song (403)
✓ Cannot delete other user's song (403)
✓ Last played date updates on "Play now"
✓ Songs sorted by last played
```

---

## 🐛 Troubleshooting

### Port 3001 already in use
```bash
# Kill existing process
lsof -i :3001 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### Database connection error
```
Error: connect ECONNREFUSED 127.0.0.1:5433
```
→ Make sure PostgreSQL is running on port 5433, or update DATABASE_URL_DEV in .env

### Migration fails
```bash
# Reset migrations (CAREFUL - drops tables)
npx sequelize-cli db:migrate:undo:all
npx sequelize-cli db:migrate
```

### Frontend shows blank page
```bash
# Clear vite cache
rm -rf node_modules/.vite
npm run dev
```

---

## 📚 API Reference

### POST /api/auth/register
```javascript
{
  "name": "john_doe",
  "email": "john@example.com",
  "password": "secure_password"
}
```
→ Returns: `{ uid, name, email, isAdmin }`

### POST /api/auth/login
```javascript
{
  "login": "john_doe",  // or john@example.com
  "password": "secure_password"
}
```
→ Returns: `{ auth, userId, token, sessionId, user }`

### GET /api/auth/logout
→ Destroys session, returns `{ auth: false }`

### GET /api/songs
→ Returns all songs for authenticated user

### POST /api/songs
```javascript
{
  "title": "Wonderwall",
  "artist": "Oasis",
  "bpm": 160,
  "key": "Em",
  "instrument": "Guitar",
  "chords": "Em7 Dsus2...",
  "tabs": "e|-----0-----0..."
}
```

---

## 🎯 What's Next

After setup, consider:

- [ ] User profile page (edit name, email)
- [ ] Password reset flow
- [ ] Song search/filtering
- [ ] Export songs to PDF
- [ ] Collaborative playlists
- [ ] Mobile app (React Native)
- [ ] Cloud backup

---

## 📝 Notes

- Passwords are hashed with bcryptjs (salt=10)
- Sessions persist across page reloads (localStorage + cookie)
- All song operations are scoped to authenticated user
- Ownership enforced at controller level (server-side)
- Database CASCADE deletes songs when user is deleted

**Happy coding! 🎵**
