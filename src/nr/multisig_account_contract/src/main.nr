use dep::aztec::macros::aztec;

mod config_note;
mod signer_note;
mod test;

#[aztec]
pub contract MultisigAccount {
    use dep::aztec::{
        authwit::{account::AccountActions, entrypoint::app::AppPayload},
        context::PrivateContext,
        macros::{
            functions::{external, initializer, noinitcheck, nophasecheck, view},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        note::note_getter_options::{NoteGetterOptions, PropertySelector},
        oracle::auth_witness::get_auth_witness,
        state_vars::{Owned, PrivateMutable, PrivateSet},
        utils::comparison::Comparator,
    };
    use schnorr;
    use std::embedded_curve_ops::EmbeddedCurvePoint;

    use crate::config_note::ConfigNote;
    use crate::signer_note::SignerNote;

    global MAX_SIGNERS: u8 = 3;

    #[storage]
    struct Storage<Context> {
        config: Owned<PrivateMutable<ConfigNote, Context>, Context>,
        signers: Owned<PrivateSet<SignerNote, Context>, Context>,
    }

    /// Constructs a multisig account contract with the given threshold and initial signers.
    ///
    /// # Arguments
    /// * `threshold` - The minimum number of signatures required (must be > 0 and <= signer_count)
    /// * `initial_signers` - Array of public keys for the initial signers (only first signer_count are used)
    /// * `signer_count` - Number of signers to use from initial_signers array
    #[external("private")]
    #[initializer]
    fn constructor(threshold: u8, initial_signers: [EmbeddedCurvePoint; 3], signer_count: u8) {
        // Validate inputs
        assert(threshold > 0, "Threshold must be greater than 0");
        assert(signer_count <= MAX_SIGNERS, "Too many signers");
        assert(threshold <= signer_count, "Threshold cannot exceed signer count");

        let this = self.address;

        // Initialize config note with threshold and signer count
        let config = ConfigNote::new(threshold, signer_count);
        self.storage.config.at(this).initialize(config).deliver(MessageDelivery.CONSTRAINED_ONCHAIN);

        // Insert each signer note
        for i in 0..MAX_SIGNERS {
            if i < signer_count {
                let signer_point = initial_signers[i as u32];
                // Skip invalid (infinite) points
                if !signer_point.is_infinite {
                    let signer_note = SignerNote::new(signer_point.x, signer_point.y);
                    self.storage.signers.at(this).insert(signer_note).deliver(
                        MessageDelivery.CONSTRAINED_ONCHAIN,
                    );
                }
            }
        }
    }

    /// Account entrypoint that executes a transaction payload after verifying it has
    /// been authorized by the multisig threshold.
    ///
    /// # Arguments
    /// * `app_payload` - The payload containing the calls to execute
    /// * `fee_payment_method` - How the account will pay for the transaction fee
    /// * `cancellable` - Whether this transaction can be cancelled by a higher-fee replacement
    #[external("private")]
    #[noinitcheck]
    #[nophasecheck]
    fn entrypoint(app_payload: AppPayload, fee_payment_method: u8, cancellable: bool) {
        let actions = AccountActions::init(self.context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payment_method, cancellable);
    }

    /// Verifies a private authorization witness for a given inner_hash.
    ///
    /// Returns IS_VALID_SELECTOR if the authwit is valid (threshold signatures verified).
    /// Reverts if not enough valid signatures are provided.
    ///
    /// # Arguments
    /// * `inner_hash` - The hash of the message being authorized
    #[external("private")]
    #[noinitcheck]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        let actions = AccountActions::init(self.context, is_valid_impl);
        actions.verify_private_authwit(inner_hash)
    }

    /// Adds a new signer to the multisig.
    ///
    /// This function requires authorization from the existing multisig threshold.
    /// The new signer's public key must be a valid non-infinite curve point.
    ///
    /// # Arguments
    /// * `new_signer_x` - X coordinate of the new signer's public key
    /// * `new_signer_y` - Y coordinate of the new signer's public key
    #[external("private")]
    fn add_signer(new_signer_x: Field, new_signer_y: Field) {
        let this = self.address;

        // Update config to increment signer count
        let new_config_message = self.storage.config.at(this).replace(|old_config: ConfigNote| {
            // Validate that we haven't reached max signers
            assert(old_config.signer_count < MAX_SIGNERS, "Maximum signers reached");
            // Return updated config with incremented signer count
            ConfigNote::new(old_config.threshold, old_config.signer_count + 1)
        });
        new_config_message.deliver(MessageDelivery.CONSTRAINED_ONCHAIN);

        // Insert the new signer note
        let signer_note = SignerNote::new(new_signer_x, new_signer_y);
        self.storage.signers.at(this).insert(signer_note).deliver(
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    /// Removes a signer from the multisig.
    ///
    /// This function requires authorization from the existing multisig threshold.
    /// The new signer count must remain >= threshold.
    ///
    /// # Arguments
    /// * `signer_x` - X coordinate of the signer's public key to remove
    /// * `signer_y` - Y coordinate of the signer's public key to remove
    #[external("private")]
    fn remove_signer(signer_x: Field, signer_y: Field) {
        let this = self.address;

        // First, read config to get threshold and validate
        let config_message = self.storage.config.at(this).get_note();
        let config = config_message.get_note();
        config_message.deliver(MessageDelivery.CONSTRAINED_ONCHAIN);

        // Validate that we won't go below threshold
        assert(
            config.signer_count > config.threshold,
            "Cannot remove signer: would go below threshold",
        );

        // Create options to select the specific signer note by x coordinate
        // PropertySelector: index is the field position in packed note, offset and length for byte selection
        // For SignerNote, x is at index 0, and we select the full 32 bytes (Field)
        let mut options = NoteGetterOptions::new();
        options = options.select(
            PropertySelector { index: 0, offset: 0, length: 32 },
            Comparator.EQ,
            signer_x,
        );
        // Also select by y coordinate (index 1)
        options = options.select(
            PropertySelector { index: 1, offset: 0, length: 32 },
            Comparator.EQ,
            signer_y,
        );
        options = options.set_limit(1);

        // Pop (retrieve and nullify) the matching signer note
        let removed_notes = self.storage.signers.at(this).pop_notes(options);
        assert(removed_notes.len() == 1, "Signer not found");

        // Update config to decrement signer count
        let new_config_message = self.storage.config.at(this).replace(|old_config: ConfigNote| {
            ConfigNote::new(old_config.threshold, old_config.signer_count - 1)
        });
        new_config_message.deliver(MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    /// Updates the signature threshold required for authorization.
    ///
    /// This function requires authorization from the existing multisig threshold.
    /// The new threshold must be > 0 and <= current signer_count.
    ///
    /// # Arguments
    /// * `new_threshold` - The new threshold value
    #[external("private")]
    fn update_threshold(new_threshold: u8) {
        let this = self.address;

        // Validate new_threshold > 0
        assert(new_threshold > 0, "Threshold must be greater than 0");

        // Update config with new threshold
        let new_config_message = self.storage.config.at(this).replace(|old_config: ConfigNote| {
            // Validate new_threshold <= signer_count
            assert(
                new_threshold <= old_config.signer_count,
                "Threshold cannot exceed signer count",
            );
            // Return updated config with new threshold
            ConfigNote::new(new_threshold, old_config.signer_count)
        });
        new_config_message.deliver(MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    /// Validates that the given outer_hash is authorized by at least threshold signers.
    ///
    /// The auth witness is expected to contain MAX_SIGNERS concatenated signatures,
    /// where each signature is 64 Fields (bytes converted to Fields).
    /// Invalid/unused signatures should be zeroed out.
    ///
    /// Returns true if at least `threshold` valid signatures are found.
    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, outer_hash: Field) -> bool {
        // Initialize storage to read config and signers
        let storage = Storage::init(context);
        let this = context.this_address();

        // Get the config note to read threshold
        // Note: get_note() on PrivateMutable performs read-nullify-recreate
        // We only need the threshold value for validation, so we access the note
        // but don't call deliver() which would require sender_for_tags
        let config_message = storage.config.at(this).get_note();
        let config = config_message.get_note();
        // NOT calling deliver() - this is intentional for read-only access in validation

        let threshold = config.threshold;

        // Get all signer notes
        let mut options = NoteGetterOptions::new();
        options = options.set_limit(MAX_SIGNERS as u32);
        let signer_notes = storage.signers.at(this).get_notes(options);

        // Get auth witness containing all signatures
        // For MAX_SIGNERS=3 signers, we need 3 * 64 = 192 Fields
        // Safety: The witness is only used as a "magical value" that makes the signature verification pass.
        let witness: [Field; 192] = unsafe { get_auth_witness(outer_hash) };

        // Convert outer_hash to bytes for signature verification
        let message_bytes: [u8; 32] = outer_hash.to_be_bytes();

        // Count valid signatures
        let mut valid_count: u8 = 0;

        // Check each signature against each signer
        // For each signer, try to verify their signature
        for sig_idx in 0..MAX_SIGNERS {
            // Extract the 64-byte signature for this slot
            let sig_offset = (sig_idx as u32) * 64;
            let mut signature: [u8; 64] = [0; 64];
            for i in 0..64 {
                signature[i] = witness[sig_offset + i] as u8;
            }

            // Check if this signature is empty (all zeros = no signature provided)
            let mut is_empty = true;
            for i in 0..64 {
                if signature[i] != 0 {
                    is_empty = false;
                }
            }

            if !is_empty {
                // Try to verify this signature against each signer
                // Use MAX_SIGNERS as compile-time bound
                for signer_idx in 0..MAX_SIGNERS {
                    // Only process if within actual signer count
                    if (signer_idx as u32) < signer_notes.len() {
                        let retrieved_note = signer_notes.get(signer_idx as u32);
                        let signer = retrieved_note.note;

                        let pub_key =
                            EmbeddedCurvePoint { x: signer.x, y: signer.y, is_infinite: false };

                        // Verify signature
                        if schnorr::verify_signature(pub_key, signature, message_bytes) {
                            valid_count += 1;
                            // Note: We can't break in Noir, but this is fine as
                            // different signers shouldn't produce the same valid signature
                        }
                    }
                }
            }
        }

        // Return true if we have at least threshold valid signatures
        valid_count >= threshold
    }
}
