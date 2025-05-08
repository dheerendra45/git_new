const { admin, db } = require('../config/firebase');
const { SendEmailCommand, SendBulkTemplatedEmailCommand } = require("@aws-sdk/client-ses");
const { sesClient, baseUrl } = require('../config/aws');
const { storeSentEmailMetadata, findCampaignByMessageId } = require('../utils/emailTracker');
const { fetchInvestorEmails } = require('../utils/helpers');
const notificationService = require('../services/notificationService')


// OPTIMIZATION 1: Send emails in batches instead of one by one
const BATCH_SIZE = 50; // SES allows up to 50 destinations per request

// Helper function to chunk array into batches
const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

// Send email to recipients - Optimized to use batching
const sendEmail = async (req, res) => {
  const { campaignId, content, recipients, sender, subject } = req.body;

  if (!campaignId || !content?.html || !recipients || !subject) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // OPTIMIZATION 2: Fetch emails once, not in a loop
    const recipientEmails = await fetchInvestorEmails(recipients);

    if (recipientEmails.length === 0) {
      return res.status(400).json({ message: "No valid recipient emails found" });
    }

    const results = [];
    const trackingPixel = `<img src="${baseUrl}/track-open?campaignId=${campaignId}" width="1" height="1" style="display:none;" />`;
    const emailContent = `${content.html}${trackingPixel}`;

    // OPTIMIZATION 3: Process emails in batches
    const emailBatches = chunkArray(recipientEmails, BATCH_SIZE);
    
    for (const batch of emailBatches) {
      const destinations = batch.map(recipient => ({
        Destination: {
          ToAddresses: [recipient],
        },
        ReplacementTags: [
          {
            Name: "RECIPIENT",
            Value: recipient
          }
        ]
      }));

      // Use bulk email sending when possible (multiple recipients with same content)
      if (batch.length > 1) {
        const params = {
          Source: sender,
          Template: "BaseEmailTemplate", // You'll need to create this template in SES
          DefaultTemplateData: JSON.stringify({
            subject: subject,
            htmlBody: emailContent
          }),
          Destinations: destinations,
          DefaultTags: [{ Name: "campaignId", Value: campaignId }],
          ReplyToAddresses: ["replies@blackleoventure.com"],
        };

        try {
          const command = new SendBulkTemplatedEmailCommand(params);
          const result = await sesClient.send(command);
          results.push(result);
          
          // OPTIMIZATION 4: Batch database writes
          await storeSentEmailMetadata({
            campaignId,
            sender: sender,
            recipientEmails: batch,
            subject,
            sentAt: new Date().toISOString(),
            messageId: result.Status.map(status => status.MessageId).join(','),
          });
        } catch (error) {
          console.error("Error sending bulk emails:", error);
          // Fall back to individual sending if bulk fails
          for (const recipient of batch) {
            await sendIndividualEmail(campaignId, recipient, sender, subject, emailContent, results);
          }
        }
      } else {
        // For single recipient, use regular send
        await sendIndividualEmail(campaignId, batch[0], sender, subject, emailContent, results);
      }
    }

    // OPTIMIZATION 5: Update campaign stats in a single write
    await updateCampaignStats(campaignId, recipientEmails.length);

    res.status(200).json({
      message: "Campaign emails sent successfully",
      campaignId,
      recipientCount: recipientEmails.length,
      batchCount: emailBatches.length,
    });
  } catch (error) {
    console.error("Error sending campaign emails:", error);
    res.status(500).json({
      message: "Failed to send campaign emails",
      error: error.message,
    });
  }
};

// Helper function to send individual emails when needed
const sendIndividualEmail = async (campaignId, recipient, sender, subject, emailContent, results) => {
  const params = {
    Source: sender,
    Destination: {
      ToAddresses: [recipient],
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Html: {
          Data: emailContent.replace("track-open?campaignId=", 
                  `track-open?campaignId=${campaignId}&recipient=${encodeURIComponent(recipient)}`),
        },
      },
    },
    Tags: [{ Name: "campaignId", Value: campaignId }],
    ReplyToAddresses: ["replies@blackleoventure.com"],
  };

  const command = new SendEmailCommand(params);
  const result = await sesClient.send(command);
  results.push(result);

  await storeSentEmailMetadata({
    campaignId,
    sender: sender,
    recipientEmails: [recipient],
    subject,
    sentAt: new Date().toISOString(),
    messageId: result.MessageId,
  });
};

// Helper function to update campaign stats efficiently
const updateCampaignStats = async (campaignId, sentCount) => {
  const campaignRef = db.collection("emailTracking").doc(campaignId);
  await campaignRef.set({
    sentCount: admin.firestore.FieldValue.increment(sentCount),
    unreadCount: admin.firestore.FieldValue.increment(sentCount),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
};

// Handle received emails (replies) - Optimized to reduce DB ops
// Update this function in your emailController.js
const receiveEmail = async (req, res) => {
  try {
    // Store the raw body for debugging
    const rawBody = req.body;
    
    // Normalize the body object (handle both string and object cases)
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    
    // Check if this is a subscription confirmation
    if (body.Type === "SubscriptionConfirmation") {
      try {
        const result = await notificationService.processSubscriptionConfirmation(body);
        return res.status(200).send(result);
      } catch (error) {
        return res.status(500).send("Failed to confirm SNS subscription");
      }
    }

    // For regular notifications, respond quickly but continue processing
    res.status(200).send("Notification received");

    // Parse message - handle different possible formats
    let message;
    try {
      if (body.Message) {
        // If Message is a string, parse it
        message = typeof body.Message === 'string' ? JSON.parse(body.Message) : body.Message;
      } else if (body.notificationType || body.eventType) {
        // Message is directly in the body
        message = body;
      } else {
        // Unknown format
        return;
      }
      
      // Process based on notification type
      if (message.notificationType === "Received") {
        await notificationService.processEmailReply(message);
      } else if (message.eventType === "Bounce" || message.eventType === "Complaint") {
        await notificationService.processEmailEvent(message);
      }
    } catch (error) {
      // Error handling maintained but without console.log
    }
  } catch (error) {
    // Already sent 200 response, or sending now if the error was early
    if (!res.headersSent) {
      res.status(500).send("Error processing notification");
    }
  }
};

// Track email opens - Optimized for efficiency
const trackEmailOpen = async (req, res) => {
  const { campaignId, recipient } = req.query;

  if (!campaignId) {
    // Return pixel anyway to prevent blank images
    res.set("Content-Type", "image/png");
    return res.send(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
        "base64"
      )
    );
  }
  
  // OPTIMIZATION 8: Respond with pixel immediately, update DB asynchronously
  // Return a transparent 1x1 pixel first for better UX
  res.set("Content-Type", "image/png");
  res.send(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
      "base64"
    )
  );

  // Then process tracking data asynchronously
  try {
    if (!recipient) return; // Skip DB operations if no recipient
    
    const emailDocRef = db.collection("emailTracking").doc(campaignId);
    const emailDoc = await emailDocRef.get();

    if (!emailDoc.exists) {
      console.warn(`Campaign ${campaignId} not found for tracking`);
      return;
    }

    const data = emailDoc.data();
    const openedBy = data.openedBy || [];

    if (recipient && !openedBy.includes(recipient)) {
      await emailDocRef.update({
        openedCount: admin.firestore.FieldValue.increment(1),
        unreadCount: admin.firestore.FieldValue.increment(-1),
        openedBy: admin.firestore.FieldValue.arrayUnion(recipient),
        lastOpened: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (error) {
    console.error("Error tracking email open:", error);
  }
};

// Handle email events from SNS (bounces, spam complaints) - Optimized
const handleEmailEvents = async (req, res) => {
  // Send 200 response quickly to acknowledge receipt
  res.sendStatus(200);
  
  let message;
  try {
    message = JSON.parse(req.body.Message || "{}");
  } catch (error) {
    console.error("Error parsing SNS message:", error);
    return;
  }

  // Use the notification service to process the event
  await notificationService.processEmailEvent(message);
};


// Get replied emails for a campaign
const getRepliedEmails = async (req, res) => {
  const { campaignId } = req.params;

  try {
    const doc = await db.collection("emailTracking").doc(campaignId).get();
    if (!doc.exists) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const data = doc.data();
    const repliedEmails = data.repliedBy || [];

    res.status(200).json({
      campaignId,
      repliedEmails,
      totalReplied: repliedEmails.length,
    });
  } catch (error) {
    console.error("Error fetching replied emails:", error);
    res.status(500).json({
      message: "Failed to fetch replied emails",
      error: error.message,
    });
  }
};

// OPTIMIZATION 10: Cache frequently accessed data
let statsCache = {
  lastUpdated: null,
  data: null,
  TTL: 1000 * 60 * 5 // 5 minutes
};

const getOverallStats = async (req, res) => {
  try {
    // Check if we have a recent cache
    const now = Date.now();
    if (statsCache.lastUpdated && (now - statsCache.lastUpdated < statsCache.TTL)) {
      return res.json(statsCache.data);
    }
    
    // If no cache or expired, fetch new data
    const [clientsSnapshot, investorListsSnapshot, contactListsSnapshot] = await Promise.all([
      db.collection("clients").get(),
      db.collection("investors").get(),
      db.collection("contactLists").get()
    ]);
    
    const stats = {
      clients: clientsSnapshot.size,
      investorLists: investorListsSnapshot.size,
      totalContacts: contactListsSnapshot.size,
    };
    
    // Update cache
    statsCache = {
      lastUpdated: now,
      data: stats,
      TTL: statsCache.TTL
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get stats for a specific campaign
const getCampaignStats = async (req, res) => {
  const { campaignId } = req.params;

  try {
    const doc = await db.collection("emailTracking").doc(campaignId).get();
    if (!doc.exists) {
      return res.status(404).json({ message: "Campaign stats not found" });
    }

    const data = doc.data();
    res.status(200).json({
      campaignId,
      sender: data.sender,
      subject: data.subject,
      sentAt: data.sentAt,
      messageId: data.messageId,
      stats: {
        sent: data.sentCount || 0,
        opened: data.openedCount || 0,
        bounced: data.bouncedCount || 0,
        spammed: data.spamCount || 0,
        unread: data.unreadCount || 0,
        replied: data.repliedCount || 0,
      },
      repliedBy: data.repliedBy || [],
    });
  } catch (error) {
    console.error("Error fetching email stats:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch stats", error: error.message });
  }
};

// Get stats for all campaigns - Optimized with pagination
const getAllCampaignStats = async (req, res) => {
  try {
    const { limit = 20, lastDoc } = req.query;
    const limitNum = parseInt(limit, 10);
    
    let query = db.collection("emailTracking")
      .orderBy("sentAt", "desc")
      .limit(limitNum);
      
    // Apply pagination if lastDoc is provided
    if (lastDoc) {
      const lastDocSnapshot = await db.collection("emailTracking").doc(lastDoc).get();
      if (lastDocSnapshot.exists) {
        query = query.startAfter(lastDocSnapshot);
      }
    }
    
    const snapshot = await query.get();

    if (snapshot.empty) {
      return res.status(200).json({
        message: "No email campaigns found",
        totalCampaigns: 0,
        data: [],
      });
    }

    const campaigns = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        campaignId: doc.id,
        sender: data.sender,
        subject: data.subject,
        sentAt: data.sentAt,
        messageId: data.messageId,
        stats: {
          sent: data.sentCount || 0,
          opened: data.openedCount || 0,
          bounced: data.bouncedCount || 0,
          spammed: data.spamCount || 0,
          unread: data.unreadCount || 0,
          replied: data.repliedCount || 0,
        },
        // Don't return entire arrays which could be large
        repliedCount: (data.repliedBy || []).length,
      };
    });

    // Get total count (cached if possible)
    let totalCount;
    if (statsCache.lastUpdated && (Date.now() - statsCache.lastUpdated < statsCache.TTL)) {
      totalCount = statsCache.totalCampaigns;
    } else {
      const countSnapshot = await db.collection("emailTracking").count().get();
      totalCount = countSnapshot.data().count;
      statsCache.totalCampaigns = totalCount;
    }

    res.status(200).json({
      message: "Successfully retrieved email stats",
      totalCampaigns: totalCount,
      pageSize: limitNum,
      lastDoc: snapshot.docs[snapshot.docs.length - 1]?.id,
      hasMore: snapshot.docs.length === limitNum,
      data: campaigns,
    });
  } catch (error) {
    console.error("Error fetching all email stats:", error);
    res.status(500).json({
      message: "Failed to fetch all email stats",
      error: error.message,
    });
  }
};

// Add client credentials
const addClientCredentials = async (req, res) => {
  const { clientId, imapPassword } = req.body;

  if (!clientId || !imapPassword) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    await db.collection("clients").doc(clientId).set(
      {
        imapPassword,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    res.status(201).json({ message: "Client credentials added successfully" });
  } catch (error) {
    console.error("Error adding client credentials:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  sendEmail,
  receiveEmail,
  trackEmailOpen,
  handleEmailEvents,
  getRepliedEmails,
  getOverallStats,
  getCampaignStats,
  getAllCampaignStats,
  addClientCredentials
};