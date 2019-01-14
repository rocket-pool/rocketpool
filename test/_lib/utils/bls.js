const BLS = require('bls-wasm');


/**
 * creates a new BLS object with private / public key
 */

// Create a new BLS object using BLS.BLS12_381 curve 
export async function BLSNew() {
  return BLS.init(BLS.BLS12_381)
      .then(() => {
      try {
          const sec = new BLS.SecretKey();
          sec.setByCSPRNG();
          return sec;
      } catch (e) {
          console.log(`TEST FAIL ${e}`)
          assert(false)
      }
  })
}