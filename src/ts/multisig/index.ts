/**
 * The multisig module provides an M-of-N multisig account contract implementation
 * for Aztec. This allows multiple signers to collectively control an account,
 * requiring a threshold number of signatures to authorize transactions.
 *
 * @packageDocumentation
 */

import { type Salt, getAccountContractAddress } from "@aztec/aztec.js/account";
import { AccountManager, type Wallet } from "@aztec/aztec.js/wallet";
import { Fr } from "@aztec/foundation/curves/bn254";
import { GrumpkinScalar } from "@aztec/foundation/curves/grumpkin";
import { AztecAddress } from "@aztec/stdlib/aztec-address";

import {
  MultisigAccountContract,
  MultisigAuthWitnessProvider,
  MultisigAccountContractArtifact,
  type MultisigConfig,
  type MultisigSigner,
  MAX_SIGNERS,
  createSignerFromPrivateKey,
} from "./account_contract.js";

// Re-export all types and classes
export {
  MultisigAccountContract,
  MultisigAuthWitnessProvider,
  MultisigAccountContractArtifact,
  type MultisigConfig,
  type MultisigSigner,
  MAX_SIGNERS,
  createSignerFromPrivateKey,
};

// Re-export useful types from dependencies for convenience
export { Fr, GrumpkinScalar, type Salt };

/**
 * Creates an Account Manager for a multisig account.
 *
 * @param wallet - A wallet instance (e.g., TestWallet).
 * @param secretKey - Secret key used to derive all the keystore keys for this account.
 * @param config - The multisig configuration (threshold and signers).
 * @param signingPrivateKeys - The signing private keys available to this instance.
 *                             Must include at least `threshold` keys matching signers.
 * @param salt - Optional deployment salt for deterministic address generation.
 * @returns An account manager initialized with the multisig contract and its deployment params.
 *
 * @example
 * ```typescript
 * // Create a 2-of-3 multisig
 * const signers = await Promise.all([
 *   createSignerFromPrivateKey(privateKey1),
 *   createSignerFromPrivateKey(privateKey2),
 *   createSignerFromPrivateKey(privateKey3),
 * ]);
 *
 * const config: MultisigConfig = {
 *   threshold: 2,
 *   signers,
 * };
 *
 * // This instance has keys for signers 1 and 2
 * const account = await getMultisigAccount(wallet, secretKey, config, [privateKey1, privateKey2]);
 * const deployedWallet = await account.deploy().send().wait().then(() => account.getWallet());
 * ```
 */
export function getMultisigAccount(
  wallet: Wallet,
  secretKey: Fr,
  config: MultisigConfig,
  signingPrivateKeys: GrumpkinScalar[],
  salt?: Salt,
): Promise<AccountManager> {
  return AccountManager.create(
    wallet,
    secretKey,
    new MultisigAccountContract(config, signingPrivateKeys),
    salt,
  );
}

/**
 * Computes the address of a multisig account contract without deploying it.
 *
 * @param secretKey - A seed for deriving the public keys.
 * @param salt - The contract address salt.
 * @param config - The multisig configuration.
 * @param signingPrivateKeys - The signing private keys (only used to create the account contract instance).
 * @returns The computed address for this multisig configuration.
 */
export async function getMultisigAccountContractAddress(
  secretKey: Fr,
  salt: Fr,
  config: MultisigConfig,
  signingPrivateKeys: GrumpkinScalar[],
): Promise<AztecAddress> {
  const accountContract = new MultisigAccountContract(
    config,
    signingPrivateKeys,
  );
  return await getAccountContractAddress(accountContract, secretKey, salt);
}
