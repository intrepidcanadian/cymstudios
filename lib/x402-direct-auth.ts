/**
 * Direct-strategy payment authentication.
 *
 * The EIP-3009 strategy is self-authenticating: the authorization is signed, and
 * the token contract verifies that signature on-chain, so a payload naming
 * someone else's address simply reverts.
 *
 * The `direct` strategy has no such property. It settles with
 * `transferFrom(from, facilitator, value)` against a pre-existing allowance, and
 * `from` is just a field in a JSON payload. Without a signature, anyone who
 * knows an address holding a live allowance to the facilitator can spend it —
 * buying themselves a gift card funded by someone else's wallet.
 *
 * So `direct` payloads must carry an EIP-191 signature over the canonical
 * message below, proving control of `from`, plus a single-use nonce (recorded in
 * `used_nonces`) so a captured payload cannot be replayed.
 *
 * Both client and server MUST build the message through this function — a
 * mismatch in field order or casing silently fails every payment.
 */

export interface DirectAuthParams {
  /** Payer address */
  from: string;
  /** Facilitator address receiving the transfer */
  to: string;
  /** Atomic token amount */
  value: string;
  /** Chain the transfer settles on */
  chainId: number;
  /** Token contract */
  token: string;
  /** Client-generated 32-byte hex nonce, single-use */
  nonce: string;
}

/**
 * Canonical message signed by the payer. Binds the payment to a specific payer,
 * recipient, amount, chain, and token, so a signature captured for one payment
 * cannot be reused for a different one.
 */
export function buildDirectAuthMessage(p: DirectAuthParams): string {
  return [
    'CymStudio x402 direct payment',
    `from: ${p.from.toLowerCase()}`,
    `to: ${p.to.toLowerCase()}`,
    `value: ${p.value}`,
    `chainId: ${p.chainId}`,
    `token: ${p.token.toLowerCase()}`,
    `nonce: ${p.nonce.toLowerCase()}`,
  ].join('\n');
}
