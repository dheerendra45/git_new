const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

// Import routes
const clientRoutes = require("./routes/clientRoutes");
const campaignRoutes = require("./routes/campaignRoutes");
const contactListRoutes = require("./routes/contactListRoutes");
const investorRoutes = require("./routes/investorRoutes");
const emailRoutes = require("./routes/emailRoutes");
const reportRoutes = require("./routes/reportRoutes");


// Import middleware
const errorHandler = require("./middleware/errorHandler");

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: [
    "https://email-sender-1fae3.web.app",
    "http://localhost:5174"
  ],
  credentials: true
}));
app.use(express.json());
// Routes
app.use("/clients", clientRoutes);

app.use("/campaign", campaignRoutes);
app.use("/contact-lists", contactListRoutes);
app.use("/investors", investorRoutes);
app.use("/reports", reportRoutes);
app.use("/", emailRoutes); 

// Root route
app.get("/", (req, res) => {
  res.send("Welcome to the Email Campaign API!");
});

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
