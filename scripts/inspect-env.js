const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    console.log('--- BEGIN .ENV CONTENT ---');
    content.split('\n').forEach((line, i) => {
        console.log(`Line ${i + 1}: [${line.trim()}]`);
    });
    console.log('--- END .ENV CONTENT ---');
} else {
    console.log('.env file not found');
}
