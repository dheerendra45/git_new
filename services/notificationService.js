const { admin, db } = require('../config/firebase');
const { snsClient } = require('../config/aws');
const { ConfirmSubscriptionCommand } = require("@aws-sdk/client-sns");
const { findCampaignByMessageId } = require('../utils/helpers');

// Process SNS subscription confirmation
async function processSubscriptionConfirmation(data) {
  const { SubscribeURL, Token, TopicArn } = data;

  try {
    const command = new ConfirmSubscriptionCommand({
      TopicArn,
      Token,
    });

    await snsClient.send(command);
    return "SNS subscription confirmed successfully";
  } catch (error) {
    throw error;
  }
}

// Enhanced processEmailReply function
async function processEmailReply(message) {
  // Validate message structure
  if (!message || typeof message !== 'object') {
    return;
  }
  
  if (message.notificationType !== "Received") {
    return;
  }

  // Ensure mail object exists
  if (!message.mail) {
    return;
  }

  // Extract key information
  const replyFrom = message.mail?.source;
  const subject = message.mail?.commonHeaders?.subject || "No Subject";
  const toAddress = Array.isArray(message.mail?.destination) ? 
                    message.mail.destination[0] : 
                    message.mail?.destination;
  
  // Check all possible reference fields for original message ID
  const originalMessageId = 
    message.mail?.commonHeaders?.["in-reply-to"] ||
    (message.mail?.commonHeaders?.references 
      ? message.mail.commonHeaders.references.split(" ")[0]
      : null) ||
    message.mail?.headers?.find(h => h.name === "In-Reply-To")?.value;

  if (!replyFrom || !toAddress) {
    return;
  }

  try {
    // Call the utility function to find the campaign
    const campaignId = await findCampaignByMessageId(
      originalMessageId,
      replyFrom,
      toAddress
    );

    if (!campaignId) {
      await storeOrphanedReply(replyFrom, toAddress, subject, message);
      return;
    }

    // Extract the email body content
    const emailContent = extractEmailContent(message);

    // Store the reply in the database
    const campaignRef = db.collection("emailTracking").doc(campaignId);
    const replyRef = campaignRef.collection("replies").doc();

    const batch = db.batch();
    batch.set(replyRef, {
      from: replyFrom,
      subject,
      date: message.mail?.timestamp || new Date().toISOString(),
      body: emailContent,
    });

    batch.update(campaignRef, {
      repliedCount: admin.firestore.FieldValue.increment(1),
      repliedBy: admin.firestore.FieldValue.arrayUnion(replyFrom),
    });

    await batch.commit();
  } catch (error) {
    // Keep a minimal error log
    console.error("Error processing email reply:", error);
  }
}

// Helper function to extract email content
function extractEmailContent(message) {
  // Try all possible paths for content
  // 1. Try to get HTML content first (most common in SES notifications)
  if (message.content?.html?.data) {
    return message.content.html.data;
  } 
  
  // 2. Try to get text content next
  if (message.content?.text?.data) {
    return message.content.text.data;
  }
  
  // 3. Try alternative paths for body content
  if (message.body?.html) {
    return message.body.html;
  }
  
  if (message.body?.text) {
    return message.body.text;
  }
  
  // 4. Try content without .data
  if (message.content?.html) {
    return message.content.html;
  }
  
  if (message.content?.text) {
    return message.content.text;
  }
  
  // 5. Check if message itself has html or text fields
  if (message.html) {
    return message.html;
  }
  
  if (message.text) {
    return message.text;
  }
  
  // Last attempt - check for a content field that might be a string
  if (typeof message.content === 'string') {
    return message.content;
  }
  
  // Final fallback
  return "No body content available";
}

// Orphaned reply storage
async function storeOrphanedReply(from, to, subject, message) {
  try {
    const content = extractEmailContent(message);
    
    const orphanedDoc = {
      from,
      to,
      subject,
      content,
      receivedAt: new Date(),
      headers: message.mail?.headers || [],
      commonHeaders: message.mail?.commonHeaders || {},
      messageId: message.mail?.messageId || 'unknown',
      originalMessageId: 
        message.mail?.commonHeaders?.["in-reply-to"] ||
        (message.mail?.commonHeaders?.references 
          ? message.mail.commonHeaders.references.split(" ")[0]
          : null) ||
        message.mail?.headers?.find(h => h.name === "In-Reply-To")?.value || 'unknown',
      // Store minimal version of raw message to avoid exceeding Firestore limits
      rawMessageSummary: JSON.stringify({
        notificationType: message.notificationType,
        mail: {
          source: message.mail?.source,
          destination: message.mail?.destination,
          timestamp: message.mail?.timestamp,
          messageId: message.mail?.messageId
        }
      })
    };
    
    await db.collection("orphanedReplies").add(orphanedDoc);
  } catch (error) {
    console.error("Failed to store orphaned reply:", error);
  }
}

// Process email event notifications (bounces, complaints)
async function processEmailEvent(message) {
  const campaignId = message.mail?.tags?.campaignId?.[0];
  if (!campaignId) {
    return;
  }

  const campaignRef = db.collection("emailTracking").doc(campaignId);
  
  // Check if the campaign exists
  const campaignDoc = await campaignRef.get();
  if (!campaignDoc.exists) {
    return;
  }

  try {
    if (message.eventType === "Bounce") {
      const bouncedRecipients = message.bounce?.bouncedRecipients?.map(r => r.emailAddress) || [];
      
      await campaignRef.update({
        bouncedCount: admin.firestore.FieldValue.increment(bouncedRecipients.length),
        bouncedRecipients: admin.firestore.FieldValue.arrayUnion(...bouncedRecipients),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    } else if (message.eventType === "Complaint") {
      const complainedRecipients = message.complaint?.complainedRecipients?.map(r => r.emailAddress) || [];
      
      await campaignRef.update({
        spamCount: admin.firestore.FieldValue.increment(complainedRecipients.length),
        spamRecipients: admin.firestore.FieldValue.arrayUnion(...complainedRecipients),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (error) {
    console.error(`Error processing email event for campaign ${campaignId}:`, error);
  }
}

module.exports = {
  processSubscriptionConfirmation,
  processEmailReply,
  processEmailEvent
};