import { getDb, getSetting } from './db.js';
getDb();
console.log(getSetting('api_token'));
