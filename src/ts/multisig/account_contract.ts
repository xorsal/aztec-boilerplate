import type {
  AccountContract,
  AccountInterface,
  AuthWitnessProvider,
  ChainInfo,
} from "@aztec/aztec.js/account";
import { Schnorr } from "@aztec/foundation/crypto/schnorr";
import { Fr } from "@aztec/foundation/curves/bn254";
import { GrumpkinScalar, Point } from "@aztec/foundation/curves/grumpkin";
import type { ContractArtifact } from "@aztec/stdlib/abi";
import { loadContractArtifact } from "@aztec/stdlib/abi";
import { AuthWitness } from "@aztec/stdlib/auth-witness";
import type { CompleteAddress } from "@aztec/stdlib/contract";
import type { NoirCompiledContract } from "@aztec/stdlib/noir";

import { DefaultAccountInterface } from "@aztec/accounts/defaults";

import MultisigAccountContractArtifactJson from "../../../target/multisig_account_contract-MultisigAccount.json" with { type: "json" };

/**
 * The loaded contract artifact for the multisig account contract.
 */
export const MultisigAccountContractArtifact = loadContractArtifact(
  MultisigAccountContractArtifactJson as NoirCompiledContract,
);

/**
 * Maximum number of signers supported by the multisig contract.
 * This must match MAX_SIGNERS in the Noir contract.
 */
export const MAX_SIGNERS = 3;

/**
 * Represents a signer with their public key.
 */
export interface MultisigSigner {
  /** The signer's Schnorr public key */
  publicKey: Point;
}

/**
 * Configuration for deploying a multisig account contract.
 */
export interface MultisigConfig {
  /** The number of signatures required for authorization (M in M-of-N) */
  threshold: number;
  /** The signers' public keys */
  signers: MultisigSigner[];
}

/**
 * Account contract for M-of-N multisig authorization.
 *
 * This contract requires threshold signatures from a set of signers to authorize
 * transactions. Unlike the Schnorr account which has a single signing key, this
 * account expects the auth witness to contain concatenated signatures from
 * multiple signers.
 */
export class MultisigAccountContract implements AccountContract {
  constructor(
    /** The multisig configuration (threshold and signers) */
    private config: MultisigConfig,
    /** The signing private keys available to this instance */
    private signingPrivateKeys: GrumpkinScalar[],
  ) {
    if (config.threshold <= 0) {
      throw new Error("Threshold must be greater than 0");
    }
    if (config.threshold > config.signers.length) {
      throw new Error("Threshold cannot exceed number of signers");
    }
    if (config.signers.length > MAX_SIGNERS) {
      throw new Error(`Number of signers cannot exceed ${MAX_SIGNERS}`);
    }
  }

  /**
   * Returns the initialization function name and arguments for deploying the contract.
   */
  async getInitializationFunctionAndArgs(): Promise<{
    constructorName: string;
    constructorArgs: any[];
  }> {
    // Prepare signers array with up to MAX_SIGNERS entries
    // Unused slots are filled with infinite points
    const signerPoints = this.config.signers.map((s) => ({
      x: s.publicKey.x.toBigInt(),
      y: s.publicKey.y.toBigInt(),
      is_infinite: false,
    }));

    // Fill remaining slots with infinite points
    while (signerPoints.length < MAX_SIGNERS) {
      signerPoints.push({
        x: 0n,
        y: 0n,
        is_infinite: true,
      });
    }

    return {
      constructorName: "constructor",
      constructorArgs: [
        this.config.threshold,
        signerPoints,
        this.config.signers.length,
      ],
    };
  }

  /**
   * Returns the auth witness provider for creating authorization witnesses.
   */
  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new MultisigAuthWitnessProvider(
      this.config,
      this.signingPrivateKeys,
    );
  }

  /**
   * Returns the contract artifact.
   */
  getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(MultisigAccountContractArtifact);
  }

  /**
   * Returns the account interface for interacting with the deployed contract.
   */
  getInterface(
    address: CompleteAddress,
    chainInfo: ChainInfo,
  ): AccountInterface {
    return new DefaultAccountInterface(
      this.getAuthWitnessProvider(address),
      address,
      chainInfo,
    );
  }
}

/**
 * Creates auth witnesses for multisig accounts by combining multiple Schnorr signatures.
 *
 * The auth witness format is a concatenation of MAX_SIGNERS * 64 bytes, where each
 * 64-byte slot contains either a valid signature or zeros (unused).
 */
export class MultisigAuthWitnessProvider implements AuthWitnessProvider {
  constructor(
    private config: MultisigConfig,
    private signingPrivateKeys: GrumpkinScalar[],
  ) {}

  /**
   * Creates an auth witness by signing the message hash with all available private keys.
   *
   * The witness contains signatures in slots corresponding to signer positions.
   * If we have the private key for signer N, slot N contains their signature.
   * Empty slots contain zeros.
   */
  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    const schnorr = new Schnorr();

    // Initialize witness buffer: MAX_SIGNERS * 64 bytes (each signature is 64 bytes)
    const witnessBytes = new Array<number>(MAX_SIGNERS * 64).fill(0);

    // For each private key we have, find the corresponding signer and sign
    for (const privateKey of this.signingPrivateKeys) {
      // Compute the public key for this private key
      const publicKey = await schnorr.computePublicKey(privateKey);

      // Find which signer slot this key belongs to
      const signerIndex = this.config.signers.findIndex(
        (s) =>
          s.publicKey.x.equals(publicKey.x) &&
          s.publicKey.y.equals(publicKey.y),
      );

      if (signerIndex === -1) {
        // This private key doesn't match any signer - skip it
        continue;
      }

      // Sign the message
      const signature = await schnorr.constructSignature(
        messageHash.toBuffer(),
        privateKey,
      );
      const sigBytes = signature.toBuffer();

      // Place signature in the correct slot
      const offset = signerIndex * 64;
      for (let i = 0; i < 64; i++) {
        witnessBytes[offset + i] = sigBytes[i];
      }
    }

    // The witness is sent as an array of Field elements (one byte per field for simplicity)
    // However, the contract expects 192 Fields, so we convert appropriately
    return new AuthWitness(messageHash, witnessBytes);
  }
}

/**
 * Helper to create a MultisigSigner from a private key.
 */
export async function createSignerFromPrivateKey(
  privateKey: GrumpkinScalar,
): Promise<MultisigSigner> {
  const schnorr = new Schnorr();
  const publicKey = await schnorr.computePublicKey(privateKey);
  return { publicKey };
}
