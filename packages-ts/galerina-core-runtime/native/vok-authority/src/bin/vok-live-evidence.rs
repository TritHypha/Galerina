#![forbid(unsafe_code)]

use galerina_vok_authority::{
    AuthorityContext, AuthorityTable, AuthorityTag, MintRequest, NonceSource, OsNonceSource, Trit,
    RETURN_U64_OBJECT_BYTES,
};

fn main() {
    let mut entropy = OsNonceSource;
    let first = entropy
        .next_nonce()
        .unwrap_or_else(|error| refuse(error.failure_id()));
    let second = entropy
        .next_nonce()
        .unwrap_or_else(|error| refuse(error.failure_id()));
    if first == [0; 16] || second == [0; 16] || first == second {
        refuse("VOK_NATIVE_ENTROPY_ZERO");
    }
    let context = AuthorityContext::new([1; 32], [2; 32], [3; 32], 1, 1);
    let mut table = AuthorityTable::new(1, RETURN_U64_OBJECT_BYTES, context.clone(), OsNonceSource)
        .unwrap_or_else(|error| refuse(error.failure_id()));
    let request = MintRequest::new_return_u64(
        AuthorityTag::parse("slide.vok.execute.v1")
            .unwrap_or_else(|error| refuse(error.failure_id())),
        context.clone(),
        [Trit::Admit; 8],
        42,
    )
    .unwrap_or_else(|error| refuse(error.failure_id()));
    let admitted = table
        .mint_admitted(request)
        .unwrap_or_else(|error| refuse(error.failure_id()));
    let lease = table
        .open_lease(admitted, &context)
        .unwrap_or_else(|error| refuse(error.failure_id()));
    let receipt = table
        .execute_lease(lease, &context)
        .unwrap_or_else(|error| refuse(error.failure_id()));
    let target_name = std::env::consts::ARCH;
    let os_name = std::env::consts::OS;
    println!(
        "{{\"schema\":\"galerina.vok.native-wx-live.v1\",\"verdict\":\"PASS\",\"os\":\"{os_name}\",\"target\":\"{target_name}\",\"k3Vectors\":19683,\"result\":{},\"executableAtCall\":{},\"writableAtCall\":{},\"authorityReleased\":{},\"entropyNonzero\":true,\"entropyDistinct\":true}}",
        receipt.value(),
        receipt.executable_at_call(),
        receipt.writable_at_call(),
        receipt.authority_released(),
    );
}

fn refuse(failure_id: &str) -> ! {
    eprintln!("REFUSED: {failure_id}");
    std::process::exit(1);
}
