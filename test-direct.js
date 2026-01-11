
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

async function testDirect() {
    console.log('🧪 Direct Firestore Test');

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }

    const db = admin.firestore();

    try {
        console.log('Attempting write...');
        const ref = await db.collection('test-collection').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            message: 'Hello World'
        });
        console.log('✅ Write success:', ref.id);
    } catch (e) {
        console.error('❌ Write failed:', e);
    }
}

testDirect();
