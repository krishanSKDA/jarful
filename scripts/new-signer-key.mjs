// Generates a P-256 signer key for True Markets Gateway wallets.
//   node scripts/new-signer-key.mjs
// Store the private key as TM_SIGNER_PRIVATE_KEY. Keep a backup: users are
// permanently bound to the signer key they were created with.
import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
console.log(`TM_SIGNER_PRIVATE_KEY=${ecdh.getPrivateKey("hex").padStart(64, "0")}`);
console.log(`# public key (for reference): ${ecdh.getPublicKey("hex", "compressed")}`);
