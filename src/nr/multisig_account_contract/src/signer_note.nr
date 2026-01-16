use aztec::{macros::notes::note, protocol_types::{address::AztecAddress, traits::Packable}};

// Stores a signer's public key composed of two fields (x, y coordinates)
// Used in the multisig account contract to track authorized signers
#[derive(Eq, Packable)]
#[note]
pub struct SignerNote {
    pub x: Field,
    pub y: Field,
    pub owner: AztecAddress,
}

impl SignerNote {
    pub fn new(x: Field, y: Field, owner: AztecAddress) -> Self {
        SignerNote { x, y, owner }
    }
}
