const { db } = require('../config/firebase');

// Helper function to find campaign by Message-ID
async function findCampaignByMessageId(messageId, replyFrom, campaignSender) {
  console.log(
    `Searching for campaign with Message-ID: ${messageId}, Reply-From: ${replyFrom}, Sender: ${campaignSender}`
  );
  
  // Try to find by Message-ID first
  if (messageId) {
    const snapshot = await db
      .collection("emailTracking")
      .where("messageId", "==", messageId)
      .limit(1)
      .get();
    
    if (!snapshot.empty) {
      console.log(`Found campaign by Message-ID: ${snapshot.docs[0].id}`);
      return snapshot.docs[0].id;
    }
  }
  
  // Fallback: Match by sender and recipient
  const snapshot = await db
    .collection("emailTracking")
    .where("sender", "==", campaignSender)
    .where("recipientEmails", "array-contains", replyFrom)
    .limit(1)
    .get();
  
  if (!snapshot.empty) {
    console.log(`Found campaign by fallback: ${snapshot.docs[0].id}`);
    return snapshot.docs[0].id;
  }
  
  console.log("No campaign found");
  return null;
}

// Fetch investor emails based on list ID
async function fetchInvestorEmails(listId) {
  if (!listId || listId === "No Recipients") return [];
  
  const listIds = listId.split(",").map((id) => id.trim());
  const emails = [];
  const chunks = [];
  
  // Process in chunks of 10 to avoid Firestore limits
  for (let i = 0; i < listIds.length; i += 10) {
    chunks.push(listIds.slice(i, i + 10));
  }
  
  try {
    const investorsRef = db.collection("investors");
    for (const chunk of chunks) {
      const querySnapshot = await investorsRef
        .where("listId", "in", chunk)
        .get();
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data["Partner Email"]) emails.push(data["Partner Email"]);
      });
    }
    return emails;
  } catch (error) {
    console.error("Error fetching investor emails:", error);
    return [];
  }
}

module.exports = {
  findCampaignByMessageId,
  fetchInvestorEmails
};