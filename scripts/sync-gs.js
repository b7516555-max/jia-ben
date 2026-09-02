// 同步備份 code.gs
const fs = require('fs');
const content = fs.readFileSync(__dirname + '/code.gs', 'utf8');
fs.writeFileSync(__dirname + '/程式碼.js', content, 'utf8');
