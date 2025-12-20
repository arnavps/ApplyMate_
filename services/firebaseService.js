/**
 * Firebase Service Module
 * 
 * Handles all Firestore database operations.
 * Provides clean separation of database logic from routes.
 * 
 * Features:
 * - Graceful handling of missing Firebase configuration
 * - Structured data storage
 * - Error handling and logging
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

class FirebaseService {
  constructor() {
    this.db = null;
    this.initialized = false;
    this._initialize();
  }

  /**
   * Initialize Firebase Admin SDK
   * Gracefully handles missing configuration
   */
  _initialize() {
    try {
      const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
      
      if (!fs.existsSync(serviceAccountPath)) {
        console.warn('⚠️  Firebase service account file not found. Results will not be saved to database.');
        console.warn('   To enable Firebase: Download service account JSON from Firebase Console');
        console.warn('   and save it as firebase-service-account.json in the project root.');
        return;
      }

      const serviceAccount = require(serviceAccountPath);
      
      // Check if Firebase is already initialized
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      }

      this.db = admin.firestore();
      this.initialized = true;
      console.log('✅ Firebase initialized successfully');
    } catch (error) {
      console.error('❌ Firebase initialization error:', error.message);
      console.warn('   Continuing without Firebase. Results will not be saved.');
      this.initialized = false;
    }
  }

  /**
   * Verify Firebase Auth token and get user ID
   * @param {string} idToken - Firebase ID token from client
   * @returns {Promise<Object|null>} User info or null if invalid
   */
  async verifyAuthToken(idToken) {
    if (!this.initialized) {
      return null;
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      return {
        uid: decodedToken.uid,
        email: decodedToken.email
      };
    } catch (error) {
      console.error('❌ Error verifying token:', error.message);
      return null;
    }
  }

  /**
   * Save analysis results to Firestore
   * @param {Object} analysis - The complete analysis object
   * @param {string} userId - Optional user ID
   * @returns {Promise<string|null>} Document ID if saved, null otherwise
   */
  async saveAnalysis(analysis, userId = null) {
    if (!this.initialized || !this.db) {
      return null;
    }

    try {
      const analysisData = {
        ...analysis,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: new Date().toISOString()
      };

      // Add userId if provided
      if (userId) {
        analysisData.userId = userId;
      }

      const docRef = await this.db.collection('analyses').add(analysisData);
      console.log(`💾 Analysis saved to Firestore: ${docRef.id}${userId ? ` (User: ${userId})` : ''}`);
      return docRef.id;
    } catch (error) {
      console.error('❌ Error saving to Firestore:', error.message);
      // Don't throw - allow app to continue even if save fails
      return null;
    }
  }

  /**
   * Retrieve all saved analyses
   * @param {number} limit - Maximum number of analyses to retrieve
   * @returns {Promise<Array>} Array of analysis documents
   */
  async getAllAnalyses(limit = 50) {
    if (!this.initialized || !this.db) {
      throw new Error('Firebase is not initialized');
    }

    try {
      const snapshot = await this.db.collection('analyses')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const analyses = [];
      snapshot.forEach(doc => {
        analyses.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return analyses;
    } catch (error) {
      console.error('❌ Error fetching analyses:', error.message);
      throw new Error(`Failed to fetch analyses: ${error.message}`);
    }
  }

  /**
   * Get a specific analysis by document ID
   * @param {string} docId - Document ID
   * @returns {Promise<Object|null>} Analysis document or null if not found
   */
  async getAnalysisById(docId) {
    if (!this.initialized || !this.db) {
      throw new Error('Firebase is not initialized');
    }

    try {
      const doc = await this.db.collection('analyses').doc(docId).get();
      
      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        ...doc.data()
      };
    } catch (error) {
      console.error('❌ Error fetching analysis:', error.message);
      throw new Error(`Failed to fetch analysis: ${error.message}`);
    }
  }

  /**
   * Get analyses by user ID
   * @param {string} userId - User ID
   * @param {number} limit - Maximum number of analyses to retrieve
   * @returns {Promise<Array>} Array of analysis documents
   */
  async getAnalysesByUserId(userId, limit = 50) {
    if (!this.initialized || !this.db) {
      throw new Error('Firebase is not initialized');
    }

    try {
      // Try querying with orderBy first (requires composite index)
      // If that fails, fall back to querying without orderBy and sorting in memory
      let snapshot;
      let usedOrderBy = true;
      
      try {
        snapshot = await this.db.collection('analyses')
          .where('userId', '==', userId)
          .orderBy('timestamp', 'desc')
          .limit(limit)
          .get();
      } catch (orderByError) {
        // If orderBy fails (missing index), try without orderBy and sort in memory
        const errorMsg = orderByError.message || '';
        const errorCode = orderByError.code;
        
        if (errorCode === 9 || errorMsg.includes('index') || errorMsg.includes('requires an index') || errorMsg.includes('The query requires an index')) {
          console.warn('⚠️  Firestore composite index missing for userId+timestamp. Fetching without orderBy and sorting in memory.');
          usedOrderBy = false;
          snapshot = await this.db.collection('analyses')
            .where('userId', '==', userId)
            .limit(limit * 3) // Get more to account for sorting
            .get();
        } else {
          // For other errors, still try the fallback
          console.warn('⚠️  Query with orderBy failed, trying without orderBy:', orderByError.message);
          usedOrderBy = false;
          snapshot = await this.db.collection('analyses')
            .where('userId', '==', userId)
            .limit(limit * 3)
            .get();
        }
      }

      const analyses = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        analyses.push({
          id: doc.id,
          ...data
        });
      });

      // Sort by timestamp if we didn't use orderBy
      if (!usedOrderBy && analyses.length > 0) {
        analyses.sort((a, b) => {
          // Handle Firestore Timestamp objects
          let aTime = 0;
          let bTime = 0;
          
          if (a.timestamp && a.timestamp.toMillis) {
            aTime = a.timestamp.toMillis();
          } else if (a.timestamp && a.timestamp.seconds) {
            aTime = a.timestamp.seconds * 1000;
          } else if (a.createdAt) {
            aTime = new Date(a.createdAt).getTime();
          }
          
          if (b.timestamp && b.timestamp.toMillis) {
            bTime = b.timestamp.toMillis();
          } else if (b.timestamp && b.timestamp.seconds) {
            bTime = b.timestamp.seconds * 1000;
          } else if (b.createdAt) {
            bTime = new Date(b.createdAt).getTime();
          }
          
          return bTime - aTime; // Descending order (newest first)
        });
        
        // Limit after sorting
        return analyses.slice(0, limit);
      }

      return analyses;
    } catch (error) {
      console.error('❌ Error fetching user analyses:', error.message);
      console.error('Error code:', error.code);
      console.error('Error stack:', error.stack);
      throw new Error(`Failed to fetch analyses: ${error.message}`);
    }
  }

  /**
   * Check if Firebase is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.initialized && this.db !== null;
  }
}

module.exports = new FirebaseService();

