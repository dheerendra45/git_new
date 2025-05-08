const { admin, db } = require('../config/firebase');
const { snsClient } = require('../config/aws');
const { ConfirmSubscriptionCommand } = require("@aws-sdk/client-sns");
const { findCampaignByMessageId } = require('../utils/helpers');

// Process SNS subscription confirmation
async function processSubscriptionConfirmation(data) {
  const { SubscribeURL, Token, TopicArn } = data;
  console.log("SNS SubscriptionConfirmation received:", {
    SubscribeURL,
    TopicArn,
  });

  const command = new ConfirmSubscriptionCommand({
    TopicArn,
    Token,
  });

  await snsClient.send(command);
  console.log(`SNS subscription confirmed for TopicArn: ${TopicArn}`);
  return "SNS subscription confirmed successfully";
}

// Process email reply notification
async function processEmailReply(message) {
  if (message.notificationType !== "Received") {
    console.log("Ignoring non-email SNS notification:", message.notificationType);
    return;
  }

  const replyFrom = message.mail?.source;
  const subject = message.mail?.commonHeaders?.subject || "No Subject";
  const toAddress = message.mail?.destination?.[0];
  const originalMessageId = message.mail?.commonHeaders?.["in-reply-to"] ||
    message.mail?.commonHeaders?.references?.split(" ")[0];

  if (!replyFrom || !toAddress) {
    console.log("Missing replyFrom or toAddress:", { replyFrom, toAddress });
    return;
  }

  console.log(`Processing reply from ${replyFrom} to ${toAddress}, In-Reply-To: ${originalMessageId}`);

  const campaignId = await findCampaignByMessageId(
    originalMessageId,
    replyFrom,
    toAddress
  );

  if (!campaignId) {
    console.log(`No campaign found for reply from ${replyFrom}`);
    return;
  }

  const campaignRef = db.collection("emailTracking").doc(campaignId);
  const replyRef = campaignRef.collection("replies").doc();

  const batch = db.batch();
  batch.set(replyRef, {
    from: replyFrom,
    subject,
    date: message.mail?.timestamp || new Date().toISOString(),
    body: message.content || "No body content",
  });

  batch.update(campaignRef, {
    repliedCount: admin.firestore.FieldValue.increment(1),
    repliedBy: admin.firestore.FieldValue.arrayUnion(replyFrom),
  });

  await batch.commit();
  console.log(`Stored reply from ${replyFrom} for campaign ${campaignId}`);
}

// Process email event notifications (bounces, complaints)
async function processEmailEvent(message) {
  const campaignId = message.mail?.tags?.campaignId?.[0];
  if (!campaignId) {
    console.warn("No campaignId found in SNS event");
    return;
  }

  const campaignRef = db.collection("emailTracking").doc(campaignId);

  if (message.eventType === "Bounce") {
    await campaignRef.update({
      bouncedCount: admin.firestore.FieldValue.increment(1),
    });
    console.log(`Recorded bounce for campaign ${campaignId}`);
  } else if (message.eventType === "Complaint") {
    await campaignRef.update({
      spamCount: admin.firestore.FieldValue.increment(1),
    });
    console.log(`Recorded spam complaint for campaign ${campaignId}`);
  }
}

module.exports = {
  processSubscriptionConfirmation,
  processEmailReply,
  processEmailEvent
};
