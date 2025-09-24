#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function main() {
  const deployFile = path.join(__dirname, '..', 'deployments', 'sepolia', 'SafeBid.json');
  if (!fs.existsSync(deployFile)) {
    console.error('Deployment file not found:', deployFile);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(deployFile, 'utf8'));
  const address = data.address;
  const abi = data.abi;

  // Write ABI to UI
  const abiOut = path.join(__dirname, '..', 'ui', 'src', 'abi', 'SafeBid.json');
  fs.writeFileSync(abiOut, JSON.stringify(abi, null, 2));
  console.log('Wrote ABI to', abiOut);

  // Write address to UI .env
  const uiEnv = path.join(__dirname, '..', 'ui', '.env');
  const envContent = `VITE_SAFEBID_ADDRESS=${address}\n`;
  fs.writeFileSync(uiEnv, envContent);
  console.log('Wrote address to', uiEnv, address);
}

main();

