# ApplyMate - AI Job Application Assistant (Product Grade)

ApplyMate is a production-ready web application that helps job seekers analyze their resume against job descriptions using AI. It provides match scores, identifies missing skills, generates personalized cover letters, suggests interview questions, and offers concrete resume improvement suggestions.

## ✨ Features

- 📄 **Resume Upload**: Upload your resume as a PDF with validation
- 📝 **Job Description Analysis**: Paste any job description for analysis
- 🤖 **AI-Powered Analysis**: Uses Google's Gemini API with structured prompts
- 📊 **Match Score**: Get a 0-100 compatibility score with detailed explanations
- 🎯 **Missing Skills**: Identify specific skills you need to develop
- 💡 **Resume Improvements**: Get 3 concrete, actionable suggestions
- ✉️ **Cover Letter**: Generate a personalized, professional cover letter
- ❓ **Interview Questions**: Get 5 role-specific interview questions
- 💾 **Firebase Storage**: All analyses are saved to Firestore
- 🎨 **Professional UI**: Modern design with Tailwind CSS

## 🏗️ Architecture

### Clean Separation of Concerns

```
applymate/
├── server.js              # Express server - routes only
├── services/
│   ├── aiService.js       # AI logic - Gemini API interactions
│   └── firebaseService.js # Database operations - Firestore
├── utils/
│   └── pdfExtractor.js    # PDF text extraction utility
└── public/
    └── index.html         # Frontend with Tailwind CSS
```

### Key Design Principles

1. **Service Layer Pattern**: Business logic separated from routes
2. **Error Handling**: Robust error handling at every layer
3. **Environment Configuration**: All config via environment variables
4. **JSON-First AI**: Structured prompts ensure clean JSON responses
5. **Graceful Degradation**: Works without Firebase (results just not saved)

## 🚀 Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Required: Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Server Configuration
PORT=3000
NODE_ENV=development
MAX_FILE_SIZE=5242880

# Optional: Gemini Model (default: gemini-pro)
GEMINI_MODEL=gemini-pro
```

**Get your Gemini API Key:**
1. Visit https://makersuite.google.com/app/apikey
2. Sign in with your Google account
3. Create a new API key
4. Copy it to your `.env` file

### 3. Set Up Firebase (Optional)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use an existing one
3. Enable Firestore Database
4. Go to Project Settings > Service Accounts
5. Click "Generate New Private Key"
6. Save the downloaded JSON file as `firebase-service-account.json` in the project root

**Note**: The app works without Firebase, but results won't be saved.

### 4. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### 5. Open in Browser

Navigate to `http://localhost:3000`

## 📁 File Structure & Explanations

### `server.js` - Main Express Server
**Purpose**: HTTP request handling and routing only

**Key Features**:
- Clean route handlers (no business logic)
- Centralized error handling middleware
- File upload configuration with Multer
- Health check endpoint
- Environment-based configuration

**Routes**:
- `GET /` - Serves frontend
- `POST /api/analyze` - Main analysis endpoint
- `GET /api/analyses` - Get all saved analyses
- `GET /api/analyses/:id` - Get specific analysis
- `GET /api/health` - Health check

### `services/aiService.js` - AI Service Module
**Purpose**: All Gemini API interactions and prompt engineering

**Key Features**:
- **Structured Prompts**: Acts as hiring expert with strict scoring criteria
- **JSON-Only Responses**: Ensures clean JSON parsing (no markdown)
- **Response Validation**: Validates all required fields and constraints
- **Error Handling**: Enhanced error messages for debugging
- **Temperature Control**: Lower temperature (0.3) for consistent responses

**Prompt Design**:
- Evaluates as experienced hiring manager (15+ years)
- Strict scoring: Required skills (40%), Experience (30%), Education (15%), Keywords (15%)
- Returns: matchScore, missingSkills, scoreExplanation, resumeImprovements, coverLetter, interviewQuestions

### `services/firebaseService.js` - Firebase Service Module
**Purpose**: All Firestore database operations

**Key Features**:
- Graceful initialization (works without Firebase)
- Structured data storage
- Error handling that doesn't break the app
- Query methods for retrieving analyses

**Methods**:
- `saveAnalysis(analysis)` - Save analysis to Firestore
- `getAllAnalyses(limit)` - Get all analyses
- `getAnalysisById(id)` - Get specific analysis
- `isAvailable()` - Check if Firebase is configured

### `utils/pdfExtractor.js` - PDF Extraction Utility
**Purpose**: PDF text extraction with error handling

**Key Features**:
- Validates file existence and content
- Handles password-protected PDFs
- Handles image-only PDFs
- Clean error messages
- File cleanup utility

### `public/index.html` - Frontend Application
**Purpose**: Complete single-page application

**Key Features**:
- **Tailwind CSS**: Professional, responsive design
- **Modern UI**: Gradient backgrounds, cards, animations
- **Loading States**: Visual feedback during processing
- **Error Display**: User-friendly error messages
- **Results Display**: All analysis fields with proper formatting
- **Copy Functionality**: Copy cover letter to clipboard

**New UI Components**:
- Match score with color-coded cards (green/yellow/orange/red)
- Score explanation section
- Resume improvements with numbered suggestions
- Enhanced interview questions display
- Professional typography and spacing

## 🔧 API Endpoints

### POST `/api/analyze`
Analyzes a resume against a job description.

**Request:**
- `resume`: PDF file (multipart/form-data)
- `jobDescription`: String (form data)

**Response:**
```json
{
  "success": true,
  "analysis": {
    "matchScore": 85,
    "missingSkills": ["React.js", "TypeScript"],
    "scoreExplanation": [
      "Strong alignment with required technical skills (React, Node.js)",
      "Missing 2 years of experience in cloud infrastructure",
      "Excellent education background matches requirements"
    ],
    "resumeImprovements": [
      "Add a 'Technical Skills' section highlighting React.js and TypeScript",
      "Quantify achievements with metrics (e.g., 'Improved performance by 40%')",
      "Include relevant certifications or courses in cloud technologies"
    ],
    "coverLetter": "...",
    "interviewQuestions": ["...", "...", "...", "...", "..."]
  },
  "firestoreId": "document_id",
  "saved": true
}
```

### GET `/api/analyses`
Retrieves all saved analyses from Firestore.

**Query Parameters:**
- `limit` (optional): Maximum number of results (default: 50)

**Response:**
```json
{
  "success": true,
  "count": 10,
  "analyses": [...]
}
```

### GET `/api/analyses/:id`
Get a specific analysis by document ID.

### GET `/api/health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "firebase": true,
  "ai": true
}
```

## 🎯 Key Improvements from Basic Version

### 1. **Structured AI Prompts**
- Acts as hiring expert with 15+ years experience
- Strict scoring criteria with weighted components
- Ensures JSON-only responses (no markdown)

### 2. **Scoring Explanation**
- 2-3 bullet points explaining WHY the score is what it is
- Focuses on specific gaps or strengths
- Helps users understand areas for improvement

### 3. **Resume Improvement Suggestions**
- Exactly 3 concrete, actionable suggestions
- Tailored to the specific job description
- Implementable recommendations

### 4. **Clean Architecture**
- Service layer separation (AI, Firebase, PDF)
- Routes handle HTTP only
- Utilities for reusable functions
- Environment-based configuration

### 5. **Professional UI**
- Tailwind CSS for modern design
- Color-coded match scores
- Better visual hierarchy
- Responsive design
- Loading and error states

### 6. **Robust Error Handling**
- Centralized error middleware
- Enhanced error messages
- Graceful degradation
- User-friendly error display

### 7. **Response Validation**
- Validates all required fields
- Ensures correct data types
- Checks constraints (e.g., exactly 3 improvements, 5 questions)
- Better error messages if validation fails

## 🔍 How It Works

1. **User uploads PDF resume** → Validated and stored temporarily
2. **User pastes job description** → Validated for content
3. **PDF text extracted** → Using pdf-parse library
4. **AI Analysis** → Structured prompt sent to Gemini API
   - Resume evaluated against job requirements
   - Match score calculated with weighted criteria
   - Missing skills identified
   - Score explanation generated
   - Resume improvements suggested
   - Cover letter generated
   - Interview questions created
5. **Results saved** → Stored in Firestore (if configured)
6. **Results displayed** → Formatted UI with all insights

## 🛠️ Troubleshooting

**"Firebase initialization error"**
- Make sure `firebase-service-account.json` exists and is valid
- The app will still work without Firebase, but won't save results

**"AI analysis failed"**
- Check that `GEMINI_API_KEY` is set correctly in `.env`
- Ensure your API key has proper permissions
- Check API quota/rate limits

**"Failed to extract text from PDF"**
- Ensure the PDF is not password-protected
- Check that the PDF contains actual text (not just images)
- Verify the PDF is not corrupted

**"Only PDF files are allowed"**
- Make sure you're uploading a PDF file, not a Word document or image
- Check file extension is `.pdf`

## 📝 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | - | Google Gemini API key |
| `PORT` | No | 3000 | Server port |
| `NODE_ENV` | No | development | Environment mode |
| `MAX_FILE_SIZE` | No | 5242880 | Max file size in bytes (5MB) |
| `GEMINI_MODEL` | No | gemini-pro | Gemini model to use |

## 📄 License

ISC

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

---

**Built with ❤️ using Node.js, Express, Firebase, and Google Gemini AI**
