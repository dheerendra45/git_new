const { SendEmailCommand } = require("@aws-sdk/client-ses");
const { sesClient, baseUrl } = require('../config/aws');
const { storeSentEmailMetadata } = require('../utils/emailTracker');
const { fetchInvestorEmails } = require('../utils/helpers');

// Send campaign emails to recipients
async function sendCampaignEmails(campaignData) {
  const { campaignId, content, recipients, sender, subject } = campaignData;

  if (!campaignId || !content?.html || !recipients || !subject) {
    throw new Error("Missing required fields");
  }

  const recipientEmails = await fetchInvestorEmails(recipients);

  if (recipientEmails.length === 0) {
    throw new Error("No valid recipient emails found");
  }

  const results = [];

  for (const recipient of recipientEmails) {
    const trackingPixel = `<img src="${baseUrl}/track-open?campaignId=${campaignId}&recipient=${encodeURIComponent(
      recipient
    )}" width="1" height="1" style="display:none;" />`;
    const emailContent = `${content.html}${trackingPixel}`;

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
            Data: emailContent,
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
  }

  return {
    message: "Campaign emails sent successfully",
    campaignId,
    recipients: recipientEmails,
    results,
  };
}

module.exports = {
  sendCampaignEmails
};