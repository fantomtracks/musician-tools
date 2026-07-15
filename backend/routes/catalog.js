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

// GET list/detail routes: story 19.3 (read = authsess only, non-scoped userUid).

module.exports = router;
