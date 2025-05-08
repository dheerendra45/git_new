const fs = require('fs').promises;
const Papa = require('papaparse');

// Parse CSV file content
const parseCSV = async (filePath) => {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    return new Promise((resolve) => {
      Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          resolve({
            data: results.data,
            errors: results.errors
          });
        }
      });
    });
  } catch (error) {
    console.error('Error reading CSV file:', error);
    throw new Error(`Failed to read CSV file: ${error.message}`);
  }
};

// Delete a file 
const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    require('fs').unlink(filePath, (err) => {
      if (err) {
        console.error("Error deleting temp file:", err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

// Process the uploaded CSV file
const processCsvUpload = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse the CSV file
    const { data, errors } = await parseCSV(req.file.path);
    
    if (errors.length > 0) {
      return res.status(400).json({ error: 'CSV parsing error', details: errors });
    }

    // Process the data as needed
    // For example, you might want to save it to your database

    // Clean up - delete the temporary file
    await deleteFile(req.file.path);

    // Return success response
    return res.status(200).json({
      message: 'CSV processed successfully',
      recordCount: data.length,
      // You might want to return the processed data or a summary
    });
  } catch (error) {
    console.error('Error processing CSV upload:', error);
    
    // Try to clean up the file even if processing failed
    if (req.file && req.file.path) {
      try {
        await deleteFile(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }

    return res.status(500).json({
      error: 'Failed to process CSV file',
      details: error.message
    });
  }
};

module.exports = {
  parseCSV,
  deleteFile,
  processCsvUpload
};