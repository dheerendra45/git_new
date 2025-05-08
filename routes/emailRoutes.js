const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');

router.post('/send-email', emailController.sendEmail);
router.post('/receive-email', emailController.receiveEmail);
router.get('/track-open', emailController.trackEmailOpen);
router.post('/sns-email-events', emailController.handleEmailEvents);
router.get('/email-stats', emailController.getAllCampaignStats);
router.get('/email-stats/:campaignId', emailController.getCampaignStats);
router.get('/stats', emailController.getOverallStats);

module.exports = router;