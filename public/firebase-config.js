/**
 * Firebase Configuration
 * 
 * To enable Firebase Authentication:
 * 1. Go to Firebase Console (https://console.firebase.google.com/)
 * 2. Create a new project or select existing one
 * 3. Enable Authentication > Sign-in method > Email/Password
 * 4. Go to Project Settings > General > Your apps > Web app
 * 5. Copy the config object and paste it below
 * 
 * Example:
 * {
 *   apiKey: "your-api-key",
 *   authDomain: "your-project.firebaseapp.com",
 *   projectId: "your-project-id",
 *   storageBucket: "your-project.appspot.com",
 *   messagingSenderId: "123456789",
 *   appId: "your-app-id"
 * }
 */

const firebaseConfig = {
  apiKey: "AIzaSyDyOmIzoemzKqEAdWfJdZZrDrGYUTPzXNo",
  authDomain: "project-9ff34.firebaseapp.com",
  projectId: "project-9ff34",
  storageBucket: "project-9ff34.firebasestorage.app",
  messagingSenderId: "113020307334",
  appId: "1:113020307334:web:ac0e311fc2fbde41a78e07",
  measurementId: "G-WVTC5B6RXF"
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = firebaseConfig;
}

