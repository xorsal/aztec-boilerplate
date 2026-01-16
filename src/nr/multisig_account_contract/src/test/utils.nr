use crate::MultisigAccount;
use aztec::{
    protocol_types::address::AztecAddress,
    test::helpers::test_environment::TestEnvironment,
};
use std::embedded_curve_ops::EmbeddedCurvePoint;

/// Test keypairs - these are deterministic keys derived from simple secrets.
/// In a real implementation, these would be actual Grumpkin curve points.
/// For testing, we use well-known test points.

/// Test public key 1 (derived from secret = 1)
/// These are Grumpkin curve generator point coordinates
pub fn test_pubkey_1() -> EmbeddedCurvePoint {
    // Using the Grumpkin generator point as test key 1
    EmbeddedCurvePoint {
        x: 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd3,
        y: 0x1a76dae6d3272396d0cbe61fced2bc532edac647851e3ac53ce1cc9c7e645a83,
        is_infinite: false,
    }
}

/// Test public key 2 (different deterministic point)
pub fn test_pubkey_2() -> EmbeddedCurvePoint {
    // Different test key - values chosen to be within BN254 field
    EmbeddedCurvePoint {
        x: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde,
        y: 0x0edcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321,
        is_infinite: false,
    }
}

/// Test public key 3 (different deterministic point)
pub fn test_pubkey_3() -> EmbeddedCurvePoint {
    // Different test key - values chosen to be within BN254 field
    EmbeddedCurvePoint {
        x: 0x0222222222222222222222222222222222222222222222222222222222222222,
        y: 0x0333333333333333333333333333333333333333333333333333333333333333,
        is_infinite: false,
    }
}

/// Create an array of test signers with the specified count
pub fn create_test_signers(count: u8) -> [EmbeddedCurvePoint; 3] {
    let mut signers: [EmbeddedCurvePoint; 3] = [
        EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true },
        EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true },
        EmbeddedCurvePoint { x: 0, y: 0, is_infinite: true },
    ];

    if count >= 1 {
        signers[0] = test_pubkey_1();
    }
    if count >= 2 {
        signers[1] = test_pubkey_2();
    }
    if count >= 3 {
        signers[2] = test_pubkey_3();
    }

    signers
}

/// Setup the test environment and deploy a multisig contract
///
/// # Arguments
/// * `threshold` - The threshold required for authorization
/// * `signer_count` - Number of signers to initialize
///
/// # Returns
/// Tuple of (env, contract_address, owner)
pub unconstrained fn setup_multisig(
    threshold: u8,
    signer_count: u8,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    // The contract deployment counter starts at 0, but TXE only registers keys
    // for contracts with non-zero secrets. We do a "warmup" deployment with
    // without_initializer() to increment the counter, so the real deployment
    // gets a non-zero secret and has keys registered.
    let _ = env.deploy("MultisigAccount").without_initializer();

    let owner = env.create_light_account();

    let contract_address = deploy_multisig(&mut env, owner, threshold, signer_count);

    (&mut env, contract_address, owner)
}

/// Deploy a multisig contract with the given configuration
///
/// # Arguments
/// * `env` - The test environment
/// * `owner` - The deployer/owner address
/// * `threshold` - The threshold required for authorization
/// * `signer_count` - Number of signers to initialize
///
/// # Returns
/// The deployed contract address
pub unconstrained fn deploy_multisig(
    env: &mut TestEnvironment,
    owner: AztecAddress,
    threshold: u8,
    signer_count: u8,
) -> AztecAddress {
    let signers = create_test_signers(signer_count);

    let initializer = MultisigAccount::interface().constructor(
        threshold,
        signers,
        signer_count,
    );

    // Deploy using the standard pattern - env.deploy() automatically assigns
    // a unique secret for key derivation for the contract address
    env.deploy("MultisigAccount").with_private_initializer(owner, initializer)
}

/// Create an empty/invalid signature array (all zeros)
/// Useful for testing edge cases or when signatures aren't validated
pub fn empty_signatures() -> [Field; 192] {
    [0; 192]
}
