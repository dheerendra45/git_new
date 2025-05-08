const { db } = require('../config/firebase');

// Create a new client
exports.createClient = async (req, res) => {
  try {
    const clientData = { ...req.body, createdAt: new Date() };
    const userRef = db.collection("clients").doc();
    await userRef.set(clientData);
    res
      .status(201)
      .json({ id: userRef.id, message: "Client added successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all clients with pagination, optionally filtered by email
exports.getClients = async (req, res) => {
  try {
    const { email, limit = 20, startAfter = null } = req.query;
    const limitNum = parseInt(limit);
    
    let query = db.collection("clients").orderBy("createdAt", "desc").limit(limitNum);
    
    // If filtering by email, we need a different query since we can't combine
    // where and orderBy on different fields without an index
    if (email) {
      query = db.collection("clients").where("email", "==", email).limit(limitNum);
    }
    
    // Apply cursor-based pagination if startAfter is provided
    if (startAfter) {
      const startAfterDoc = await db.collection("clients").doc(startAfter).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      return res.json({
        clients: [],
        lastVisible: null,
        hasMore: false
      });
    }

    // Get the last visible document for next pagination request
    const lastVisible = snapshot.docs[snapshot.docs.length - 1];
    
    const clients = snapshot.docs.map((doc) => ({ 
      id: doc.id, 
      ...doc.data() 
    }));

    res.json({
      clients,
      lastVisible: lastVisible.id,
      hasMore: clients.length === limitNum
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a client by ID
exports.updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedClientData = req.body;
    
    // Update the document directly without checking existence first
    await db.collection("clients").doc(id).update({
      ...updatedClientData,
      updatedAt: new Date()
    });
    
    // Only get the document once after update
    const updatedDoc = await db.collection("clients").doc(id).get();
    
    // If the document doesn't exist after update, it means it was deleted during our operation
    if (!updatedDoc.exists) {
      return res.status(404).json({ error: "Client not found or was deleted" });
    }
    
    const updatedClient = { id: updatedDoc.id, ...updatedDoc.data() };
    
    res.json(updatedClient);
  } catch (error) {
    // Firestore throws specific errors when document doesn't exist
    if (error.code === 5) { // NOT_FOUND
      return res.status(404).json({ error: "Client not found" });
    }
    res.status(500).json({ error: error.message });
  }
};

// Delete a client by ID
exports.deleteClient = async (req, res) => {
  try {
    const { id } = req.params;
    // No need to check existence before deleting - Firebase does this atomically
    await db.collection("clients").doc(id).delete();
    
    res.status(200).json({ message: "Client deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Add IMAP credentials to a client
exports.addCredentials = async (req, res) => {
  const { clientId, imapPassword } = req.body;

  if (!clientId || !imapPassword) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    await db.collection("clients").doc(clientId).update({
      imapPassword,
      updatedAt: new Date().toISOString(),
    });
    res.status(201).json({ message: "Client credentials added successfully" });
  } catch (error) {
    // Check if error is because document doesn't exist
    if (error.code === 5) { // NOT_FOUND
      return res.status(404).json({ error: "Client not found" });
    }
    console.error("Error adding client credentials:", error);
    res.status(500).json({ error: error.message });
  }
};