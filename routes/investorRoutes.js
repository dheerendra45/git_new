const express = require('express');
const router = express.Router();
const investorController = require('../controllers/investorController');
const upload = require('../middleware/fileUpload');

router.get('/', investorController.getAllInvestors);
router.post('/', investorController.addInvestors);
router.put('/:id', investorController.updateInvestor);
router.delete('/:id', investorController.deleteInvestor);
router.post('/upload-csv', upload.single('file'), require('../utils/csvParser').processCsvUpload);

module.exports = router;