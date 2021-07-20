let startBlock;
let totalGasUsage = 0;
let describes = {}

export async function startGasUsage() {
  startBlock = await web3.eth.getBlockNumber();
}

export async function endGasUsage() {
  const endBlock = await web3.eth.getBlockNumber();

  const describeName = this.currentTest.parent.title;
  const testName = this.currentTest.title;
  let gasUsed = 0;

  if (!describes.hasOwnProperty(describeName)) {
    describes[describeName] = {
      name: describeName,
      gasUsed: 0,
      tests: []
    }
  }

  // Loop through all blocks since test started and sum gasUsed on transactions
  for (let i = startBlock + 1; i <= endBlock; i++){
    const block = await web3.eth.getBlock(i);
    gasUsed += block.gasUsed;
  }

  totalGasUsage += gasUsed;
  describes[describeName].gasUsed += gasUsed;
  describes[describeName].tests.push({
    name: testName,
    gasUsed: gasUsed
  })
}

export async function printGasUsage() {
  console.log('  Gas Usage: \x1b[31m(' + totalGasUsage + ' gas)\u001b[00m');
  for (const describe of Object.values(describes)) {
    console.log('    ' + describe.name + ' \x1b[31m(' + describe.gasUsed + ' gas)\u001b[00m');
    for (const test of describe.tests){
      console.log('      ' + test.name + ' \x1b[31m(' + test.gasUsed + ' gas)\u001b[00m');
    }
  }
}