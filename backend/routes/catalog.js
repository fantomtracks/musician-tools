var express = require('express');
var router = express.Router();
const bodyParser = require('body-parser');
const catalogController = require('../controllers/catalogcontroller');
const authsess = require('../middleware/authsess');
const requireCurator = require('../middleware/requirecurator');

router.use(bodyParser.json());

// Story 19.1 — Catalog WRITE routes (curator only). authsess THEN requireCurator
// (-> 403 for non-curators, NOT 404; the entry is readable by all, cf. §3). CSRF
// is applied app-wide in routes/index.js for every /api mutation.
router.post('/', authsess, requireCurator, catalogController.createCatalogEntry);
router.put('/:uid', authsess, requireCurator, catalogController.updateCatalogEntry);
router.delete('/:uid', authsess, requireCurator, catalogController.deleteCatalogEntry);
// Story 19.6 — publish a draft (curator). Distinct sub-path, no clash with /:uid.
router.post('/:uid/publish', authsess, requireCurator, catalogController.publishCatalogEntry);

// Story 19.3 — Catalog READ routes (any logged-in user; NON scoped userUid, cf. §3).
// authsess only (no requireCurator). List is the app's only enveloped endpoint.
router.get('/', authsess, catalogController.getCatalogList);
// /facets BEFORE /:uid so it isn't captured as a uid param.
router.get('/facets', authsess, catalogController.getCatalogFacets);
// Story 19.12 — EXACT (title, artist) dup-check (curator only: it reveals draft
// existence). BEFORE /:uid so "exists" isn't captured as a uid param.
router.get('/exists', authsess, requireCurator, catalogController.getCatalogExists);
router.get('/:uid', authsess, catalogController.getCatalogEntry);

// Story 19.4 — Add to my songlist. Writes the USER's own Songlist (a Song copy),
// NOT the Catalog → authsess only (no requireCurator). CSRF app-wide covers it.
router.post('/:uid/add-to-songlist', authsess, catalogController.addToSonglist);

module.exports = router;
