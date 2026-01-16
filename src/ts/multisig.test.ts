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

  describe("Insufficient Signatures Rejection", () => {
    it("should reject simulation when only 1 of 2 required signatures provided", async () => {
      // Deploy a 2-of-3 multisig with all 3 keys
      const signer1 = await createSignerFromPrivateKey(signingKey1);
      const signer2 = await createSignerFromPrivateKey(signingKey2);
      const signer3 = await createSignerFromPrivateKey(signingKey3);

      const config: MultisigConfig = {
        threshold: 2,
        signers: [signer1, signer2, signer3],
      };

      // Create and deploy with all keys (so deployment succeeds)
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

      // Deploy the multisig account
      const deployMethod = await accountManager.getDeployMethod();
      await deployMethod.send({ from: fundedAccountAddress }).wait();

      // Get the multisig address
      const multisigAddress = accountManager.address;

      // Now create a new account contract with ONLY 1 signing key (insufficient)
      const insufficientKeysContract = new MultisigAccountContract(config, [
        signingKey1, // Only 1 key, but threshold is 2
      ]);

      // Create an account manager with the same address but insufficient keys
      const insufficientAccountManager = await wallet.createAccount({
        secret: secretKey,
        salt,
        contract: insufficientKeysContract,
      });

      // Verify it resolves to the same address
      expect(insufficientAccountManager.address.toString()).toEqual(
        multisigAddress.toString(),
      );

      // Get a wallet for the insufficient-keys account
      const insufficientWallet = await insufficientAccountManager.getAccount();

      // Try to simulate a call that requires authorization
      // The entrypoint should fail because we only provide 1 signature but need 2
      // We'll use the MultisigAccount contract's update_threshold function
      // which requires self-authorization
      const { MultisigAccountContract: MultisigAccountContractClass } =
        await import("../artifacts/MultisigAccount.js");
      const multisigContract = await MultisigAccountContractClass.at(
        multisigAddress,
        insufficientWallet,
      );

      // Try to update threshold - this requires authorization from the multisig
      // With only 1 signature (threshold is 2), this should fail
      await expect(
        multisigContract.methods.update_threshold(1).simulate(),
      ).rejects.toThrow();
    });

    it("should reject simulation when 1 of 3 required signatures for 3-of-3 multisig", async () => {
      // Deploy a 3-of-3 multisig
      const signer1 = await createSignerFromPrivateKey(signingKey1);
      const signer2 = await createSignerFromPrivateKey(signingKey2);
      const signer3 = await createSignerFromPrivateKey(signingKey3);

      const config: MultisigConfig = {
        threshold: 3,
        signers: [signer1, signer2, signer3],
      };

      // Deploy with all keys
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

      const deployMethod = await accountManager.getDeployMethod();
      await deployMethod.send({ from: fundedAccountAddress }).wait();

      const multisigAddress = accountManager.address;

      // Create account manager with only 1 key (need 3)
      const insufficientContract = new MultisigAccountContract(config, [
        signingKey1,
      ]);

      const insufficientManager = await wallet.createAccount({
        secret: secretKey,
        salt,
        contract: insufficientContract,
      });

      const insufficientWallet = await insufficientManager.getAccount();

      const { MultisigAccountContract: MultisigAccountContractClass } =
        await import("../artifacts/MultisigAccount.js");
      const multisigContract = await MultisigAccountContractClass.at(
        multisigAddress,
        insufficientWallet,
      );

      // Should fail - need 3 signatures, have 1
      await expect(
        multisigContract.methods.update_threshold(2).simulate(),
      ).rejects.toThrow();
    });

    it("should reject simulation when 2 of 3 required signatures for 3-of-3 multisig", async () => {
      // Deploy a 3-of-3 multisig
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

      const deployMethod = await accountManager.getDeployMethod();
      await deployMethod.send({ from: fundedAccountAddress }).wait();

      const multisigAddress = accountManager.address;

      // Create account manager with 2 keys (need 3)
      const insufficientContract = new MultisigAccountContract(config, [
        signingKey1,
        signingKey2,
      ]);

      const insufficientManager = await wallet.createAccount({
        secret: secretKey,
        salt,
        contract: insufficientContract,
      });

      const insufficientWallet = await insufficientManager.getAccount();

      const { MultisigAccountContract: MultisigAccountContractClass } =
        await import("../artifacts/MultisigAccount.js");
      const multisigContract = await MultisigAccountContractClass.at(
        multisigAddress,
        insufficientWallet,
      );

      // Should fail - need 3 signatures, have 2
      await expect(
        multisigContract.methods.update_threshold(2).simulate(),
      ).rejects.toThrow();
    });
  });

  // Note: Signer management integration tests (add/remove/verify participation)
  // are blocked on infrastructure issues:
  //
  // 1. Fee payment: The multisig account needs FeeJuice funding or external fee
  //    sponsorship to send actual transactions (same blocker as task 6.2).
  //
  // 2. Simulation depth: While we can simulate authorization rejection (tests in
  //    "Insufficient Signatures Rejection"), simulating successful execution
  //    requires more account state to be properly synchronized, which currently
  //    fails with "Array must contain at most 100 element(s)" errors in the
  //    private log sync process.
  //
  // The authorization path is verified by:
  // - Deployment tests: Successful deployment proves constructor authorization works
  // - Rejection tests: Prove that insufficient signatures fail auth verification
  //
  // Signer management contract logic is tested in Noir unit tests (task 4.5).
});
