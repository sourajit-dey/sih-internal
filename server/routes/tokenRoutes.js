const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');

router.post('/', queueController.issueToken);
router.get('/:id', queueController.getTokenStatus);

module.exports = router;
