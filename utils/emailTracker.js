const { db } = require('../config/firebase');
const admin = require('firebase-admin');

// Store email metadata in Firestore
async function storeSentEmailMetadata({
  campaignId,
  sender,
  recipientEmails,
  subject,
  sentAt,
  messageId,
}) {
  await db.collection("emailTracking").doc(campaignId).set(
    {
      sender,
      recipientEmails,
      subject,
      sentAt,
      messageId,
      sentCount: recipientEmails.length,
      openedCount: 0,
      bouncedCount: 0,
      spamCount: 0,
      unreadCount: recipientEmails.length,
      repliedCount: 0,
      repliedBy: [],
      replies: [],
      openedBy: [],
    },
    { merge: true }
  );
}

// Track email open event
async function trackEmailOpen(campaignId, recipient) {
  if (!campaignId) {
    throw new Error("campaignId is required");
  }

  const emailDocRef = db.collection("emailTracking").doc(campaignId);
  const emailDoc = await emailDocRef.get();

  if (!emailDoc.exists) {
    throw new Error("Campaign not found");
  }

  const data = emailDoc.data();
  const openedBy = data.openedBy || [];

  if (recipient && !openedBy.includes(recipient)) {
    await emailDocRef.update({
      openedCount: admin.firestore.FieldValue.increment(1),
      unreadCount: admin.firestore.FieldValue.increment(-1),
      openedBy: admin.firestore.FieldValue.arrayUnion(recipient),
    });
  }
  
  // Return 1x1 transparent PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64"
  );
}

module.exports = {
  storeSentEmailMetadata,
  trackEmailOpen
};
