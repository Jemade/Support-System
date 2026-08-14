const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 9143;

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`[Avantis Support Portal] Running at http://localhost:${PORT}`);
});
