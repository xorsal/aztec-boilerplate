use crate::MultisigAccount;
use crate::test::utils;

/// Signer management tests for add_signer, remove_signer, and update_threshold.
///
/// NOTE: These functions require authorization via the multisig threshold.
/// In TXE tests, we use the owner/deployer account to call these functions,
/// but the actual authorization (signature verification) happens in the
/// contract's is_valid_impl. Since TXE cannot produce multi-signature auth
/// witnesses, these tests verify:
/// 1. The function interfaces are correct
/// 2. The validation logic works (boundary conditions)
/// 3. The function call structure is properly wired
///
/// Full end-to-end authorization flow is tested in Phase 6 TypeScript tests.

// ============================================================================
// Add Signer Tests
// ============================================================================

/// Test that add_signer function exists and has correct interface.
/// We deploy a 1-of-2 multisig (room for 1 more signer) and verify
/// the add_signer function can be called.
#[test]
unconstrained fn test_add_signer_function_exists() {
    let (env, contract_address, owner) = utils::setup_multisig(1, 2);

    // Get the new signer's public key
    let new_signer = utils::test_pubkey_4();

    // Call add_signer - this exercises the function interface
    // Note: In actual use, this requires authorization from threshold signers.
    // TXE doesn't validate the auth witness for account contract calls.
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).add_signer(new_signer.x, new_signer.y),
    );

    // If we get here, the function was callable with the correct arguments
    assert(!contract_address.is_zero(), "Contract should exist after add_signer");
}

/// Test that adding a signer to a full multisig (3 signers = MAX_SIGNERS) fails.
/// This verifies the boundary condition: can't add when at MAX_SIGNERS.
#[test(should_fail_with = "Maximum signers reached")]
unconstrained fn test_add_signer_rejects_when_max_reached() {
    // Deploy with 3 signers (MAX_SIGNERS)
    let (env, contract_address, owner) = utils::setup_multisig(2, 3);

    // Try to add a 4th signer - should fail
    let new_signer = utils::test_pubkey_4();
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).add_signer(new_signer.x, new_signer.y),
    );
}

// ============================================================================
// Remove Signer Tests
// ============================================================================

/// Test that remove_signer function exists and has correct interface.
/// We deploy a 1-of-3 multisig (can remove 2 signers) and verify
/// the remove_signer function can be called.
#[test]
unconstrained fn test_remove_signer_function_exists() {
    let (env, contract_address, owner) = utils::setup_multisig(1, 3);

    // Get the signer to remove (signer 3)
    let signer_to_remove = utils::test_pubkey_3();

    // Call remove_signer - this exercises the function interface
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).remove_signer(signer_to_remove.x, signer_to_remove.y),
    );

    // If we get here, the function was callable with the correct arguments
    assert(!contract_address.is_zero(), "Contract should exist after remove_signer");
}

/// Test that removing a signer when it would go below threshold fails.
/// This verifies the boundary condition: signer_count must remain > threshold.
#[test(should_fail_with = "Cannot remove signer: would go below threshold")]
unconstrained fn test_remove_signer_rejects_below_threshold() {
    // Deploy with 2-of-2 multisig - can't remove any signers
    let (env, contract_address, owner) = utils::setup_multisig(2, 2);

    // Try to remove a signer - should fail because 2-1=1 < threshold(2)
    let signer_to_remove = utils::test_pubkey_2();
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).remove_signer(signer_to_remove.x, signer_to_remove.y),
    );
}

/// Test that removing a non-existent signer fails.
/// This verifies the validation: signer must exist to be removed.
#[test(should_fail_with = "Signer not found")]
unconstrained fn test_remove_signer_rejects_nonexistent() {
    // Deploy with 1-of-2 multisig
    let (env, contract_address, owner) = utils::setup_multisig(1, 2);

    // Try to remove a signer that was never added (pubkey_4)
    let nonexistent_signer = utils::test_pubkey_4();
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).remove_signer(nonexistent_signer.x, nonexistent_signer.y),
    );
}

// ============================================================================
// Update Threshold Tests
// ============================================================================

/// Test that update_threshold function exists and has correct interface.
/// We deploy a 2-of-3 multisig and change threshold to 1.
#[test]
unconstrained fn test_update_threshold_function_exists() {
    let (env, contract_address, owner) = utils::setup_multisig(2, 3);

    // Call update_threshold to lower threshold from 2 to 1
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).update_threshold(1),
    );

    // If we get here, the function was callable with correct arguments
    assert(!contract_address.is_zero(), "Contract should exist after update_threshold");
}

/// Test that update_threshold can increase threshold.
/// Deploy 1-of-3, change to 2-of-3.
#[test]
unconstrained fn test_update_threshold_increase() {
    let (env, contract_address, owner) = utils::setup_multisig(1, 3);

    // Increase threshold from 1 to 2
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).update_threshold(2),
    );

    assert(!contract_address.is_zero(), "Contract should exist after threshold increase");
}

/// Test that update_threshold rejects zero threshold.
#[test(should_fail_with = "Threshold must be greater than 0")]
unconstrained fn test_update_threshold_rejects_zero() {
    let (env, contract_address, owner) = utils::setup_multisig(2, 3);

    // Try to set threshold to 0 - should fail
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).update_threshold(0),
    );
}

/// Test that update_threshold rejects threshold exceeding signer count.
#[test(should_fail_with = "Threshold cannot exceed signer count")]
unconstrained fn test_update_threshold_rejects_exceeds_signers() {
    // Deploy with 2 signers
    let (env, contract_address, owner) = utils::setup_multisig(1, 2);

    // Try to set threshold to 3 (exceeds signer_count of 2)
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).update_threshold(3),
    );
}

// ============================================================================
// Combined Operations Tests
// ============================================================================

/// Test that we can add a signer then update threshold.
/// Deploy 1-of-2, add signer (now 1-of-3), update to 2-of-3.
#[test]
unconstrained fn test_add_signer_then_update_threshold() {
    let (env, contract_address, owner) = utils::setup_multisig(1, 2);

    // Add a third signer
    let new_signer = utils::test_pubkey_3();
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).add_signer(new_signer.x, new_signer.y),
    );

    // Now update threshold from 1 to 2
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).update_threshold(2),
    );

    assert(!contract_address.is_zero(), "Contract should exist after operations");
}

/// Test that we can lower threshold then remove signer.
/// Deploy 2-of-3, update to 1-of-3, remove signer (now 1-of-2).
#[test]
unconstrained fn test_update_threshold_then_remove_signer() {
    let (env, contract_address, owner) = utils::setup_multisig(2, 3);

    // Lower threshold first
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).update_threshold(1),
    );

    // Now remove a signer (signer 3)
    let signer_to_remove = utils::test_pubkey_3();
    env.call_private(
        owner,
        MultisigAccount::at(contract_address).remove_signer(signer_to_remove.x, signer_to_remove.y),
    );

    assert(!contract_address.is_zero(), "Contract should exist after operations");
}
