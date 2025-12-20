/**
 * ApplyMate Server - Product Grade
 * 
 * Main Express server with clean architecture:
 * - Routes handle HTTP requests/responses only
 * - Business logic delegated to services
 * - Robust error handling
 * - Environment-based configuration
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

// Import services
const aiService = require('./services/aiService');
const firebaseService = require('./services/firebaseService');
const pdfExtractor = require('./utils/pdfExtractor');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `resume-${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed. Please upload a .pdf file.'));
    }
  },
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880') // Default 5MB
  }
});

/**
 * Error handling middleware
 * Centralized error handling for consistent responses
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large', 
        message: `Maximum file size is ${process.env.MAX_FILE_SIZE || 5}MB` 
      });
    }
    return res.status(400).json({ error: 'File upload error', message: err.message });
  }

  // Validation errors
  if (err.message.includes('required') || err.message.includes('empty')) {
    return res.status(400).json({ error: 'Validation error', message: err.message });
  }

  // AI service errors
  if (err.message.includes('AI analysis') || err.message.includes('Gemini')) {
    return res.status(500).json({ 
      error: 'AI analysis failed', 
      message: err.message 
    });
  }

  // PDF extraction errors
  if (err.message.includes('PDF') || err.message.includes('extract')) {
    return res.status(400).json({ 
      error: 'PDF processing error', 
      message: err.message 
    });
  }

  // Firebase/Firestore errors
  if (err.message.includes('Firebase') || err.message.includes('Firestore') || err.message.includes('index')) {
    return res.status(500).json({ 
      error: 'Database error', 
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }

  // Default error
  res.status(500).json({ 
    error: 'Internal server error', 
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

// Routes

/**
 * GET /
 * Serve the main HTML page
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * POST /api/analyze
 * Main analysis endpoint
 * 
 * Flow:
 * 1. Validate file and job description
 * 2. Extract text from PDF
 * 3. Call AI service for analysis
 * 4. Save to Firebase (if available)
 * 5. Return results
 */
app.post('/api/analyze', upload.single('resume'), async (req, res, next) => {
  let uploadedFilePath = null;

  try {
    // Validate file upload
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No resume file uploaded', 
        message: 'Please upload a PDF resume file' 
      });
    }

    uploadedFilePath = req.file.path;

    // Validate job description
    if (!req.body.jobDescription || req.body.jobDescription.trim() === '') {
      pdfExtractor.cleanup(uploadedFilePath);
      return res.status(400).json({ 
        error: 'Job description required', 
        message: 'Please provide a job description' 
      });
    }

    // Extract text from PDF
    const resumeText = await pdfExtractor.extractText(uploadedFilePath);
    
    // Analyze with AI service
    const analysis = await aiService.analyzeResume(
      resumeText, 
      req.body.jobDescription.trim()
    );

    // Get userId from auth token if provided
    let userId = null;
    if (req.headers.authorization) {
      const token = req.headers.authorization.replace('Bearer ', '');
      const userInfo = await firebaseService.verifyAuthToken(token);
      if (userInfo) {
        userId = userInfo.uid;
      }
    }

    // Save to Firebase (non-blocking)
    const firestoreId = await firebaseService.saveAnalysis({
      resumeText: resumeText.substring(0, 500), // Store snippet for reference
      jobDescription: req.body.jobDescription.substring(0, 500),
      ...analysis
    }, userId);

    // Clean up uploaded file
    pdfExtractor.cleanup(uploadedFilePath);

    // Return success response
    res.json({
      success: true,
      analysis: analysis,
      firestoreId: firestoreId,
      saved: firestoreId !== null
    });

  } catch (error) {
    // Clean up file on error
    if (uploadedFilePath) {
      pdfExtractor.cleanup(uploadedFilePath);
    }
    
    // Pass to error handler
    next(error);
  }
});

/**
 * GET /api/analyses
 * Retrieve analyses from Firestore (all if admin, user's only if authenticated)
 */
app.get('/api/analyses', async (req, res, next) => {
  try {
    if (!firebaseService.isAvailable()) {
      return res.status(503).json({ 
        error: 'Firebase not available', 
        message: 'Database is not configured. Results are not being saved.' 
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    let analyses;

    // Check if user is authenticated
    if (req.headers.authorization) {
      const token = req.headers.authorization.replace('Bearer ', '');
      
      if (!token || token === 'Bearer') {
        return res.status(401).json({ error: 'Invalid authentication token format' });
      }

      const userInfo = await firebaseService.verifyAuthToken(token);
      if (userInfo) {
        try {
          // Get user's analyses only
          analyses = await firebaseService.getAnalysesByUserId(userInfo.uid, limit);
        } catch (queryError) {
          console.error('Error querying user analyses:', queryError);
          // If query fails, return empty array instead of error (user might not have any analyses yet)
          if (queryError.message.includes('index') || queryError.message.includes('requires')) {
            // Index not created yet - return empty for now
            analyses = [];
          } else {
            throw queryError;
          }
        }
      } else {
        return res.status(401).json({ error: 'Invalid authentication token' });
      }
    } else {
      // Get all analyses (for backward compatibility, but should require auth in production)
      analyses = await firebaseService.getAllAnalyses(limit);
    }

    res.json({ 
      success: true,
      count: analyses.length,
      analyses: analyses || []
    });
  } catch (error) {
    console.error('Error in /api/analyses:', error);
    next(error);
  }
});

/**
 * POST /api/verify-auth
 * Verify Firebase auth token
 */
app.post('/api/verify-auth', async (req, res, next) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'ID token required' });
    }

    const userInfo = await firebaseService.verifyAuthToken(idToken);
    
    if (userInfo) {
      res.json({ 
        success: true,
        user: userInfo 
      });
    } else {
      res.status(401).json({ 
        error: 'Invalid token' 
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analyses/:id
 * Get a specific analysis by ID
 */
app.get('/api/analyses/:id', async (req, res, next) => {
  try {
    if (!firebaseService.isAvailable()) {
      return res.status(503).json({ 
        error: 'Firebase not available' 
      });
    }

    const analysis = await firebaseService.getAnalysisById(req.params.id);

    if (!analysis) {
      return res.status(404).json({ 
        error: 'Analysis not found' 
      });
    }

    res.json({ 
      success: true,
      analysis 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    firebase: firebaseService.isAvailable(),
    ai: !!process.env.GEMINI_API_KEY
  });
});

// Apply error handling middleware
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 ApplyMate server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 AI Service: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing API Key'}`);
  console.log(`💾 Firebase: ${firebaseService.isAvailable() ? '✅ Connected' : '⚠️  Not configured'}`);
  console.log(`\n`);
});
