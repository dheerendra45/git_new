const multer = require("multer");

// Configure multer to use /tmp directory (Vercel-compatible)
const upload = multer({ dest: "/tmp" });

module.exports = upload;