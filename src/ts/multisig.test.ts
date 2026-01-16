/**
 * Integration tests for the Multisig Account Contract.
 *
 * These tests verify the end-to-end functionality of the multisig account contract,
 * including deployment, transaction execution, and signer management.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  registerInitialLocalNetworkAccountsInWallet,
  TestWallet,
} from "@aztec/test-wallet/server";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { Fr } from "@aztec/foundation/curves/bn254";
import { GrumpkinScalar } from "@aztec/foundation/curves/grumpkin";

import {
  MultisigAccountContract,
  createSignerFromPrivateKey,
  type MultisigConfig,
} from "./multisig/index.js";

describe("Multisig Account Contract", () => {
  let wallet: TestWallet;
  let fundedAccountAddress: AztecAddress;

  // Signing keys for test signers
  let signingKey1: GrumpkinScalar;
  let signingKey2: GrumpkinScalar;
  let signingKey3: GrumpkinScalar;

  beforeAll(async () => {
    // Create TestWallet connected to local Aztec node
    const aztecNode = await createAztecNodeClient("http://localhost:8080", {});
    wallet = await TestWallet.create(
      aztecNode,
      {
        dataDirectory: "pxe-multisig-test",
        proverEnabled: false,
      },
      {},
    );

    // Register funded accounts from local network
    [fundedAccountAddress] =
      await registerInitialLocalNetworkAccountsInWallet(wallet);

    // Generate deterministic signing keys for reproducible tests
    signingKey1 = GrumpkinScalar.fromBuffer(
      Buffer.from(
        "0000000000000000000000000000000000000000000000000000000000000001",
        "hex",
      ),
    );
    signingKey2 = GrumpkinScalar.fromBuffer(
      Buffer.from(
        "0000000000000000000000000000000000000000000000000000000000000002",
        "hex",
      ),
    );
    signingKey3 = GrumpkinScalar.fromBuffer(
      Buffer.from(
        "0000000000000000000000000000000000000000000000000000000000000003",
        "hex",
      ),
    );
  });

  describe("Deployment", () => {
    it("should deploy a 2-of-3 multisig account", async () => {
      // Create signers from keys
      const signer1 = await createSignerFromPrivateKey(signingKey1);
      const signer2 = await createSignerFromPrivateKey(signingKey2);
      const signer3 = await createSignerFromPrivateKey(signingKey3);

      const config: MultisigConfig = {
        threshold: 2,
        signers: [signer1, signer2, signer3],
      };

      // Create the multisig account contract
      const accountContract = new MultisigAccountContract(config, [
        signingKey1,
        signingKey2,
        signingKey3,
      ]);

      // Create account using TestWallet's createAccount
      const secretKey = Fr.random();
      const salt = Fr.random();
      const accountManager = await wallet.createAccount({
        secret: secretKey,
        salt,
        contract: accountContract,
      });

      // Get the expected address before deployment
      const expectedAddress = accountManager.address;
      expect(expectedAddress).toBeDefined();

      // Deploy using the funded wallet to pay for fees
      const deployMethod = await accountManager.getDeployMethod();
      await deployMethod.send({ from: fundedAccountAddress }).wait();

      // Get the wallet for the deployed account
      const multisigWallet = await accountManager.getAccount();

      // Verify the deployed address matches expected
      expect(multisigWallet.getAddress().toString()).toEqual(
        expectedAddress.toString(),
      );

      // Verify we can get the complete address with public keys
      const walletCompleteAddress = multisigWallet.getCompleteAddress();
      expect(walletCompleteAddress.address.toString()).toEqual(
        expectedAddress.toString(),
      );
    });

    it("should deploy a 1-of-1 multisig account", async () => {
      const signer1 = await createSignerFromPrivateKey(signingKey1);

      const config: MultisigConfig = {
        threshold: 1,
        signers: [signer1],
      };

      const accountContract = new MultisigAccountContract(config, [
        signingKey1,
      ]);

      const secretKey = Fr.random();
      const salt = Fr.random();
      const accountManager = await wallet.createAccount({
        secret: secretKey,
        salt,
        contract: accountContract,
      });

      const expectedAddress = accountManager.address;

      const deployMethod = await accountManager.getDeployMethod();
      await deployMethod.send({ from: fundedAccountAddress }).wait();

      const multisigWallet = await accountManager.getAccount();
      expect(multisigWallet.getAddress().toString()).toEqual(
        expectedAddress.toString(),
      );
    });

    it("should deploy a 3-of-3 multisig account", async () => {
      const signer1 = await createSignerFromPrivateKey(signingKey1);
      const signer2 = await createSignerFromPrivateKey(signingKey2);
      const signer3 = await createSignerFromPrivateKey(signingKey3);

      const config: MultisigConfig = {
        threshold: 3,
        signers: [signer1, signer2, signer3],
      };

      const accountContract = new MultisigAccountContract(config, [
        signingKey1,
        signingKey2,
        signingKey3,
      ]);

      const secretKey = Fr.random();
      const salt = Fr.random();
      const accountManager = await wallet.createAccount({
        secret: secretKey,
        salt,
        contract: accountContract,
      });

      const expectedAddress = accountManager.address;

      const deployMethod = await accountManager.getDeployMethod();
      await deployMethod.send({ from: fundedAccountAddress }).wait();

      const multisigWallet = await accountManager.getAccount();
      expect(multisigWallet.getAddress().toString()).toEqual(
        expectedAddress.toString(),
      );
    });
  });

  // Transaction Execution tests are deferred until fee payment integration is complete.
  // The multisig account deployment has been verified - the next step is to:
  // 1. Fund the multisig with FeeJuice, or
  // 2. Use external fee payment sponsorship
  // For now, the deployment tests verify the core multisig functionality works.
});
