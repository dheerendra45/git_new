const { db } = require('../config/firebase');
const admin = require('firebase-admin');

// Create a new campaign
exports.createCampaign = async (req, res) => {
  try {
    // Validate that we have a contactListId in the request body
    if (req.body.contactListId) {
      // All good, contactListId exists
    } else if (req.body.listId) {
      // If using listId instead, normalize it to contactListId
      req.body.contactListId = req.body.listId;
      console.log("Normalized listId to contactListId:", req.body.contactListId);
    } else {
      console.log("Warning: Creating campaign without contact list ID");
    }

    const campaignData = { 
      ...req.body, 
      createdAt: admin.firestore.FieldValue.serverTimestamp() // Use server timestamp
    };
    const campaignRef = db.collection("campaignLists").doc();
    await campaignRef.set(campaignData);
    res
      .status(201)
      .json({ id: campaignRef.id, message: "Campaign added successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all campaigns with pagination - OPTIMIZED
exports.getAllCampaigns = async (req, res) => {
  try {
    // Add pagination parameters
    const { limit = 20, startAfter = null } = req.query;
    const limitNum = parseInt(limit);
    
    let query = db.collection("campaignLists").orderBy("createdAt", "desc").limit(limitNum);
    
    // Apply cursor-based pagination if startAfter is provided
    if (startAfter) {
      // Use documentId() instead of fetching document first
      query = query.startAfter(startAfter);
    }

    // Get total count efficiently in parallel
    const countPromise = db.collection("campaignLists").count().get();
    const snapshotPromise = query.get();
    
    // Execute both queries in parallel
    const [countSnapshot, snapshot] = await Promise.all([countPromise, snapshotPromise]);
    const totalCount = countSnapshot.data().count;

    if (snapshot.empty) {
      return res.json({
        campaigns: [],
        totalCount,
        lastVisible: null,
        hasMore: false
      });
    }

    // Get the last visible document for next pagination request
    const lastVisible = snapshot.docs[snapshot.docs.length - 1];
    
    const campaigns = snapshot.docs.map((doc) => ({ 
      id: doc.id, 
      ...doc.data() 
    }));

    res.json({
      campaigns,
      totalCount,
      lastVisible: lastVisible.id,
      hasMore: campaigns.length === limitNum
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a single campaign by ID
exports.getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;
    const docRef = db.collection("campaignLists").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    res.json({ id: docSnap.id, ...docSnap.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete a campaign by ID
exports.deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    // No need to check existence before deleting - Firebase does this atomically
    await db.collection("campaignLists").doc(id).delete();
    
    res.status(200).json({
      success: true,
      message: "Campaign deleted successfully",
      data: { id },
    });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete campaign",
      error: error.message,
    });
  }
};

// Get all investors for a specific campaign list with pagination - OPTIMIZED
exports.getCampaignInvestors = async (req, res) => {
  try {
    const { listId } = req.params;
    const { limit = 20, startAfter = null } = req.query;
    const limitNum = parseInt(limit);

    if (!listId) {
      return res.status(400).json({
        success: false,
        message: "listId is required",
      });
    }

    // Create base query with pagination
    let query = db
      .collection("investors")
      .where("listId", "==", listId)
      .orderBy("createdAt", "desc")
      .limit(limitNum);
    
    // Apply cursor-based pagination if startAfter is provided
    if (startAfter) {
      // Use startAfter value directly instead of fetching document first
      query = query.startAfter(startAfter);
    }

    // Execute both queries in parallel to save time
    const countPromise = db
      .collection("investors")
      .where("listId", "==", listId)
      .count()
      .get();
      
    const snapshotPromise = query.get();
    
    const [countQuery, snapshot] = await Promise.all([countPromise, snapshotPromise]);    
    const totalCount = countQuery.data().count;

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: `No investors found for listId: ${listId}`,
        totalCount,
        data: [],
        hasMore: false
      });
    }

    // Get the last visible document for next pagination request
    const lastVisible = snapshot.docs[snapshot.docs.length - 1];
    
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
