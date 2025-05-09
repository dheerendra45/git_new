const { VerifyEmailIdentityCommand, GetIdentityVerificationAttributesCommand } = require("@aws-sdk/client-ses");
const clientService = require('../services/clientService');
const { sesClient } = require('../config/aws');

// Controller for email verification
const verifyEmail = async (req, res) => {
  try {
    const { clientId, email } = req.body;
    
    if (!clientId || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Client ID and email are required' 
      });
    }

    // Check if the client exists
    const client = await clientService.getClientById(clientId);
    if (!client) {
      return res.status(404).json({ 
        success: false, 
        message: 'Client not found' 
      });
    }

    // Verify the email with AWS SES using SDK v3
    const verifyCommand = new VerifyEmailIdentityCommand({ EmailAddress: email });
    await sesClient.send(verifyCommand);
    
    // Update the client's email verification status in Firestore
    await clientService.markVerificationSent(clientId);

    return res.json({ 
      success: true, 
      message: `Verification email sent to ${email}. The client must click the link in the email to complete verification.`
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Error verifying email: ${error.message}` 
    });
  }
};

// Controller for checking verification status
const checkVerification = async (req, res) => {
  try {
    const { clientId } = req.params;
    console.log("id",clientId)

    
    // Check if the client exists
    const client = await clientService.getClientById(clientId);
    if (!client) {
      return res.status(404).json({ 
        success: false, 
        message: 'Client not found' 
      });
    }

    // Check the verification status with AWS SES
    const { email } = client;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Client has no email address'
      });
    }

    // Using SDK v3 for getting verification attributes
    const getVerificationCommand = new GetIdentityVerificationAttributesCommand({
      Identities: [email]
    });
    
    const verificationResult = await sesClient.send(getVerificationCommand);
    console.log(verificationResult)



    const verificationAttributes = verificationResult.VerificationAttributes?.[email];
    console.log(verificationAttributes)



    let isVerified = false;
    if (verificationAttributes && verificationAttributes.VerificationStatus === 'Success') {
      isVerified = true;
      
      // Update the client record if it's verified
      if (!client.emailVerified) {
        await clientService.updateEmailVerificationStatus(clientId, true);
      }
    }

    return res.json({
      success: true,
      verified: isVerified,
      status: verificationAttributes ? verificationAttributes.VerificationStatus : 'NotStarted'
    });
  } catch (error) {
    console.error('Verification check error:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Error checking verification status: ${error.message}` 
    });
  }
};

module.exports = {
  verifyEmail,
  checkVerification
};