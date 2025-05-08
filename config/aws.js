const { SESClient } = require("@aws-sdk/client-ses");
const { SNSClient } = require("@aws-sdk/client-sns");
const dotenv = require("dotenv");

dotenv.config();

// AWS credentials configuration
const awsConfig = {
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

// Initialize SES Client
const sesClient = new SESClient(awsConfig);

// Initialize SNS Client
const snsClient = new SNSClient(awsConfig);

// Base URL for tracking
const baseUrl = process.env.BASE_URL || "https://email-sender-server-rho.vercel.app";

module.exports = {
  sesClient,
  snsClient,
  baseUrl
};