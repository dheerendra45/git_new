// routes/reportRoutes.js

const express = require("express");
const router = express.Router();
const ReportController = require("../controllers/ReportController");

// Generate report for a specific campaign
router.get("/campaign/:campaignId", ReportController.generateCampaignReport);
router.get("/campaign/:campaignId/detailed", ReportController.getDetailedCampaignReport);

// Get all campaign reports for a specific user
router.get("/user/:userId", ReportController.getAllCampaignReports);

module.exports = router;