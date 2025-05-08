const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const emailController = require('../controllers/emailController');

router.get('/', campaignController.getAllCampaigns);
router.get('/:id', campaignController.getCampaignById);
router.post('/', campaignController.createCampaign);
router.delete('/:id', campaignController.deleteCampaign);
router.get('/:listId/investors', campaignController.getCampaignInvestors);
router.get('/:campaignId/replied-emails', emailController.getRepliedEmails);

module.exports = router;