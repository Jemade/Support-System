const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 9142;

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`[Avantis Desktop UI] Running at http://localhost:${PORT}`);
});
