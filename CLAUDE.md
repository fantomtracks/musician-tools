# Musician Tools — project conventions

## Naming / vocabulary (UI + code)

Two distinct notions, kept verbally separate so they never blur as the product grows:

- **Songlist** — the user's **personal** collection: the songs they added and practice.
  Verbs: *Add to songlist*, *in your songlist*. This is the existing songs page.
- **Catalog** — the **shared** pool of ready-made, pre-filled songs (future): a source you
  browse and copy *from* into your own songlist.
  Verbs: *Browse catalog*, *Import from catalog*, *Add to my songlist*.

Rules:
- Use **Songlist** for anything personal; never call it "Library" — in mainstream apps
  (Spotify, Steam) "Library" reads as *your own* collection, which would clash with the
  shared Catalog and confuse the two notions.
- Use **Catalog** for the shared pool; it intrinsically reads as "a source you pull from".
- The copy action from Catalog → Songlist is phrased **"Add to my songlist"**.
- Keep these exact words in user-facing strings, comments, and identifiers.
