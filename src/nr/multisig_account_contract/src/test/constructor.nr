use crate::test::utils;

#[test]
unconstrained fn test_utils_compile_and_import() {
    // Verify we can call test utility functions
    let signers = utils::create_test_signers(2);
    assert(!signers[0].is_infinite, "Signer 1 should not be infinite");
    assert(!signers[1].is_infinite, "Signer 2 should not be infinite");
    assert(signers[2].is_infinite, "Signer 3 should be infinite (not used)");
}
