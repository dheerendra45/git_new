const { db } = require('../config/firebase');

// Store metadata about sent emails
async function storeSentEmailMetadata(emailData) {
  const { campaignId, sender, recipientEmails, subject, sentAt, messageId } = emailData;
  
  console.log(`Storing email metadata for campaign ${campaignId}, messageId: ${messageId}`);
  
  try {
    // Store the email metadata in the campaign document
    await db.collection("emailTracking").doc(campaignId).set({
      sender,
      sentCount: recipientEmails.length,
      unreadCount: recipientEmails.length,
      subject,
      sentAt,
      messageId,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    
    // Store message ID mapping for reply tracking
    for (const recipient of recipientEmails) {
      await db.collection("messageIdMapping").add({
        messageId,
        campaignId,
        recipient,
        sender,
        timestamp: sentAt
      });
    }
    
    console.log(`✅ Successfully stored metadata for campaign ${campaignId}`);
  } catch (error) {
    console.error(`❌ Error storing email metadata for campaign ${campaignId}:`, error);
    throw error;
  }
}

// Find a campaign by message ID (for reply tracking)
async function findCampaignByMessageId(messageId, replyFrom, toAddress) {
  console.log(`Looking up campaign by messageId: ${messageId}, replyFrom: ${replyFrom}, toAddress: ${toAddress}`);
  
  try {
    // First try to find by messageId (most reliable)
    if (messageId) {
      console.log(`Searching for messageId: ${messageId}`);
      
      // Try looking up the exact message ID
      const exactMatches = await db.collection("messageIdMapping")
        .where("messageId", "==", messageId)
        .limit(1)
        .get();
      
      if (!exactMatches.empty) {
        const match = exactMatches.docs[0].data();
        console.log(`Found exact match for messageId: ${messageId}, campaignId: ${match.campaignId}`);
        return match.campaignId;
      }
      
      // messageId might include angle brackets or other formatting
      const cleanMessageId = messageId.replace(/[<>]/g, "").trim();
      console.log(`Trying cleaned messageId: ${cleanMessageId}`);
      
      const cleanMatches = await db.collection("messageIdMapping")
        .where("messageId", "==", cleanMessageId)
        .limit(1)
        .get();
        
      if (!cleanMatches.empty) {
        const match = cleanMatches.docs[0].data();
        console.log(`Found match for cleaned messageId: ${cleanMessageId}, campaignId: ${match.campaignId}`);
        return match.campaignId;
      }
      
      // Try partial matching as a last resort for messageId
      console.log("Trying partial messageId matching...");
      const allMappings = await db.collection("messageIdMapping").get();
      
      for (const doc of allMappings.docs) {
        const mapping = doc.data();
        if (messageId.includes(mapping.messageId) || mapping.messageId.includes(cleanMessageId)) {
          console.log(`Found partial match: ${mapping.messageId}, campaignId: ${mapping.campaignId}`);
          return mapping.campaignId;
        }
      }
    }
    
    // If messageId lookup fails, try sender/recipient pair
    console.log(`MessageId lookup failed, trying sender/recipient: ${replyFrom} -> ${toAddress}`);
    
    const recipientMatches = await db.collection("messageIdMapping")
      .where("recipient", "==", replyFrom)
      .where("sender", "==", toAddress)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();
      
    if (!recipientMatches.empty) {
      const match = recipientMatches.docs[0].data();
      console.log(`Found match by sender/recipient, campaignId: ${match.campaignId}`);
      return match.campaignId;
    }
    
    // Last resort - look for campaigns with matching recipient in the repliedBy array
    console.log("Trying to match by campaign recipient lists...");
    
    const campaignsSnapshot = await db.collection("emailTracking")
      .orderBy("sentAt", "desc")
      .limit(10)
      .get();
    
    for (const doc of campaignsSnapshot.docs) {
      const campaign = doc.data();
      const repliedBy = campaign.repliedBy || [];
      
      if (repliedBy.includes(replyFrom)) {
        console.log(`Found campaign ${doc.id} with ${replyFrom} in repliedBy list`);
        return doc.id;
      }
    }
    
    console.log("⚠️ Could not find any matching campaign");
    return null;
  } catch (error) {
    console.error("❌ Error finding campaign by messageId:", error);
    return null;
  }
}

module.exports = {
  storeSentEmailMetadata,
  findCampaignByMessageId
};