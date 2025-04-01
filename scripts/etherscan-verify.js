import { EtherscanVerifier } from '../test/_helpers/verify';
import fs from 'fs';
import path from 'path';

const preamble = process.env.PREAMBLE || null;
const etherscanApiKey = process.env.ETHERSCAN_API_KEY || null;
const deployment = process.env.DEPLOYMENT || 'latest';

async function verify() {
  const deploymentData = JSON.parse(fs.readFileSync('deployments' + path.sep + deployment + '.json').toString('utf-8'));
  const chain = deploymentData.chain;

  console.log(`Chain: ${chain}`);
  console.log('\n');

  // Verify all deployed contracts
  const verifierOpts = {
    chain: chain,
    preamble: preamble !== null ? fs.readFileSync(process.cwd() + path.sep + preamble, 'utf8') : '',
    apiKey: etherscanApiKey,
  };
  const verifier = new EtherscanVerifier(deploymentData.buildInfos, verifierOpts);
  const verificationResults = await verifier.verifyAll(deploymentData.verification);

  console.log();
  console.log('# Verification results');
  console.log();

  for (const contract in verificationResults) {
    const guid = verificationResults[contract];
    if (guid === null) {
      console.log(`  - ${contract}: Failed to submit`);
    } else if (guid === undefined) {
      console.log(`  - ${contract}: Already verified`);
    } else {
      const status = await verifier.getVerificationStatus(verificationResults[contract]);
      console.log(`  - ${contract}: ${status.result}`);
    }
  }
}

verify().then(() => process.exit());

