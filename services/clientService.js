const admin = require('firebase-admin');
const db = admin.firestore();
const clientsCollection = db.collection('clients');

/**
 * Get all clients or filter by email
 * @param {string} email - Optional email to filter by
 * @returns {Array} - Array of client objects
 */
const getClients = async (email = null) => {
  try {
    let query = clientsCollection;
    
    if (email) {
      query = query.where('email', '==', email);
    }
    
    const snapshot = await query.get();
    const clients = [];
    
    snapshot.forEach(doc => {
      clients.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return clients;
  } catch (error) {
    console.error('Error fetching clients:', error);
    throw error;
  }
};

/**
 * Get a single client by ID
 * @param {string} clientId - The client ID to fetch
 * @returns {Object|null} - Client object or null if not found
 */
const getClientById = async (clientId) => {
  try {
    const doc = await clientsCollection.doc(clientId).get();
    if (!doc.exists) {
      return null;
    }
    return {
      id: doc.id,
      ...doc.data()
    };
  } catch (error) {
    console.error('Error fetching client:', error);
    throw error;
  }
};

/**
 * Update a client
 * @param {string} clientId - The client ID to update
 * @param {Object} data - The data to update
 * @returns {Object} - Updated client object
 */
const updateClient = async (clientId, data) => {
  try {
    // Clean up undefined values to avoid Firestore errors
    Object.keys(data).forEach(key => {
      if (data[key] === undefined) {
        delete data[key];
      }
    });
    
    await clientsCollection.doc(clientId).update({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Get and return the updated document
    return await getClientById(clientId);
  } catch (error) {
    console.error('Error updating client:', error);
    throw error;
  }
};

/**
 * Update email verification status
 * @param {string} clientId - The client ID to update
 * @param {boolean} status - Verification status
 * @returns {Object} - Updated client object
 */
const updateEmailVerificationStatus = async (clientId, status = false) => {
  try {
    await clientsCollection.doc(clientId).update({
      emailVerified: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return await getClientById(clientId);
  } catch (error) {
    console.error('Error updating email verification:', error);
    throw error;
  }
};

/**
 * Mark email verification as sent
 * @param {string} clientId - The client ID to update
 * @returns {Object} - Updated client object
 */
const markVerificationSent = async (clientId) => {
  try {
    await clientsCollection.doc(clientId).update({
      emailVerificationSent: true,
      emailVerificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return await getClientById(clientId);
  } catch (error) {
    console.error('Error updating verification sent status:', error);
    throw error;
  }
};

module.exports = {
  getClients,
  getClientById,
  updateClient,
  updateEmailVerificationStatus,
  markVerificationSent
};