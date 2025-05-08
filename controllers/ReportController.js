// controllers/ReportController.js

const admin = require("firebase-admin");
const db = admin.firestore();
const { fetchInvestorEmails } = require('../utils/helpers.js');

// Function to generate campaign report
const generateCampaignReport = async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    if (!campaignId) {
      return res.status(400).json({ 
        success: false, 
        message: "Campaign ID is required" 
      });
    }

    // Get campaign data
    const campaignDoc = await db.collection("campaignLists").doc(campaignId).get();
    if (!campaignDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        message: "Campaign not found" 
      });
    }
    
    // Get email tracking data
    const trackingDoc = await db.collection("emailTracking").doc(campaignId).get();
    console.log("Tracking doc:", JSON.stringify(trackingDoc.data(), null, 2));

    if (!trackingDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        message: "Campaign tracking data not found" 
      });
    }

    const campaignData = campaignDoc.data();
    const trackingData = trackingDoc.data();

    // Calculate campaign metrics
    const report = {
      campaignName: campaignData.campaignName || campaignData.name || "Unnamed Campaign",
      firmsContacted: trackingData.sentCount || 0,
      creditsUsed: trackingData.sentCount || 0, // Assuming 1 credit per email
      remindersSent: 0, // This would need to be tracked separately
      peopleResponded: trackingData.repliedCount || 0,
      responseRate: trackingData.sentCount ? 
        ((trackingData.repliedCount / trackingData.sentCount) * 100).toFixed(2) : 
        "0.00",
      totalCredits: 10000, // This would come from your credit system
      sentAt: trackingData.sentAt,
      messageId: trackingData.messageId, // Include the message ID in the report
      openRate: trackingData.sentCount ? 
        ((trackingData.openedCount / trackingData.sentCount) * 100).toFixed(2) : 
        "0.00"
    };

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error("Error generating campaign report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate report",
      error: error.message
    });
  }
};

// Function to get all campaign reports for a user
const getAllCampaignReports = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: "User ID is required" 
      });
    }

    // Get all campaigns for this user
    const campaignsSnapshot = await db.collection("campaignLists")
      .where("userId", "==", userId)
      .get();

    if (campaignsSnapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No campaigns found for this user",
        data: []
      });
    }

    const reports = [];
    
    // Process each campaign
    for (const doc of campaignsSnapshot.docs) {
      const campaignData = doc.data();
      const trackingDoc = await db.collection("emailTracking").doc(doc.id).get();
      
      if (trackingDoc.exists) {
        const trackingData = trackingDoc.data();
        
        reports.push({
          campaignId: doc.id,
          campaignName: campaignData.campaignName || campaignData.name || "Unnamed Campaign",
          firmsContacted: trackingData.sentCount || 0,
          creditsUsed: trackingData.sentCount || 0,
          remindersSent: 0, // This would need to be tracked separately
          peopleResponded: trackingData.repliedCount || 0,
          responseRate: trackingData.sentCount ? 
            ((trackingData.repliedCount / trackingData.sentCount) * 100).toFixed(2) : 
            "0.00",
          sentAt: trackingData.sentAt || "Unknown",
          messageId: trackingData.messageId || "Unknown", // Include the message ID
          openRate: trackingData.sentCount ? 
            ((trackingData.openedCount / trackingData.sentCount) * 100).toFixed(2) : 
            "0.00"
        });
      }
    }

    res.status(200).json({
      success: true,
      data: reports
    });
  } catch (error) {
    console.error("Error generating campaign reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate reports",
      error: error.message
    });
  }
};

// Improved function to extract email part from tracking strings
const extractEmailOnly = (item) => {
  if (!item) return "";
  
  // Log the incoming item for debugging
  console.log("Extracting email from:", item);
  
  // Standard email regex that stops at valid email characters
  const standardMatch = item.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
  if (standardMatch) {
    // Return just the first match (the email)
    console.log("Extracted email:", standardMatch[1]);
    return standardMatch[1];
  }
  
  // If the standard pattern doesn't work, try to find the @ symbol and extract more carefully
  const atIndex = item.indexOf('@');
  if (atIndex > 0) {
    // Extract username before @
    let username = '';
    for (let i = atIndex - 1; i >= 0; i--) {
      const char = item[i];
      if (/[a-zA-Z0-9._-]/.test(char)) {
        username = char + username;
      } else {
        break;
      }
    }
    
    // Extract domain after @ - stop at first non-valid domain character
    let domain = '';
    for (let i = atIndex + 1; i < item.length; i++) {
      const char = item[i];
      if (/[a-zA-Z0-9._-]/.test(char)) {
        domain += char;
      } else {
        // Stop extraction once we hit an invalid character
        break;
      }
    }
    
    // Validate we have a proper domain with at least one dot
    if (username && domain && domain.includes('.')) {
      const email = username + '@' + domain;
      console.log("Constructed email:", email);
      return email;
    }
  }
  
  console.log("Failed to extract email, returning original:", item);
  return item;
};

const getDetailedCampaignReport = async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    if (!campaignId) {
      return res.status(400).json({ 
        success: false, 
        message: "Campaign ID is required" 
      });
    }

    // Get campaign data
    const campaignDoc = await db.collection("campaignLists").doc(campaignId).get();
    if (!campaignDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        message: "Campaign not found" 
      });
    }
    
    const campaignData = campaignDoc.data();
    
    // Get email tracking data
    const trackingDoc = await db.collection("emailTracking").doc(campaignId).get();
    if (!trackingDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        message: "Campaign tracking data not found" 
      });
    }
    
    const trackingData = trackingDoc.data();
    console.log(trackingData);
    
    // Extract recipient emails
    const recipientEmails = trackingData.recipientEmails || [];
    
    // Simply get the tracking counts
    const openedCount = trackingData.openedCount || 0;
    const repliedCount = trackingData.repliedCount || 0;
    const repliedBy = trackingData.repliedBy || [];

    if (recipientEmails.length === 0) {
      return res.status(200).json({
        success: true,
        campaignName: campaignData.campaignName || campaignData.name || "Unnamed Campaign",
        sentAt: trackingData.sentAt || "Unknown",
        data: []
      });
    }

    // Process emails in batches
    const batchSize = 10;
    const detailedReport = [];
    const allInvestorsByEmail = {};
    
    // Process emails in batches of 10
    for (let i = 0; i < recipientEmails.length; i += batchSize) {
      const emailBatch = recipientEmails.slice(i, i + batchSize);
      
      const investorsSnapshot = await db.collection("investors")
        .where("Partner Email", "in", emailBatch)
        .get();
      
      investorsSnapshot.forEach(doc => {
        const investor = doc.data();
        const email = investor["Partner Email"];
        
        if (email) {
          const emailLower = email.toLowerCase();
          if (!allInvestorsByEmail[emailLower]) {
            allInvestorsByEmail[emailLower] = [];
          }
          allInvestorsByEmail[emailLower].push({
            ...investor,
            docId: doc.id
          });
        }
      });
    }
    
    // Process each recipient email
    for (const email of recipientEmails) {
      if (!email) continue;
      
      const emailLower = email.toLowerCase();
      const investorsForEmail = allInvestorsByEmail[emailLower] || [];
      
      // Select the best investor record
      let bestInvestor = investorsForEmail.find(inv => inv["Company Name"]) || 
                         (investorsForEmail.length > 0 ? investorsForEmail[0] : null);
      
      // Extract data for report
      const companyname = bestInvestor?.["Company Name"] || "N/A";
      const investorName = bestInvestor?.["Investor Name"] || "N/A";
      const fundType = bestInvestor?.["Fund Type"] || "N/A";
      const website = bestInvestor?.["Website (If Available)"] || 
                     bestInvestor?.["Website (if available)"] || 
                     bestInvestor?.["Website"] || "N/A";
      
      // Simple check based on counts
      const wasOpened = openedCount > 0;
      const wasReplied = repliedCount > 0;
      
      // Just use the repliedBy as is
      const replierEmail = wasReplied && repliedBy.length > 0 ? repliedBy[0] : null;
      console.log(replierEmail)
      detailedReport.push({
        name: companyname,
        website: website,
        contacts: investorName,
        partneremail: email,
        opened: wasOpened ? "Yes" : "No",
        replied: wasReplied ? "Yes" : "No",
        repliedBy: replierEmail,
        fundType: fundType
      });
    }

    res.status(200).json({
      success: true,
      campaignName: campaignData.campaignName || campaignData.name || "Unnamed Campaign",
      sentAt: trackingData.sentAt || "Unknown",
      data: detailedReport
    });
  } catch (error) {
    console.error("Error generating detailed campaign report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate detailed report",
      error: error.message
    });
  }
};

module.exports = {
  generateCampaignReport,
  getAllCampaignReports,
  getDetailedCampaignReport,
};