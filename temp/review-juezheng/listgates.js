const fs = require('fs');
const dir = 'D:/project/2026/moliu/src/renderer/src/services/gates';
fs.readdirSync(dir).forEach(f => console.log(f));
