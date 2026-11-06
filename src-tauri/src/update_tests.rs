#[test]
#[ignore = "Run with SIMPLESHARE_TEST_INSTALLER set after a signed installer is built"]
fn installer_signature_verifies_and_rejects_tampering() {
    use base64::Engine;
    let path = std::env::var("SIMPLESHARE_TEST_INSTALLER").expect("Set SIMPLESHARE_TEST_INSTALLER");
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let public = base64::engine::general_purpose::STANDARD
        .decode(config["plugins"]["updater"]["pubkey"].as_str().unwrap())
        .unwrap();
    let signature = base64::engine::general_purpose::STANDARD
        .decode(
            std::fs::read_to_string(format!("{path}.sig"))
                .unwrap()
                .trim(),
        )
        .unwrap();
    let public = minisign_verify::PublicKey::decode(std::str::from_utf8(&public).unwrap()).unwrap();
    let signature =
        minisign_verify::Signature::decode(std::str::from_utf8(&signature).unwrap()).unwrap();
    let mut installer = std::fs::read(path).unwrap();
    public.verify(&installer, &signature, false).unwrap();
    let position = installer.len() / 2;
    installer[position] ^= 1;
    assert!(public.verify(&installer, &signature, false).is_err());
}
