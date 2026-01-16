use dep::aztec::{macros::notes::note, protocol_types::traits::Packable};

// Stores the multisig configuration: threshold and signer count
// Used in the multisig account contract to track authorization requirements
#[derive(Eq, Packable)]
#[note]
pub struct ConfigNote {
    pub threshold: u8,
    pub signer_count: u8,
}

impl ConfigNote {
    pub fn new(threshold: u8, signer_count: u8) -> Self {
        ConfigNote { threshold, signer_count }
    }
}
