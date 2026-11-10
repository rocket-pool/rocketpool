# Ethereum BLS verification and deserialization vectors

`ethereum-verify-v0.1.2.json` contains all 29 files in the `verify/` directory of
the official [ethereum/bls12-381-tests v0.1.2 release](https://github.com/ethereum/bls12-381-tests/releases/tag/v0.1.2).
Each original filename (without `.json`) is a key; its JSON data is unchanged.
Only packaging and key ordering have changed.

`ethereum-deserialization_G1-v0.1.2.json` contains all 13 files from
`deserialization_G1/`; `ethereum-deserialization_G2-v0.1.2.json` contains all 15
files from `deserialization_G2/` in the same archive, packaged in the same way.
Their expected outputs have not been changed. The decoder tests intentionally
reject canonical infinity encodings for deposit verification.

Source archive:
https://github.com/ethereum/bls12-381-tests/releases/download/v0.1.2/bls_tests_json.tar.gz

Archive SHA-256:
`0dc1dfabfa7b3e0f8e8029f9cb2bb8733597526fa085b18f160d2c4eb0b448bc`

The source project's CC0 license is reproduced in `LICENSE`.

The `BLSDepositVerifier` suite tests all 29 verification vectors directly from
compressed bytes and requires the exact expected boolean, including false for
malformed inputs. Its decoder checks run all 28 deserialization vectors,
intentionally rejecting infinity for deposit verification. The pinned test-only
`@noble/curves` dependency supplies independent coordinate comparisons; official
expected results are not regenerated.

`ethereum-additional-v0.1.2.json` preserves the other 41 files in the same release,
grouped by `sign`, `aggregate`, `aggregate_verify`, `fast_aggregate_verify`,
`batch_verify` and `hash_to_G2`. Contents and expected values are unchanged.
The arithmetic/vector suite uses all 26 distinct compressed points in these
families, the nine non-null signing outputs for complete verification, and all
four hash-to-G2 coordinate outputs for exact decoding checks. A null signing
output concerns an invalid secret key and does not apply to the verifier API.
Aggregate/batch fixtures supply point coverage only; they do not imply support
for aggregate/batch signature verification.
