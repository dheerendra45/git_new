const express = require('express');
const router = express.Router();
const contactListController = require('../controllers/contactListController');

router.get('/', contactListController.getAllContactLists);
router.post('/', contactListController.createContactList);
router.delete('/:id', contactListController.deleteContactList);

module.exports = router;