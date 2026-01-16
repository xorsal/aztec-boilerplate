use dep::aztec::{macros::notes::note, protocol_types::traits::Packable};

// Stores a signer's public key composed of two fields (x, y coordinates)
// Used in the multisig account contract to track authorized signers
#[derive(Eq, Packable)]
#[note]
pub struct SignerNote {
    pub x: Field,
    pub y: Field,
}

impl SignerNote {
    pub fn new(x: Field, y: Field) -> Self {
        SignerNote { x, y }
    }
}
