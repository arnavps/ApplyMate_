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

      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        if (admin.apps.length === 0) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
        }
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Fallback: Read from Environment Variable (for deployment)
        try {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
          if (admin.apps.length === 0) {
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount)
            });
          }
          console.log('✅ Firebase initialized from Environment Variable');
        } catch (parseError) {
          console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable');
          throw parseError;
        }
      } else {
        console.warn('⚠️  Firebase service account file not found via path or env var.');
        return;
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
      return { success: false, error: 'Firebase not initialized' };
    }

    // MANDATORY: User ID required for saving
    if (!userId) {
      console.warn('⚠️  Analysis not saved: User not logged in (anonymous generation)');
      return { success: false, error: 'User not logged in' };
    }

    try {
      const analysisData = {
        ...analysis,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: new Date().toISOString(),
        userId: userId // Keep userId in doc for reference/indexes
      };

      // Save to root collection 'analyses' with userId field
      // This avoids potential issues with subcollection path creation in some environments
      const docRef = await this.db.collection('analyses').add(analysisData);
      console.log(`💾 Analysis saved to Firestore: ${docRef.id} (User: ${userId})`);
      return { success: true, id: docRef.id };
    } catch (error) {
      console.error('❌ Error saving to Firestore:', error);
      console.error('   Error Code:', error.code);
      console.error('   Error Message:', error.message);
      if (error.details) console.error('   Details:', error.details);

      // Return the specific error for debugging
      return { success: false, error: error.message || 'Unknown Firestore Error' };
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
      console.log(`🔍 Fetching analyses for User: ${userId}`);
      // Defensive guard: treat missing/invalid userId as empty results
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        console.warn('⚠️  Invalid userId provided to getAnalysesByUserId');
        return [];
      }

      let snapshot;
      try {
        console.log('   Attempting query: collection("analyses").where("userId", "==", userId).orderBy("timestamp", "desc")');
        snapshot = await this.db.collection('analyses')
          .where('userId', '==', userId)
          .orderBy('timestamp', 'desc')
          .limit(limit)
          .get();
      } catch (orderByError) {
        console.warn(`⚠️  Primary Query Failed: ${orderByError.code} - ${orderByError.message}`);

        console.log('   Attempting fallback query: collection("analyses").where("userId", "==", userId) (Unordered)');
        snapshot = await this.db.collection('analyses')
          .where('userId', '==', userId)
          .limit(limit * 3)
          .get();
      }

      console.log(`✅ Query successful. Documents found: ${snapshot.size}`);

      const analyses = [];
      snapshot.forEach(doc => {
        analyses.push({
          id: doc.id,
          ...doc.data()
        });
      });

      // Ensure sorted desc
      analyses.sort((a, b) => {
        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.createdAt).getTime();
        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.createdAt).getTime();
        return timeB - timeA;
      });

      return analyses.slice(0, limit);
    } catch (error) {
      console.error('❌ Error fetching user analyses:', error);
      console.error(`   Code: ${error.code}, Message: ${error.message}`);
      return [];
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
