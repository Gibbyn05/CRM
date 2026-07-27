import { randomBytes } from "crypto";

// Genererer en kryptografisk sikker, url-trygg bærer-token for
// signeringslenker (/sign/[token]). 32 tilfeldige byte -> 43 tegn base64url;
// uforutsigbar nok til at den fungerer som eneste hemmelighet i lenken, og
// unik nok til at contracts_signing_token_idx i praksis aldri kolliderer.
export function generateSigningToken(): string {
  return randomBytes(32).toString("base64url");
}
