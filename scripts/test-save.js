
const path = require('path');
const firebaseService = require('../services/firebaseService');
const admin = require('firebase-admin');

// Mock admin functionality for the test script only if not initialized
// We are importing the service which initializes admin, but we need to ensure 
// we can test the save logic without a full server run if possible, 
// OR we rely on the service's internal init. 
// Given the service initializes on require, we should be good if creds exist.

async function verifyPersistence() {
    console.log('🧪 Starting Persistence Verification...');

    // 1. Verify Authentication Enforcement
    console.log('\n[1/3] Testing Anonymous Save (Should Fail)...');
    const resultAnonymous = await firebaseService.saveAnalysis({
        matchScore: 0,
        missingSkills: [],
        scoreExplanation: ['Test'],
        resumeImprovements: [],
        coverLetter: 'Test',
        interviewQuestions: []
    }, null);

    if (resultAnonymous === null) {
        console.log('✅ Anonymous save correctly rejected.');
    } else {
        console.error('❌ Anonymous save SHOULD have failed but returned ID:', resultAnonymous);
        process.exit(1);
    }

    // 2. Verify Authenticated Save
    console.log('\n[2/3] Testing Authenticated Save...');
    const testUserId = 'test-user-' + Date.now();
    const testData = {
        matchScore: 88,
        missingSkills: ['Time Travel'],
        scoreExplanation: ['Good resume', 'Needs more flux capacitor'],
        resumeImprovements: ['Add date', 'Add signature', 'Add photo'],
        coverLetter: 'Dear Hiring Manager...',
        interviewQuestions: ['Why?', 'How?', 'When?', 'Where?', 'Who?']
    };

    const savedId = await firebaseService.saveAnalysis(testData, testUserId);

    if (savedId) {
        console.log(`✅ Save successful! Doc ID: ${savedId}`);
    } else {
        // Attempting to debug why null was returned - likely logged in services logic
        console.error('❌ Save failed: saveAnalysis returned null. Check stdout for service error logs.');
        process.exit(1);
    }

    // 3. Verify Read Back
    console.log('\n[3/3] Verifying Read Consistency...');
    const userAnalyses = await firebaseService.getAnalysesByUserId(testUserId);

    const found = userAnalyses.find(a => a.id === savedId);

    if (found) {
        console.log('✅ Successfully retrieved saved analysis from user scope.');
        console.log('   Retrieved Data Match Score:', found.matchScore);

        // Cleanup
        console.log('\n🧹 Cleaning up test data...');
        // Note: Deleting is hard without direct admin access in this script context 
        // unless we use the same db instance.
        try {
            await firebaseService.db.collection('users').doc(testUserId).collection('analyses').doc(savedId).delete();
            console.log('   Test document deleted.');
        } catch (e) {
            console.warn('   Cleanup failed (non-critical):', e.message);
        }
    } else {
        console.error('❌ Could not find the saved analysis in user query.');
        console.error('   Returned items:', userAnalyses.length);
        process.exit(1);
    }

    console.log('\n🎉 ALL CHECKS PASSED!');
    process.exit(0);
}

verifyPersistence().catch(err => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
});
