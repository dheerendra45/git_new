const { db } = require('../config/firebase');
const admin = require('firebase-admin');

// Create a new contact list
exports.createContactList = async (req, res) => {
  try {
    const { listName } = req.body;
    if (!listName || typeof listName !== "string") {
      return res.status(400).json({
        success: false,
        message: "listName is required and must be a string",
      });
    }

    // Use transaction to check existence and create in one atomic operation
    // This reduces separate read and write operations
    const result = await db.runTransaction(async (transaction) => {
      // Check if list name already exists
      const querySnapshot = await transaction.get(
        db.collection("contactLists").where("listName", "==", listName).limit(1)
      );

      if (!querySnapshot.empty) {
        return { 
          success: false, 
          status: 409, 
          message: `A contact list with the name "${listName}" already exists` 
        };
      }

      // Create new document reference
      const newListRef = db.collection("contactLists").doc();
      
      // Set document data in transaction
      transaction.set(newListRef, {
        listName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), // Using admin SDK directly
      });

      return { 
        success: true, 
        status: 201, 
        message: "Contact list created successfully", 
        id: newListRef.id 
      };
    });

    // Return response based on transaction result
    return res.status(result.status).json({
      success: result.success,
      message: result.message,
      id: result.id
    });
  } catch (error) {
    console.error("Error creating contact list:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save contact list",
      error: error.message,
    });
  }
};

// Get all contact lists with pagination
exports.getAllContactLists = async (req, res) => {
  try {
    // Add pagination parameters
    const { limit = 20, startAfter = null } = req.query;
    const limitNum = parseInt(limit);
    
    // Create base query with pagination
    let query = db.collection("contactLists")
      .orderBy("createdAt", "desc")
      .limit(limitNum);
    
    // Apply cursor-based pagination if startAfter is provided
    if (startAfter) {
      const startAfterDoc = await db.collection("contactLists").doc(startAfter).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    const snapshot = await query.get();

    // Get total count efficiently
    const countSnapshot = await db.collection("contactLists").count().get();
    const totalCount = countSnapshot.data().count;

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        message: "No contact lists found",
        data: [],
        totalCount,
        lastVisible: null,
        hasMore: false
      });
    }

    // Get the last visible document for next pagination request
    const lastVisible = snapshot.docs[snapshot.docs.length - 1];
    
    // Map documents to include ID and data
    const contactLists = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({
      success: true,
      data: contactLists,
      totalCount,
      lastVisible: lastVisible.id,
      hasMore: contactLists.length === limitNum
    });
  } catch (error) {
    console.error("Error fetching contact lists:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch contact lists",
      error: error.message,
    });
  }
};

// Delete a contact list and related investors with optimized batch processing
exports.deleteContactList = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Contact list ID is required",
      });
    }

    // Reference to the contact list document
    const contactListRef = db.collection("contactLists").doc(id);

    // Use a transaction to handle the entire deletion process
    const result = await db.runTransaction(async (transaction) => {
      // Check if the contact list exists
      const contactListDoc = await transaction.get(contactListRef);
      if (!contactListDoc.exists) {
        return {
          success: false,
          status: 404,
          message: `Contact list with ID ${id} not found`
        };
      }

      // Delete the contact list in the transaction
      transaction.delete(contactListRef);

      // Return success for the transaction
      return {
        success: true,
        status: 200
      };
    });

    // If transaction failed due to non-existent document
    if (!result.success) {
      return res.status(result.status).json({
        success: false,
        message: result.message
      });
    }

    // After successful transaction, handle batch deletions of related documents
    // We'll use multiple smaller batches to avoid hitting Firestore limits (500 operations per batch)
    
    // Get investors with listId = id
    const investorsSnapshot = await db
      .collection("investors")
      .where("listId", "==", id)
      .get();

    // Get investors with listRef = contactListRef
    const investorListsSnapshot = await db
      .collection("investors")
      .where("listRef", "==", contactListRef)
      .get();

    // Function to delete documents in batches
    const batchDelete = async (querySnapshot) => {
      const batchSize = 450; // Firestore has a limit of 500 operations per batch
      const totalDocs = querySnapshot.size;
      const batches = Math.ceil(totalDocs / batchSize);
      
      let deletedCount = 0;
      
      for (let i = 0; i < batches; i++) {
        const batch = db.batch();
        const docsInBatch = querySnapshot.docs.slice(i * batchSize, (i + 1) * batchSize);
        
        docsInBatch.forEach(doc => {
          batch.delete(doc.ref);
          deletedCount++;
        });
        
        await batch.commit();
      }
      
      return deletedCount;
    };

    // Delete all investors in batches
    const deletedInvestors = await batchDelete(investorsSnapshot);
    const deletedInvestorLists = await batchDelete(investorListsSnapshot);

    res.status(200).json({
      success: true,
      message: `Contact list ${id} deleted along with ${deletedInvestorLists} investor lists and ${deletedInvestors} investors.`,
    });
  } catch (error) {
    console.error("Error deleting contact list:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete contact list and related data",
      error: error.message,
    });
  }
};

// Get a specific contact list by ID
exports.getContactListById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Contact list ID is required"
      });
    }
    
    const docRef = db.collection("contactLists").doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        message: "Contact list not found"
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
    console.error("Error fetching contact list:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch contact list",
      error: error.message
    });
  }
};