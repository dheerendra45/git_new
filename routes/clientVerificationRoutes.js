const express = require('express');
const router = express.Router();
const clientController = require('../controllers/emailVerificationController');

// Route to verify an email with AWS SES
router.post('/verify-email', clientController.verifyEmail);
router.get('/:clientId/verify-status', clientController.checkVerification);

// Route to check verification status
router.get('/check-verification/:clientId', clientController.checkVerification);

module.exports = router;