const crypto = require('crypto');
const password = 'PanitSukses26';
const salt = crypto.randomBytes(16).toString('base64url');
const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
console.log('pbkdf2_sha256$100000$' + salt + '$' + hash);