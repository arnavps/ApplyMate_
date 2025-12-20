/**
 * AI Service Module
 * 
 * Handles all Gemini API interactions with structured prompts.
 * Acts as a hiring expert with strict scoring and clean JSON responses.
 * 
 * Key Features:
 * - Structured prompts for consistent responses
 * - JSON-only output (no markdown, no explanations)
 * - Strict resume scoring as a hiring expert
 * - Generates scoring explanations
 * - Provides resume improvement suggestions
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const https = require('https');
require('dotenv').config();

class AIService {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.apiKey = process.env.GEMINI_API_KEY;
    
    // Try common model names in order of preference
    this.modelName = process.env.GEMINI_MODEL || null;
    this.model = null;
    this.generationConfig = {
      temperature: 0.3, // Lower temperature for more consistent, focused responses
      topP: 0.95,
      topK: 40,
    };
  }

  /**
   * Lists available models from the Gemini API
   * Helps identify which models are accessible with the current API key
   */
  async listAvailableModels() {
    return new Promise((resolve, reject) => {
      const url = `https://generativelanguage.googleapis.com/v1/models?key=${this.apiKey}`;
      
      https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              console.warn(`Failed to list models: ${res.statusCode}`);
              resolve([]);
              return;
            }
            
            const jsonData = JSON.parse(data);
            resolve(jsonData.models || []);
          } catch (error) {
            console.error('Error parsing models list:', error);
            resolve([]);
          }
        });
      }).on('error', (error) => {
        console.error('Error listing models:', error);
        resolve([]);
      });
    });
  }

  /**
   * Finds and initializes a working model
   * Tries multiple model names until one works
   */
  async _initializeModel() {
    // If model name is explicitly set, try it first
    if (this.modelName) {
      try {
        this.model = this.genAI.getGenerativeModel({ 
          model: this.modelName,
          generationConfig: this.generationConfig
        });
        // Test if model works by making a simple call (we'll catch errors in analyzeResume)
        return;
      } catch (error) {
        console.warn(`Model ${this.modelName} failed to initialize:`, error.message);
      }
    }

    // Try common model names in order
    const modelNamesToTry = [
      'gemini-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro-latest',
      'gemini-2.0-flash-exp',
      'models/gemini-pro',
      'models/gemini-1.5-flash',
      'models/gemini-1.5-pro'
    ];

    // If no explicit model set, try to find available models
    if (!this.modelName) {
      const availableModels = await this.listAvailableModels();
      if (availableModels.length > 0) {
        // Find models that support generateContent
        const supportedModels = availableModels
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => m.name.replace('models/', ''));
        
        if (supportedModels.length > 0) {
          // Prefer flash models (faster/cheaper) then pro models
          const preferredModel = supportedModels.find(m => m.includes('flash')) || 
                                supportedModels.find(m => m.includes('pro')) ||
                                supportedModels[0];
          this.modelName = preferredModel;
          this.model = this.genAI.getGenerativeModel({ 
            model: this.modelName,
            generationConfig: this.generationConfig
          });
          console.log(`Using model: ${this.modelName}`);
          return;
        }
      }
    }

    // Fallback: try each model name
    for (const modelName of modelNamesToTry) {
      try {
        this.model = this.genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: this.generationConfig
        });
        this.modelName = modelName;
        console.log(`Using model: ${this.modelName}`);
        return;
      } catch (error) {
        // Continue to next model
        continue;
      }
    }

    throw new Error(
      'Could not find an available Gemini model. ' +
      'Please check your API key and ensure it has access to Gemini models. ' +
      'You can also set GEMINI_MODEL in your .env file to a specific model name.'
    );
  }

  /**
   * Builds the structured prompt for resume analysis
   * Acts as a hiring expert with strict evaluation criteria
   */
  _buildAnalysisPrompt(resumeText, jobDescription) {
    return `You are an experienced hiring manager and technical recruiter with 15+ years of experience evaluating candidates. Your task is to analyze a resume against a job description with strict, objective criteria.

RESUME TEXT:
${resumeText}

JOB DESCRIPTION:
${jobDescription}

EVALUATION CRITERIA:
1. Match Score (0-100): Score strictly based on:
   - Required skills match (40% weight)
   - Relevant experience alignment (30% weight)
   - Education/certifications match (15% weight)
   - Keywords and terminology alignment (15% weight)
   Be harsh but fair. A perfect match is 90-100, good match is 70-89, moderate is 50-69, poor is below 50.

2. Missing Skills: List ONLY skills explicitly required in the job description but absent from the resume. Be specific (e.g., "React.js" not "JavaScript frameworks").

3. Score Explanation: Provide 2-3 concise bullet points explaining WHY the score is what it is. Focus on specific gaps or strengths.

4. Resume Improvements: Provide exactly 3 concrete, actionable suggestions to improve the resume for THIS specific job. Each suggestion should be specific and implementable.

5. Cover Letter: Generate a professional, personalized cover letter (3-4 paragraphs) that highlights relevant experience and addresses key job requirements.

6. Interview Questions: Generate exactly 5 role-specific interview questions that a hiring manager would ask based on the job requirements and candidate's background.

RESPONSE FORMAT:
Return ONLY valid JSON. No markdown, no code blocks, no explanations, no additional text. The JSON must be parseable.

{
  "matchScore": <integer 0-100>,
  "missingSkills": [<array of strings>],
  "scoreExplanation": [<array of 2-3 strings explaining the score>],
  "resumeImprovements": [<array of exactly 3 strings>],
  "coverLetter": "<string>",
  "interviewQuestions": [<array of exactly 5 strings>]
}`;
  }

  /**
   * Extracts and parses JSON from AI response
   * Handles various response formats and ensures clean JSON
   */
  _extractJSON(responseText) {
    let jsonText = responseText.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.includes('```json')) {
      jsonText = jsonText.split('```json')[1].split('```')[0].trim();
    } else if (jsonText.includes('```')) {
      jsonText = jsonText.split('```')[1].split('```')[0].trim();
    }
    
    // Remove any leading/trailing non-JSON text
    const jsonStart = jsonText.indexOf('{');
    const jsonEnd = jsonText.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error('No valid JSON found in AI response');
    }
    
    jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
    
    try {
      return JSON.parse(jsonText);
    } catch (parseError) {
      throw new Error(`Failed to parse JSON: ${parseError.message}. Response: ${jsonText.substring(0, 200)}`);
    }
  }

  /**
   * Validates the AI response structure
   * Ensures all required fields are present and properly formatted
   */
  _validateResponse(data) {
    const requiredFields = {
      matchScore: 'number',
      missingSkills: 'object',
      scoreExplanation: 'object',
      resumeImprovements: 'object',
      coverLetter: 'string',
      interviewQuestions: 'object'
    };

    for (const [field, type] of Object.entries(requiredFields)) {
      if (!(field in data)) {
        throw new Error(`Missing required field: ${field}`);
      }
      
      if (type === 'number' && typeof data[field] !== 'number') {
        throw new Error(`Field ${field} must be a number`);
      }
      
      if (type === 'string' && typeof data[field] !== 'string') {
        throw new Error(`Field ${field} must be a string`);
      }
      
      if (type === 'object' && !Array.isArray(data[field])) {
        throw new Error(`Field ${field} must be an array`);
      }
    }

    // Validate specific constraints
    if (data.matchScore < 0 || data.matchScore > 100) {
      throw new Error('matchScore must be between 0 and 100');
    }

    if (!Array.isArray(data.resumeImprovements) || data.resumeImprovements.length !== 3) {
      throw new Error('resumeImprovements must contain exactly 3 items');
    }

    if (!Array.isArray(data.interviewQuestions) || data.interviewQuestions.length !== 5) {
      throw new Error('interviewQuestions must contain exactly 5 items');
    }

    if (!Array.isArray(data.scoreExplanation) || data.scoreExplanation.length < 2 || data.scoreExplanation.length > 3) {
      throw new Error('scoreExplanation must contain 2-3 items');
    }

    return true;
  }

  /**
   * Main method to analyze resume against job description
   * Returns structured analysis with all required fields
   */
  async analyzeResume(resumeText, jobDescription) {
    // Initialize model if not already done
    if (!this.model) {
      await this._initializeModel();
    }

    try {
      // Validate inputs
      if (!resumeText || resumeText.trim().length === 0) {
        throw new Error('Resume text cannot be empty');
      }

      if (!jobDescription || jobDescription.trim().length === 0) {
        throw new Error('Job description cannot be empty');
      }

      // Truncate inputs if too long (Gemini has token limits)
      const maxLength = 15000; // Conservative limit
      const truncatedResume = resumeText.length > maxLength 
        ? resumeText.substring(0, maxLength) + '... [truncated]'
        : resumeText;
      
      const truncatedJobDesc = jobDescription.length > maxLength
        ? jobDescription.substring(0, maxLength) + '... [truncated]'
        : jobDescription;

      // Build prompt
      const prompt = this._buildAnalysisPrompt(truncatedResume, truncatedJobDesc);

      // Call Gemini API
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Extract and parse JSON
      const analysis = this._extractJSON(text);

      // Validate response structure
      this._validateResponse(analysis);

      // Round match score to integer
      analysis.matchScore = Math.round(analysis.matchScore);

      return analysis;

    } catch (error) {
      // Enhance error messages for better debugging
      if (error.message.includes('API_KEY')) {
        throw new Error('Invalid or missing Gemini API key. Check your .env file.');
      }
      
      if (error.message.includes('quota') || error.message.includes('rate limit')) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      // Provide helpful error message for model not found errors
      if (error.message.includes('404') || error.message.includes('not found')) {
        // Try to reinitialize with a different model
        this.model = null;
        try {
          await this._initializeModel();
          // Retry the request with the new model
          const result = await this.model.generateContent(this._buildAnalysisPrompt(
            resumeText.length > 15000 ? resumeText.substring(0, 15000) + '... [truncated]' : resumeText,
            jobDescription.length > 15000 ? jobDescription.substring(0, 15000) + '... [truncated]' : jobDescription
          ));
          const response = await result.response;
          const text = response.text();
          const analysis = this._extractJSON(text);
          this._validateResponse(analysis);
          analysis.matchScore = Math.round(analysis.matchScore);
          return analysis;
        } catch (retryError) {
          // If retry also fails, provide detailed error
          const availableModels = await this.listAvailableModels();
          const modelList = availableModels.length > 0 
            ? availableModels.map(m => m.name).join(', ')
            : 'Unable to list models. Check your API key.';
          
          throw new Error(
            `Model "${this.modelName}" is not available. ` +
            `Available models: ${modelList}. ` +
            `Try setting GEMINI_MODEL in your .env file. ` +
            `Original error: ${error.message}`
          );
        }
      }

      throw new Error(`AI analysis failed: ${error.message}`);
    }
  }
}

module.exports = new AIService();

