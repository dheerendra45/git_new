const { db } = require('../config/firebase');
const admin = require('firebase-admin');

// Get all investors with pagination
const getAllInvestors = async (req, res) => {
  try {
    // Add pagination parameters
    const { limit = 20, startAfter = null, sortField = "createdAt", sortOrder = "desc" } = req.query;
    const limitNum = parseInt(limit);
    
    // Create base query with pagination and sorting
    let query = db.collection("investors")
      .orderBy(sortField, sortOrder)
      .limit(limitNum);
    
    // Apply cursor-based pagination if startAfter is provided
    if (startAfter) {
      const startAfterDoc = await db.collection("investors").doc(startAfter).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    const snapshot = await query.get();
    
    // Get total count efficiently
    const countSnapshot = await db.collection("investors").count().get();
    const totalCount = countSnapshot.data().count;

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No investors found",
        totalCount,
        data: [],
        lastVisible: null,
        hasMore: false
      });
    }

    // Get the last visible document for next pagination request
    const lastVisible = snapshot.docs[snapshot.docs.length - 1];
    
    // Map the documents to an array of investor objects
    const investors = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({
      success: true,
      message: "Successfully retrieved investors",
      totalCount,
      data: investors,
      lastVisible: lastVisible.id,
      hasMore: investors.length === limitNum
    });
  } catch (error) {
    console.error("Error retrieving investors:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve investors",
      details: error.message,
    });
  }
};

// Add multiple investors using batched writes
const addInvestors = async (req, res) => {
  try {
    const investorData = req.body;
    
    if (!Array.isArray(investorData) || investorData.length === 0) {
      return res
        .status(400)
        .json({ 
          success: false, 
          error: "Invalid request: Array of investor data is required" 
        });
    }
    
    // Validate all investor data before processing
    for (const investor of investorData) {
      if (!investor["Partner Email"] || !investor.listId) {
        return res
          .status(400)
          .json({ 
            success: false, 
            error: "Each investor must have 'Partner Email' and listId" 
          });
      }
    }
    
    // Use batched writes for better performance
    const createdIds = [];
    const batchSize = 450; // Firestore has a limit of 500 operations per batch
    const batches = Math.ceil(investorData.length / batchSize);
    
    for (let i = 0; i < batches; i++) {
      const batch = db.batch();
      const batchData = investorData.slice(i * batchSize, (i + 1) * batchSize);
      
      for (const investor of batchData) {
        // Add timestamp to each investor
        const investorWithTimestamp = {
          ...investor,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        const investorRef = db.collection("investors").doc();
        batch.set(investorRef, investorWithTimestamp);
        createdIds.push(investorRef.id);
      }
      
      await batch.commit();
    }
    
    res.status(201).json({
      success: true,
      ids: createdIds,
      message: `Successfully added ${createdIds.length} investors`,
    });
  } catch (error) {
    console.error("Error adding investors:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to add investors", 
      details: error.message 
    });
  }
};

// Update an investor
const updateInvestor = async (req, res) => {
  try {
    const investorId = req.params.id;
    const updateData = req.body;

    // Validate ID
    if (!investorId) {
      return res.status(400).json({
        success: false,
        error: "Investor ID is required",
      });
    }

    // Validate update data
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Update data is required",
      });
    }

    // Check for required fields if they're being updated
    if (updateData.partnerEmail === "" || updateData.listId === "") {
      return res.status(400).json({
        success: false,
        error: "partnerEmail and listId cannot be empty",
      });
    }

    // Add updated timestamp
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    // Update the document directly without checking existence first
    await db.collection("investors").doc(investorId).update(updateData);
    
    res.status(200).json({
      success: true,
      message: `Successfully updated investor with ID: ${investorId}`,
      updatedFields: Object.keys(updateData),
    });
  } catch (error) {
    console.error("Error updating investor:", error);
    
    // Check if error is due to document not existing
    if (error.code === 5) { // NOT_FOUND
      return res.status(404).json({
        success: false,
        error: "Investor not found",
      });
    }
    
    res.status(500).json({
      success: false,
      error: "Failed to update investor",
      details: error.message,
    });
  }
};

// Delete an investor
const deleteInvestor = async (req, res) => {
  try {
    const investorId = req.params.id;

    // Validate ID
    if (!investorId) {
      return res.status(400).json({
        success: false,
        error: "Investor ID is required",
      });
    }

    // Delete the document directly without checking existence first
    await db.collection("investors").doc(investorId).delete();

    res.status(200).json({
      success: true,
      message: `Successfully deleted investor with ID: ${investorId}`,
    });
  } catch (error) {
    console.error("Error deleting investor:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete investor",
      details: error.message,
    });
  }
};

// Get investors by campaign list ID with pagination
const getInvestorsByListId = async (req, res) => {
  try {
    const { listId } = req.params;
    const { limit = 20, startAfter = null, sortField = "createdAt", sortOrder = "desc" } = req.query;
    const limitNum = parseInt(limit);

    if (!listId) {
      return res.status(400).json({
        success: false,
        message: "listId is required",
      });
    }

    // Create base query with filtering, pagination, and sorting
    let query = db.collection("investors")
      .where("listId", "==", listId);
      
    // Need to create a composite index if sorting by a field other than the one used in where clause
    if (sortField !== "listId") {
      query = query.orderBy(sortField, sortOrder);
    }
    
    query = query.limit(limitNum);
    
    // Apply cursor-based pagination if startAfter is provided
    if (startAfter) {
      const startAfterDoc = await db.collection("investors").doc(startAfter).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    const snapshot = await query.get();
    
    // Get count for this specific listId efficiently
    const countQuery = await db
      .collection("investors")
      .where("listId", "==", listId)
      .count()
      .get();
    
    const totalCount = countQuery.data().count;

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: `No investors found for listId: ${listId}`,
        totalCount,
        data: [],
        lastVisible: null,
        hasMore: false
      });
    }

    // Get the last visible document for next pagination request
    const lastVisible = snapshot.docs[snapshot.docs.length - 1];
    
    // Map documents to include ID and data
    const investors = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({
      success: true,
      message: `Successfully retrieved investors for listId: ${listId}`,
      totalCount,
      data: investors,
      lastVisible: lastVisible.id,
      hasMore: investors.length === limitNum
    });
  } catch (error) {
    console.error("Error fetching investors by listId:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch investors",
      error: error.message,
    });
  }
};

// Get a single investor by ID
const getInvestorById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Investor ID is required"
      });
    }
    
    const docRef = db.collection("investors").doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        error: "Investor not found"
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        id: docSnap.id,
        ...docSnap.data()
      }
    });
  } catch (error) {
    console.error("Error fetching investor:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch investor",
      details: error.message
    });
  }
};

module.exports = {
  getAllInvestors,
  addInvestors,
  updateInvestor,
  deleteInvestor,
  getInvestorsByListId,
  getInvestorById
};