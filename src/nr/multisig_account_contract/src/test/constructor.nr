use crate::test::utils;
use crate::MultisigAccount;
use aztec::test::helpers::test_environment::TestEnvironment;

#[test]
unconstrained fn test_utils_compile_and_import() {
    // Verify we can call test utility functions
    let signers = utils::create_test_signers(2);
    assert(!signers[0].is_infinite, "Signer 1 should not be infinite");
    assert(!signers[1].is_infinite, "Signer 2 should not be infinite");
    assert(signers[2].is_infinite, "Signer 3 should be infinite (not used)");
}

/// Test valid 2-of-3 multisig deployment
#[test]
unconstrained fn test_deploy_valid_2_of_3() {
    // Should successfully deploy a 2-of-3 multisig
    let (_env, contract_address, _owner) = utils::setup_multisig(2, 3);

    // Contract should be deployed (non-zero address)
    assert(!contract_address.is_zero(), "Contract should be deployed");
}

/// Test valid 1-of-1 multisig deployment (single signer)
#[test]
unconstrained fn test_deploy_valid_1_of_1() {
    let (_env, contract_address, _owner) = utils::setup_multisig(1, 1);
    assert(!contract_address.is_zero(), "Contract should be deployed");
}

/// Test valid 3-of-3 multisig deployment (all signers required)
#[test]
unconstrained fn test_deploy_valid_3_of_3() {
    let (_env, contract_address, _owner) = utils::setup_multisig(3, 3);
    assert(!contract_address.is_zero(), "Contract should be deployed");
}

/// Test that zero threshold is rejected
#[test(should_fail_with = "Threshold must be greater than 0")]
unconstrained fn test_reject_zero_threshold() {
    let _ = utils::setup_multisig(0, 2);
}

/// Test that threshold exceeding signer count is rejected
#[test(should_fail_with = "Threshold cannot exceed signer count")]
unconstrained fn test_reject_threshold_exceeds_signers() {
    let _ = utils::setup_multisig(3, 2);
}

/// Test that too many signers (exceeding MAX_SIGNERS) is rejected
#[test(should_fail_with = "Too many signers")]
unconstrained fn test_reject_too_many_signers() {
    // MAX_SIGNERS is 3, so signer_count of 4 should fail
    let mut env = TestEnvironment::new();

    // Warmup deployment to increment counter (see setup_multisig for details)
    let _ = env.deploy("MultisigAccount").without_initializer();

    let owner = env.create_light_account();

    // Create signers array (will still only have 3 entries due to array size)
    let signers = utils::create_test_signers(3);

    // Try to deploy with signer_count = 4 (exceeds MAX_SIGNERS)
    let initializer = MultisigAccount::interface().constructor(
        2, // threshold
        signers,
        4, // signer_count > MAX_SIGNERS (3)
    );

    // Deploy using standard pattern - should fail in constructor validation
    let _ = env.deploy("MultisigAccount").with_private_initializer(owner, initializer);
}
